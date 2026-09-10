-- Tracks real per-report spend for the "Generate AI report" feature
-- (supabase/functions/ai-study-report), so that function can enforce a
-- platform-wide monthly spend cap itself rather than relying only on
-- Anthropic's own account-level billing limits (Console -> Settings ->
-- Billing) — per direct user request: warn at $5/month, hard-stop at
-- $10/month, shared across every admin (this is about total invoice
-- exposure, not a per-researcher allowance).
--
-- One row per successful report generation. `estimated_cost_usd` is the
-- same figure the Edge Function already computes from Anthropic's own
-- response.usage (input/output/cache-read tokens x the PRICING table in
-- that function) — an estimate, not the literal invoiced amount (Anthropic
-- doesn't return exact billed cost in the API response), but the same
-- number already shown to the admin after every report, so the running
-- total and the cap it's compared against are internally consistent.
create table if not exists public.ai_report_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  model text not null,
  estimated_cost_usd numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_report_usage_created_at_idx on public.ai_report_usage (created_at);

alter table public.ai_report_usage enable row level security;

-- Read-only for any signed-in admin (so the Analysis Hub page can show
-- "this month: $X of $10" to an editor too, not just owners) — no
-- write policy for any client role at all. The Edge Function inserts rows
-- via its own service-role client, which bypasses RLS entirely, same as
-- every other Edge-Function-only write in this schema.
create policy ai_report_usage_select_admins
  on public.ai_report_usage for select
  to authenticated
  using (true);
