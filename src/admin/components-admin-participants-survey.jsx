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
  itemRefKey,
  findItemsMatchingTagPattern,
  buildCustomGroupComposite,
  summarizeComposite,
  loadCustomMeasureGroups,
  saveCustomMeasureGroups,
  simulateSurveyResponseRows,
  flattenSurveyQuestions,
  flattenSurveyResponseRecord,
  SURVEY_COLUMN_LABEL_MODE,
  stripSurveyExportPrefix,
  getSurveyAttentionCheckItems,
  countAttentionChecksPassed,
} from "../utils";
import { PageHeader, Card, Table, Th, Td, Button, Badge, Toggle, useToast, useConfirm, EmptyState, IconNote } from "./ui";
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

// Local date (not UTC) so a CSV downloaded late at night still gets the
// filename date the admin actually sees on their own clock.
function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

// Mirrors mergeParticipantRowsWithSurveyRows's column shape/order
// (utils-backend.js, not exported) so a CSV built from simulated rows lines
// up exactly with what "Download Survey CSV" produces from real data —
// same participant-field order, same survey_<QID>[_<ROW>] column keys, same
// "NA" fill for unanswered/not-shown-to-this-participant cells (matters
// since typical R workflows against this app's exports rely on read.csv's
// default na.strings picking that up).
function buildSimulatedCsvRows(survey, simRows, fillValue = "NA") {
  const hasGroups = Array.isArray(survey?.experiment_groups) && survey.experiment_groups.length > 0;
  const groupNameById = new Map((survey?.experiment_groups || []).map((g) => [g.id, g.name]));
  const surveyColumns = flattenSurveyQuestions(survey, { labelMode: SURVEY_COLUMN_LABEL_MODE.TEXT });
  const attentionCheckItems = getSurveyAttentionCheckItems(survey);

  return (simRows || []).map((row) => {
    const flat = flattenSurveyResponseRecord(row, surveyColumns);
    Object.keys(flat).forEach((k) => {
      if (flat[k] === "" || flat[k] == null) flat[k] = fillValue;
    });

    return {
      session_id: row.session_id ?? "",
      participant_id: row.participant_id ?? "",
      ip_address: "",
      prolific_pid: row.prolific_pid ?? "",
      entered_at_iso: row.entered_at_iso ?? "",
      submitted_at_iso: row.submitted_at_iso ?? "",
      duration_s: Math.round((row.duration_ms ?? 0) / 1000),
      feed_id: row.feed_id ?? "",
      ...(hasGroups
        ? {
            experiment_group_id: row.experiment_group_id ?? "",
            experiment_group_name: groupNameById.get(row.experiment_group_id) || row.experiment_group_id || "",
          }
        : {}),
      ...(attentionCheckItems.length
        ? { attention_checks_passed: countAttentionChecksPassed(attentionCheckItems, row.responses) }
        : {}),
      ...flat,
    };
  });
}

const LAST_SURVEY_KEY = (projectId) => `admin_last_analysis_survey_id::${APP || "app"}::${projectId || "global"}`;
const CUSTOM_GROUPS_KEY = (projectId, surveyId) =>
  `admin_custom_measure_groups::${APP || "app"}::${projectId || "global"}::${surveyId}`;

