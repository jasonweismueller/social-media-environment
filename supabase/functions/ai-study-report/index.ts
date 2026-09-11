// AI-generated study report — a real, billed Anthropic API call. NOT the
// same thing as "Export study context" (components-admin-participants-
// survey.jsx's buildStudyContextMarkdown/exportStudyContext, unchanged) —
// that button just downloads Markdown for a researcher to paste into a chat
// UI themselves, no API call, no cost to this platform. This function calls
// the Anthropic Messages API server-side with the code_execution tool, so
// the actual statistics in the report are computed by real Python running
// against the real response CSV — not estimated by the model reading a wall
// of CSV text as tokens. The CSV is handed to Anthropic's Files API and
// referenced by file_id (a `container_upload` content block), so the
// model's own prompt text never contains per-row data — only the small
// design/aggregate Markdown context the frontend already built does.
//
// Gated in three places, deliberately, all re-checked here server-side, not
// just hidden client-side — same "frontend gate is UX, not the boundary"
// posture as save-survey/admin-users: (1) the caller's own
// `profiles.ai_analysis_enabled` — a per-account grant only an owner can
// flip, from the Users & access page (20260801000030_ai_analysis_per_user.sql
// — replaced an earlier same-day draft of this feature that used one global
// app_settings switch instead, per direct user decision to make this a
// per-user grant so an owner can hand it to specific admins rather than
// turning it on for everyone at once); (2) the caller's own role
// (editor/owner), same role floor as save-survey; (3) a platform-wide
// monthly spend cap (ai_report_usage, 20260801000031_ai_report_usage.sql) —
// warns at $5, hard-stops at $10, shared across every admin — layered on
// top of, not instead of, whatever spend limit the user sets in the
// Anthropic Console itself (account-wide, covers everything on that key).
//
// Needs a real function (not a plain PostgREST call) because the
// ANTHROPIC_API_KEY must never reach the frontend — set via
// `supabase secrets set ANTHROPIC_API_KEY=... --project-ref <ref>` on each
// Supabase project this is deployed to (production AND staging separately
// — secrets aren't shared across projects). Not something Claude can set
// from this sandbox: a live-service API key is a real credential, same "the
// user runs this themselves" posture as every other secret in this repo.
//
// ===== BATCHES-API REWRITE (2026-09-11) =====
// Superseded the 2026-09-10 "background-job" design below, which still had
// a real ceiling: `action: "generate"` created a job row and returned
// immediately, but the actual Anthropic call kept running via
// EdgeRuntime.waitUntil() *inside that same function invocation* — and
// Supabase's wall-clock limit (150s Free plan, 400s paid — confirmed
// directly, not guessed, from Supabase's own docs and this project's own
// plan) governs the invocation as a whole, including any waitUntil()
// background work. A report that genuinely needed longer than
// GENERATION_TIMEOUT_MS allowed still failed — cleanly instead of
// silently, but still failed — with no real workaround short of a paid
// Supabase plan, and even 400s wasn't a hard guarantee for a large study.
//
// Real fix, not a bigger band-aid: submit the report to Anthropic's Message
// Batches API (confirmed directly from Anthropic's own docs that the
// code_execution tool is supported there) instead of calling /v1/messages
// directly. `action: "generate"` now does two fast things in the
// background — upload the CSV, then POST to /v1/messages/batches — and
// stops there; the actual generation runs entirely on Anthropic's own
// infrastructure with no Supabase execution ceiling involved at all.
// `action: "poll"` (new — replaces the old plain-PostgREST-select polling
// the frontend used to do directly against ai_report_jobs) is what the
// frontend now calls on every tick instead: a fast "is this batch done
// yet?" check against Anthropic, well under a second, that only updates
// the job row when something has actually changed. Real, meaningful
// tradeoffs from this switch, surfaced to the user before building it:
// no more live character-by-character report text (batches don't stream —
// progress is now just "still processing"), and turnaround is less
// predictable (Anthropic's own guidance: usually well under an hour, no
// hard upper bound short of the batch's own 24h expiry) — but it can no
// longer fail purely because Supabase's clock ran out, on any plan, for any
// study size. Real bonus, not just a tradeoff: Batches pricing is 50% off
// the regular Messages API for identical work (see BATCH_DISCOUNT below).
//
// Dedup guard widened from 15 minutes to 24 hours (see DEDUP_WINDOW_MS) to
// match this new reality — a real in-flight batch can now legitimately
// still be "running" long after the old window would have let a second,
// duplicate billed batch start on top of it. 24h also matches a batch's own
// outer expiration bound, so a truly stuck job still self-resolves (as an
// "expired" error, via the poll path) within the same window.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";

