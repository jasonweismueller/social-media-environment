-- Optional per-survey researcher-provided context (hypotheses, specific
-- comparisons/DVs to test, anything else) for the AI-generated study report
-- feature (ai-study-report Edge Function, see its own header comment).
--
-- Built after a real report on a live study ran generic, pooled
-- comparisons (misinformation-vs-accurate overall, emotional-vs-neutral
-- overall) instead of the researcher's actual core hypothesis (does the
-- prebunk *condition* reduce believability of emotionally-framed
-- misinformation specifically) — not wrong, just answering a different
-- question, because the model has no way to know which comparisons are
-- the ones that actually matter to the researcher from the raw response
-- data and question ids alone. This table is how a researcher tells it.
--
-- Admin-only, never participant-facing — shape and RLS mirror
-- custom_measure_groups (20260801000015, later scoped by project_access in
-- 20260801000020) from the start, not as a follow-up audit fix.
create table public.ai_report_context (
  survey_id text primary key references public.surveys(id) on delete cascade,
  context text,
  updated_at timestamptz not null default now()
);

alter table public.ai_report_context enable row level security;

create policy "ai_report_context_select_admins"
  on public.ai_report_context for select
  to authenticated
  using (
    public.is_admin_reader()
    and exists (
      select 1 from public.surveys s
      where s.id = ai_report_context.survey_id
        and public.has_project_access(s.project_id)
    )
  );

create policy "ai_report_context_write_editors"
  on public.ai_report_context for all
  to authenticated
  using (
    public.is_admin_writer()
    and exists (
      select 1 from public.surveys s
      where s.id = ai_report_context.survey_id
        and public.has_project_access(s.project_id)
    )
  )
  with check (
    public.is_admin_writer()
    and exists (
      select 1 from public.surveys s
      where s.id = ai_report_context.survey_id
        and public.has_project_access(s.project_id)
    )
  );

create trigger ai_report_context_set_updated_at
  before update on public.ai_report_context
  for each row execute function public.set_updated_at();

-- Snapshot of whatever context (if any) actually informed one specific
-- past report — the row above is the reusable/editable current value, this
-- is per-job, so "Recent reports" can show what a given report was told
-- even if the survey-level context has since been edited or cleared.
alter table public.ai_report_jobs add column if not exists extra_context text;
