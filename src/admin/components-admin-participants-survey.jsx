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
              border: "1px solid var(--admin-border, #d1d5db)",
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
                  <span>Range <strong>{summary.min ?? "—"}–{summary.max ?? "—"}</strong></span>
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
  border: "1px solid var(--admin-border, #d1d5db)",
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
        border: "1px solid var(--admin-border, #d1d5db)",
        borderRadius: 8,
        padding: 14,
        marginBottom: 16,
        background: "var(--admin-surface-subtle, rgba(0,0,0,0.02))",
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

  const handleDelete = (id) => {
    if (!confirm("Remove this custom group? This only removes the grouping, not any response data.")) return;
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
        <div style={{ fontSize: 12.5, color: "#b91c1c", marginBottom: 10 }}>
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

function MeasuresSection({ dataset, measures, defaultOpen = true }) {
  // Seeded once from defaultOpen, then fully user-controlled — otherwise a
  // sibling re-render (e.g. adding a custom group elsewhere on the page)
  // would re-evaluate defaultOpen and snap this back shut/open, fighting a
  // manual toggle.
  const [open, setOpen] = useState(defaultOpen);

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
          </div>
        </details>
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

export function SurveyParticipantsPage({
  projectId: projectIdProp,
  surveyId: controlledSurveyId,
  onSurveyIdChange,
  embed = false,
}) {
  const projectId = projectIdProp ?? getProjectIdUtil() ?? "global";

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
      return;
    }

    if (!controlled) {
      try {
        localStorage.setItem(LAST_SURVEY_KEY(projectId), surveyId);
      } catch {}
    }

    setCustomGroups([]);

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

  const dataset = useMemo(() => {
    if (!survey) return null;
    return buildAnalysisDataset({ survey, responseRows });
  }, [survey, responseRows]);

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
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
          <Button size="sm" onClick={refresh} disabled={!surveyId || loading}>
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
            <DemographicsSection dataset={dataset} demographics={demographics} />
            <CustomGroupsSection
              dataset={dataset}
              projectId={projectId}
              surveyId={surveyId}
              groups={customGroups}
              setGroups={setCustomGroups}
            />
            {measures && (
              <MeasuresSection dataset={dataset} measures={measures} defaultOpen={customGroups.length === 0} />
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
