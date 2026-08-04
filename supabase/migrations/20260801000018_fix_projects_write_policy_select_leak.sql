-- Real bug found while verifying project_access RLS (2026-08-04, see
-- CLAUDE.md "project_access RLS... never verified against a real
-- restricted session"). `projects_write_editors` (from 20260801000003) is a
-- single `for all` policy — `using (is_admin_writer())`, no project
-- scoping, by deliberate design (20260801000016's own comment: "Write
-- policy (projects_write_editors) is untouched... stays editor/owner-only
-- exactly as before; this migration only scopes *which* projects an
-- already-admin user can see").
--
-- The bug: in Postgres, a `for all` policy's USING clause also governs
-- SELECT, not just INSERT/UPDATE/DELETE, and permissive policies for the
-- same command are OR'd together. So `projects_write_editors` was silently
-- re-granting full SELECT visibility to every editor/owner regardless of
-- `project_access`, completely undoing the restriction
-- `projects_select_admins` (20260801000016) was supposed to add. Confirmed
-- empirically: simulated a real restricted editor session
-- (`set local role authenticated; set local request.jwt.claim.sub = ...`)
-- against a project_access row scoped to exactly one disposable project,
-- and `select * from projects` still returned all 8 real projects, not
-- just the granted one. `feeds` never had this problem — its write side
-- was already split into three command-scoped policies
-- (feeds_write_editors/feeds_update_editors/feeds_delete_editors), none of
-- them `for all`.
--
-- Fix: split `projects_write_editors` the same way feeds already is. Write
-- semantics are unchanged (still unscoped by project_access, matching the
-- explicit stated design intent in 20260801000016) — this only removes the
-- accidental SELECT grant.
drop policy "projects_write_editors" on public.projects;

create policy "projects_insert_editors"
  on public.projects for insert
  to authenticated
  with check (public.is_admin_writer());

create policy "projects_update_editors"
  on public.projects for update
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());

create policy "projects_delete_editors"
  on public.projects for delete
  to authenticated
  using (public.is_admin_writer());
