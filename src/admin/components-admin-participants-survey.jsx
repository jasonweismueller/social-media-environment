/// components-admin-participants-survey.jsx
//
// Survey Participants "analysis hub" — demographics, measures (with
// auto-detected composite scales + Cronbach's alpha), and between-group
// comparisons for a single survey's responses. Driven purely by survey_id
// (via loadSurveyResponsesBySurveyRoster), so it works the same way
// regardless of whether the survey is delivered survey-only, after a single
// feed, or after a multi-feed sequence — unlike the old Participants panel,
// which only ever showed survey data for a narrow set of URL shapes.
import React, { useEffect, useMemo, useState } from "react";
import {
  APP,
  getProjectId as getProjectIdUtil,
  listSurveysFromBackend,
  loadSurveyFromBackend,
  loadSurveyResponsesBySurveyRoster,
  loadSurveyOnlyRoster,
  buildAnalysisDataset,
  computeDemographicsSummary,
  computeMeasuresSummary,
  computeGroupComparison,
  computeCompositeScores,
  summarizeItem,
  getRawItemValue,
  histogramBins,
  formatPValue,
} from "../utils";
import { PageHeader, Card, Table, Th, Td, Button, Badge } from "./ui";
import { StatCard } from "./components-admin-participants-feed";

/* ----------------------------- helpers ----------------------------- */