// Custom measure groups now live in Supabase (custom_measure_groups table —
// CLAUDE.md "Survey Participants analysis hub" follow-up) so they sync
// across browsers/admins. This localStorage reader is kept only as a
// one-time migration source: any groups saved locally back when this
// feature was localStorage-only get pushed up to the backend automatically
// the first time this survey's analysis is opened with zero backend groups
// (see the surveyId effect below) — never used for anything else.
function loadLegacyLocalCustomGroups(projectId, surveyId) {
  if (!surveyId) return [];
  try {
    const raw = localStorage.getItem(CUSTOM_GROUPS_KEY(projectId, surveyId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeGroupId() {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ----------------------------- mini charts ----------------------------- */

function MiniHistogram({ nums, binCount = 8, height = 56 }) {
  const bins = useMemo(() => histogramBins(nums, binCount), [nums, binCount]);
  if (!bins.length) return null;
  if (bins.length === 1 && bins[0].noVariation) {
    return (
      <div className="subtle" style={{ fontSize: 12, height, display: "flex", alignItems: "center" }}>
        No variation yet — every response so far is {bins[0].x0.toFixed(1)} ({bins[0].count}{" "}
        response{bins[0].count === 1 ? "" : "s"}).
      </div>
    );
  }
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
              background: "var(--admin-accent)",
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
              background: "var(--admin-accent)",
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
  const options = useMemo(
    () => demographics.map(({ item }) => `${item.questionId}::${item.itemKey}`),
    [demographics]
  );
  const [selectedKey, setSelectedKey] = useState(options[0] || "");

  useEffect(() => {
    if (!options.includes(selectedKey)) setSelectedKey(options[0] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.join("|")]);

  const selected = demographics.find(({ item }) => `${item.questionId}::${item.itemKey}` === selectedKey);

  return (
    <Card
      title="Demographics"
      subtitle="Auto-detected from question ids/text (age, gender, income, education, ethnicity, employment, ...)."
      actions={
        demographics.length > 0 && (
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--admin-border)",
              fontSize: 13,
              maxWidth: 260,
            }}
          >
            {demographics.map(({ item }) => (
              <option key={`${item.questionId}::${item.itemKey}`} value={`${item.questionId}::${item.itemKey}`}>
                {DEMOGRAPHIC_KIND_LABELS[item.demographicKind] || item.questionText}
              </option>
            ))}
          </select>
        )
      }
    >
      {demographics.length === 0 ? (
        <div className="subtle" style={{ fontSize: 13 }}>
          No demographic questions detected in this survey. Question ids/text like AGE, GENDER, INCOME,
          EDUCATION, ETHNICITY, EMPLOYMENT, MARITAL, NATIONALITY are picked up automatically.
        </div>
      ) : !selected ? null : (
        (({ item, summary }) => (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
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
                  <span>Range <strong>{summary.min != null && summary.max != null ? `${summary.min}–${summary.max}` : "—"}</strong></span>
                </div>
                {summary.n > 1 && (
                  <div style={{ maxWidth: 360 }}>
                    <MiniHistogram
                      nums={dataset.rows.map((r) => Number(getRawItemValue(r.responses, item))).filter((v) => Number.isFinite(v))}
                    />
                  </div>
                )}
              </>
            ) : summary.kind === "text" ? (
              <div className="subtle" style={{ fontSize: 12 }}>{summary.nAnswered} free-text response(s).</div>
            ) : (
              <div style={{ maxWidth: 420 }}>
                <CategoryBarList options={summary.options} maxWidth={260} />
              </div>
            )}
          </div>
        ))(selected)
      )}
    </Card>
  );
}

function CompositeMeasureBlock({ dataset, composite, summary, actions }) {
  const scores = useMemo(
    () => computeCompositeScores(composite, dataset.rows).filter((v) => v != null),
    [composite, dataset.rows]
  );

  return (
    <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--admin-border-subtle)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{composite.label}</div>
          <Badge tone="accent">{composite.source === "custom" ? "custom group" : "composite"} · {composite.items.length} items</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>N = {summary.nAnswered}/{summary.nTotal}</div>
          {actions}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6, fontSize: 12.5 }}>
        <span>Mean <strong>{fmtNum(summary.mean)}</strong></span>
        <span>SD <strong>{fmtNum(summary.sd)}</strong></span>
        <span>Median <strong>{fmtNum(summary.median)}</strong></span>
        <span>Range <strong>{summary.min != null && summary.max != null ? `${summary.min}–${summary.max}` : "—"}</strong></span>
        <span>
          Cronbach's α{" "}
          <strong>{summary.reliability ? fmtNum(summary.reliability.alpha) : "—"}</strong>
          {summary.reliability?.lowN && (
            <span title="Reliability estimates from this few respondents aren't meaningful yet — treat as provisional." style={{ marginLeft: 4, color: "var(--admin-warning)", cursor: "help" }}>
              ⚠
            </span>
          )}
        </span>
      </div>
      {summary.nAnswered > 0 && summary.nAnswered < 10 && (
        <div className="subtle" style={{ fontSize: 11.5, marginTop: 4 }}>
          Only {summary.nAnswered} response{summary.nAnswered === 1 ? "" : "s"} so far — early numbers, treat as provisional.
        </div>
      )}

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
                <tr key={`${it.questionId}::${it.itemKey}`}>
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

const inputStyle = {
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--admin-border)",
  fontSize: 13,
};

/**
 * Add/edit form for a custom tag-matched measure group. `initial` (when
 * editing) carries {name, pattern, itemKeys} — the *saved* item selection,
 * which can differ from what `pattern` alone would currently match (e.g. an
 * item the researcher manually excluded, like dropping PK_3 from a PK
 * mediator scale). That gap is reconstructed once on open as `overrides`, so
 * manual exclusions survive even as the pattern text is tweaked further.
 */