// Ambient global Supabase's Edge Runtime provides for exactly this
// "respond now, keep working after" pattern (mirrors Cloudflare Workers'
// event.waitUntil()). Typed loosely and guarded at the one call site below
// so `deno check` passes even though nothing declares this global in
// standard Deno/lib types.
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_API_BASE = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-5";
const ALLOWED_MODELS = new Set(["claude-sonnet-5", "claude-opus-5"]);

// $/1M tokens, cached 2026-09 — used both to show the admin a rough
// pre-generation estimate and to compute the real per-report cost recorded
// in ai_report_usage after a call actually completes (see PRICING's own use
// below) — the two numbers are deliberately the same table, so a shown
// estimate and the running monthly total stay internally consistent even
// though neither is Anthropic's own literal invoiced figure. These are
// standard (non-batch) per-token rates — BATCH_DISCOUNT below is applied on
// top when computing a real batch job's actual cost.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
};

// The Message Batches API is billed at half the standard per-token rate for
// identical work — https://platform.claude.com/docs/en/build-with-claude/batch-processing.
const BATCH_DISCOUNT = 0.5;

// Platform-wide monthly spend guardrails for this feature specifically —
// per direct user request, separate from (and in addition to) whatever
// spend limit they set in the Anthropic Console itself (account-wide,
// covers everything on that API key). Shared across every admin who's been
// granted ai_analysis_enabled — this is about bounding the platform's total
// invoice exposure from this one feature, not a per-researcher allowance.
// Calendar-month (UTC) boundary, reset automatically on the 1st.
const MONTHLY_WARNING_USD = 5;
const MONTHLY_HARD_LIMIT_USD = 10;

// How long a pending/running job is trusted as "still legitimately in
// flight" before a second Generate click is allowed to start a fresh
// (billed) batch instead of just resuming the existing one. Widened from
// 15 minutes (the old streaming design's own window) to 24 hours — a real
// batch can now take well over 15 minutes and still be completely healthy,
// and 24 hours matches a batch's own outer expiration bound, so a truly
// stuck job still self-resolves (as an "expired" error, discovered the next
// time it's polled) within the same window rather than blocking forever.
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

// Generous timeouts for the two kinds of Anthropic calls this function
// itself still makes synchronously (never the report generation itself,
// which now happens entirely on Anthropic's side, outside any of this):
// submitting a batch (upload + create — both plain, fast POSTs, even for a
// several-MB CSV) and checking/finalizing one (a status GET, or — once
// ended — fetching a results file that's realistically at most a few
// hundred KB of report text plus a short code transcript). Both are
// comfortably under Supabase's wall-clock limit on either plan tier.
const SUBMIT_TIMEOUT_MS = 60 * 1000;
const POLL_CHECK_TIMEOUT_MS = 45 * 1000;

function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Sums estimated_cost_usd across every ai_report_usage row since the start
// of the current UTC month. Small table (one row per report ever
// generated), so a plain select-and-sum client-side is simpler than a
// Postgres aggregate function for what's realistically a handful of rows
// per month — revisit if usage ever grows enough for that to matter.
async function getMonthlySpendUsd(admin: any): Promise<number> {
  const { data, error } = await admin
    .from("ai_report_usage")
    .select("estimated_cost_usd")
    .gte("created_at", startOfCurrentMonthIso());
  if (error) throw new Error(error.message);
  return (data || []).reduce((sum: number, row: any) => sum + Number(row.estimated_cost_usd || 0), 0);
}

