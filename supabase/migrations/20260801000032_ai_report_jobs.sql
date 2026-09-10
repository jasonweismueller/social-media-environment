-- Background-job table for AI study report generation.
--
-- Root cause this fixes: ai-study-report previously ran the whole Anthropic
-- call (CSV upload + Messages API with code_execution, often well over 20s
-- for a real study) synchronously inside one HTTP request/response cycle.
-- Supabase's edge gateway drops a connection with reason "EarlyDrop" after
-- roughly ~20s of no response bytes flowing, killing the function's isolate
-- mid-flight — the browser sees a generic "Failed to send a request to the
-- Edge Function" (no JSON body, since the connection died before any
-- response could be sent), and worse, the ai_report_usage cost-tracking
-- insert (which only ever ran *after* a full Anthropic response was
-- received) never happens either — so the $5/$10 monthly safety cap is
-- blind to exactly the attempts most likely to have actually spent real
-- money server-side before being cut off client-side.
--
-- Fix: the Edge Function now creates a row here, returns immediately, and
-- keeps running the real Anthropic call via EdgeRuntime.waitUntil() after
-- the response is sent — completely decoupling Anthropic's response time
-- from the client's connection. The frontend polls this table (a plain
-- RLS-gated PostgREST select, not a second Edge Function round-trip) until
-- status is 'done'/'error'. Cost is recorded into ai_report_usage from
-- inside the background task, same as before, just no longer gated on the
-- original HTTP connection still being alive.
create table if not exists public.ai_report_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  survey_id text,
  model text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  report_markdown text,
  usage jsonb,
  estimated_cost_usd numeric,
  execution_trace jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backs both the dedup-guard lookup (find an in-flight job for this
-- user+survey before starting a duplicate paid call) and the frontend's own
-- "resume polling after a page refresh" lookup.
create index if not exists ai_report_jobs_user_survey_idx
  on public.ai_report_jobs (user_id, survey_id, created_at desc);

alter table public.ai_report_jobs enable row level security;

-- Read-only for the owning user — the frontend polls this directly via
-- PostgREST with the caller's own JWT, same "RLS-gated plain select" pattern
-- already used for custom_measure_groups/project_access elsewhere in this
-- schema. No insert/update/delete policy for `authenticated` — every write
-- goes through the Edge Function's service-role client, same as
-- ai_report_usage.
create policy ai_report_jobs_select_own
  on public.ai_report_jobs for select
  to authenticated
  using (user_id = auth.uid());

create trigger ai_report_jobs_set_updated_at
  before update on public.ai_report_jobs
  for each row execute function set_updated_at();