function GroupEditor({ dataset, initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [pattern, setPattern] = useState(initial?.pattern || "");
  const [overrides, setOverrides] = useState(() => {
    if (!initial) return new Map();
    const initialMatched = new Set(
      findItemsMatchingTagPattern(dataset, initial.pattern || "").map(itemRefKey)
    );
    const savedKeys = new Set(initial.itemKeys || []);
    const diff = new Map();
    const allKeys = new Set([...initialMatched, ...savedKeys]);
    allKeys.forEach((k) => {
      const saved = savedKeys.has(k);
      if (saved !== initialMatched.has(k)) diff.set(k, saved);
    });
    return diff;
  });

  const byKey = useMemo(() => new Map(dataset.items.map((it) => [itemRefKey(it), it])), [dataset.items]);

  const matched = useMemo(() => findItemsMatchingTagPattern(dataset, pattern), [dataset, pattern]);
  const matchedKeys = useMemo(() => new Set(matched.map(itemRefKey)), [matched]);

  const displayKeys = useMemo(() => {
    const keys = new Set([...matchedKeys, ...overrides.keys()]);
    return Array.from(keys)
      .filter((k) => byKey.has(k))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [matchedKeys, overrides, byKey]);

  const isChecked = (key) => (overrides.has(key) ? overrides.get(key) : matchedKeys.has(key));
  const toggle = (key) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, !isChecked(key));
      return next;
    });
  };

  const selectedKeys = displayKeys.filter((k) => isChecked(k));
  const canSave = name.trim() && selectedKeys.length >= 1;

  return (
    <div
      style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 8,
        padding: 14,
        marginBottom: 16,
        background: "var(--admin-surface-alt)",
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: 11.5, color: "var(--admin-muted)", marginBottom: 3 }}>Group name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. MI_EMO_BL_AVG"
            style={{ ...inputStyle, width: "100%" }}
          />
        </div>
        <div style={{ flex: "2 1 320px" }}>
          <div style={{ fontSize: 11.5, color: "var(--admin-muted)", marginBottom: 3 }}>
            Match tags — space = AND, comma = OR, * = wildcard (e.g. "MI EMO BL")
          </div>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="e.g. MI EMO BL"
            style={{ ...inputStyle, width: "100%", fontFamily: "monospace" }}
          />
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--admin-muted)", marginBottom: 6 }}>
        {matched.length} item{matched.length === 1 ? "" : "s"} match this pattern
        {selectedKeys.length !== matched.length ? ` · ${selectedKeys.length} selected` : ""}. Uncheck any to exclude
        them from this group.
      </div>

      {displayKeys.length > 0 && (
        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            border: "1px solid var(--admin-border-subtle)",
            borderRadius: 6,
            padding: "4px 8px",
            marginBottom: 10,
            background: "var(--admin-surface)",
          }}
        >
          {displayKeys.map((key) => {
            const it = byKey.get(key);
            // For matrix/bipolar rows, questionId is shared by every row in
            // that question — itemKey (the row's own id) is what actually
            // distinguishes them, so lead with that instead.
            const primary = it.isComposite ? it.itemKey : it.questionId;
            return (
              <label
                key={key}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12.5, cursor: "pointer" }}
              >
                <input type="checkbox" checked={isChecked(key)} onChange={() => toggle(key)} />
                <span style={{ fontFamily: "monospace" }}>{primary}</span>
                {it.isComposite && it.itemLabel && it.itemLabel !== primary && (
                  <span style={{ color: "var(--admin-muted)" }}>({it.itemLabel})</span>
                )}
              </label>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() =>
            onSave({
              id: initial?.id || makeGroupId(),
              name: name.trim(),
              pattern,
              itemKeys: selectedKeys,
            })
          }
        >
          {initial ? "Save changes" : "Add group"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {overrides.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOverrides(new Map())}>
            Reset exclusions
          </Button>
        )}
      </div>
    </div>
  );
}

function CustomGroupsSection({ dataset, projectId, surveyId, groups, setGroups }) {
  const confirm = useConfirm();
  const [editorMode, setEditorMode] = useState(null); // null | "new" | groupId being edited
  const [saveError, setSaveError] = useState("");

  const groupComposites = useMemo(
    () => groups.map((g) => ({ group: g, composite: buildCustomGroupComposite(g, dataset) })),
    [groups, dataset]
  );

  const persist = (next) => {
    setGroups(next);
    setSaveError("");
    saveCustomMeasureGroups(surveyId, next, { projectId }).then((res) => {
      if (!res.ok) setSaveError(res.err || "Failed to save custom groups");
    });
  };

  const handleSave = (groupDef) => {
    const exists = groups.some((g) => g.id === groupDef.id);
    const next = exists ? groups.map((g) => (g.id === groupDef.id ? groupDef : g)) : [...groups, groupDef];
    persist(next);
    setEditorMode(null);
  };

  const handleDelete = async (id) => {
    if (!(await confirm({ title: "Remove custom group?", message: "This only removes the grouping, not any response data." }))) return;
    persist(groups.filter((g) => g.id !== id));
  };

  const editingGroup = typeof editorMode === "string" && editorMode !== "new"
    ? groups.find((g) => g.id === editorMode)
    : null;

  return (
    <Card
      title="Custom measure groups"
      subtitle="Group any items across the whole survey by shared naming tags — e.g. every BL item, or just MI + EMO + BL together — instead of relying only on auto-detected per-question composites."
      actions={
        !editorMode && (
          <Button size="sm" onClick={() => setEditorMode("new")}>
            + New group
          </Button>
        )
      }
    >
      {saveError && (
        <div style={{ fontSize: 12.5, color: "var(--admin-danger-ink)", marginBottom: 10 }}>
          Failed to save: {saveError}
        </div>
      )}

      {editorMode === "new" && (
        <GroupEditor dataset={dataset} onSave={handleSave} onCancel={() => setEditorMode(null)} />
      )}

      {groupComposites.length === 0 && !editorMode && (
        <div className="subtle" style={{ fontSize: 13 }}>
          No custom groups yet. Useful when a survey repeats measures across many stimuli (e.g. BL/PK on
          20 posts across 4 conditions) and you want condition-level or overall averages, not one chart per item.
        </div>
      )}

      {groupComposites.map(({ group, composite }) =>
        editingGroup?.id === group.id ? (
          <GroupEditor
            key={group.id}
            dataset={dataset}
            initial={group}
            onSave={handleSave}
            onCancel={() => setEditorMode(null)}
          />
        ) : (
          <CompositeMeasureBlock
            key={group.id}
            dataset={dataset}
            composite={composite}
            summary={summarizeComposite(composite, dataset.rows)}
            actions={
              !editorMode && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditorMode(group.id)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(group.id)}>
                    Delete
                  </Button>
                </>
              )
            }
          />
        )
      )}
    </Card>
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

