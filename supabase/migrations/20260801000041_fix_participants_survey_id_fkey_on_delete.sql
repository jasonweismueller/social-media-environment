-- Real, reported bug: deleting a survey failed with
--   update or delete on table "surveys" violates foreign key constraint
--   "participants_survey_id_fkey" on table "participants"
-- Every other survey_id foreign key in this schema (feed_surveys,
-- survey_responses, experiment_assignments, experiment_group_counters,
-- experiment_groups, custom_measure_groups, ai_report_context) is declared
-- ON DELETE CASCADE -- participants.survey_id (20260801000006_participants.sql)
-- was the one outlier left with no ON DELETE clause at all, which defaults to
-- NO ACTION and blocks deleting any survey that ever had a participant row
-- pointing at it. Confirmed live: 4 real surveys currently have participant
-- rows, one with 1,452 of them.
--
-- Fixed with ON DELETE SET NULL, deliberately NOT CASCADE like its siblings
-- above: a participants row represents real feed-visit/engagement data whose
-- primary lifecycle is tied to feed_id (a separate FK on the same row,
-- already ON DELETE CASCADE) -- survey_id is just a "which survey this
-- participant was en route to" stamp (see utils-backend.js's
-- loadMultiFeedParticipantSurveyRoster / the 2026-08-11 "feed + survey CSV
-- leaked another survey's participants" fix for how that stamp is used).
-- Deleting a survey's definition shouldn't also erase evidence that real
-- participants engaged with the feed it was linked to. Mirrors the same
-- "preserve the primary record, null the now-dangling secondary reference"
-- pattern survey_responses.feed_id/project_id already use (both ON DELETE
-- SET NULL) for the exact same shape of problem.
alter table public.participants
  drop constraint participants_survey_id_fkey,
  add constraint participants_survey_id_fkey
    foreign key (survey_id) references public.surveys(id) on delete set null;
