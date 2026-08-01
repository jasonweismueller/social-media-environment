-- Participants. Replaces the `Participants::{project}::{feed}` sheets,
-- which today grow columns dynamically per post via appendRowWithHeader_
-- (each post contributes ~20 interaction columns: reacted, commented,
-- shared, saved, bio_opened, note_helpful_rated, review_rating, etc. — see
-- buildParticipantRow in utils-core.js). That dynamic-column approach is
-- exactly the kind of thing a relational schema shouldn't copy literally:
-- fixed core columns get real types and indexes; everything post-keyed and
-- per-study-variable goes in `extra` JSONB instead of one column per field.
create table public.participants (
  id uuid primary key default gen_random_uuid(),

  project_id text references public.projects(id) on delete cascade,
  feed_id text not null references public.feeds(id) on delete cascade,
  survey_id text references public.surveys(id),
  feed_checksum text,

  session_id text not null,
  participant_id text,
  prolific_pid text,
  prolific_session_id text,
  prolific_study_id text,
  ip_address text,

  entered_at timestamptz,
  submitted_at timestamptz,
  ms_enter_to_submit integer,
  ms_enter_to_last_interaction integer,

  -- Every ${postId}_reacted / _commented / _shared / _saved /
  -- _review_rating / ... column from buildParticipantRow, keyed by post id:
  -- { "<post_id>": { reacted: bool, commented: bool, ... }, ... }
  extra jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index participants_feed_id_idx on public.participants (feed_id);
create index participants_survey_id_idx on public.participants (survey_id);
create index participants_session_id_idx on public.participants (session_id);
create index participants_project_id_idx on public.participants (project_id);

alter table public.participants enable row level security;

-- Participants insert their own row anonymously, once, at study completion.
-- No update/delete for anon — the current log_participant action is
-- insert-only too (a participant only submits once).
create policy "participants_insert_public"
  on public.participants for insert
  to anon, authenticated
  with check (true);

create policy "participants_select_admins"
  on public.participants for select
  to authenticated
  using (public.is_admin_reader());

-- Supports the "Delete survey data" admin feature (CLAUDE.md: deletes
-- response data, scoped by survey, without touching the survey definition).
create policy "participants_delete_editors"
  on public.participants for delete
  to authenticated
  using (public.is_admin_writer());