function fmtNum(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function csvEscape(value) {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows = [], header = [], labels = []) {
  const lines = [];
  if (header.length) {
    const firstRow = Array.isArray(labels) && labels.length === header.length ? labels : header;
    lines.push(firstRow.map(csvEscape).join(","));
  }
  for (const row of rows) {
    lines.push(header.map((key) => csvEscape(row?.[key])).join(","));
  }
  return lines.join("\n");
}

function normalizeCsvValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(normalizeCsvValue).filter(Boolean).join(" | ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

function safeFileStem(value = "survey") {
  return (
    String(value || "survey")
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_") || "survey"
  );
}

function triggerCsvDownload(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const LAST_SURVEY_KEY = (projectId) => `admin_last_analysis_survey_id::${APP || "app"}::${projectId || "global"}`;

/* ----------------------------- mini charts ----------------------------- */

function MiniHistogram({ nums, binCount = 8, height = 56 }) {
  const bins = useMemo(() => histogramBins(nums, binCount), [nums, binCount]);
  if (!bins.length) return null;
  const max = Math.max(...bins.map((b) => b.count), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
        {bins.map((b, i) => (
          <div
            key={i}
            title={`${b.x0.toFixed(1)}–${b.x1.toFixed(1)}: ${b.count}`}
            style={{
              flex: 1,
              height: Math.max(2, (b.count / max) * (height - 4)),
              background: "var(--admin-accent, #2563eb)",
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--admin-muted)", marginTop: 2 }}>
        <span>{bins[0].x0.toFixed(1)}</span>
        <span>{bins[bins.length - 1].x1.toFixed(1)}</span>
      </div>
    </div>
  );
}

function CategoryBarList({ options, maxWidth = 180 }) {
  if (!options?.length) return <div className="subtle" style={{ fontSize: 12 }}>No answers yet.</div>;
  const max = Math.max(...options.map((o) => o.pct), 0.0001);

  return (
    <div>
      {options.map((o) => (
        <div key={o.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div
            style={{ width: 110, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}
            title={o.label}
          >
            {o.label}
          </div>
          <div
            style={{
              width: Math.max(2, (o.pct / max) * maxWidth),
              height: 9,
              background: "var(--admin-accent, #2563eb)",
              borderRadius: 2,
            }}
          />
          <div style={{ fontSize: 10.5, color: "var(--admin-muted)", whiteSpace: "nowrap" }}>
            {o.count} ({Math.round(o.pct * 100)}%)
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- sections ----------------------------- */

const DEMOGRAPHIC_KIND_LABELS = {
  age: "Age",
  gender: "Gender / Sex",
  income: "Income",
  education: "Education",
  ethnicity: "Ethnicity / Race",
  employment: "Employment",
  marital: "Marital status",
  nationality: "Nationality / Country",
  residence: "Residence",
  language: "Language",
};

function DemographicsSection({ dataset, demographics }) {
  return (
    <Card
      title="Demographics"
      subtitle="Auto-detected from question ids/text (age, gender, income, education, ethnicity, employment, ...)."
    >
      {demographics.length === 0 ? (
        <div className="subtle" style={{ fontSize: 13 }}>
          No demographic questions detected in this survey. Question ids/text like AGE, GENDER, INCOME,
          EDUCATION, ETHNICITY, EMPLOYMENT, MARITAL, NATIONALITY are picked up automatically.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {demographics.map(({ item, summary }) => (
            <div key={`${item.questionId}::${item.itemKey}`}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.questionText}</div>
                <Badge tone="neutral">{DEMOGRAPHIC_KIND_LABELS[item.demographicKind] || item.demographicKind}</Badge>
                <span style={{ fontSize: 11, color: "var(--admin-muted)" }}>
                  N = {summary.nAnswered}/{summary.nTotal}
                </span>
              </div>

              {summary.kind === "numeric" ? (
                <>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, marginBottom: 6 }}>
                    <span>Mean <strong>{fmtNum(summary.mean)}</strong></span>
                    <span>SD <strong>{fmtNum(summary.sd)}</strong></span>
                    <span>Median <strong>{fmtNum(summary.median)}</strong></span>
                    <span>Range <strong>{summary.min ?? "—"}–{summary.max ?? "—"}</strong></span>
                  </div>
                  {summary.n > 1 && (
                    <MiniHistogram
                      nums={dataset.rows.map((r) => Number(getRawItemValue(r.responses, item))).filter((v) => Number.isFinite(v))}
                    />
                  )}
                </>
              ) : summary.kind === "text" ? (
                <div className="subtle" style={{ fontSize: 12 }}>{summary.nAnswered} free-text response(s).</div>
              ) : (
                <CategoryBarList options={summary.options} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CompositeMeasureBlock({ dataset, composite, summary }) {
  const scores = useMemo(
    () => computeCompositeScores(composite, dataset.rows).filter((v) => v != null),
    [composite, dataset.rows]
  );

  return (
    <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--admin-border-subtle)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{composite.label}</div>
          <Badge tone="accent">composite · {composite.items.length} items</Badge>
        </div>
        <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>N = {summary.nAnswered}/{summary.nTotal}</div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6, fontSize: 12.5 }}>
        <span>Mean <strong>{fmtNum(summary.mean)}</strong></span>
        <span>SD <strong>{fmtNum(summary.sd)}</strong></span>
        <span>Median <strong>{fmtNum(summary.median)}</strong></span>
        <span>Range <strong>{summary.min ?? "—"}–{summary.max ?? "—"}</strong></span>
        <span>
          Cronbach's α{" "}
          <strong>{summary.reliability ? fmtNum(summary.reliability.alpha) : "—"}</strong>
        </span>
      </div>

      {scores.length > 1 && (
        <div style={{ marginTop: 8, maxWidth: 320 }}>
          <MiniHistogram nums={scores} />
        </div>
      )}

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--admin-muted)" }}>
          Item breakdown ({composite.items.length})
        </summary>
        <Table style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>N</Th>
              <Th>Mean</Th>
              <Th>SD</Th>
            </tr>
          </thead>
          <tbody>
            {composite.items.map((it) => {
              const s = summarizeItem(it, dataset.rows);
              return (
                <tr key={it.itemKey}>
                  <Td>{it.itemLabel}</Td>
                  <Td>{s.nAnswered}</Td>
                  <Td>{fmtNum(s.mean)}</Td>
                  <Td>{fmtNum(s.sd)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </details>
    </div>
  );
}

function TextResponsesBlock({ dataset, items }) {
  return (
    <div>
      {items.map(({ item, summary }) => {
        const values = dataset.rows
          .map((r) => String(getRawItemValue(r.responses, item) ?? "").trim())
          .filter(Boolean);
        return (
          <details key={item.questionId} style={{ marginBottom: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              {item.questionText} — {summary.nAnswered} response{summary.nAnswered === 1 ? "" : "s"}
            </summary>
            {values.length === 0 ? (
              <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>No responses yet.</div>
            ) : (
              <ul style={{ maxHeight: 220, overflowY: "auto", margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
                {values.slice(0, 100).map((v, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{v}</li>
                ))}
              </ul>
            )}
            {values.length > 100 && (
              <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                Showing first 100 of {values.length}.
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

function MeasuresSection({ dataset, measures }) {
  const hasAny =
    measures.composites.length ||
    measures.standaloneNumeric.length ||
    measures.standaloneCategorical.length ||
    measures.textItems.length;

  return (
    <Card
      title="Measures"
      subtitle="Composite scales (auto-detected from matrix questions or ID_1/ID_2/ID_3-style groups), single-item measures, and other question responses."
    >
      {!hasAny ? (
        <div className="subtle" style={{ fontSize: 13 }}>No non-demographic questions detected in this survey.</div>
      ) : (
        <>
          {measures.composites.map(({ composite, summary }) => (
            <CompositeMeasureBlock key={composite.id} dataset={dataset} composite={composite} summary={summary} />
          ))}

          {measures.standaloneNumeric.map(({ item, summary }) => (
            <div
              key={item.questionId}
              style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--admin-border-subtle)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.questionText}</div>
                <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>N = {summary.nAnswered}/{summary.nTotal}</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4, fontSize: 12.5 }}>
                <span>Mean <strong>{fmtNum(summary.mean)}</strong></span>
                <span>SD <strong>{fmtNum(summary.sd)}</strong></span>
                <span>Median <strong>{fmtNum(summary.median)}</strong></span>
                <span>Range <strong>{summary.min ?? "—"}–{summary.max ?? "—"}</strong></span>
              </div>
            </div>
          ))}

          {measures.standaloneCategorical.map(({ item, summary }) => (
            <div
              key={`${item.questionId}::${item.itemKey}`}
              style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--admin-border-subtle)" }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                {item.questionText}
                {item.isComposite ? ` — ${item.itemLabel}` : ""}
                <span style={{ fontWeight: 400, fontSize: 11, color: "var(--admin-muted)", marginLeft: 8 }}>
                  N = {summary.nAnswered}/{summary.nTotal}
                </span>
              </div>
              <CategoryBarList options={summary.options} />
            </div>
          ))}

          {measures.textItems.length > 0 && <TextResponsesBlock dataset={dataset} items={measures.textItems} />}
        </>
      )}
    </Card>
  );
}

function GroupComparisonSection({ comparison }) {
  if (!comparison) return null;

  return (
    <Card
      title="Group comparison"
      subtitle={`Between-subjects groups: ${comparison.groups.map((g) => `${g.name} (n=${g.n})`).join(" · ")}`}
    >
      {comparison.numericComparisons.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Measures — mean ± SD (n)</div>
          <Table>
            <thead>
              <tr>
                <Th>Measure</Th>
                {comparison.groups.map((g) => (
                  <Th key={g.id}>{g.name}</Th>
                ))}
                <Th>Test</Th>
              </tr>
            </thead>
            <tbody>
              {comparison.numericComparisons.map((c) => (
                <tr key={c.key}>
                  <Td>{c.label}</Td>
                  {c.perGroup.map((g, i) => (
                    <Td key={i}>{g.n ? `${fmtNum(g.mean)} ± ${fmtNum(g.sd)} (n=${g.n})` : "—"}</Td>
                  ))}
                  <Td>
                    {!c.test ? (
                      "—"
                    ) : c.test.type === "welch_t" ? (
                      <span>t({fmtNum(c.test.df, 1)}) = {fmtNum(c.test.t)}, {formatPValue(c.test.p)}</span>
                    ) : (
                      <span>
                        F({c.test.dfBetween},{c.test.dfWithin}) = {fmtNum(c.test.F)}, {formatPValue(c.test.p)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {comparison.categoricalComparisons.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Categorical variables</div>
          {comparison.categoricalComparisons.map((c) => (
            <details key={c.key} style={{ marginBottom: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {c.questionText}
                {c.label !== c.questionText ? ` — ${c.label}` : ""}
                {c.test && (
                  <span style={{ fontWeight: 400, color: "var(--admin-muted)", marginLeft: 8, fontSize: 12 }}>
                    χ²({c.test.df}) = {fmtNum(c.test.chisq)}, {formatPValue(c.test.p)}
                  </span>
                )}
              </summary>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 8 }}>
                {c.perGroup.map((g) => (
                  <div key={g.groupId} style={{ minWidth: 180 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      {g.groupName} (n={g.nAnswered})
                    </div>
                    <CategoryBarList options={g.options} maxWidth={140} />
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}

function ResponsesSection({ dataset, survey, pageSize, onShowMore }) {
  const groups = Array.isArray(survey?.experiment_groups) ? survey.experiment_groups : [];
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const hasGroups = groups.length > 0;

  const sorted = useMemo(
    () => [...dataset.rows].sort((a, b) => String(b.submitted_at_iso).localeCompare(String(a.submitted_at_iso))),
    [dataset.rows]
  );
  const visible = sorted.slice(0, pageSize);

  return (
    <Card title="Responses" subtitle={`${dataset.rows.length} response${dataset.rows.length === 1 ? "" : "s"} for this survey.`}>
      {visible.length === 0 ? (
        <div className="subtle" style={{ fontSize: 13 }}>No responses yet.</div>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Participant</Th>
                <Th>Session</Th>
                <Th>Submitted</Th>
                {hasGroups && <Th>Group</Th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.session_id || r.participant_id}>
                  <Td>{r.participant_id || "—"}</Td>
                  <Td style={{ fontFamily: "monospace", fontSize: 11.5 }}>{r.session_id || "—"}</Td>
                  <Td>{r.submitted_at_iso || "—"}</Td>
                  {hasGroups && <Td>{groupNameById.get(r.experiment_group_id) || r.experiment_group_id || "—"}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
          {visible.length < sorted.length && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <Button size="sm" onClick={onShowMore}>Show more</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ----------------------------- main page ----------------------------- */

export function SurveyParticipantsPage({ projectId: projectIdProp }) {
  const projectId = projectIdProp ?? getProjectIdUtil() ?? "global";

  const [surveys, setSurveys] = useState([]);
  const [loadingSurveys, setLoadingSurveys] = useState(true);
  const [surveyId, setSurveyId] = useState("");

  const [survey, setSurvey] = useState(null);
  const [responseRows, setResponseRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    let cancelled = false;
    setLoadingSurveys(true);
    listSurveysFromBackend({ projectId, force: true }).then((list) => {
      if (cancelled) return;
      const arr = Array.isArray(list) ? list : [];
      setSurveys(arr);
      setLoadingSurveys(false);

      let remembered = "";
      try {
        remembered = localStorage.getItem(LAST_SURVEY_KEY(projectId)) || "";
      } catch {}

      const pick = arr.find((s) => s.survey_id === remembered) || arr[0];
      setSurveyId((cur) => (cur && arr.some((s) => s.survey_id === cur) ? cur : pick?.survey_id || ""));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!surveyId) {
      setSurvey(null);
      setResponseRows([]);
      return;
    }

    try {
      localStorage.setItem(LAST_SURVEY_KEY(projectId), surveyId);
    } catch {}

    let cancelled = false;
    setLoading(true);
    setError("");
    setPageSize(25);

    Promise.all([
      loadSurveyFromBackend(surveyId, { projectId, force: true }),
      loadSurveyResponsesBySurveyRoster(surveyId, { projectId }),
    ])
      .then(([def, rows]) => {
        if (cancelled) return;
        setSurvey(def);
        setResponseRows(Array.isArray(rows) ? rows : []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Failed to load survey analysis data:", e);
        setError("Failed to load survey data");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [surveyId, projectId]);

  const dataset = useMemo(() => {
    if (!survey) return null;
    return buildAnalysisDataset({ survey, responseRows });
  }, [survey, responseRows]);

  const demographics = useMemo(() => (dataset ? computeDemographicsSummary(dataset) : []), [dataset]);
  const measures = useMemo(() => (dataset ? computeMeasuresSummary(dataset) : null), [dataset]);
  const groupComparison = useMemo(
    () => (dataset ? computeGroupComparison(dataset, survey?.experiment_groups) : null),
    [dataset, survey]
  );

  const topStats = useMemo(() => {
    if (!dataset) return null;
    const rows = dataset.rows;
    const uniqueParticipants = new Set(rows.map((r) => r.participant_id).filter(Boolean)).size;
    const dates = rows.map((r) => r.submitted_at_iso).filter(Boolean).sort();
    return {
      total: rows.length,
      uniqueParticipants,
      first: dates[0] || null,
      last: dates[dates.length - 1] || null,
    };
  }, [dataset]);

  const refresh = () => {
    if (!surveyId) return;
    setLoading(true);
    setError("");
    Promise.all([
      loadSurveyFromBackend(surveyId, { projectId, force: true }),
      loadSurveyResponsesBySurveyRoster(surveyId, { projectId }),
    ])
      .then(([def, rows]) => {
        setSurvey(def);
        setResponseRows(Array.isArray(rows) ? rows : []);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setError("Failed to refresh survey data");
        setLoading(false);
      });
  };

  const downloadCsv = async () => {
    if (!surveyId) return;
    try {
      setDownloading(true);
      const roster = await loadSurveyOnlyRoster({ surveyId, projectId, labelMode: "text" });
      const safeRows = Array.isArray(roster?.rows) ? roster.rows : [];
      if (!safeRows.length) {
        alert("No survey responses found yet.");
        return;
      }

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

      const csv = buildCsv(normalizedRows, header, header);
      const filename = `${safeFileStem(survey?.name || surveyId)}_survey_responses.csv`;
      triggerCsvDownload(filename, csv);
    } catch (e) {
      console.error("Survey CSV download failed:", e);
      alert("Failed to download CSV.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Survey Participants"
        subtitle={
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>Analysis hub for </span>
            <select
              value={surveyId}
              onChange={(e) => setSurveyId(e.target.value)}
              disabled={loadingSurveys || !surveys.length}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--admin-border, #d1d5db)",
                fontSize: 13,
                maxWidth: 320,
              }}
            >
              {!surveys.length && <option value="">{loadingSurveys ? "Loading surveys…" : "No surveys yet"}</option>}
              {surveys.map((s) => (
                <option key={s.survey_id} value={s.survey_id}>
                  {s.name || s.survey_id}
                </option>
              ))}
            </select>
            <span className="subtle"> · {APP} · {projectId || "global"}</span>
          </div>
        }
        actions={
          <>
            <Button size="sm" onClick={refresh} disabled={!surveyId || loading}>
              Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={downloadCsv} busy={downloading} disabled={!surveyId}>
              Download Survey CSV
            </Button>
          </>
        }
      />

      {error && <div style={{ color: "crimson", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {!surveyId && !loadingSurveys && (
        <Card title="No survey selected">
          <div className="subtle">
            {surveys.length ? "Pick a survey above." : "This project doesn't have any surveys yet — create one in Surveys."}
          </div>
        </Card>
      )}

      {loading && !dataset && (
        <Card title="Loading…">
          <div className="subtle">Loading survey definition and responses…</div>
        </Card>
      )}

      {dataset && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              gap: 10,
              marginBottom: 18,
            }}
          >
            <StatCard title="Responses" value={topStats.total} />
            <StatCard title="Unique participants" value={topStats.uniqueParticipants} />
            <StatCard title="First submission" value={topStats.first ? topStats.first.slice(0, 10) : "—"} />
            <StatCard title="Latest submission" value={topStats.last ? topStats.last.slice(0, 10) : "—"} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <DemographicsSection dataset={dataset} demographics={demographics} />
            {measures && <MeasuresSection dataset={dataset} measures={measures} />}
            <GroupComparisonSection comparison={groupComparison} />
            <ResponsesSection
              dataset={dataset}
              survey={survey}
              pageSize={pageSize}
              onShowMore={() => setPageSize((s) => s + 25)}
            />
          </div>
        </>
      )}
    </>
  );
}
