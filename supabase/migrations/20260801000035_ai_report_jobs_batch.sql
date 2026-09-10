-- Batches-API rewrite (2026-09-11, see ai-study-report/index.ts's own header
-- comment for the full reasoning). Even after the 2026-09-10 background-job
-- rewrite, the actual Anthropic call still ran inside one Supabase function
-- invocation's EdgeRuntime.waitUntil() background work — which is bound by
-- the same wall-clock limit as the invocation itself (150s Free plan, 400s
-- paid; waitUntil() does not extend it). A report that genuinely needed
-- longer than that had no real fix short of upgrading the Supabase plan,
-- and even 400s wasn't a guarantee for a large study.
--
-- Fix: submit generation to Anthropic's Message Batches API instead of
-- calling /v1/messages directly. Submission itself returns a batch id
-- almost instantly; the actual generation then runs entirely on Anthropic's
-- own infrastructure, decoupled from any Supabase execution ceiling. These
-- two columns let a later poll (from a fresh, short-lived function
-- invocation) find the in-flight batch and, once Anthropic marks it ended,
-- fetch its result and clean up the uploaded file.
alter table public.ai_report_jobs add column if not exists anthropic_batch_id text;
alter table public.ai_report_jobs add column if not exists anthropic_file_id text;
