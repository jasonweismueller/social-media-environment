-- Per-user project access scoping, for the Users admin page rework (see
-- CLAUDE.md "Admin user management rework + project access control").
--
-- There was no project-level scoping on admin accounts before this
-- (profiles.role is global viewer/editor/owner, see 20260801000002's own
-- comment) — every signed-in admin could see every project. This adds an
-- *opt-in* restriction: a user with zero project_access rows keeps today's
-- behavior exactly (sees every project, matching current live behavior for
-- the one real admin account that exists at the time of writing), and only
-- becomes scoped down once an owner explicitly grants that user access to a
-- specific set of projects. This means shipping this migration is a no-op
-- for every existing account until an owner actively restricts someone —
-- no lockout risk on deploy.
--
-- `apps` (empty = every platform for that project) lets an owner also limit
-- a granted project to specific fb/ig/amz platforms, mirroring how a single
-- project can already span all three (see 20260801000003's own comment).
create table public.project_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  apps text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create unique index project_access_user_project_idx on public.project_access (user_id, project_id);
create index project_access_user_idx on public.project_access (user_id);
create index project_access_project_idx on public.project_access (project_id);

alter table public.project_access enable row level security;

-- Any signed-in admin can read the roster (the Users page's project-access
-- editor needs to see everyone's grants, same reasoning as
-- profiles_select_admins), only owners can write it (matches
-- profiles_update_owner/insert_owner/delete_owner — user/access management
-- is an owner-only surface throughout this app).
create policy "project_access_select_admins"
  on public.project_access for select
  to authenticated
  using (public.is_admin_reader());

create policy "project_access_write_owner"
  on public.project_access for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Reusable by any table gated purely on project (currently just `projects`
-- itself). SECURITY DEFINER + explicit search_path, matching
-- current_profile_role() in 20260801000001 — needs to see project_access
-- rows regardless of the calling row's own RLS visibility, and pinning
-- search_path is required whenever a SECURITY DEFINER function is involved
-- (mutable search_path on a definer function is a privilege-escalation
-- vector).
create or replace function public.has_project_access(pid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.is_owner(), false)
    or not exists (select 1 from public.project_access where user_id = auth.uid())
    or exists (
      select 1 from public.project_access
      where user_id = auth.uid() and project_id = pid
    );
$$;

-- Feed-level variant: also checks the per-project `apps` narrowing.
-- `apps = '{}'` on a granted row means "every platform for this project"
-- (the default an owner gets when they grant a project without touching
-- the platform checkboxes), same convention as has_project_access above
-- treating zero project_access rows at all as "every project".
create or replace function public.has_project_app_access(pid text, target_app text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.is_owner(), false)
    or not exists (select 1 from public.project_access where user_id = auth.uid())
    or exists (
      select 1 from public.project_access
      where user_id = auth.uid()
        and project_id = pid
        and (apps = '{}'::text[] or target_app = any(apps))
    );
$$;

-- Tighten projects_select_admins (20260801000003) to also require project
-- access. Write policy (projects_write_editors) is untouched — creating/
-- deleting/renaming a project stays editor/owner-only exactly as before;
-- this migration only scopes *which* projects an already-admin user can see.
drop policy "projects_select_admins" on public.projects;

create policy "projects_select_admins"
  on public.projects for select
  to authenticated
  using (public.is_admin_reader() and public.has_project_access(id));

-- Split feeds_select_public (20260801000003) into an anon branch (kept
-- byte-for-byte `using (true)` — participants loading a real study never
-- authenticate, so this must never depend on project_access) and an
-- authenticated-admin branch that now also checks project+app access. Write
-- policies (feeds_write_editors/update_editors/delete_editors) are
-- untouched.
drop policy "feeds_select_public" on public.feeds;

create policy "feeds_select_anon"
  on public.feeds for select
  to anon
  using (true);

create policy "feeds_select_admins"
  on public.feeds for select
  to authenticated
  using (public.is_admin_reader() and public.has_project_app_access(project_id, app));
