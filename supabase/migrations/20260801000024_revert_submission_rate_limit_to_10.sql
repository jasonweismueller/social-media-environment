-- Reverts 20260801000023_raise_submission_rate_limit.sql, per direct user
-- instruction: keep the original 10/10-minutes limit on production, and do
-- multi-feed testing on staging instead (which has no participant-data
-- stakes) rather than raising production's abuse-prevention threshold.
-- Kept as its own migration (not a rewrite of 000023) so the history stays
-- honest about what was tried — same convention this file's own CLAUDE.md
-- narrative already uses for other "built one way, then explicitly
-- corrected" changes.
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
