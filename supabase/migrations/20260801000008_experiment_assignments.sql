-- Experiment group assignment. Replaces the round-robin scheme built on
-- LockService + a PropertiesService counter (assignExperimentGroup_ in
-- Code.gs). Postgres gives us a strictly better primitive for this: a
-- counter row locked with `SELECT ... FOR UPDATE` inside a single
-- transaction, which serializes concurrent assignments without any
-- external lock service and is idempotent per (survey_id, session_id) via
-- a unique constraint — matching the "idempotent per session_id" guarantee
-- CLAUDE.md calls out for the current implementation.
--
-- Unlike every other table in this migration set, this one is NOT meant to
-- be reachable directly through the PostgREST table API — no INSERT policy
-- is granted to anon/authenticated below. The only sanctioned write path is
-- the assign_experiment_group() RPC function, which does the
-- lock-read-increment-insert atomically. Direct table inserts would race
-- and break the round-robin balance the whole feature exists for.

create table public.experiment_group_counters (
  survey_id text primary key references public.surveys(id) on delete cascade,
  counter integer not null default 0
);

create table public.experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  survey_id text not null references public.surveys(id) on delete cascade,
  session_id text not null,
  participant_id text,
  group_id text not null,
  assigned_at timestamptz not null default now(),
  unique (survey_id, session_id)
);

create index experiment_assignments_survey_id_idx on public.experiment_assignments (survey_id);

alter table public.experiment_group_counters enable row level security;
alter table public.experiment_assignments enable row level security;

-- Admin-only read. No insert/update/delete policies for either table at
-- all — see note above; writes only happen inside the SECURITY DEFINER
-- function below, which bypasses RLS as its owning role.
create policy "experiment_assignments_select_admins"
  on public.experiment_assignments for select
  to authenticated
  using (public.is_admin_reader());

-- Backs the admin "reset balance" action (reset_experiment_group_assignments
-- in Code.gs): clears assignments + the counter for one survey, for when
-- live balance has drifted (participants started but never finished).
create policy "experiment_assignments_delete_editors"
  on public.experiment_assignments for delete
  to authenticated
  using (public.is_admin_writer());

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
  v_groups jsonb;
  v_group_count integer;
  v_counter integer;
  v_group_id text;
begin
  -- Idempotent: a session_id that already has an assignment (retry, page
  -- reload mid-study, etc.) gets the same group back rather than a new roll.
  select group_id into v_existing
    from public.experiment_assignments
    where survey_id = p_survey_id and session_id = p_session_id;

  if v_existing is not null then
    return v_existing;
  end if;

  select definition -> 'experiment_groups' into v_groups
    from public.surveys
    where id = p_survey_id;

  v_group_count := coalesce(jsonb_array_length(v_groups), 0);
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

  v_group_id := v_groups -> (v_counter % v_group_count) ->> 'id';

  update public.experiment_group_counters
    set counter = v_counter + 1
    where survey_id = p_survey_id;

  insert into public.experiment_assignments (survey_id, session_id, participant_id, group_id)
    values (p_survey_id, p_session_id, p_participant_id, v_group_id)
    -- A second concurrent call for the same session that lost the race to
    -- the idempotency check above still can't double-insert.
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

-- Reset-balance admin action, kept as its own function (rather than a bare
-- DELETE from the client) so both tables stay in sync in one call.
create or replace function public.reset_experiment_group_assignments(p_survey_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_writer() then
    raise exception 'insufficient privilege';
  end if;

  delete from public.experiment_assignments where survey_id = p_survey_id;
  delete from public.experiment_group_counters where survey_id = p_survey_id;
end;
$$;

revoke all on function public.assign_experiment_group(text, text, text) from public;
grant execute on function public.assign_experiment_group(text, text, text) to anon, authenticated;

revoke all on function public.reset_experiment_group_assignments(text) from public;
grant execute on function public.reset_experiment_group_assignments(text) to authenticated;
