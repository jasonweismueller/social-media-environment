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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
const ALLOWED_MODELS = new Set(["claude-sonnet-5", "claude-opus-5"]);

// $/1M tokens, cached 2026-09 — used both to show the admin a rough
// pre-generation estimate and to compute the real per-report cost recorded
// in ai_report_usage after a call actually completes (see PRICING's own use
// below) — the two numbers are deliberately the same table, so a shown
// estimate and the running monthly total stay internally consistent even
// though neither is Anthropic's own literal invoiced figure.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
};

// Platform-wide monthly spend guardrails for this feature specifically —
// per direct user request, separate from (and in addition to) whatever
// spend limit they set in the Anthropic Console itself (account-wide,
// covers everything on that API key). Shared across every admin who's been
// granted ai_analysis_enabled — this is about bounding the platform's total
// invoice exposure from this one feature, not a per-researcher allowance.
// Calendar-month (UTC) boundary, reset automatically on the 1st.
const MONTHLY_WARNING_USD = 5;
const MONTHLY_HARD_LIMIT_USD = 10;

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

const SYSTEM_PROMPT = `You are a careful, conservative research-methods assistant helping a
behavioral-science researcher get a first-pass, honest read on their study's
data. You have a code_execution tool with Python (pandas, numpy, scipy
available) — use it to actually compute every statistic you report; never
estimate or guess a number from eyeballing text. If a response CSV file is
attached to this conversation, read it in code before writing anything
about it, and recompute every measure/comparison described in the context
directly from it rather than trusting the aggregate numbers already given.

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

function buildPrompt(markdown: string, hasCsv: boolean, csvFilename: string): string {
  const header =
    "Here is the design, content, and aggregate statistics for a research study, exported from the platform's own admin dashboard:";
  const csvNote = hasCsv
    ? `\n\nA CSV of every individual (de-identified) survey response has been attached to this conversation as an uploaded file named "${csvFilename}". Use the code_execution tool to load it (e.g. with pandas) and compute every statistic in your report directly from it — the aggregate numbers in the context above are for orientation only, not a substitute for recomputing from the real data.`
    : `\n\nNo response-level CSV was attached (there may be too few responses yet, or none) — write the report from the aggregate context above only, and say plainly that no per-response computation was possible.`;
  return `${header}\n\n${markdown}${csvNote}`;
}

function extractText(msg: any): string {
  const blocks = Array.isArray(msg?.content) ? msg.content : [];
  return blocks
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("\n\n")
    .trim();
}

// Best-effort, deliberately not guessing exact block-shape field names —
// just passes through whatever non-text/non-thinking blocks Anthropic
// actually returned (the code_execution tool_use/tool_result pairs), so the
// admin UI can show "the code Claude ran" for real transparency without
// this function needing to know the precise schema. Capped so a pathological
// response can't blow up the payload back to the browser.
function extractExecutionTrace(msg: any): any[] {
  const blocks = Array.isArray(msg?.content) ? msg.content : [];
  const trace = blocks.filter((b: any) => b?.type && b.type !== "text" && b.type !== "thinking");
  const json = JSON.stringify(trace);
  if (json.length > 200000) {
    return [{ note: "Execution trace omitted — too large to return." }];
  }
  return trace;
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

  if (!markdown) {
    return jsonResponse({ ok: false, err: "markdown study context is required" }, { status: 400 });
  }
  // A CSV this large (~15MB of raw text) would already be an unusual study
  // by this app's standards — reject rather than silently spend a lot on a
  // single call that's more likely a bug than an intentional huge export.
  if (csv.length > 15_000_000) {
    return jsonResponse({ ok: false, err: "response CSV is too large for a single AI report (over ~15MB)." }, { status: 400 });
  }

  // Hard cap, checked against the total *before* this call — not
  // "current total + this call's own cost", since that cost isn't known
  // until Anthropic actually responds. This means one report can push the
  // running total slightly past $10 (reports typically cost a few cents to
  // around a quarter of a dollar, so the overshoot is small and bounded),
  // but the *next* call is reliably blocked once the total has crossed it.
  // A "reserve, then commit" two-phase design would close that gap but is
  // more machinery than this internal safety cap needs.
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

  let fileId: string | null = null;

  try {
    // 1. Upload the response CSV to Anthropic's Files API, if present, so
    // the model's own code (run in its sandbox) reads real per-row data —
    // the prompt text below never contains a single response row.
    if (csv && csv.length > 0) {
      const form = new FormData();
      form.append("file", new Blob([csv], { type: "text/csv" }), csvFilename);
      const uploadRes = await fetch("https://api.anthropic.com/v1/files", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
        body: form,
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Anthropic file upload failed (${uploadRes.status}): ${errText.slice(0, 500)}`);
      }
      const uploaded = await uploadRes.json();
      fileId = uploaded?.id || null;
    }

    const userContent: any[] = [{ type: "text", text: buildPrompt(markdown, !!fileId, csvFilename) }];
    if (fileId) {
      userContent.push({ type: "container_upload", file_id: fileId });
    }

    const msgRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        tools: [{ type: "code_execution_20260521", name: "code_execution" }],
      }),
    });

    if (!msgRes.ok) {
      const errText = await msgRes.text();
      throw new Error(`Anthropic API error (${msgRes.status}): ${errText.slice(0, 800)}`);
    }

    const msg = await msgRes.json();
    const reportMarkdown = extractText(msg);
    const usage = msg?.usage || {};
    const price = PRICING[model] || PRICING[DEFAULT_MODEL];
    const inputTok = Number(usage.input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0);
    const cacheReadTok = Number(usage.cache_read_input_tokens || 0);
    const outputTok = Number(usage.output_tokens || 0);
    const estimatedCostUsd = (inputTok * price.input) / 1e6 + (cacheReadTok * price.input * 0.1) / 1e6 + (outputTok * price.output) / 1e6;

    // Record real spend as soon as it's known — even for the "no report
    // text" failure branch just below, since Anthropic still billed for
    // those tokens; only requests that never reached Anthropic at all
    // (bad input, the hard-cap rejection above) record nothing, correctly.
    let monthlySpendAfterCall = monthlySpendBeforeCall + estimatedCostUsd;
    try {
      const { error: insertErr } = await admin
        .from("ai_report_usage")
        .insert({ user_id: userData.user.id, model, estimated_cost_usd: Number(estimatedCostUsd.toFixed(6)) });
      if (insertErr) console.error("ai_report_usage insert failed:", insertErr.message);
    } catch (e) {
      // Non-fatal — a logging failure shouldn't hide a real report the
      // admin is waiting on; the monthly cap just becomes slightly less
      // accurate for this one call instead of the whole feature breaking.
      console.error("ai_report_usage insert threw:", e);
    }

    if (!reportMarkdown) {
      // stop_reason "refusal" or a response that was all tool-use/thinking
      // with no final text both land here — surface the raw stop reason
      // rather than a silent-looking blank report.
      return jsonResponse(
        {
          ok: false,
          err: `Anthropic returned no report text (stop_reason: ${msg?.stop_reason || "unknown"}). Usage: ${JSON.stringify(usage)}`,
        },
        { status: 502 }
      );
    }

    return jsonResponse({
      ok: true,
      report_markdown: reportMarkdown,
      model,
      usage,
      estimated_cost_usd: Number(estimatedCostUsd.toFixed(4)),
      stop_reason: msg?.stop_reason || null,
      execution_trace: extractExecutionTrace(msg),
      monthly_spend_usd: Number(monthlySpendAfterCall.toFixed(4)),
      monthly_warning_usd: MONTHLY_WARNING_USD,
      monthly_hard_limit_usd: MONTHLY_HARD_LIMIT_USD,
    });
  } catch (e) {
    return jsonResponse({ ok: false, err: String((e as Error)?.message || e) }, { status: 500 });
  } finally {
    // Best-effort cleanup — don't let response data sit in Anthropic's
    // Files storage any longer than this one request needed it for.
    if (fileId) {
      try {
        await fetch(`https://api.anthropic.com/v1/files/${fileId}`, {
          method: "DELETE",
          headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
        });
      } catch {
        // Non-fatal — nothing else in this function depends on the delete
        // succeeding, and failing to clean up isn't worth masking the real
        // response (success or error) with a secondary error.
      }
    }
  }
});
