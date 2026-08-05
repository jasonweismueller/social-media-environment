-- Continuing the project_access RLS audit (2026-08-05, see CLAUDE.md
-- "project_access RLS finally verified live" and the two fixes it
-- documents, 20260801000018/20260801000019). Those two closed the gap on
-- projects/feeds/posts/surveys/participants/survey_responses; this migration
-- does the same for four tables that were added later (experiment_groups +
-- custom_measure_groups shipped in 20260801000015, after project_access
-- itself in 20260801000016, so they never got the same treatment) and were
-- found while re-auditing every table's policies from scratch rather than
-- assuming "already covered" without checking.
--
-- Confirmed by reading `pg_policies` directly before writing this, same as
-- 20260801000019's own audit:
--   - `experiment_groups_select_public` and `feed_surveys_select_public` are
--     BOTH `to authenticated, anon using (true)` — the exact same shape as
--     the posts/surveys leak 20260801000019 fixed: any signed-in admin,
--     restricted or not, can read every project's experiment-group
--     definitions (names, feed_sequence_ids) and every feed<->survey link
--     across every project. The `anon` grant on both is legitimate and
--     stays untouched — real participants (always anon) need it: a
--     survey's experiment_groups are merged onto the survey object on
--     load (supabaseLoadSurveyDefinition), and feed_surveys is how a
--     feed resolves which survey it's linked to.
--   - `custom_measure_groups_select_admins` and
--     `experiment_assignments_select_admins` are already correctly
--     `to authenticated` only (no anon leak — neither is participant-
--     facing), but their USING clause is bare `is_admin_reader()` with no
--     project_access check, same gap 20260801000019 closed for
--     participants/survey_responses.
--
-- None of these four tables carry their own project_id column — all key off
-- survey_id (text, referencing surveys.id), so scoping is via an EXISTS
-- join to surveys rather than a direct has_project_access(project_id) call.

drop policy "experiment_groups_select_public" on public.experiment_groups;

create policy "experiment_groups_select_anon"
  on public.experiment_groups for select
  to anon
  using (true);

create policy "experiment_groups_select_admins"
  on public.experiment_groups for select
  to authenticated
  using (
    public.is_admin_reader()
    and exists (
      select 1 from public.surveys s
      where s.id = experiment_groups.survey_id
        and public.has_project_access(s.project_id)
    )
  );

drop policy "feed_surveys_select_public" on public.feed_surveys;

create policy "feed_surveys_select_anon"
  on public.feed_surveys for select
  to anon
  using (true);

create policy "feed_surveys_select_admins"
  on public.feed_surveys for select
  to authenticated
  using (
    public.is_admin_reader()
    and exists (
      select 1 from public.surveys s
      where s.id = feed_surveys.survey_id
        and public.has_project_access(s.project_id)
    )
  );

drop policy "custom_measure_groups_select_admins" on public.custom_measure_groups;

create policy "custom_measure_groups_select_admins"
  on public.custom_measure_groups for select
  to authenticated
  using (
    public.is_admin_reader()
    and exists (
      select 1 from public.surveys s
      where s.id = custom_measure_groups.survey_id
        and public.has_project_access(s.project_id)
    )
  );

drop policy "experiment_assignments_select_admins" on public.experiment_assignments;

create policy "experiment_assignments_select_admins"
  on public.experiment_assignments for select
  to authenticated
  using (
    public.is_admin_reader()
    and exists (
      select 1 from public.surveys s
      where s.id = experiment_assignments.survey_id
        and public.has_project_access(s.project_id)
    )
  );