const MEASURES_PAGE_SIZE = 6;

function MeasuresSection({ dataset, measures, defaultOpen = false }) {
  // Seeded once from defaultOpen, then fully user-controlled — otherwise a
  // sibling re-render (e.g. adding a custom group elsewhere on the page)
  // would re-evaluate defaultOpen and snap this back shut/open, fighting a
  // manual toggle. Collapsed by default regardless of custom groups —
  // rendering every measure's chart/table at once is the main source of
  // "too much at once" on a survey with more than a handful of questions.
  const [open, setOpen] = useState(defaultOpen);
  const [visibleCount, setVisibleCount] = useState(MEASURES_PAGE_SIZE);

  const hasAny =
    measures.composites.length ||
    measures.standaloneNumeric.length ||
    measures.standaloneCategorical.length ||
    measures.textItems.length;

  const totalCount =
    measures.composites.length +
    measures.standaloneNumeric.length +
    measures.standaloneCategorical.length +
    measures.textItems.length;

  // Flatten composites + standalone numeric/categorical into one ordered
  // list so "show first N" is a single, simple slice — text items (already
  // their own paginated/collapsed blocks) render separately, unpaginated.
  const blocks = [
    ...measures.composites.map((m) => ({ kind: "composite", ...m })),
    ...measures.standaloneNumeric.map((m) => ({ kind: "numeric", ...m })),
    ...measures.standaloneCategorical.map((m) => ({ kind: "categorical", ...m })),
  ];
  const visibleBlocks = blocks.slice(0, visibleCount);
  const remaining = blocks.length - visibleBlocks.length;

  return (
    <Card
      title="Auto-detected measures"
      subtitle="Composite scales (auto-detected from matrix questions or ID_1/ID_2/ID_3-style groups), single-item measures, and other question responses."
    >
      {!hasAny ? (
        <div className="subtle" style={{ fontSize: 13 }}>No non-demographic questions detected in this survey.</div>
      ) : (
        <details open={open} onToggle={(e) => setOpen(e.target.open)}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--admin-muted)", marginBottom: 10 }}>
            {totalCount} auto-detected item{totalCount === 1 ? "" : "s"}
          </summary>
          <div style={{ marginTop: 10 }}>
          {visibleBlocks.map((b) =>
            b.kind === "composite" ? (
              <CompositeMeasureBlock key={`c:${b.composite.id}`} dataset={dataset} composite={b.composite} summary={b.summary} />
            ) : b.kind === "numeric" ? (
              <div
                key={`n:${b.item.questionId}`}
                style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--admin-border-subtle)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{b.item.questionText}</div>
                  <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>N = {b.summary.nAnswered}/{b.summary.nTotal}</div>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4, fontSize: 12.5 }}>
                  <span>Mean <strong>{fmtNum(b.summary.mean)}</strong></span>
                  <span>SD <strong>{fmtNum(b.summary.sd)}</strong></span>
                  <span>Median <strong>{fmtNum(b.summary.median)}</strong></span>
                  <span>Range <strong>{b.summary.min != null && b.summary.max != null ? `${b.summary.min}–${b.summary.max}` : "—"}</strong></span>
                </div>
              </div>
            ) : (
              <div
                key={`cat:${b.item.questionId}::${b.item.itemKey}`}
                style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--admin-border-subtle)" }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  {b.item.questionText}
                  {b.item.isComposite ? ` — ${b.item.itemLabel}` : ""}
                  <span style={{ fontWeight: 400, fontSize: 11, color: "var(--admin-muted)", marginLeft: 8 }}>
                    N = {b.summary.nAnswered}/{b.summary.nTotal}
                  </span>
                </div>
                <CategoryBarList options={b.summary.options} />
              </div>
            )
          )}

          {remaining > 0 && (
            <Button variant="ghost" onClick={() => setVisibleCount((n) => n + MEASURES_PAGE_SIZE)}>
              Show {Math.min(remaining, MEASURES_PAGE_SIZE)} more ({remaining} remaining)
            </Button>
          )}

          {measures.textItems.length > 0 && <TextResponsesBlock dataset={dataset} items={measures.textItems} />}
          </div>
        </details>
      )}
    </Card>
  );
}

