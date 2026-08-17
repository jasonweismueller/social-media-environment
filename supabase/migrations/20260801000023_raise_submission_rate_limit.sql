-- The submission rate limiter (20260801000021_submission_abuse_guards.sql)
-- was calibrated at 10 inserts / 10 minutes per IP under the assumption "a
-- real participant's browser only ever produces 1-2 inserts for an entire
-- session either way." That assumption doesn't hold for a
-- multi_feed_then_survey study: one real participant's single run through a
-- 5-feed study (the largest live today, "Study 3 - Main") already produces
-- 5 participants inserts + 1 survey_responses insert = 6 — so two ordinary
-- QA run-throughs from the same researcher/tester IP, well within normal
-- use, already exceeds the old cap.
--
-- Confirmed this was actually happening, not just theoretical: real
-- production data (`submission_events`) showed one IP with 18 events across
-- a 17-minute window, well past the old 10-per-10-minutes cap, matching a
-- direct user report of intermittent 400s while testing a multi-feed study
-- ("worked for a while and then got 400 error again").
--
-- Raised 10 -> 40. Still meaningfully blocks a scripted flood (a bot
-- hammering the endpoint would still trip this within seconds), while
-- giving real headroom for several full run-throughs of even a much larger
-- multi-feed study than anything live today. Window (10 minutes) and the
-- IP-resolution logic are unchanged — this is a single-constant change to
-- the same function from that migration, not a redesign.
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
  rate_limit_max constant int := 40;
  rate_limit_window constant interval := '10 minutes';
begin
  headers := nullif(current_setting('request.headers', true), '')::jsonb;
  client_ip := coalesce(
    nullif(headers->>'cf-connecting-ip', ''),
    nullif(headers->>'sb-forwarded-for', ''),
    'unknown'
  );

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
