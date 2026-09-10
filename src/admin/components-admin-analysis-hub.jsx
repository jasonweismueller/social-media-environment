/// components-admin-analysis-hub.jsx
//
// "AI Analysis" — a dedicated, standalone page (not a tab inside the Survey
// Participants hub) that only exists at all for accounts an owner has
// explicitly granted `profiles.ai_analysis_enabled` (see the "AI analysis"
// toggle on the Users & access page and AdminShell.jsx's conditional nav
// item). Its whole job is the "Generate AI report" workflow that used to
// live inline in components-admin-participants-survey.jsx: pick a survey,
// pick a model, see a rough cost estimate, generate a real (billed)
// Anthropic report against that survey's own responses.
//
// Deliberately does NOT re-implement the full Survey Participants analysis
// hub (demographics/measures/group-comparison charts, response tables,
// CSV corrections, simulated-data testing) — this page's own survey
// picker loads just enough (survey definition + response roster) to build
// the same study-context markdown + response CSV that hub already builds,
// reusing its exported buildStudyContextMarkdown/CSV helpers rather than
// duplicating that ~200-line function.
//
// Also surfaces the platform-wide monthly spend cap the ai-study-report
// Edge Function itself enforces ($5 warning / $10 hard stop, shared across
// every admin, see that function's own comment) — this page just displays
// and reacts to what the Edge Function already decided; it never makes the
// stop/warn call itself.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getProjectId as getProjectIdUtil,
  getAdminAiAnalysisEnabled,
  listSurveysFromBackend,
  loadSurveyFromBackend,
  loadSurveyResponsesBySurveyRoster,
  loadSurveyOnlyRoster,
  loadPostsFromBackend,
  loadCustomMeasureGroups,
  orderedLinkedFeedIdsFromSurvey,
  buildAnalysisDataset,
  computeDemographicsSummary,
  computeMeasuresSummary,
  computeGroupComparison,
  buildCustomGroupComposite,
  stripSurveyExportPrefix,
  getSurveyAttentionCheckItems,
  countAttentionChecksPassed,
  generateAiStudyReport,
  pollAiReportJob,
  listAiReportJobHistory,
  getAiReportUsage,
} from "../utils";
import { PageHeader, Card, Button, Badge, EmptyState, RoleGate, useToast, useConfirm, IconSparkle, Table, Th, Td, Tr } from "./ui";
import {
  buildStudyContextMarkdown,
  buildCsv,
  normalizeCsvValue,
  safeFileStem,
  todayStamp,
  triggerTextDownload,
} from "./components-admin-participants-survey";

// $/1M tokens — mirrors supabase/functions/ai-study-report/index.ts's own
// PRICING map exactly (kept in sync by hand, same as that file's own
// "cached 2026-09" comment already flags as something to revisit) since
// this is only ever used for a rough pre-generation estimate; the real
// number always comes back from the Edge Function's own response.usage.
const MODEL_OPTIONS = [
  { value: "claude-sonnet-5", label: "Sonnet — fast, cheap", input: 2.0, output: 10.0 },
  { value: "claude-opus-5", label: "Opus — slower, deeper", input: 5.0, output: 25.0 },
];

// Background-job polling (2026-09-10) — see ai-study-report/index.ts's own
// header comment for the "EarlyDrop" root cause this replaces. A real
// code_execution report regularly takes 1-3 minutes (each tool turn is its
// own Anthropic round-trip), so this page no longer waits on one HTTP call
// — it kicks off a job, then polls this table every few seconds.
const AI_REPORT_JOB_STORAGE_PREFIX = "ai_report_job_v1::";
const AI_REPORT_POLL_INTERVAL_MS = 4000;
// Client-side patience only — the job itself keeps running server-side
// (EdgeRuntime.waitUntil) regardless of whether this page is still polling,
// so hitting this just stops the spinner and leaves the job trackable via
// localStorage; reopening this survey resumes polling automatically.
const AI_REPORT_POLL_MAX_MS = 8 * 60 * 1000;

