-- Pulls experiment group *definitions* out of surveys.definition jsonb into
-- a real table, and adds a new table for custom measure groups (previously
-- localStorage-only in the admin Survey Participants analysis hub, per
-- CLAUDE.md's "Survey Participants analysis hub: correctness fixes" note —
-- never synced across browsers/admins, a real known gap this closes).
--
-- Group *assignments* (experiment_assignments/experiment_group_counters,
-- migration 20260801000008) already lived in their own tables — only the
-- group id/name/feed_sequence_ids definitions themselves were still buried
-- inside the survey's jsonb blob, which is what made adding
-- feed_sequence_ids to that shape a "same field, 5 separate places" footgun
-- (CLAUDE.md, "Experiment groups can now route feed(s) sequences"). Moving
-- the definitions into their own FK'd table doesn't remove every one of
-- those 5 places (the in-memory JS/TS object shape survey.experiment_groups
-- is deliberately kept identical everywhere — admin editor, App-*.jsx
-- routing, survey-sanitize.ts/utils-survey.js validation are UNCHANGED by
-- this migration), but it does make the *storage* layer relational: real FK
-- cascade on survey delete, and assign_experiment_group (below) reads a real
-- table instead of indexing into a jsonb array.
--
-- Confirmed before writing this: two real, currently-live surveys already
-- have experiment_groups with real participant assignments ("Prebunk Paper
-- Study 1 - Main", 32 assignments; "Prebunk Paper Study 2", 2 assignments) —
-- the backfill below is a genuine data migration, not a greenfield table,
-- and assign_experiment_group is switched over to the new table in the same
-- migration so there's no window where a survey's groups exist in one place
-- but not the other.

create table public.experiment_groups (
  survey_id text not null references public.surveys(id) on delete cascade,
  id text not null,
  name text not null,
  feed_sequence_ids text[] not null default '{}',
  sort_order integer not null default 0,
  primary key (survey_id, id)
);

create index experiment_groups_survey_id_idx on public.experiment_groups (survey_id);

alter table public.experiment_groups enable row level security;

-- Participants read this indirectly via supabaseLoadSurveyDefinition (the
-- same anon-key client that already reads surveys.definition), not just
-- admins — same public-select reasoning as feed_surveys.
create policy "experiment_groups_select_public"
  on public.experiment_groups for select
  to anon, authenticated
  using (true);

create policy "experiment_groups_write_editors"
  on public.experiment_groups for all
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());

-- Backfill from every existing survey's definition->experiment_groups
-- before assign_experiment_group is switched over below, so there's no gap
-- where a live survey's groups are missing from the new table. jsonb array
-- position is preserved as sort_order (round-robin fairness doesn't
-- actually depend on order, but the admin editor's "Group 1/2/3" display
-- and each group's own feed_sequence_ids ordering should stay stable).
insert into public.experiment_groups (survey_id, id, name, feed_sequence_ids, sort_order)
select
  s.id,
  g.value ->> 'id',
  coalesce(nullif(g.value ->> 'name', ''), 'Group ' || g.ordinality::text),
  coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(g.value -> 'feed_sequence_ids', '[]'::jsonb)) as x),
    '{}'
  ),
  (g.ordinality - 1)::integer
from public.surveys s
cross join lateral jsonb_array_elements(coalesce(s.definition -> 'experiment_groups', '[]'::jsonb))
  with ordinality as g(value, ordinality)
where coalesce(g.value ->> 'id', '') <> ''
on conflict (survey_id, id) do nothing;

-- Same round-robin logic as before (20260801000008_experiment_assignments.sql)
-- except v_groups (a jsonb array read from surveys.definition) is replaced
-- with v_group_ids (a real array read from experiment_groups). Assignment
-- idempotency (experiment_assignments unique (survey_id, session_id)) and
-- the counter-locking behavior are both completely unchanged.
create or replace function public.assign_experiment_group(
  p_survey_id text,
  p_session_id text,
  p_participant_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_group_ids text[];
  v_group_count integer;
  v_counter integer;
  v_group_id text;
begin
  select group_id into v_existing
    from public.experiment_assignments
    where survey_id = p_survey_id and session_id = p_session_id;

  if v_existing is not null then
    return v_existing;
  end if;

  select array_agg(id order by sort_order, id) into v_group_ids
    from public.experiment_groups
    where survey_id = p_survey_id;

  v_group_count := coalesce(array_length(v_group_ids, 1), 0);
  if v_group_count = 0 then
    raise exception 'survey % has no experiment_groups defined', p_survey_id;
  end if;

  insert into public.experiment_group_counters (survey_id, counter)
    values (p_survey_id, 0)
    on conflict (survey_id) do nothing;

  select counter into v_counter
    from public.experiment_group_counters
    where survey_id = p_survey_id
    for update;

  -- Postgres arrays are 1-indexed.
  v_group_id := v_group_ids[(v_counter % v_group_count) + 1];

  update public.experiment_group_counters
    set counter = v_counter + 1
    where survey_id = p_survey_id;

  insert into public.experiment_assignments (survey_id, session_id, participant_id, group_id)
    values (p_survey_id, p_session_id, p_participant_id, v_group_id)
    on conflict (survey_id, session_id) do nothing
    returning group_id into v_group_id;

  if v_group_id is null then
    select group_id into v_group_id
      from public.experiment_assignments
      where survey_id = p_survey_id and session_id = p_session_id;
  end if;

  return v_group_id;
end;
$$;

-- New feature, not a migration of existing backend data (it was
-- localStorage-only before this) — admin-only, no public/anon access is
-- needed since nothing participant-facing reads it.
create table public.custom_measure_groups (
  id text primary key,
  survey_id text not null references public.surveys(id) on delete cascade,
  name text not null,
  pattern text not null default '',
  item_keys text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_measure_groups_survey_id_idx on public.custom_measure_groups (survey_id);

create trigger custom_measure_groups_set_updated_at
  before update on public.custom_measure_groups
  for each row execute function public.set_updated_at();

alter table public.custom_measure_groups enable row level security;

create policy "custom_measure_groups_select_admins"
  on public.custom_measure_groups for select
  to authenticated
  using (public.is_admin_reader());

create policy "custom_measure_groups_write_editors"
  on public.custom_measure_groups for all
  to authenticated
  using (public.is_admin_writer())
  with check (public.is_admin_writer());
