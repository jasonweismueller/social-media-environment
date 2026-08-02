-- Phase 1 (schema design) of the Apps Script + Sheets -> Supabase migration.
-- See ~/.claude/plans/gradual-migrating-codd.md and CLAUDE.md "Backend migration planning"
-- for full context. This file has not been run against any Supabase project yet.

create extension if not exists pgcrypto;

-- Every table gets an `updated_at` that auto-bumps on UPDATE, mirroring the
-- updated_at columns already present in the current Sheets-based model.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Role helpers used by RLS policies throughout this migration set.
-- `profiles.role` mirrors the current Admins-sheet role column
-- (viewer/editor/owner, see CLAUDE.md + components-admin-users.jsx). There is
-- no project-level scoping on admin accounts today, so these stay global.
--
-- LANGUAGE PLPGSQL, not SQL, and deliberately so: `profiles` isn't created
-- until the next migration file. A `language sql` function body gets parsed
-- and resolved against the catalog at CREATE FUNCTION time (Postgres needs
-- to determine the query's result shape), so it would fail right here with
-- "relation public.profiles does not exist". A plpgsql body is stored as
-- opaque text and only resolved when actually called, long after profiles
-- exists — so this forward reference is fine as plpgsql, not as plain sql.
create or replace function public.current_profile_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select role from public.profiles where id = auth.uid());
end;
$$;

-- editor or owner: the two roles allowed to write project/feed/post/survey
-- data today (requireRole_(session, ['editor']) in Code.gs).
create or replace function public.is_admin_writer()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_profile_role() in ('editor', 'owner'), false);
$$;

-- owner only: user management (create/update/disable admin accounts).
create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_profile_role() = 'owner', false);
$$;

-- any signed-in, non-disabled admin: read access to admin-only data
-- (participant rosters, survey responses, experiment assignments).
create or replace function public.is_admin_reader()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_profile_role() in ('viewer', 'editor', 'owner'), false);
$$;