function aiReportJobStorageKey(surveyId) {
  return `${AI_REPORT_JOB_STORAGE_PREFIX}${surveyId || ""}`;
}

// Grounded in real usage once it exists (2026-09-10) — the original
// formula below (single-turn token estimate) badly undercounted real cost:
// code_execution runs as a multi-turn server-side loop (the model writes
// code, runs it, sees output, writes more code...), and Anthropic bills
// *each turn* separately, with input tokens growing turn over turn as
// context accumulates. Confirmed live: a real 305-response report cost
// $1.48 total across 11 turns — about 15x this formula's own $0.097
// estimate for the same input. `historicalPerResponseUsd` (the real
// $/response average from this account's own completed reports, computed
// by the caller from ai_report_jobs — see the "Recent reports" section
// below) is used whenever at least one real data point exists, since a
// real average beats any formula; LEGACY_MULTIPLIER only kicks in before
// that first real report ever completes, calibrated from the one
// observation above so a brand-new account's very first estimate is in
// the right order of magnitude rather than off by 15x.
const LEGACY_MULTIPLIER = 15;

function estimateReportCost(responseCount, model, historicalPerResponseUsd) {
  if (historicalPerResponseUsd != null && Number.isFinite(historicalPerResponseUsd) && historicalPerResponseUsd > 0) {
    return historicalPerResponseUsd * Math.max(1, responseCount);
  }
  const price = MODEL_OPTIONS.find((m) => m.value === model) || MODEL_OPTIONS[0];
  const estimatedCsvChars = Math.max(0, responseCount) * 500;
  const inputTokens = Math.round(estimatedCsvChars / 4) + 1500;
  const outputTokens = 1800;
  return ((inputTokens * price.input) / 1e6 + (outputTokens * price.output) / 1e6) * LEGACY_MULTIPLIER;
}