const GROUP_COMPARISON_PAGE_SIZE = 8;

function TestCaveat({ text }) {
  return (
    <span title={text} style={{ marginLeft: 4, color: "var(--admin-warning)", cursor: "help" }}>
      ⚠
    </span>
  );
}

function GroupComparisonSection({ comparison }) {
  const [numericVisible, setNumericVisible] = useState(GROUP_COMPARISON_PAGE_SIZE);
  const [catVisible, setCatVisible] = useState(GROUP_COMPARISON_PAGE_SIZE);

  if (!comparison) return null;

  const tinyGroup = comparison.groups.some((g) => g.n > 0 && g.n < 5);
  const visibleNumeric = comparison.numericComparisons.slice(0, numericVisible);
  const visibleCat = comparison.categoricalComparisons.slice(0, catVisible);

  return (
    <Card
      title="Group comparison"
      subtitle={`Between-subjects groups: ${comparison.groups.map((g) => `${g.name} (n=${g.n})`).join(" · ")}`}
    >
      {tinyGroup && (
        <div className="subtle" style={{ fontSize: 12, marginBottom: 12 }}>
          ⚠ At least one group still has fewer than 5 responses — comparisons below are early and
          may swing a lot as more data comes in.
        </div>
      )}

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
              {visibleNumeric.map((c) => (
                <tr key={c.key}>
                  <Td>{c.label}</Td>
                  {c.perGroup.map((g, i) => (
                    <Td key={i}>{g.n ? `${fmtNum(g.mean)} ± ${fmtNum(g.sd)} (n=${g.n})` : "—"}</Td>
                  ))}
                  <Td>
                    {!c.test ? (
                      "—"
                    ) : c.test.type === "welch_t" ? (
                      <span>
                        t({fmtNum(c.test.df, 1)}) = {fmtNum(c.test.t)}, {formatPValue(c.test.p)}
                        {c.test.lowN && <TestCaveat text="Small group sizes — treat this test as provisional." />}
                      </span>
                    ) : (
                      <span>
                        F({c.test.dfBetween},{c.test.dfWithin}) = {fmtNum(c.test.F)}, {formatPValue(c.test.p)}
                        {c.test.lowN && <TestCaveat text="Small group sizes — treat this test as provisional." />}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {comparison.numericComparisons.length > numericVisible && (
            <Button variant="ghost" onClick={() => setNumericVisible((n) => n + GROUP_COMPARISON_PAGE_SIZE)}>
              Show more ({comparison.numericComparisons.length - numericVisible} remaining)
            </Button>
          )}
        </div>
      )}

      {comparison.categoricalComparisons.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Categorical variables</div>
          {visibleCat.map((c) => (
            <details key={c.key} style={{ marginBottom: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {c.questionText}
                {c.label !== c.questionText ? ` — ${c.label}` : ""}
                {c.test && (
                  <span style={{ fontWeight: 400, color: "var(--admin-muted)", marginLeft: 8, fontSize: 12 }}>
                    χ²({c.test.df}) = {fmtNum(c.test.chisq)}, {formatPValue(c.test.p)}
                    {c.test.lowExpectedCounts && (
                      <TestCaveat text="Some cells have very few expected responses — this test isn't reliable yet." />
                    )}
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
          {comparison.categoricalComparisons.length > catVisible && (
            <Button variant="ghost" onClick={() => setCatVisible((n) => n + GROUP_COMPARISON_PAGE_SIZE)}>
              Show more ({comparison.categoricalComparisons.length - catVisible} remaining)
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function FlagBadge({ label, detail }) {
  return (
    <span
      title={detail}
      style={{
        display: "inline-block",
        fontSize: ".72rem",
        fontWeight: 600,
        color: "var(--admin-warning-ink)",
        background: "var(--admin-warning-soft)",
        border: "1px solid var(--admin-warning-border)",
        borderRadius: 999,
        padding: "1px 7px",
        marginRight: 4,
        cursor: "help",
      }}
    >
      {label}
    </span>
  );
}

// Straight-lining check: an overall assessment across every measure this
// participant answered, not a separate flag per composite. Checking one
// composite in isolation is weak evidence on its own — a composite's items
// are often closely related by design (that's what makes them a valid
// scale), so giving the identical answer to all of them can be a genuine,
// consistent response rather than inattention. It only becomes a meaningful
// signal once it's the *dominant* pattern across everything the participant
// answered, not one isolated measure among several answered normally — so a
// single flag is computed from all eligible composites (>= 3 items) together,
// and only fires when a majority of the composites they actually completed
// were straight-lined (or there's only one composite in the whole survey to
// begin with, in which case there's nothing else to compare it against).
// A conservative, purely client-side heuristic over data already loaded —
// nothing sent anywhere, nothing auto-excluded, just a hint for the
// researcher to look closer. Incomplete composites (any item left blank) are
// skipped rather than counted, since a blank isn't "the same answer."
function computeStraightLineFlags(dataset, row) {
  const completeComposites = dataset.composites.filter((composite) => {
    if (composite.items.length < 3) return false;
    return composite.items.every((it) => {
      const v = getRawItemValue(row.responses, it);
      return v != null && v !== "";
    });
  });
  if (!completeComposites.length) return [];

  const straightLined = completeComposites.filter((composite) => {
    const vals = composite.items.map((it) => String(getRawItemValue(row.responses, it)));
    return vals.every((v) => v === vals[0]);
  });
  if (!straightLined.length) return [];

  if (completeComposites.length > 1 && straightLined.length / completeComposites.length < 0.5) {
    return [];
  }

  const names = straightLined.map((c) => c.label).join(", ");
  const detail =
    straightLined.length === completeComposites.length
      ? `Gave the identical answer within every measure answered (${completeComposites.length}): ${names}.`
      : `Gave the identical answer within ${straightLined.length} of ${completeComposites.length} measures answered: ${names}.`;

  return [{ key: "straightline:overall", label: "Straight-lining", detail }];
}

// Attention-check items are flagged directly by classifySurveyQuestions
// (isAttentionCheck/attentionCheckValue, utils-survey-analysis.js) rather
// than detected heuristically the way straight-lining is — the admin
// explicitly marked the question and picked the correct answer in the
// editor, so this is a real pass/fail check, not a guess. Skipped (not
// flagged as a fail) when unanswered — an attention check left blank could
// mean it was never reached (e.g. hidden by a visible_if further up the
// page), not that it was answered wrong.
function computeAttentionCheckFlags(dataset, row) {
  const flags = [];
  for (const item of dataset.items) {
    if (!item.isAttentionCheck) continue;
    const v = getRawItemValue(row.responses, item);
    if (v == null || v === "") continue;
    if (String(v) !== item.attentionCheckValue) {
      flags.push({
        key: `attentioncheck:${item.questionId}`,
        label: "Failed attention check",
        detail: `"${item.questionText}" was answered incorrectly.`,
      });
    }
  }
  return flags;
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

  const flagsBySession = useMemo(() => {
    const out = new Map();
    sorted.forEach((r) => {
      const flags = [...computeStraightLineFlags(dataset, r), ...computeAttentionCheckFlags(dataset, r)];
      if (flags.length) out.set(r.session_id || r.participant_id, flags);
    });
    return out;
  }, [dataset, sorted]);

  return (
    <Card title="Responses" subtitle={`${dataset.rows.length} response${dataset.rows.length === 1 ? "" : "s"} for this survey.`}>
      {visible.length === 0 ? (
        <EmptyState icon={IconNote} title="No responses yet" message="Responses will appear here as participants complete this survey." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Participant</Th>
                <Th>Session</Th>
                <Th>Submitted</Th>
                {hasGroups && <Th>Group</Th>}
                <Th>Flags</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.session_id || r.participant_id}>
                  <Td>{r.participant_id || "—"}</Td>
                  <Td style={{ fontFamily: "monospace", fontSize: 11.5 }}>{r.session_id || "—"}</Td>
                  <Td>{r.submitted_at_iso || "—"}</Td>
                  {hasGroups && <Td>{groupNameById.get(r.experiment_group_id) || r.experiment_group_id || "—"}</Td>}
                  <Td>
                    {(flagsBySession.get(r.session_id || r.participant_id) || []).map((f) => (
                      <FlagBadge key={f.key} label={f.label} detail={f.detail} />
                    ))}
                  </Td>
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

// Calibrated empirically against computeGroupComparison's actual output
// (matrix/bipolar composites, 3 groups, n=30/group) rather than derived by
// hand — the generator's noise/quantization layers make the true
// z-shift -> observed-mean relationship non-linear. Roughly: None ~ no
// separation; Small ~ Cohen's d 0.2-0.3 (often not significant, like a
// modest pilot effect); Medium ~ d 0.5-0.6; Large ~ d 0.9+ (reliably
// significant at n=30/group) — useful spread for testing pairwise-
// comparison code against both "nothing here" and "clearly something here".
const GROUP_EFFECT_PRESETS = [
  { value: 0, label: "None (null effect)" },
  { value: 0.2, label: "Small" },
  { value: 0.45, label: "Medium" },
  { value: 0.8, label: "Large" },
];

function SimulateResponsesCard({
  survey,
  simOpen,
  setSimOpen,
  usingSimulated,
  simRowCount,
  simPerGroup,
  setSimPerGroup,
  simTotal,
  setSimTotal,
  simGroupEffect,
  setSimGroupEffect,
  simLowEffort,
  setSimLowEffort,
  onSimulate,
  onClear,
}) {
  const groups = Array.isArray(survey?.experiment_groups) ? survey.experiment_groups : [];
  const hasGroups = groups.length > 0;
  const expectedN = hasGroups ? groups.length * Math.max(0, Number(simPerGroup) || 0) : Math.max(0, Number(simTotal) || 0);

  return (
    <Card
      title="Simulate responses"
      subtitle="Generate fake-but-plausible responses for this survey — client-side only, never sent to the backend — so you can build/test an analysis script before real data exists."
      actions={
        <Button size="sm" variant="ghost" onClick={() => setSimOpen((v) => !v)}>
          {simOpen ? "Hide" : "Show"}
        </Button>
      }
    >
      {simOpen ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            {hasGroups ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--admin-muted)" }}>
                Participants per group ({groups.length} groups)
                <input
                  type="number"
                  min={1}
                  value={simPerGroup}
                  onChange={(e) => setSimPerGroup(Math.max(1, Number(e.target.value) || 1))}
                  style={{ ...inputStyle, width: 100 }}
                />
              </label>
            ) : (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--admin-muted)" }}>
                Total participants
                <input
                  type="number"
                  min={1}
                  value={simTotal}
                  onChange={(e) => setSimTotal(Math.max(1, Number(e.target.value) || 1))}
                  style={{ ...inputStyle, width: 100 }}
                />
              </label>
            )}

            {hasGroups && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--admin-muted)" }}>
                Group differences
                <select
                  value={simGroupEffect}
                  onChange={(e) => setSimGroupEffect(Number(e.target.value))}
                  style={{ ...inputStyle, width: 170 }}
                  title="How much simulated group means differ — for testing your between-group comparison code, not a real effect"
                >
                  {GROUP_EFFECT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <Button variant="secondary" onClick={onSimulate}>
              Simulate {expectedN} response{expectedN === 1 ? "" : "s"}
            </Button>

            {usingSimulated && (
              <Button variant="ghost" onClick={onClear}>
                Clear simulation
              </Button>
            )}
          </div>

          <div style={{ marginTop: 12, maxWidth: 480 }}>
            <Toggle
              label="Include a few low-effort (straight-lining) responses"
              hint="A small share of simulated respondents give the same answer to every item of a scale, on top of whatever ties happen naturally — useful for testing the data-quality flags below."
              checked={simLowEffort}
              onChange={setSimLowEffort}
            />
          </div>

          {usingSimulated && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--admin-muted)" }}>
              Currently viewing {simRowCount} simulated response{simRowCount === 1 ? "" : "s"} — every chart, stat, and
              test below is computed from this fake data, not real responses.
            </div>
          )}
        </>
      ) : (
        usingSimulated && (
          <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>
            Viewing {simRowCount} simulated response{simRowCount === 1 ? "" : "s"} —{" "}
            <button
              type="button"
              onClick={onClear}
              style={{ border: "none", background: "none", padding: 0, color: "var(--admin-accent)", cursor: "pointer", font: "inherit" }}
            >
              clear
            </button>{" "}
            to go back to real data.
          </div>
        )
      )}
    </Card>
  );
}

/* ----------------------------- main page ----------------------------- */

export function SurveyParticipantsPage({
  projectId: projectIdProp,
  surveyId: controlledSurveyId,
  onSurveyIdChange,
  embed = false,
}) {
  const projectId = projectIdProp ?? getProjectIdUtil() ?? "global";
  const toast = useToast();

  // When nested as a tab inside AdminSurveysPanel, the survey is already
  // selected by the parent — this page just renders analysis for it,
  // skipping its own survey-list fetch/picker and "remembered survey"
  // localStorage bookkeeping (both only make sense for the standalone route).
  const controlled = controlledSurveyId !== undefined && controlledSurveyId !== null;
  const [surveys, setSurveys] = useState([]);
  const [loadingSurveys, setLoadingSurveys] = useState(!controlled);
  const [uncontrolledSurveyId, setUncontrolledSurveyId] = useState("");
  const surveyId = controlled ? controlledSurveyId : uncontrolledSurveyId;
  const setSurveyId = (id) => (controlled ? onSurveyIdChange?.(id) : setUncontrolledSurveyId(id));

  const [survey, setSurvey] = useState(null);
  const [responseRows, setResponseRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [customGroups, setCustomGroups] = useState([]);

  // Simulate responses — generates fake-but-plausible survey_responses rows
  // client-side (never touches the backend) so an analysis script can be
  // built/tested against realistic data instead of waiting on real
  // participants. See utils-survey-simulate.js for the generation model.
  const [simOpen, setSimOpen] = useState(false);
  const [usingSimulated, setUsingSimulated] = useState(false);
  const [simRows, setSimRows] = useState([]);
  const [simPerGroup, setSimPerGroup] = useState(30);
  const [simTotal, setSimTotal] = useState(100);
  const [simGroupEffect, setSimGroupEffect] = useState(0.45);
  const [simLowEffort, setSimLowEffort] = useState(true);

  useEffect(() => {
    if (controlled) {
      setLoadingSurveys(false);
      return;
    }

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
  }, [projectId, controlled]);

  useEffect(() => {
    if (!surveyId) {
      setSurvey(null);
      setResponseRows([]);
      setCustomGroups([]);
      setUsingSimulated(false);
      setSimRows([]);
      return;
    }

    if (!controlled) {
      try {
        localStorage.setItem(LAST_SURVEY_KEY(projectId), surveyId);
      } catch {}
    }

    setCustomGroups([]);
    setUsingSimulated(false);
    setSimRows([]);

    let cancelled = false;
    setLoading(true);
    setError("");
    setPageSize(25);

    Promise.all([
      loadSurveyFromBackend(surveyId, { projectId, force: true }),
      loadSurveyResponsesBySurveyRoster(surveyId, { projectId }),
      loadCustomMeasureGroups({ surveyId, projectId }),
    ])
      .then(([def, rows, backendGroups]) => {
        if (cancelled) return;
        setSurvey(def);
        setResponseRows(Array.isArray(rows) ? rows : []);

        if (backendGroups.length) {
          setCustomGroups(backendGroups);
        } else {
          // One-time migration path — see loadLegacyLocalCustomGroups above.
          const legacy = loadLegacyLocalCustomGroups(projectId, surveyId);
          if (legacy.length) {
            setCustomGroups(legacy);
            saveCustomMeasureGroups(surveyId, legacy, { projectId }).then((res) => {
              if (!res.ok) console.warn("Failed to migrate local custom measure groups to backend:", res.err);
            });
          }
        }

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
  }, [surveyId, projectId, controlled]);

  const effectiveResponseRows = usingSimulated ? simRows : responseRows;

  const dataset = useMemo(() => {
    if (!survey) return null;
    return buildAnalysisDataset({ survey, responseRows: effectiveResponseRows });
  }, [survey, effectiveResponseRows]);

  const runSimulation = () => {
    if (!survey) return;
    const generated = simulateSurveyResponseRows({
      survey,
      participantsPerGroup: simPerGroup,
      totalParticipants: simTotal,
      groupEffectSize: simGroupEffect,
      includeLowEffort: simLowEffort,
      seed: surveyId,
    });
    setSimRows(generated);
    setUsingSimulated(true);
  };

  const clearSimulation = () => {
    setUsingSimulated(false);
    setSimRows([]);
  };

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

      const safeRows = usingSimulated
        ? buildSimulatedCsvRows(survey, simRows)
        : (await loadSurveyOnlyRoster({ surveyId, projectId, labelMode: "text" })).rows || [];

      if (!safeRows.length) {
        toast.error(usingSimulated ? "Simulate some responses first." : "No survey responses found yet.");
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

      const csv = buildCsv(normalizedRows, header, header.map(stripSurveyExportPrefix));
      const filename = `${safeFileStem(survey?.name || surveyId)}_responses_${todayStamp()}${usingSimulated ? "_SIMULATED" : ""}.csv`;
      triggerCsvDownload(filename, csv);
    } catch (e) {
      console.error("Survey CSV download failed:", e);
      toast.error("Failed to download CSV.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {!embed ? (
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
                  border: "1px solid var(--admin-border)",
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
              {usingSimulated && <Badge tone="accent">SIMULATED</Badge>}
            </div>
          }
          actions={
            <>
              <Button
                size="sm"
                onClick={refresh}
                disabled={!surveyId || loading || usingSimulated}
                title={usingSimulated ? "Clear the simulation first" : undefined}
              >
                Refresh
              </Button>
              <Button size="sm" variant="secondary" onClick={downloadCsv} busy={downloading} disabled={!surveyId}>
                Download Survey CSV
              </Button>
            </>
          }
        />
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 14 }}>
          {usingSimulated && <Badge tone="accent">SIMULATED</Badge>}
          <Button
            size="sm"
            onClick={refresh}
            disabled={!surveyId || loading || usingSimulated}
            title={usingSimulated ? "Clear the simulation first" : undefined}
          >
            Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={downloadCsv} busy={downloading} disabled={!surveyId}>
            Download Survey CSV
          </Button>
        </div>
      )}

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
            <SimulateResponsesCard
              survey={survey}
              simOpen={simOpen}
              setSimOpen={setSimOpen}
              usingSimulated={usingSimulated}
              simRowCount={simRows.length}
              simPerGroup={simPerGroup}
              setSimPerGroup={setSimPerGroup}
              simTotal={simTotal}
              setSimTotal={setSimTotal}
              simGroupEffect={simGroupEffect}
              setSimGroupEffect={setSimGroupEffect}
              simLowEffort={simLowEffort}
              setSimLowEffort={setSimLowEffort}
              onSimulate={runSimulation}
              onClear={clearSimulation}
            />
            <DemographicsSection dataset={dataset} demographics={demographics} />
            <CustomGroupsSection
              dataset={dataset}
              projectId={projectId}
              surveyId={surveyId}
              groups={customGroups}
              setGroups={setCustomGroups}
            />
            {measures && (
              <MeasuresSection dataset={dataset} measures={measures} />
            )}
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
