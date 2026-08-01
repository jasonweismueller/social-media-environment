-- Survey responses. Replaces the
-- `SurveyResponses::{app-prefix}{project}::{feed}::{survey}` sheets — one
-- sheet per (app, project, feed, survey) combo today, which is exactly the
-- sheet-count-growth problem driving this migration (see CLAUDE.md "Backend
-- migration planning"). Here it's one table, one row per submission, scoped
-- by foreign key + indexes instead of by sheet name.
create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),

  survey_id text not null references public.surveys(id) on delete cascade,
  feed_id text references public.feeds(id) on delete set null,
  project_id text references public.projects(id) on delete set null,

  session_id text not null,
  participant_id text,
  experiment_group_id text,

  prolific_pid text,
  prolific_session_id text,
  prolific_study_id text,
  ip_address text,

  entered_at timestamptz,
  submitted_at timestamptz,
  duration_ms integer,

  -- { "<question_id>": <answer>, ... } — matches sendSurveyResponseToBackend's
  -- `responses` payload shape exactly, no need to normalize per-question
  -- answers into their own rows/columns.
  responses jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index survey_responses_survey_id_idx on public.survey_responses (survey_id);
create index survey_responses_session_id_idx on public.survey_responses (session_id);
create index survey_responses_experiment_group_idx on public.survey_responses (survey_id, experiment_group_id);

alter table public.survey_responses enable row level security;

-- Participants submit their own response anonymously, once.
create policy "survey_responses_insert_public"
  on public.survey_responses for insert
  to anon, authenticated
  with check (true);

create policy "survey_responses_select_admins"
  on public.survey_responses for select
  to authenticated
  using (public.is_admin_reader());

-- Backs the "Delete survey data" admin button (deleteSurveyResponsesOnBackend
-- / delete_survey_responses action) — irreversible, editor/owner only,
-- scoped to one survey's rows without touching the survey definition.
create policy "survey_responses_delete_editors"
  on public.survey_responses for delete
  to authenticated
  using (public.is_admin_writer());