export function AiAnalysisHubPage({ projectId: projectIdProp }) {
  const projectId = projectIdProp ?? getProjectIdUtil() ?? "global";
  const toast = useToast();
  const confirm = useConfirm();

  const [surveys, setSurveys] = useState([]);
  const [loadingSurveys, setLoadingSurveys] = useState(true);
  const [surveyId, setSurveyId] = useState("");
  const [survey, setSurvey] = useState(null);
  const [responseRows, setResponseRows] = useState([]);
  const [customGroups, setCustomGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const [model, setModel] = useState("claude-sonnet-5");
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);
  const [generatingElapsedMs, setGeneratingElapsedMs] = useState(0);
  const pollTimerRef = useRef(null);
  const pollDeadlineRef = useRef(0);
  const pollTickRef = useRef(null);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pollTickRef.current) {
      clearInterval(pollTickRef.current);
      pollTickRef.current = null;
    }
  };
  useEffect(() => () => stopPolling(), []);

  const refreshUsage = () => {
    getAiReportUsage().then((res) => {
      if (res.ok) setUsage(res);
    });
  };

  // Polls one job until it resolves (or this tab gives up waiting — the job
  // itself is unaffected either way, see AI_REPORT_POLL_MAX_MS above).
  // `announce` controls whether a completed/failed job surfaces a toast —
  // suppressed on the initial "resume tracking after reopening this
  // survey" check so a report that was already shown once doesn't re-toast.
  const pollJob = (jobId, sid, { announce } = { announce: true }) => {
    stopPolling();
    setGenerating(true);
    setGeneratingElapsedMs(0);
    const startedAt = Date.now();
    pollDeadlineRef.current = startedAt + AI_REPORT_POLL_MAX_MS;

    const tick = async () => {
      const res = await pollAiReportJob(jobId);
      if (!res.ok) {
        // Job row genuinely missing (e.g. a stale id from before this table
        // existed) — nothing to resume, clear it quietly.
        stopPolling();
        setGenerating(false);
        localStorage.removeItem(aiReportJobStorageKey(sid));
        return;
      }
      const job = res.job;
      if (job.status === "done") {
        stopPolling();
        setGenerating(false);
        setReport({
          report_markdown: job.report_markdown,
          model: job.model,
          usage: job.usage,
          estimated_cost_usd: job.estimated_cost_usd,
          execution_trace: job.execution_trace,
        });
        localStorage.removeItem(aiReportJobStorageKey(sid));
        refreshUsage();
        loadHistory();
        return;
      }
      if (job.status === "error") {
        stopPolling();
        setGenerating(false);
        if (announce) toast.error(`AI report failed${job.error ? `: ${job.error}` : "."}`);
        localStorage.removeItem(aiReportJobStorageKey(sid));
        refreshUsage();
        loadHistory();
        return;
      }
      // Still pending/running — keep polling until the client-side patience
      // window above runs out (the job itself is unaffected either way).
      if (Date.now() >= pollDeadlineRef.current) {
        stopPolling();
        setGenerating(false);
        if (announce) {
          toast.info("Still generating on the server — reopen this survey in a bit to see it once it's ready.");
        }
      }
    };

    tick();
    pollTimerRef.current = setInterval(tick, AI_REPORT_POLL_INTERVAL_MS);
    pollTickRef.current = setInterval(() => setGeneratingElapsedMs(Date.now() - startedAt), 1000);
  };

  // On survey switch (including the very first load), check whether this
  // survey already has a job tracked in localStorage — either still running
  // (resume polling silently) or finished while this page was closed (show
  // it without re-toasting, since the user isn't watching it complete live).
  useEffect(() => {
    stopPolling();
    setGenerating(false);
    if (!surveyId) return;
    let raw = null;
    try {
      raw = localStorage.getItem(aiReportJobStorageKey(surveyId));
    } catch {}
    if (!raw) return;
    let stored;
    try {
      stored = JSON.parse(raw);
    } catch {
      localStorage.removeItem(aiReportJobStorageKey(surveyId));
      return;
    }
    if (!stored?.jobId) return;
    pollJob(stored.jobId, surveyId, { announce: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // Platform-wide monthly spend cap the Edge Function itself enforces (see
  // its own comment) — fetched once on mount (not per-survey, since it's
  // shared across the whole platform, not scoped to any one study) and
  // refreshed from every generate response afterward without a second
  // round-trip, since the Edge Function already returns the post-call total.
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getAiReportUsage().then((res) => {
      if (!cancelled && res.ok) setUsage(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Real usage history — every finished report this account has generated
  // (see supabaseListAiReportJobHistory's own comment for why this is a
  // plain RLS-gated select, not a second Edge Function round-trip). Powers
  // both the "Recent reports" table below and estimateReportCost's real
  // $/response ratio. Refetched after every job completion via loadHistory,
  // not just once on mount.
  const [jobHistory, setJobHistory] = useState(null);
  const loadHistory = () => {
    listAiReportJobHistory({ limit: 20 }).then((res) => {
      if (res.ok) setJobHistory(res.jobs);
    });
  };
  useEffect(loadHistory, []);

  const historicalPerResponseUsd = useMemo(() => {
    const usable = (jobHistory || []).filter(
      (j) => j.status === "done" && j.estimated_cost_usd != null && j.response_count > 0
    );
    if (!usable.length) return null;
    const ratios = usable.map((j) => j.estimated_cost_usd / j.response_count);
    return ratios.reduce((a, b) => a + b, 0) / ratios.length;
  }, [jobHistory]);

  const monthlyWarningUsd = usage?.monthly_warning_usd ?? 5;
  const monthlyHardLimitUsd = usage?.monthly_hard_limit_usd ?? 10;
  const monthlySpendUsd = usage?.monthly_spend_usd ?? 0;
  const hardLimitReached = usage != null && monthlySpendUsd >= monthlyHardLimitUsd;
  const warningReached = usage != null && monthlySpendUsd >= monthlyWarningUsd;

  useEffect(() => {
    let cancelled = false;
    setLoadingSurveys(true);
    listSurveysFromBackend({ projectId, force: true }).then((list) => {
      if (cancelled) return;
      const arr = Array.isArray(list) ? list : [];
      setSurveys(arr);
      setLoadingSurveys(false);
      setSurveyId((cur) => (cur && arr.some((s) => s.survey_id === cur) ? cur : arr[0]?.survey_id || ""));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!surveyId) {
      setSurvey(null);
      setResponseRows([]);
      setCustomGroups([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setReport(null);
    Promise.all([
      loadSurveyFromBackend(surveyId, { projectId, force: true }),
      loadSurveyResponsesBySurveyRoster(surveyId, { projectId }),
      loadCustomMeasureGroups({ surveyId, projectId }),
    ])
      .then(([def, rows, groups]) => {
        if (cancelled) return;
        setSurvey(def);
        setResponseRows(Array.isArray(rows) ? rows : []);
        setCustomGroups(Array.isArray(groups) ? groups : []);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("AI Analysis: failed to load survey data:", e);
        toast.error("Failed to load this survey's data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId, projectId]);

  const dataset = useMemo(() => (survey ? buildAnalysisDataset({ survey, responseRows }) : null), [survey, responseRows]);
  const demographics = useMemo(() => (dataset ? computeDemographicsSummary(dataset) : []), [dataset]);
  const measures = useMemo(() => (dataset ? computeMeasuresSummary(dataset) : null), [dataset]);
  const customGroupComposites = useMemo(
    () => (dataset ? customGroups.map((g) => buildCustomGroupComposite(g, dataset)) : []),
    [dataset, customGroups]
  );
  const groupComparison = useMemo(
    () => (dataset ? computeGroupComparison(dataset, survey?.experiment_groups, customGroupComposites) : null),
    [dataset, survey, customGroupComposites]
  );
  const topStats = useMemo(() => {
    if (!dataset) return null;
    const rows = dataset.rows;
    const uniqueParticipants = new Set(rows.map((r) => r.participant_id).filter(Boolean)).size;
    const dates = rows.map((r) => r.submitted_at_iso).filter(Boolean).sort();
    return { total: rows.length, uniqueParticipants, first: dates[0] || null, last: dates[dates.length - 1] || null };
  }, [dataset]);

  const feedIdsForSurvey = useMemo(() => orderedLinkedFeedIdsFromSurvey(survey), [survey]);
  const surveyNameById = useMemo(() => {
    const m = new Map();
    surveys.forEach((s) => m.set(s.survey_id, s.name || s.survey_id));
    return m;
  }, [surveys]);
  const responseCount = dataset?.rows?.length || 0;
  const estimatedCostUsd = estimateReportCost(responseCount, model, historicalPerResponseUsd);

  const generateReport = async () => {
    if (!surveyId || !survey) return;
    const ok = await confirm({
      title: "Generate AI report?",
      message:
        "This sends this study's design, aggregate stats, and de-identified individual response rows to Anthropic's API to write a first-pass analysis. It's a real, billed API call and can't be undone once it starts. Continue?",
      confirmLabel: "Generate report",
    });
    if (!ok) return;

    try {
      setGenerating(true);
      setReport(null);

      // Same context-gathering shape components-admin-participants-survey.jsx's
      // own (now-removed) "Generate AI report" button used — see this file's
      // header comment for why it's reused, not rebuilt, via the exported
      // buildStudyContextMarkdown. The CSV is uploaded separately (via the
      // Edge Function's Files API call), never embedded in the prompt text.
      let feedPostsByFeedId = {};
      if (feedIdsForSurvey.length) {
        const pairs = await Promise.all(
          feedIdsForSurvey.map(async (fid) => {
            try {
              const loaded = await loadPostsFromBackend(fid, { projectId: projectId || undefined, force: true });
              return [fid, Array.isArray(loaded) ? loaded : []];
            } catch (_) {
              return [fid, []];
            }
          })
        );
        feedPostsByFeedId = Object.fromEntries(pairs);
      }

      let attentionSummary = null;
      try {
        const attentionItems = getSurveyAttentionCheckItems(survey);
        if (attentionItems.length && dataset?.rows?.length) {
          const counts = dataset.rows.map((r) => countAttentionChecksPassed(attentionItems, r.responses));
          attentionSummary = {
            total: attentionItems.length,
            avgPassed: counts.reduce((a, b) => a + b, 0) / counts.length,
            n: dataset.rows.length,
          };
        }
      } catch (e) {
        console.error("AI report: attention-check summary failed", e);
      }

      let responseCsv = "";
      try {
        const safeRows = (await loadSurveyOnlyRoster({ surveyId, projectId, labelMode: "text" })).rows || [];
        if (safeRows.length) {
          const header = Array.from(
            safeRows.reduce((set, row) => {
              Object.keys(row || {}).forEach((key) => set.add(key));
              return set;
            }, new Set())
          );
          const normalizedRows = safeRows.map((row) => {
            const next = {};
            header.forEach((key) => {
              next[key] = normalizeCsvValue(row?.[key]);
            });
            return next;
          });
          responseCsv = buildCsv(normalizedRows, header, header.map(stripSurveyExportPrefix));
        }
      } catch (_) {
        // A failed response fetch shouldn't block the report entirely — the
        // model still gets the design/aggregate context with no CSV attached.
      }

      const markdown = buildStudyContextMarkdown({
        survey,
        dataset,
        demographics,
        measures,
        groupComparison,
        topStats,
        attentionSummary,
        feedPostsByFeedId,
        responseCsv: "", // uploaded separately, not embedded — see comment above
      });

      const csvFilename = `${safeFileStem(survey?.name || surveyId)}_responses.csv`;
      // Only starts the job now — a real code_execution report regularly
      // takes 1-3 minutes, well past the ~20s connection window Supabase's
      // edge gateway allows (see ai-study-report/index.ts's own header
      // comment for the "EarlyDrop" incident this replaced). The Edge
      // Function itself keeps generating in the background via
      // EdgeRuntime.waitUntil() regardless of what this call returns.
      const res = await generateAiStudyReport({ markdown, csv: responseCsv, csvFilename, model, surveyId, responseCount });

      // Present on the hard-cap-rejection case (job never started) — the
      // success case's real total is only known once the job finishes, and
      // gets refreshed then instead (see pollJob's refreshUsage() calls).
      if (res.monthly_spend_usd != null) {
        setUsage({
          monthly_spend_usd: res.monthly_spend_usd,
          monthly_warning_usd: res.monthly_warning_usd,
          monthly_hard_limit_usd: res.monthly_hard_limit_usd,
        });
      }

      if (!res.ok || !res.job_id) {
        toast.error(`AI report failed${res.err ? `: ${res.err}` : "."}`);
        setGenerating(false);
        return;
      }

      try {
        localStorage.setItem(aiReportJobStorageKey(surveyId), JSON.stringify({ jobId: res.job_id, model }));
      } catch {}
      if (res.resumed) {
        toast.info("A report for this survey was already generating — tracking that one instead of starting a new (billed) call.");
      }
      pollJob(res.job_id, surveyId, { announce: true });
    } catch (e) {
      console.error("AI report generation failed:", e);
      toast.error(`AI report failed${e?.message ? `: ${e.message}` : "."}`);
      setGenerating(false);
    }
  };

  return (
    <RoleGate
      min="editor"
      elseRender={
        <Card>
          <EmptyState
            icon={IconSparkle}
            title="Editor access required"
            message="AI report generation needs an editor or owner role — an owner can also grant it directly from the Users & access page."
          />
        </Card>
      }
    >
      {!getAdminAiAnalysisEnabled() ? (
        <Card>
          <EmptyState
            icon={IconSparkle}
            title="AI analysis isn't turned on for your account"
            message="An owner can grant this from the Users & access page. If it was just turned on, sign out and back in to pick it up."
          />
        </Card>
      ) : (
        <>
          <PageHeader
            title="AI Analysis"
            subtitle={
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span>Generate a first-pass AI report for </span>
                <select
                  value={surveyId}
                  onChange={(e) => setSurveyId(e.target.value)}
                  disabled={loadingSurveys}
                  style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid var(--admin-border)", fontSize: 13 }}
                >
                  {surveys.length === 0 && <option value="">No surveys yet</option>}
                  {surveys.map((s) => (
                    <option key={s.survey_id} value={s.survey_id}>
                      {s.name || s.survey_id}
                    </option>
                  ))}
                </select>
              </div>
            }
          />

          {(warningReached || hardLimitReached) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 13,
                background: hardLimitReached ? "var(--admin-danger-soft)" : "var(--admin-warning-soft)",
                color: hardLimitReached ? "var(--admin-danger-ink)" : "var(--admin-warning-ink)",
                border: `1px solid ${hardLimitReached ? "var(--admin-danger-border)" : "var(--admin-warning-border)"}`,
              }}
            >
              {hardLimitReached ? (
                <span>
                  <strong>Monthly cap reached.</strong> This platform has spent ~${monthlySpendUsd.toFixed(2)} of ${monthlyHardLimitUsd} on AI
                  analysis this month — generating is paused until it resets on the 1st.
                </span>
              ) : (
                <span>
                  <strong>Approaching this month's AI analysis budget.</strong> ~${monthlySpendUsd.toFixed(2)} of ${monthlyHardLimitUsd} spent so
                  far (shared across every admin) — generation pauses automatically at ${monthlyHardLimitUsd}.
                </span>
              )}
            </div>
          )}

          {!surveyId && !loadingSurveys ? (
            <Card>
              <EmptyState icon={IconSparkle} title="No surveys yet" message="Create a survey first, then come back here to analyse its responses." />
            </Card>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <Card>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-muted)", marginBottom: 6 }}>Model</div>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={generating}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--admin-border)", fontSize: 13, minWidth: 220 }}
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-muted)", marginBottom: 6 }}>Responses</div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{loading ? "…" : responseCount}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-muted)", marginBottom: 6 }}>
                      Estimated cost
                      <span title="A rough estimate only, based on response count and typical report length — the real cost is shown once a report comes back, from Anthropic's own usage figures.">
                        {" "}
                        ⓘ
                      </span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{loading ? "…" : `~$${estimatedCostUsd.toFixed(3)}`}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-muted)", marginBottom: 6 }}>This month (platform-wide)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: hardLimitReached ? "var(--admin-danger-ink)" : warningReached ? "var(--admin-warning-ink)" : undefined }}>
                      {usage == null ? "…" : `$${monthlySpendUsd.toFixed(2)} / $${monthlyHardLimitUsd}`}
                    </div>
                  </div>

                  <Button
                    size="md"
                    onClick={generateReport}
                    busy={generating}
                    disabled={!surveyId || loading || responseCount === 0 || hardLimitReached || generating}
                    title={hardLimitReached ? `Paused — this month's $${monthlyHardLimitUsd} AI analysis cap has been reached.` : undefined}
                  >
                    Generate AI report
                  </Button>
                </div>
                {responseCount === 0 && !loading && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--admin-muted)" }}>
                    This survey has no responses yet — nothing to analyse.
                  </div>
                )}
                {generating && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--admin-muted)" }}>
                    Generating — this typically takes 1–3 minutes for a real study (the model runs real code
                    against your data in several steps). Safe to leave this page open or come back later; it
                    keeps running either way.
                    {generatingElapsedMs > 0 ? ` (${Math.round(generatingElapsedMs / 1000)}s elapsed)` : ""}
                  </div>
                )}
              </Card>

              {report && (
                <Card>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <Badge tone="accent">Report</Badge>
                      <span style={{ fontSize: 12 }} className="subtle">
                        Model: {report.model}
                      </span>
                      {report.usage && (
                        <span style={{ fontSize: 12 }} className="subtle">
                          {(report.usage.input_tokens || 0) + (report.usage.cache_creation_input_tokens || 0)} in ·{" "}
                          {report.usage.output_tokens || 0} out
                          {report.usage.cache_read_input_tokens ? ` · ${report.usage.cache_read_input_tokens} cached` : ""}
                        </span>
                      )}
                      {report.estimated_cost_usd != null && (
                        <span style={{ fontSize: 12 }} className="subtle">
                          Actual cost: ~${report.estimated_cost_usd.toFixed(3)}
                        </span>
                      )}
                    </div>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        fontFamily: "inherit",
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        margin: 0,
                        maxHeight: "60vh",
                        overflow: "auto",
                        padding: 12,
                        background: "var(--admin-surface-alt)",
                        borderRadius: 8,
                        border: "1px solid var(--admin-border)",
                      }}
                    >
                      {report.report_markdown}
                    </pre>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <Button
                        size="sm"
                        onClick={() => {
                          const filename = `${safeFileStem(survey?.name || surveyId)}_ai_report_${todayStamp()}.md`;
                          triggerTextDownload(filename, report.report_markdown);
                        }}
                      >
                        Download .md
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(report.report_markdown);
                            toast.success("Copied to clipboard.");
                          } catch {
                            toast.error("Couldn't copy — your browser may be blocking clipboard access.");
                          }
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    {Array.isArray(report.execution_trace) && report.execution_trace.length > 0 && (
                      <details>
                        <summary style={{ cursor: "pointer", fontSize: 12 }} className="subtle">
                          View the code Claude ran ({report.execution_trace.length} step{report.execution_trace.length === 1 ? "" : "s"})
                        </summary>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            fontSize: 11.5,
                            maxHeight: 300,
                            overflow: "auto",
                            background: "var(--admin-surface-alt)",
                            border: "1px solid var(--admin-border)",
                            borderRadius: 6,
                            padding: 8,
                            marginTop: 6,
                          }}
                        >
                          {JSON.stringify(report.execution_trace, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </Card>
              )}

              {/* Real usage history — every finished report, not just the
                  last one shown above, so real cost stays visible after
                  navigating away and back. Also what estimateReportCost's
                  historicalPerResponseUsd is computed from. */}
              <Card>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>Recent reports</div>
                  <span style={{ fontSize: 12 }} className="subtle">
                    Real cost and token usage from every report you've generated.
                  </span>
                </div>
                {jobHistory == null ? (
                  <div style={{ fontSize: 12.5, color: "var(--admin-muted)" }}>Loading…</div>
                ) : jobHistory.length === 0 ? (
                  <EmptyState
                    compact
                    title="No reports generated yet"
                    message="Real cost and token usage will show up here once you generate your first report."
                  />
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <Table>
                      <thead>
                        <Tr hover={false}>
                          <Th>Survey</Th>
                          <Th>When</Th>
                          <Th>Model</Th>
                          <Th>Responses</Th>
                          <Th>Tokens (in / out)</Th>
                          <Th>Cost</Th>
                          <Th>Status</Th>
                        </Tr>
                      </thead>
                      <tbody>
                        {jobHistory.map((j) => {
                          const inTok = (j.usage?.input_tokens || 0) + (j.usage?.cache_creation_input_tokens || 0);
                          const outTok = j.usage?.output_tokens || 0;
                          return (
                            <Tr key={j.id}>
                              <Td>{surveyNameById.get(j.survey_id) || j.survey_id || "—"}</Td>
                              <Td>{new Date(j.created_at).toLocaleString()}</Td>
                              <Td>{j.model}</Td>
                              <Td>{j.response_count ?? "—"}</Td>
                              <Td>
                                {j.status === "done" ? `${inTok.toLocaleString()} / ${outTok.toLocaleString()}` : "—"}
                              </Td>
                              <Td>{j.estimated_cost_usd != null ? `$${Number(j.estimated_cost_usd).toFixed(3)}` : "—"}</Td>
                              <Td>
                                {j.status === "done" ? (
                                  <Badge tone="accent">done</Badge>
                                ) : (
                                  <span title={j.error || undefined}>
                                    <Badge tone="danger">failed</Badge>
                                  </span>
                                )}
                              </Td>
                            </Tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </RoleGate>
  );
}
