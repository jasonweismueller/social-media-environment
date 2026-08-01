-- Projects and Feeds. Replaces the `Projects` and `Feeds` sheets.
--
-- ID strategy (applies to every entity table in this migration set, not
-- just this file): primary keys are `text`, not `uuid default
-- gen_random_uuid()`. The current GAS backend already generates opaque
-- string ids (project_id/feed_id/survey_id/post_id) that are embedded in
-- places outside the database itself: launch links shown in the admin UI,
-- CSV column headers, and localStorage maps (postNames, keyed by post id —
-- see utils-backend.js). Phase 3's data-migration script needs to carry
-- those exact id strings over unchanged rather than mint new uuids, or
-- every existing launch link and any locally-cached admin state breaks on
-- cutover. New rows created after cutover can still use a generated uuid
-- string as their id — `text` doesn't preclude that, it just doesn't force
-- it the way a `uuid` column would.

create table public.projects (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- `app` is fb/ig/amz, matching the `?app=` param used throughout the
-- frontend (getApp() in src/utils). A single project can span all three
-- (CLAUDE.md: "listProjects_ ignores the app query param entirely... a
-- project can hold feeds across fb/ig/amz simultaneously"), so `app` lives
-- on the feed, not the project.
create table public.feeds (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  app text not null check (app in ('fb', 'ig', 'amz')),
  name text not null,
  checksum text,
  -- randomize_times / randomize_avatars / randomize_names /
  -- randomize_images / randomize_bios, see normalizeFlags in App-*.jsx.
  -- Kept as JSONB rather than five boolean columns since this set of flags
  -- has grown before and is cheap to extend without a migration.
  flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feeds_project_id_idx on public.feeds (project_id);

create trigger feeds_set_updated_at
  before update on public.feeds
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.feeds enable row level security;

-- Projects themselves are never read by the participant-facing app (only
-- feeds/posts/surveys are, via feed_id/survey_id in the URL) so restrict
-- read to signed-in admins, unlike feeds/posts/surveys below.
create policy "projects_select_admins"
  on public.projects for select
  to authenticated
  using (public.is_admin_reader());

create policy "projects_write_editors"
  on public.projects for all
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());

-- Feeds are read by anonymous participants loading a study (no admin
-- session exists for a participant), so SELECT is public. Writes stay
-- editor/owner-only, matching requireRole_(session, ['editor']) in Code.gs.
create policy "feeds_select_public"
  on public.feeds for select
  to anon, authenticated
  using (true);

create policy "feeds_write_editors"
  on public.feeds for insert
  to authenticated
  with check (public.is_admin_writer());

create policy "feeds_update_editors"
  on public.feeds for update
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());

create policy "feeds_delete_editors"
  on public.feeds for delete
  to authenticated
  using (public.is_admin_writer());
