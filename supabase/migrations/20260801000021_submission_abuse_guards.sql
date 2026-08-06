-- Submission abuse guards, prompted directly: "protection against someone
-- just spamming our page (like keep requesting a specific URL)". Before
-- this, `participants`/`survey_responses` insert policies were
-- `with check (true)` for anon — genuinely open, no rate limit, no
-- dedup. Anyone with the (public, bundled) anon key could script direct
-- REST inserts against either table with no protection at all, bypassing
-- the participant UI entirely.
--
-- Two independent guards, both enforced in Postgres via BEFORE INSERT
-- triggers (not an Edge Function rewrite of the submission path) — confirmed
-- live against this project that PostgREST exposes the real client IP to
-- Postgres via `current_setting('request.headers', true)`, specifically
-- `cf-connecting-ip` (set by Cloudflare) and `sb-forwarded-for` (set by
-- Supabase's own edge) — neither is client-suppliable, unlike a raw
-- `x-forwarded-for`, which a script can set to anything. This keeps the
-- existing `fetch(..., {keepalive:true})` direct-to-PostgREST submission
-- path (utils-backend-supabase.js `supabaseInsert`) completely unchanged —
-- both call sites already `await` the result and show the participant a
-- real "please try again" error on failure (App-*.jsx, verified by reading
-- both sendToSheet/sendSurveyResponseToBackend call sites before writing
-- this), so a trigger-rejected insert fails safely instead of silently
-- losing data.

-- =========================================================================
-- Guard 1: per-IP rate limit (platform-wide, not per-study — a script
-- hammering the endpoint is suspicious regardless of which survey/feed it's
-- aimed at; a real participant's browser only ever produces 1-2 inserts for
-- an entire session either way).
-- =========================================================================

create table public.submission_events (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index submission_events_ip_created_idx
  on public.submission_events (ip, created_at);

alter table public.submission_events enable row level security;
-- No policies at all — this table is only ever touched by the security
-- definer trigger function below, never directly by anon/authenticated.

create or replace function public.enforce_submission_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headers jsonb;
  client_ip text;
  recent_count int;
  rate_limit_max constant int := 10;
  rate_limit_window constant interval := '10 minutes';
begin
  headers := nullif(current_setting('request.headers', true), '')::jsonb;
  client_ip := coalesce(
    nullif(headers->>'cf-connecting-ip', ''),
    nullif(headers->>'sb-forwarded-for', ''),
    'unknown'
  );

  -- Opportunistic cleanup instead of a cron job — cheap relative to the
  -- expected write volume of a participant-facing research tool, and keeps
  -- this self-contained (no scheduled task to remember to set up).
  delete from public.submission_events
  where created_at < now() - interval '1 hour';

  select count(*) into recent_count
  from public.submission_events
  where ip = client_ip and created_at > now() - rate_limit_window;

  if client_ip <> 'unknown' and recent_count >= rate_limit_max then
    raise exception 'Too many submissions from this network — please wait a few minutes and try again.'
      using errcode = 'P0001';
  end if;

  insert into public.submission_events (ip) values (client_ip);

  return new;
end;
$$;

create trigger participants_rate_limit
  before insert on public.participants
  for each row execute function public.enforce_submission_rate_limit();

create trigger survey_responses_rate_limit
  before insert on public.survey_responses
  for each row execute function public.enforce_submission_rate_limit();

-- =========================================================================
-- Guard 2: the same identified Prolific worker can't submit twice for the
-- same feed (participants) / same survey (survey_responses) — the more
-- realistic "resubmit to get paid a second time" case, independent of the
-- rate limiter above (a slow, deliberate resubmission wouldn't trip a
-- 10-minute window). Partial index so it's a no-op whenever prolific_pid is
-- null (local testing, non-Prolific launches) — NULL is never considered
-- equal to NULL in SQL uniqueness anyway, the `where` clause just keeps the
-- index itself small and honest about what it's actually guarding.
--
-- Scoped to rows created from this migration's own apply time onward
-- (literal cutoff, not `now()` — a mutable function baked into a partial
-- index predicate is evaluated once at CREATE INDEX time either way, but a
-- literal is unambiguous about that rather than relying on it). Checked
-- first: real production data already has 5 existing (feed_id, prolific_pid)
-- pairs with 2 rows each — real Prolific IDs, project proj_7 — so an
-- unscoped unique index would fail to create at all, and even if it didn't,
-- retroactively deciding those existing rows are "the bad kind of duplicate"
-- isn't a call to make silently on live human-subjects data. This guards
-- every *new* submission from here on without touching or requiring a
-- decision about anything already collected.
-- =========================================================================

create unique index participants_unique_prolific_per_feed
  on public.participants (feed_id, prolific_pid)
  where prolific_pid is not null and created_at >= '2026-08-06T12:20:01Z'::timestamptz;

create unique index survey_responses_unique_prolific_per_survey
  on public.survey_responses (survey_id, prolific_pid)
  where prolific_pid is not null and created_at >= '2026-08-06T12:20:01Z'::timestamptz;
