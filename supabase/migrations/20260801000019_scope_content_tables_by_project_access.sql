-- Second half of the project_access RLS audit (2026-08-04, see CLAUDE.md
-- "project_access RLS... deliberately left ungated" and the projects fix in
-- 20260801000018 that started this pass). posts/surveys/participants/
-- survey_responses were explicitly called out at the time project_access
-- shipped (20260801000016) as closing only the normal admin-navigation
-- surface, "a determined actor with a known feed_id/survey_id and direct
-- API access could still bypass deeper-table RLS" — this migration closes
-- that gap for real.
--
-- What was actually found, confirmed by reading every policy on these four
-- tables directly (not guessed):
--
-- 1. `posts_select_public` and `surveys_select_public` are BOTH granted
--    `to authenticated, anon` with `using (true)` — i.e. not just
--    participants (who are always `anon`), but literally any signed-in
--    admin account, restricted or not, already has unrestricted read access
--    to every post's full content and every survey's full `definition`
--    across every project. This is worse than the posts.id/projects leak
--    found earlier today — it's real content (post bodies, survey
--    questions), not just names/ids. `feeds_select_public` had already been
--    split into `feeds_select_anon`/`feeds_select_admins` when
--    project_access shipped (20260801000016) — posts/surveys were simply
--    never given the same treatment.
-- 2. `participants_select_admins`/`survey_responses_select_admins` are
--    already correctly `to authenticated` only (no anon leak — this data
--    includes prolific IDs/IP addresses/survey answers, never meant to be
--    public), but their USING clause is bare `is_admin_reader()` with no
--    project_access check at all, so any authenticated admin/editor/viewer
--    can already read every participant/response row regardless of
--    project.
--
-- Confirmed via `information_schema.columns` + a full-table null/shape
-- check (0 nulls, 0 malformed rows) before writing this:
--   - surveys/participants/survey_responses all have their own bare
--     `project_id` column already — straightforward `has_project_access`.
--   - posts has neither `project_id` nor `app` columns, only the composed
--     `feed_id` (`<project>::<app>::<feed>`, same key space as `feeds.id`)
--     — project_id/app extracted via split_part rather than joining to
--     `feeds`, so this doesn't depend on the feed row still existing.

-- posts: split public → anon (unchanged) + admin (project+app scoped, same
-- precision as feeds_select_admins, since a post always belongs to exactly
-- one feed).
drop policy "posts_select_public" on public.posts;

create policy "posts_select_anon"
  on public.posts for select
  to anon
  using (true);

create policy "posts_select_admins"
  on public.posts for select
  to authenticated
  using (
    public.is_admin_reader()
    and public.has_project_app_access(
      split_part(feed_id, '::', 1),
      split_part(feed_id, '::', 2)
    )
  );

-- surveys: split public → anon (unchanged, participant-facing survey
-- loading needs this) + admin (project scoped — no per-app narrowing here,
-- matching projects/participants/survey_responses below; a survey isn't
-- inherently single-app the way a feed/post is).
drop policy "surveys_select_public" on public.surveys;

create policy "surveys_select_anon"
  on public.surveys for select
  to anon
  using (true);

create policy "surveys_select_admins"
  on public.surveys for select
  to authenticated
  using (public.is_admin_reader() and public.has_project_access(project_id));

-- participants: already authenticated-only, just add the missing scoping.
drop policy "participants_select_admins" on public.participants;

create policy "participants_select_admins"
  on public.participants for select
  to authenticated
  using (public.is_admin_reader() and public.has_project_access(project_id));

-- survey_responses: same as participants.
drop policy "survey_responses_select_admins" on public.survey_responses;

create policy "survey_responses_select_admins"
  on public.survey_responses for select
  to authenticated
  using (public.is_admin_reader() and public.has_project_access(project_id));
