-- Reusable question/measure library, prompted directly by the admin having
-- repeatedly copied whole surveys mainly to reuse a handful of questions
-- (a standard Likert scale, a demographics block) rather than building them
-- from scratch each time. Deliberately global — not scoped to a project or
-- survey via project_access — since the whole point is reuse *across*
-- studies, and a library item holds no participant data or study-specific
-- content, just a portable question template. Any admin (viewer+) can browse
-- it; editor+ can save/rename/delete, same role split every other
-- content-write table in this schema already uses.
create table public.question_library_items (
  id text primary key,
  name text not null,
  description text not null default '',
  -- Array of question objects in the same backend shape
  -- frontendQuestionToBackend/buildSavedQuestion already produce for
  -- surveys.definition.pages[].questions — never survey- or project-scoped
  -- fields like visible_to_group_ids/visible_in_feeds/feed_overrides/post_id
  -- (stripped client-side before saving, see
  -- buildLibraryQuestionsFromEditorQuestions in
  -- components-admin-surveys-editor.jsx), so an item is safe to insert into
  -- any survey in any project without silently carrying a dangling
  -- reference to a group/feed/post that doesn't exist there.
  questions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger question_library_items_set_updated_at
  before update on public.question_library_items
  for each row execute function public.set_updated_at();

alter table public.question_library_items enable row level security;

create policy "question_library_items_select_admins"
  on public.question_library_items for select
  to authenticated
  using (public.is_admin_reader());

create policy "question_library_items_write_editors"
  on public.question_library_items for all
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());
