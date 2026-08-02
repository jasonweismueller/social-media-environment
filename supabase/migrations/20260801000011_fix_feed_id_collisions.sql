-- Fixes a real data-corruption bug found during Phase 3's live --apply run.
--
-- 20260801000003's ID-strategy note assumed feed_id was already a globally
-- unique opaque string, the same way project_id/survey_id/post_id are.
-- False: real feed_ids are simple per-(project, app) counters ("feed_1",
-- "feed_2", ...) that restart for every new project. Confirmed directly —
-- "feed_1" exists as a genuinely different real feed under project_1,
-- proj_2, and proj_3 simultaneously. With feeds.id as a bare `text primary
-- key`, migrating project-after-project silently overwrote each earlier
-- project's identically-named feed rows on every upsert (no error — upsert
-- treats a primary-key collision as an update, not a conflict to reject).
--
-- Fix: feeds.id becomes a synthetic key composed as
-- "<project_id>::<app>::<raw feed_id>" (guaranteed unique, since
-- (project_id, app, feed_id) is the real natural key Code.gs's own Feeds
-- sheet uses). The original raw feed_id is preserved in a new `feed_id`
-- column — every table that references a feed by id already stores that
-- same composed string in its own feed_id-shaped column, so no other
-- schema change is needed; the migration script just needs to write the
-- composed value consistently everywhere instead of the bare original.
--
-- Separately: survey_responses.feed_id's foreign key is dropped, not
-- fixed-and-kept. Response data is historical/audit-shaped — a response
-- can legitimately reference a feed that's since been renamed or deleted,
-- and enforcing strict referential integrity there rejected real historical
-- data rather than catching a real bug (confirmed: the FK violations during
-- the --apply run were for exactly this reason, separate from the
-- collision bug above). feed_id stays on that table as plain informational
-- text.
--
-- Nothing in Supabase is live or wired to the app yet (Phase 4 hasn't
-- started), so the simplest safe fix is: wipe every Phase 3-migrated table
-- and redo the migration in one clean pass after this runs. `projects` is
-- untouched — project_id values showed no evidence of this collision
-- (they're genuinely unique per project already).

truncate table
  public.survey_responses,
  public.experiment_assignments,
  public.experiment_group_counters,
  public.feed_surveys,
  public.participants,
  public.posts,
  public.feeds,
  public.surveys
  cascade;

alter table public.feeds add column feed_id text not null;
create index feeds_feed_id_idx on public.feeds (project_id, app, feed_id);

alter table public.survey_responses drop constraint survey_responses_feed_id_fkey;