// Thin wrapper around fetch() with a real timeout and a clearer error than
// a bare AbortError when one fires — every Anthropic call in this file goes
// through this, never a bare fetch(), so nothing can hang indefinitely.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as any)?.name === "AbortError") {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function anthropicHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, ...extra };
}

async function deleteAnthropicFile(apiKey: string, fileId: string): Promise<void> {
  try {
    await fetchWithTimeout(
      `${ANTHROPIC_API_BASE}/v1/files/${fileId}`,
      { method: "DELETE", headers: anthropicHeaders(apiKey) },
      SUBMIT_TIMEOUT_MS,
      "Deleting uploaded file"
    );
  } catch (e) {
    // Best-effort cleanup — don't let response data sit in Anthropic's
    // Files storage indefinitely, but don't fail a whole job over it either.
    console.error("deleteAnthropicFile failed:", e);
  }
}

const SYSTEM_PROMPT = `You are a careful, conservative research-methods assistant helping a
behavioral-science researcher get a first-pass, honest read on their study's
data. You have a code_execution tool with Python (pandas, numpy, scipy
available) — use it to actually compute every statistic you report; never
estimate or guess a number from eyeballing text. If a response CSV file is
attached to this conversation, read it in code before writing anything
about it, and recompute every measure/comparison described in the context
directly from it rather than trusting the aggregate numbers already given.

You are billed per token and per code_execution turn, so work efficiently:
load the data and compute EVERY statistic you'll need (means, SDs, tests,
effect sizes, reliability, etc.) in as few code_execution calls as possible
— ideally one or two, computing many things in the same script rather than
one thing per call. Do not re-run the same or similar computation multiple
times to double-check it, and do not iteratively explore the data out of
curiosity. As soon as you have the numbers you need, stop running code and
write the report. If you notice you are many steps in and have not started
writing the report yet, stop investigating and write it now with whatever
you have already computed, noting any gaps briefly rather than continuing
to explore.

Write a plain-Markdown report with these sections, in this order:
1. Study overview — one paragraph restating the design in your own words,
   from the context given.
2. Sample — N, completion rate if derivable, any data-quality flags already
   noted in the context.
3. Key results — for each measure/composite and each group comparison
   described in the context, recompute it directly from the CSV (mean, SD,
   N, test statistic, p-value, effect size where applicable) and report the
   real number with a correct plain-language interpretation.
4. Anything worth flagging — low reliability, small cells, potential
   confounds, missing-data patterns.
5. Suggested next steps for the write-up.

Be honest about uncertainty and small samples — do not overstate a
non-significant result as a trend unless you say so explicitly, and do not
fabricate a statistic you did not actually compute in code. Do not generate
image/chart files — describe patterns in words instead, this report is read
as plain text. Keep the whole report under roughly 1200 words.`;

function buildPrompt(markdown: string, hasCsv: boolean, csvFilename: string, extraContext: string): string {
  const header =
    "Here is the design, content, and aggregate statistics for a research study, exported from the platform's own admin dashboard:";
  const csvNote = hasCsv
    ? `\n\nA CSV of every individual (de-identified) survey response has been attached to this conversation as an uploaded file named "${csvFilename}". Use the code_execution tool to load it (e.g. with pandas) and compute every statistic in your report directly from it — the aggregate numbers in the context above are for orientation only, not a substitute for recomputing from the real data.`
    : `\n\nNo response-level CSV was attached (there may be too few responses yet, or none) — write the report from the aggregate context above only, and say plainly that no per-response computation was possible.`;
  // Researcher-provided hypotheses/specific comparisons, when given, are
  // placed prominently and *before* the raw design context — built after a
  // real report ran generic pooled comparisons instead of the researcher's
  // actual by-condition hypothesis test, purely because nothing told it
  // which comparisons were the ones that mattered. Framed as something to
  // prioritize testing explicitly, not something to assume the answer to —
  // SYSTEM_PROMPT's own honesty instructions still apply on top of this.
  const extraContextBlock = extraContext.trim()
    ? `IMPORTANT — the researcher who ran this study has provided the following context, specific hypotheses, and/or comparisons they want tested. Treat this as the primary guide for what "Key results" should cover — run these specific comparisons explicitly, by name, in addition to (not instead of) anything else in the data worth reporting. Do not assume the outcome; compute each one for real and report the true result even if it doesn't match what the researcher expected:\n\n"""\n${extraContext.trim()}\n"""\n\n`
    : "";
  return `${extraContextBlock}${header}\n\n${markdown}${csvNote}`;
}

