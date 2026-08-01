-- Surveys. Replaces the `Surveys` registry sheet plus the chunked
-- `SurveyDefs::{project}::{survey}` sheets (JSON split across many rows to
-- dodge the 50,000-char/cell Sheets limit — see CLAUDE.md). Postgres JSONB
-- has no such limit, so the whole survey definition (pages, page_blocks,
-- experiment_groups, every question incl. visible_to_group_ids, all the
-- consent/instructions/thank-you copy) goes back to being one column again,
-- matching normalizeSurvey's shape in utils-survey.js almost verbatim. A
-- handful of fields that admin list/filter views query on are pulled out as
-- real columns too, purely for indexing — `definition` remains the source
-- of truth and Phase 2's sanitizeSurveyDef_ port keeps validating the whole
-- blob, not these columns individually.
create table public.surveys (
  id text primary key,
  project_id text references public.projects(id) on delete cascade,

  name text not null,
  status text,
  version integer not null default 1,
  completion_mode text check (completion_mode in ('redirect', 'message')),
  completion_redirect_url text,

  -- pages, page_blocks, experiment_groups, questions (with
  -- visible_to_group_ids/visible_in_feeds/feed_overrides), trigger,
  -- linked_feed_ids, feed_sequence_ids, delivery_mode, completion_code,
  -- and every consent/instructions/thank-you text/html field.
  definition jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index surveys_project_id_idx on public.surveys (project_id);

create trigger surveys_set_updated_at
  before update on public.surveys
  for each row execute function public.set_updated_at();

-- Replaces the `FeedSurveys` link sheet. handleSaveSurvey_ links a survey to
-- every feed in its feed_sequence_ids today; this table makes that an
-- actual join table instead of a side effect encoded only inside the
-- survey's own JSON blob.
create table public.feed_surveys (
  id uuid primary key default gen_random_uuid(),
  feed_id text not null references public.feeds(id) on delete cascade,
  survey_id text not null references public.surveys(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (feed_id, survey_id)
);

create index feed_surveys_survey_id_idx on public.feed_surveys (survey_id);

alter table public.surveys enable row level security;
alter table public.feed_surveys enable row level security;

-- Participants fetch the survey definition anonymously (same as
-- feeds/posts above).
create policy "surveys_select_public"
  on public.surveys for select
  to anon, authenticated
  using (true);

create policy "surveys_insert_editors"
  on public.surveys for insert
  to authenticated
  with check (public.is_admin_writer());

create policy "surveys_update_editors"
  on public.surveys for update
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());

create policy "surveys_delete_editors"
  on public.surveys for delete
  to authenticated
  using (public.is_admin_writer());

create policy "feed_surveys_select_public"
  on public.feed_surveys for select
  to anon, authenticated
  using (true);

create policy "feed_surveys_write_editors"
  on public.feed_surveys for all
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());
