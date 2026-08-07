-- Makes assign_experiment_group aware of likely-abandoned sessions, per
-- direct request: Prolific studies routinely have several participants
-- "in flight" at once, so assignment has to happen at start (no way to
-- wait for anyone to finish before deciding the next person's group) --
-- but the thing a researcher actually wants balanced is *completions*, not
-- starts. Plain round-robin (the previous behavior, migration
-- 20260801000015) balances starts perfectly and has no way to notice that
-- one condition's early assignees mostly dropped off, so completions can
-- drift badly imbalanced over a study's lifetime with no self-correction.
--
-- Fix: instead of a blind next-in-rotation pick, assign to whichever
-- group currently has the fewest "live" assignments, where live means
-- "has a completed survey_responses row" OR "was assigned within the last
-- 30 minutes" (may still complete). An assignment older than 30 minutes
-- with no completed response is assumed abandoned, per direct instruction,
-- and stops counting toward that group looking full -- nothing is
-- deleted, the row stays in experiment_assignments for the record, it
-- just no longer suppresses new assignments to that group. Ties (the
-- common case whenever nobody has actually dropped out yet) are broken
-- using the exact same counter-rotation mechanism the old pure round-robin
-- used, so with zero dropout this is byte-for-byte equivalent to the
-- previous behavior -- the live-count check only ever changes behavior
-- once a real imbalance has actually appeared.
--
-- Deliberately keeps the exact same 3-parameter signature as before
-- (p_survey_id, p_session_id, p_participant_id) rather than adding a
-- p_abandon_after parameter -- CREATE OR REPLACE FUNCTION identifies a
-- function by its parameter list, so a 4th parameter (even with a
-- default) would create a second, separate overload rather than replacing
-- this one, and named-argument calls (which supabase.rpc always uses)
-- would then face an ambiguous-call risk between the two. The 30-minute
-- window is a literal in the function body instead; revisit as its own
-- follow-up if it ever needs to be tunable per survey.
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
  v_min_live_count integer;
  v_tied_group_ids text[];
  v_tied_count integer;
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

  -- Locks the counter row for the rest of this call, same as before -- this
  -- also serializes the live-count read just below against any other
  -- concurrent assign_experiment_group call for this same survey, so 10
  -- participants starting at once still can't race each other into an
  -- inconsistent view of who currently looks "live" per group.
  select counter into v_counter
    from public.experiment_group_counters
    where survey_id = p_survey_id
    for update;

  -- Both v_min_live_count and v_tied_group_ids have to come out of the same
  -- statement -- a CTE's scope is a single SQL statement in plpgsql, it
  -- can't be split across two "select ... into" calls the way a plain
  -- local variable can.
  with live_counts as (
    select
      eg.id as group_id,
      eg.sort_order,
      count(ea.id) filter (
        where exists (
          select 1 from public.survey_responses sr
          where sr.survey_id = p_survey_id and sr.session_id = ea.session_id
        )
        or ea.assigned_at > now() - interval '30 minutes'
      ) as live_count
    from public.experiment_groups eg
    left join public.experiment_assignments ea
      on ea.survey_id = eg.survey_id and ea.group_id = eg.id
    where eg.survey_id = p_survey_id
    group by eg.id, eg.sort_order
  ),
  min_count as (
    select min(live_count) as v from live_counts
  )
  select
    (select v from min_count),
    array_agg(lc.group_id order by lc.sort_order, lc.group_id)
  into v_min_live_count, v_tied_group_ids
  from live_counts lc, min_count
  where lc.live_count = min_count.v;

  v_tied_count := coalesce(array_length(v_tied_group_ids, 1), 0);

  -- v_tied_count should always be >= 1 given v_group_count > 0 above; the
  -- plain-round-robin fallback is just defense against an unexpected empty
  -- CTE result, so this can never leave v_group_id null.
  if v_tied_count > 0 then
    v_group_id := v_tied_group_ids[(v_counter % v_tied_count) + 1];
  else
    v_group_id := v_group_ids[(v_counter % v_group_count) + 1];
  end if;

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