function buildBatchParams(markdown: string, hasCsv: boolean, csvFilename: string, fileId: string | null, model: string, extraContext: string) {
  const userContent: any[] = [{ type: "text", text: buildPrompt(markdown, hasCsv, csvFilename, extraContext) }];
  if (fileId) userContent.push({ type: "container_upload", file_id: fileId });
  return {
    model,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    tools: [{ type: "code_execution_20260521", name: "code_execution" }],
    // Deliberately no `stream` field — the Message Batches API only ever
    // returns a complete, non-streamed message per request.
  };
}

// Step 1 of 2: upload the CSV (if any) and submit the batch. Runs via
// EdgeRuntime.waitUntil() *after* the HTTP response has already been sent,
// so nothing about the caller's connection can affect it — but unlike the
// old design, this itself does almost no waiting: both Anthropic calls here
// are plain, fast requests, not the report generation itself. Once the
// batch id is known, this writes it to the job row and returns; the actual
// generation is checked/finalized later, from a separate `action: "poll"`
// call (see checkAndAdvanceBatchJob below), not from here.
async function submitReportBatch(opts: {
  admin: any;
  apiKey: string;
  jobId: string;
  markdown: string;
  csv: string;
  csvFilename: string;
  model: string;
  extraContext: string;
}): Promise<void> {
  const { admin, apiKey, jobId, markdown, csv, csvFilename, model, extraContext } = opts;
  let fileId: string | null = null;
  let batchSubmitted = false;
  try {
    if (csv && csv.length > 0) {
      const form = new FormData();
      form.append("file", new Blob([csv], { type: "text/csv" }), csvFilename);
      const uploadRes = await fetchWithTimeout(
        `${ANTHROPIC_API_BASE}/v1/files`,
        { method: "POST", headers: anthropicHeaders(apiKey), body: form },
        SUBMIT_TIMEOUT_MS,
        "Uploading response CSV"
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Anthropic file upload failed (${uploadRes.status}): ${errText.slice(0, 500)}`);
      }
      const uploaded = await uploadRes.json();
      fileId = uploaded?.id || null;
    }

    const batchRes = await fetchWithTimeout(
      `${ANTHROPIC_API_BASE}/v1/messages/batches`,
      {
        method: "POST",
        headers: anthropicHeaders(apiKey, { "content-type": "application/json" }),
        body: JSON.stringify({
          requests: [{ custom_id: "report", params: buildBatchParams(markdown, !!fileId, csvFilename, fileId, model, extraContext) }],
        }),
      },
      SUBMIT_TIMEOUT_MS,
      "Submitting report batch"
    );
    if (!batchRes.ok) {
      const errText = await batchRes.text().catch(() => "");
      throw new Error(`Anthropic batch submission failed (${batchRes.status}): ${errText.slice(0, 800)}`);
    }
    const batch = await batchRes.json();
    const batchId = batch?.id;
    if (!batchId) throw new Error("Anthropic did not return a batch id.");
    batchSubmitted = true;

    await admin
      .from("ai_report_jobs")
      .update({
        status: "running",
        anthropic_batch_id: batchId,
        anthropic_file_id: fileId,
        progress_note:
          "Submitted to Anthropic — generating on their own infrastructure now. Usually finishes within a few minutes; can occasionally take longer for a large study. Safe to close this page; it'll be here when you come back.",
      })
      .eq("id", jobId);
  } catch (e) {
    const message = String((e as Error)?.message || e);
    try {
      await admin.from("ai_report_jobs").update({ status: "error", error: message, progress_note: null }).eq("id", jobId);
    } catch (updateErr) {
      console.error("ai_report_jobs error-update failed (submit step):", updateErr);
    }
    if (fileId && !batchSubmitted) {
      await deleteAnthropicFile(apiKey, fileId);
    }
  }
}

function describeBatchProgress(createdAt: string): string {
  const elapsedMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const elapsedMin = Math.round(elapsedMs / 60000);
  const elapsedLabel = elapsedMin < 1 ? "under a minute" : `${elapsedMin} minute${elapsedMin === 1 ? "" : "s"}`;
  return `Still generating on Anthropic's own infrastructure (usually a few minutes, occasionally longer for a large study) — ${elapsedLabel} so far.`;
}

// Turns one finished batch result (a single line of the batch's results
// JSONL — this batch only ever has the one "report" request in it) into a
// finished job row: the real report text, real usage/cost (at the Batches
// API's 50%-off rate), and a richer execution trace than the old streaming
// design could show live, since the whole final message is available at
// once here rather than being reconstructed incrementally from SSE events.
async function finalizeBatchResult(admin: any, apiKey: string, job: any, resultObj: any): Promise<any> {
  const cleanup = async () => {
    if (job.anthropic_file_id) await deleteAnthropicFile(apiKey, job.anthropic_file_id);
  };

  const result = resultObj?.result;
  const resultType = result?.type;

  if (resultType !== "succeeded") {
    await cleanup();
    const errMsg =
      resultType === "errored"
        ? `Anthropic returned an error for this batch request: ${result?.error?.message || result?.error?.type || "unknown error"}`
        : resultType === "canceled"
        ? "This report's batch request was canceled."
        : resultType === "expired"
        ? "This report's batch request expired before it could complete (batch requests expire after 24 hours)."
        : `Unexpected batch result type: ${resultType || "unknown"}`;
    const update = { status: "error", error: errMsg, progress_note: null };
    await admin.from("ai_report_jobs").update(update).eq("id", job.id);
    return { ...job, ...update };
  }

  const message = result.message;
  const contentBlocks: any[] = Array.isArray(message?.content) ? message.content : [];
  const reportText = contentBlocks
    .filter((b) => b?.type === "text")
    .map((b) => b.text || "")
    .join("\n\n")
    .trim();
  // Richer than the old streaming design's {index, type} — the whole final
  // message is available in one shot here, so the existing "View the code
  // Claude ran" panel can show the actual code/output, not just block
  // labels. Truncated per-block so a large printed dataframe can't bloat
  // this jsonb column unreasonably.
  const steps = contentBlocks.map((b, i) => {
    const base: any = { index: i + 1, type: b?.type || "content" };
    if (b?.type === "server_tool_use" && typeof b?.input?.code === "string") {
      base.code = b.input.code.slice(0, 4000);
    }
    if (b?.type === "code_execution_tool_result") {
      const inner = Array.isArray(b?.content) ? b.content : b?.content ? [b.content] : [];
      const stdout = inner.map((c: any) => c?.stdout).filter((s: any) => typeof s === "string").join("\n").slice(0, 4000);
      const stderr = inner.map((c: any) => c?.stderr).filter((s: any) => typeof s === "string").join("\n").slice(0, 2000);
      if (stdout) base.stdout = stdout;
      if (stderr) base.stderr = stderr;
    }
    return base;
  });

  const usage = message?.usage || {};
  const price = PRICING[job.model] || PRICING[DEFAULT_MODEL];
  const inputTok = Number(usage.input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0);
  const cacheReadTok = Number(usage.cache_read_input_tokens || 0);
  const outputTok = Number(usage.output_tokens || 0);
  const estimatedCostUsd =
    ((inputTok * price.input) / 1e6 + (cacheReadTok * price.input * 0.1) / 1e6 + (outputTok * price.output) / 1e6) * BATCH_DISCOUNT;

  await cleanup();

  if (!reportText) {
    const update = {
      status: "error",
      error: `Anthropic returned no report text (stop_reason: ${message?.stop_reason || "unknown"}).`,
      usage,
      estimated_cost_usd: Number(estimatedCostUsd.toFixed(4)),
      progress_note: null,
    };
    await admin.from("ai_report_jobs").update(update).eq("id", job.id);
    return { ...job, ...update };
  }

  try {
    const { error: insertErr } = await admin
      .from("ai_report_usage")
      .insert({ user_id: job.user_id, model: job.model, estimated_cost_usd: Number(estimatedCostUsd.toFixed(6)) });
    if (insertErr) console.error("ai_report_usage insert failed:", insertErr.message);
  } catch (e) {
    console.error("ai_report_usage insert threw:", e);
  }

  const update = {
    status: "done",
    report_markdown: reportText,
    usage,
    estimated_cost_usd: Number(estimatedCostUsd.toFixed(4)),
    execution_trace: steps,
    progress_note: null,
  };
  await admin.from("ai_report_jobs").update(update).eq("id", job.id);
  return { ...job, ...update };
}

// Step 2 of 2, called on every `action: "poll"` request for a still
// pending/running job that already has an anthropic_batch_id — a fast
// status check (well under a second), only doing real work (fetching
// results + finalizing) once Anthropic reports the batch as "ended". Always
// resolves to a row shape the caller can return directly; never throws —
// an Anthropic-side failure here is persisted as a real job error instead
// of surfacing as a bare 500 with nothing saved.
async function checkAndAdvanceBatchJob(admin: any, apiKey: string, job: any): Promise<any> {
  try {
    const statusRes = await fetchWithTimeout(
      `${ANTHROPIC_API_BASE}/v1/messages/batches/${job.anthropic_batch_id}`,
      { headers: anthropicHeaders(apiKey) },
      POLL_CHECK_TIMEOUT_MS,
      "Checking batch status"
    );
    if (!statusRes.ok) {
      const errText = await statusRes.text().catch(() => "");
      throw new Error(`Anthropic batch status check failed (${statusRes.status}): ${errText.slice(0, 500)}`);
    }
    const batch = await statusRes.json();

    if (batch?.processing_status !== "ended") {
      const note = describeBatchProgress(job.created_at);
      if (note !== job.progress_note) {
        await admin.from("ai_report_jobs").update({ progress_note: note }).eq("id", job.id);
      }
      return { ...job, progress_note: note };
    }

    if (!batch?.results_url) {
      throw new Error("Anthropic marked this batch as ended but returned no results.");
    }
    const resultsRes = await fetchWithTimeout(
      batch.results_url,
      { headers: anthropicHeaders(apiKey) },
      POLL_CHECK_TIMEOUT_MS,
      "Fetching batch results"
    );
    if (!resultsRes.ok) {
      const errText = await resultsRes.text().catch(() => "");
      throw new Error(`Fetching batch results failed (${resultsRes.status}): ${errText.slice(0, 500)}`);
    }
    const resultsText = await resultsRes.text();
    const line = resultsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0];
    if (!line) throw new Error("Batch ended with no result lines.");
    return await finalizeBatchResult(admin, apiKey, job, JSON.parse(line));
  } catch (e) {
    const message = String((e as Error)?.message || e);
    try {
      await admin.from("ai_report_jobs").update({ status: "error", error: message, progress_note: null }).eq("id", job.id);
    } catch (updateErr) {
      console.error("ai_report_jobs error-update failed (poll step):", updateErr);
    }
    return { ...job, status: "error", error: message, progress_note: null };
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, err: "method not allowed" }, { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return jsonResponse({ ok: false, err: "missing Authorization bearer token" }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ ok: false, err: "invalid or expired session" }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role, disabled, ai_analysis_enabled")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileErr) {
    return jsonResponse({ ok: false, err: profileErr.message }, { status: 500 });
  }
  if (!profile || profile.disabled || !["editor", "owner"].includes(profile.role)) {
    return jsonResponse({ ok: false, err: "editor role required" }, { status: 403 });
  }
  if (profile.ai_analysis_enabled !== true) {
    return jsonResponse(
      {
        ok: false,
        err: "AI analysis isn't enabled for your account. An owner can turn it on for you from the Users & access page.",
      },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, err: "invalid JSON body" }, { status: 400 });
  }

  // Read-only spend check (Analysis Hub page calls this on load, and after
  // every generation, to show "$X of $10 this month" and pre-emptively
  // disable the button) — no Anthropic call, so doesn't need ANTHROPIC_API_KEY
  // configured at all and is available even to an account whose only
  // problem is a missing secret on this project.
  if (body?.check_only === true) {
    try {
      const monthlySpendUsd = await getMonthlySpendUsd(admin);
      return jsonResponse({
        ok: true,
        monthly_spend_usd: Number(monthlySpendUsd.toFixed(4)),
        monthly_warning_usd: MONTHLY_WARNING_USD,
        monthly_hard_limit_usd: MONTHLY_HARD_LIMIT_USD,
      });
    } catch (e) {
      return jsonResponse({ ok: false, err: String((e as Error)?.message || e) }, { status: 500 });
    }
  }

  // Poll one job's status — replaces the plain PostgREST select the
  // frontend used to do directly against ai_report_jobs (see this file's
  // own "BATCHES-API REWRITE" header comment). Needs to be a real function
  // call now, not a bare table read, because it's what actually asks
  // Anthropic "is this batch done yet?" and finalizes the row once it is.
  if (body?.action === "poll") {
    const jobId = String(body?.job_id || "").trim();
    if (!jobId) return jsonResponse({ ok: false, err: "job_id is required" }, { status: 400 });

    const { data: jobRow, error: jobErr } = await admin
      .from("ai_report_jobs")
      .select(
        "id, user_id, model, status, report_markdown, progress_note, usage, estimated_cost_usd, execution_trace, error, anthropic_batch_id, anthropic_file_id, extra_context, created_at"
      )
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) return jsonResponse({ ok: false, err: jobErr.message }, { status: 500 });
    if (!jobRow) return jsonResponse({ ok: false, err: "report job not found" }, { status: 404 });
    if (jobRow.user_id !== userData.user.id) {
      return jsonResponse({ ok: false, err: "not authorized to view this report job" }, { status: 403 });
    }

    let resultRow = jobRow;
    if (jobRow.status === "pending" || jobRow.status === "running") {
      if (!jobRow.anthropic_batch_id) {
        // Still inside the initial submit step (uploading the CSV / creating
        // the batch, both quick) — nothing to check on Anthropic's side yet.
        resultRow = jobRow;
      } else {
        const pollApiKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!pollApiKey) {
          return jsonResponse(
            { ok: false, err: "ANTHROPIC_API_KEY is not configured on this Supabase project." },
            { status: 500 }
          );
        }
        resultRow = await checkAndAdvanceBatchJob(admin, pollApiKey, jobRow);
      }
    }

    return jsonResponse({
      ok: true,
      job: {
        id: resultRow.id,
        status: resultRow.status,
        report_markdown: resultRow.report_markdown,
        progress_note: resultRow.progress_note,
        usage: resultRow.usage,
        estimated_cost_usd: resultRow.estimated_cost_usd,
        execution_trace: resultRow.execution_trace,
        error: resultRow.error,
        model: resultRow.model,
        extra_context: resultRow.extra_context,
        created_at: resultRow.created_at,
      },
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      {
        ok: false,
        err: "ANTHROPIC_API_KEY is not configured on this Supabase project. Run: supabase secrets set ANTHROPIC_API_KEY=... --project-ref <ref>",
      },
      { status: 500 }
    );
  }

  const markdown = String(body?.markdown || "").trim();
  const csv = typeof body?.csv === "string" ? body.csv : "";
  const csvFilename = (String(body?.csv_filename || "survey_responses.csv").replace(/[^\w.\-]+/g, "_") || "survey_responses.csv").slice(0, 120);
  const model = ALLOWED_MODELS.has(body?.model) ? body.model : DEFAULT_MODEL;
  const surveyId = body?.survey_id ? String(body.survey_id).slice(0, 200) : null;
  // Purely descriptive — used only to compute a real $/response ratio for
  // future cost estimates (see the Analysis Hub page's estimateReportCost),
  // never trusted for anything security/billing-relevant.
  const responseCount = Number.isFinite(Number(body?.response_count)) ? Math.max(0, Math.round(Number(body.response_count))) : null;
  // Optional researcher-provided hypotheses/specific comparisons (see
  // ai_report_context, 20260801000036_ai_report_context.sql) — capped well
  // under the markdown/CSV limits above since this is meant to be a short
  // steer, not another data dump.
  const extraContext = typeof body?.extra_context === "string" ? body.extra_context.slice(0, 8000) : "";

  if (!markdown) {
    return jsonResponse({ ok: false, err: "markdown study context is required" }, { status: 400 });
  }
  // A CSV this large (~15MB of raw text) would already be an unusual study
  // by this app's standards — reject rather than silently spend a lot on a
  // single call that's more likely a bug than an intentional huge export.
  if (csv.length > 15_000_000) {
    return jsonResponse({ ok: false, err: "response CSV is too large for a single AI report (over ~15MB)." }, { status: 400 });
  }

  // Hard cap, checked against the total *before* this call is dispatched —
  // not "current total + this call's own eventual cost", since that cost
  // isn't known until Anthropic actually finishes the batch (which now
  // happens well after this check, entirely on Anthropic's side). This
  // means one in-flight batch can still push the running total slightly
  // past $10 (reports typically cost a few cents to around a quarter of a
  // dollar, so the overshoot is small and bounded), but the *next* generate
  // request is reliably blocked once the total has crossed it.
  let monthlySpendBeforeCall = 0;
  try {
    monthlySpendBeforeCall = await getMonthlySpendUsd(admin);
  } catch (e) {
    return jsonResponse({ ok: false, err: String((e as Error)?.message || e) }, { status: 500 });
  }
  if (monthlySpendBeforeCall >= MONTHLY_HARD_LIMIT_USD) {
    return jsonResponse(
      {
        ok: false,
        err: `Monthly AI analysis spend cap ($${MONTHLY_HARD_LIMIT_USD}) reached for this platform (currently ~$${monthlySpendBeforeCall.toFixed(
          2
        )} this month). Resets on the 1st.`,
        monthly_spend_usd: Number(monthlySpendBeforeCall.toFixed(4)),
        monthly_warning_usd: MONTHLY_WARNING_USD,
        monthly_hard_limit_usd: MONTHLY_HARD_LIMIT_USD,
      },
      { status: 403 }
    );
  }

  // Dedup guard — reuse an already in-flight job for this user+survey
  // instead of starting a second paid batch. Specifically what stops a
  // repeated "nothing happened, let me click Generate again" click from
  // silently multiplying cost while a real batch is still legitimately
  // processing (see DEDUP_WINDOW_MS above for why this is now 24h, not the
  // old streaming design's 15 minutes).
  try {
    const { data: existing, error: existingErr } = await admin
      .from("ai_report_jobs")
      .select("id, status, created_at")
      .eq("user_id", userData.user.id)
      .eq("survey_id", surveyId)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existingErr && existing && Date.now() - new Date(existing.created_at).getTime() < DEDUP_WINDOW_MS) {
      return jsonResponse({ ok: true, job_id: existing.id, resumed: true });
    }
  } catch {
    // Non-fatal — worst case, dedup doesn't fire for this one request and a
    // fresh job is created below, same as before this guard existed.
  }

  const { data: job, error: jobErr } = await admin
    .from("ai_report_jobs")
    .insert({
      user_id: userData.user.id,
      survey_id: surveyId,
      model,
      status: "running",
      response_count: responseCount,
      progress_note: "Preparing…",
      extra_context: extraContext || null,
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    return jsonResponse({ ok: false, err: jobErr?.message || "failed to create report job" }, { status: 500 });
  }

  const backgroundWork = submitReportBatch({
    admin,
    apiKey,
    jobId: job.id,
    markdown,
    csv,
    csvFilename,
    model,
    extraContext,
  });

  // Keep the isolate alive long enough to finish uploading the CSV and
  // submitting the batch (both fast) after this response has already been
  // sent — falls back to a plain (unawaited, logged-on-failure) fire-and-
  // forget if EdgeRuntime isn't present, e.g. under `supabase functions
  // serve` locally.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(backgroundWork);
  } else {
    backgroundWork.catch((e) => console.error("background batch submission failed:", e));
  }

  return jsonResponse({ ok: true, job_id: job.id });
});
