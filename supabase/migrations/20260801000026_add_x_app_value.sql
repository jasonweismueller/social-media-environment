-- Adds "x" (X/Twitter) as a fourth valid `app` value, alongside fb/ig/amz.
-- feeds.app is the only place `app` is constrained via a hard CHECK
-- (20260801000003_projects_and_feeds.sql) — posts/surveys don't store their
-- own `app` column, they derive scoping from the feed_id they belong to
-- (`<project>::<app>::<feed>`), so this is the only constraint that needs
-- widening. Purely additive, mirrors the precedent in
-- 20260801000014_fix_ad_type_check.sql (drop + recreate the same
-- constraint with one more allowed value) — every existing fb/ig/amz row
-- is unaffected.
alter table public.feeds drop constraint feeds_app_check;
alter table public.feeds add constraint feeds_app_check
  check (app in ('fb', 'ig', 'amz', 'x'));
