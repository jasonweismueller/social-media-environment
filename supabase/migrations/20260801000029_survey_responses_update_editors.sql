-- Lets an editor/owner admin correct a participant's own already-submitted
-- survey answers — a rare but real need: a participant emails saying they
-- clicked the wrong option on one question, and there was previously no way
-- to fix that without the stored data permanently disagreeing with reality.
--
-- No UPDATE policy existed on this table before this migration (confirmed:
-- zero UPDATE policies via pg_policies), so RLS has always default-denied
-- every update regardless of the table's broad authenticated/anon grants —
-- adding this policy is the first time UPDATE becomes possible at all, not a
-- widening of something already reachable.
--
-- Deliberately narrower than the row-level policy alone: column-level grants
-- restrict `authenticated` to the `responses` jsonb column specifically, so
-- this can never be used (by a future bug, not just today's frontend code)
-- to alter identity/scoring columns on the same row — experiment_group_id,
-- session_id, prolific_pid, submitted_at, etc. stay immutable via this path.
create policy survey_responses_update_editors
  on public.survey_responses
  for update
  to authenticated
  using (is_admin_writer() and has_project_access(project_id))
  with check (is_admin_writer() and has_project_access(project_id));

revoke update on public.survey_responses from authenticated;
grant update (responses) on public.survey_responses to authenticated;
