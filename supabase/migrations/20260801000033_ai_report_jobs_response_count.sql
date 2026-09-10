-- Lets the Analysis Hub page compute a real $/response ratio from past
-- completed reports (instead of a static formula that badly undercounts
-- code_execution's real multi-turn cost — confirmed live: one real 305-
-- response report cost $1.48, ~15x the old naive estimate of $0.097) and
-- extrapolate it to a differently-sized survey. Purely additive; existing
-- rows (none yet in production at the time of this migration) just get
-- null here, which the frontend already treats as "no historical data for
-- this row" and skips.
alter table public.ai_report_jobs add column if not exists response_count integer;
