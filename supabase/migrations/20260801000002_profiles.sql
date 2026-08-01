-- Admin accounts. Replaces the `Admins` sheet (email, role, salt, hash,
-- disabled). Auth itself (password hashing, sessions) moves to Supabase
-- Auth, so this table only carries the app-specific bits Supabase Auth
-- doesn't: role and disabled. `id` is the Supabase Auth user id.
--
-- There is no project-level scoping on admin accounts in the current app
-- (confirmed: no project-scoping field found on Admins-sheet rows), so role
-- stays global here too, matching current behavior exactly.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('viewer', 'editor', 'owner')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_idx on public.profiles (lower(email));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a Supabase Auth user is created, so
-- admin creation (currently adminCreateUser in utils-backend.js) can create
-- an auth user and rely on this trigger rather than a second insert.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;

-- Every signed-in admin can see the roster (needed for the admin Users
-- page's list view) but not edit it unless they're an owner.
create policy "profiles_select_admins"
  on public.profiles for select
  to authenticated
  using (public.is_admin_reader());

create policy "profiles_update_owner"
  on public.profiles for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy "profiles_insert_owner"
  on public.profiles for insert
  to authenticated
  with check (public.is_owner());

create policy "profiles_delete_owner"
  on public.profiles for delete
  to authenticated
  using (public.is_owner());
