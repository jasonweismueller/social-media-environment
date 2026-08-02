-- Fixes a real data-corruption bug found 2026-08-02, while repairing missing
-- posts after the production cutover (see CLAUDE.md "Backend migration").
--
-- Same root cause as 20260801000011_fix_feed_id_collisions.sql, one level
-- deeper: post ids from GAS ("5f6ae9w22tumg95r8lj" etc.) are only unique
-- *within the feed they were created in* — not globally. Confirmed directly:
-- the same post id appears, with identical content, across many genuinely
-- different feeds and even different projects (real study designs here
-- duplicate a template feed into "Control"/"Treatment 1"/"Treatment 2"/...
-- variants, which keeps the shared base posts' ids identical across all of
-- them). With posts.id as a bare `text primary key`, upserting feed after
-- feed silently re-pointed every earlier feed's identically-numbered post
-- rows at whichever feed was migrated last (upsert treats a primary-key
-- collision as an update, not a rejected conflict) — leaving every
-- earlier-migrated feed sharing ids with a later one at 0 posts. This is
-- exactly what "no posts in admin dashboard for Feed 1 - G1 (Revised)" was:
-- confirmed the real posts still exist in GAS, Supabase just silently lost
-- the row to a later feed during Phase 3.
--
-- Unlike 20260801000011 (which could just truncate and redo everything,
-- since nothing was live yet), this table is live in production now with
-- real, irreplaceable rows (participants/survey_responses reference feeds
-- that reference posts indirectly via feed_id) — so this is an in-place,
-- data-preserving fix, not a wipe-and-redo. At the time this runs, the table
-- holds only successfully-migrated, non-colliding rows (confirmed: 65 rows,
-- 65 distinct ids), so backfilling post_id from the existing id and then
-- recomposing id is safe with no collision risk among current rows.
--
-- Fix: posts.id becomes a synthetic key composed as "<feed_id>::<post_id>"
-- (feed_id already being the composed <project>::<app>::<feed> key), same
-- shape as feeds.id. The original bare post id is preserved in a new
-- `post_id` column. mapPostRowToRaw (utils-backend-supabase.js) must keep
-- returning post_id as `raw.id` to the frontend, never the composed
-- internal id — the same asymmetry supabaseListFeeds already has between
-- feeds.id (composed, internal) and feeds.feed_id (bare, returned to the
-- frontend).

alter table public.posts add column post_id text;
update public.posts set post_id = id;
alter table public.posts alter column post_id set not null;

update public.posts set id = feed_id || '::' || post_id;

create unique index posts_feed_id_post_id_idx on public.posts (feed_id, post_id);
