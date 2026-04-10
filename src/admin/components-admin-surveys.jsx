import React, { useEffect, useMemo, useState } from "react";
import {
  makeEmptySurvey,
  makeQuestionByType,
  normalizeSurvey,
  SURVEY_QUESTION_TYPES,
  getProjectId,
  listFeedsFromBackend,
  listSurveysFromBackend,
  loadSurveyFromBackend,
  saveSurveyToBackend,
  deleteSurveyOnBackend,
  linkSurveyToFeedsOnBackend
} from "../utils";

/* =========================
   Small helpers
   ========================= */

const QUESTION_TYPE_LABELS = {
  [SURVEY_QUESTION_TYPES.TEXT]: "Text",
  [SURVEY_QUESTION_TYPES.TEXTAREA]: "Long text",
  [SURVEY_QUESTION_TYPES.SINGLE]: "Single choice",
  [SURVEY_QUESTION_TYPES.MULTI]: "Multiple choice",
  [SURVEY_QUESTION_TYPES.DROPDOWN]: "Dropdown",
  [SURVEY_QUESTION_TYPES.MATRIX_SINGLE]: "Matrix (single)",
  [SURVEY_QUESTION_TYPES.MATRIX_MULTI]: "Matrix (multi)",
  [SURVEY_QUESTION_TYPES.BIPOLAR]: "Bipolar scale",
  [SURVEY_QUESTION_TYPES.SLIDER]: "Slider",
  [SURVEY_QUESTION_TYPES.INFO]: "Info text",
};

function cleanStringArray(arr = []) {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

function splitLines(value = "") {
  return String(value || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinLines(arr = []) {
  return cleanStringArray(arr).join("\n");
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/* =========================
   Reusable editors
   ========================= */

function TextInput({ value, onChange, placeholder, style }) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        ...style,
      }}
    />
  );
}

function TextAreaInput({ value, onChange, placeholder, rows = 3, style }) {
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        resize: "vertical",
        ...style,
      }}
    />
  );
}

function NumberInput({ value, onChange, min, max, step = 1, style }) {
  return (
    <input
      type="number"
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        ...style,
      }}
    />
  );
}

function SelectInput({ value, onChange, children, style }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        background: "#fff",
        ...style,
      }}
    >
      {children}
    </select>
  );
}

function CheckboxInput({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function FieldBlock({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function ArrayEditor({
  label,
  value,
  onChange,
  placeholder = "One item per line",
  rows = 4,
}) {
  return (
    <FieldBlock label={label}>
      <TextAreaInput
        value={joinLines(value)}
        onChange={(text) => onChange(splitLines(text))}
        placeholder={placeholder}
        rows={rows}
      />
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
        One item per line
      </div>
    </FieldBlock>
  );
}

/* =========================
   Question editor
   ========================= */

function QuestionCard({ q, index, updateQuestion, removeQuestion }) {
  const type = q?.type;

  const isChoice =
    type === SURVEY_QUESTION_TYPES.SINGLE ||
    type === SURVEY_QUESTION_TYPES.MULTI ||
    type === SURVEY_QUESTION_TYPES.DROPDOWN;

  const isMatrix =
    type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
    type === SURVEY_QUESTION_TYPES.MATRIX_MULTI;

  const isScale =
    type === SURVEY_QUESTION_TYPES.BIPOLAR ||
    type === SURVEY_QUESTION_TYPES.SLIDER;

  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 220px auto",
          gap: 10,
          alignItems: "start",
          marginBottom: 10,
        }}
      >
        <div>
          <FieldBlock label={`Question ${index + 1}`}>
            <TextInput
              value={q.label}
              onChange={(v) => updateQuestion(index, { label: v })}
              placeholder="Question text"
            />
          </FieldBlock>
        </div>

        <div>
          <FieldBlock label="Type">
            <SelectInput
              value={q.type}
              onChange={(nextType) => {
                const next = makeQuestionByType(nextType);
                updateQuestion(index, {
                  ...next,
                  id: q.id,
                  label: q.label || next.label,
                  description: q.description || "",
                  required: q.required,
                  visible_if: q.visible_if || null,
                });
              }}
            >
              {Object.values(SURVEY_QUESTION_TYPES).map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t] || t}
                </option>
              ))}
            </SelectInput>
          </FieldBlock>
        </div>

        <div style={{ paddingTop: 23 }}>
          <button
            onClick={() => removeQuestion(index)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #dc2626",
              background: "#fff",
              color: "#dc2626",
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <FieldBlock label="Help text / description">
        <TextAreaInput
          value={q.description}
          onChange={(v) => updateQuestion(index, { description: v })}
          placeholder="Optional description"
          rows={2}
        />
      </FieldBlock>

      {type !== SURVEY_QUESTION_TYPES.INFO && (
        <div style={{ marginBottom: 12 }}>
          <CheckboxInput
            checked={q.required}
            onChange={(v) => updateQuestion(index, { required: v })}
            label="Required"
          />
        </div>
      )}

      {isChoice && (
        <>
          <ArrayEditor
            label="Options"
            value={q.options}
            onChange={(arr) => updateQuestion(index, { options: arr })}
            rows={5}
          />

          <div style={{ marginBottom: 12 }}>
            <CheckboxInput
              checked={q.randomize_options}
              onChange={(v) => updateQuestion(index, { randomize_options: v })}
              label="Randomize options"
            />
          </div>
        </>
      )}

      {isMatrix && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <ArrayEditor
            label="Rows / items"
            value={q.rows}
            onChange={(arr) => updateQuestion(index, { rows: arr })}
            rows={5}
          />
          <ArrayEditor
            label="Columns / scale points"
            value={q.columns}
            onChange={(arr) => updateQuestion(index, { columns: arr })}
            rows={5}
          />
        </div>
      )}

      {isScale && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 120px 1fr 1fr",
            gap: 12,
            alignItems: "end",
          }}
        >
          <FieldBlock label="Min">
            <NumberInput
              value={q.min}
              min={0}
              max={100}
              onChange={(v) =>
                updateQuestion(index, {
                  min: clampInt(v, 0, 100, q.min ?? 1),
                })
              }
            />
          </FieldBlock>

          <FieldBlock label="Max">
            <NumberInput
              value={q.max}
              min={1}
              max={100}
              onChange={(v) =>
                updateQuestion(index, {
                  max: clampInt(v, 1, 100, q.max ?? 7),
                })
              }
            />
          </FieldBlock>

          <FieldBlock label="Min label">
            <TextInput
              value={q.min_label}
              onChange={(v) => updateQuestion(index, { min_label: v })}
              placeholder="e.g. Negative"
            />
          </FieldBlock>

          <FieldBlock label="Max label">
            <TextInput
              value={q.max_label}
              onChange={(v) => updateQuestion(index, { max_label: v })}
              placeholder="e.g. Positive"
            />
          </FieldBlock>
        </div>
      )}

      {type === SURVEY_QUESTION_TYPES.INFO && (
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          Info text is display-only and is not required.
        </div>
      )}
    </div>
  );
}

/* =========================
   Main Component
   ========================= */

export function AdminSurveysPanel({ projectId: propProjectId, feedId, feeds: propFeeds }) {
  const projectId = propProjectId || getProjectId();

  const [surveys, setSurveys] = useState([]);
  const [feeds, setFeeds] = useState(propFeeds || []);
  const [selectedSurveyId, setSelectedSurveyId] = useState(null);
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [surveyList, feedList] = await Promise.all([
        listSurveysFromBackend({ projectId }),
        propFeeds ? Promise.resolve(propFeeds) : listFeedsFromBackend(),
      ]);
      setSurveys(surveyList || []);
      setFeeds(feedList || []);
    } catch (e) {
      console.warn("Failed to load surveys:", e);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, [projectId]);

  async function handleSelectSurvey(id) {
    setSelectedSurveyId(id);
    if (!id) {
      setSurvey(null);
      return;
    }
    const s = await loadSurveyFromBackend(id);
    setSurvey(normalizeSurvey(s));
  }

  function handleCreateSurvey() {
    const s = makeEmptySurvey({
      linked_project_id: projectId,
    });
    setSurvey(normalizeSurvey(s));
    setSelectedSurveyId(null);
  }

  async function handleSaveSurvey() {
    if (!survey) return;
    const ok = await saveSurveyToBackend({
      ...survey,
      linked_project_id: projectId,
    });
    if (ok) {
      await loadAll();
      alert("Survey saved");
    } else {
      alert("Failed to save survey");
    }
  }

  async function handleDeleteSurvey() {
    if (!survey?.survey_id) return;
    if (!window.confirm("Delete this survey?")) return;

    const ok = await deleteSurveyOnBackend(survey.survey_id);
    if (ok) {
      setSurvey(null);
      setSelectedSurveyId(null);
      await loadAll();
    }
  }

  function addQuestion(type) {
    setSurvey((prev) => ({
      ...prev,
      questions: [...(prev.questions || []), makeQuestionByType(type)],
    }));
  }

  function updateQuestion(index, patch) {
    setSurvey((prev) => {
      const qs = [...(prev.questions || [])];
      qs[index] = { ...qs[index], ...patch };
      return { ...prev, questions: qs };
    });
  }

  function removeQuestion(index) {
    setSurvey((prev) => {
      const qs = [...(prev.questions || [])];
      qs.splice(index, 1);
      return { ...prev, questions: qs };
    });
  }

  function toggleFeed(feed_id) {
    setSurvey((prev) => {
      const set = new Set(prev.linked_feed_ids || []);
      if (set.has(feed_id)) set.delete(feed_id);
      else set.add(feed_id);
      return { ...prev, linked_feed_ids: Array.from(set) };
    });
  }

  async function handleSaveFeedLinks() {
    if (!survey?.survey_id) {
      alert("Save survey first before linking feeds.");
      return;
    }

    const ok = await linkSurveyToFeedsOnBackend({
      survey_id: survey.survey_id,
      feed_ids: survey.linked_feed_ids || [],
      project_id: projectId,
    });

    if (ok) alert("Feeds linked");
    else alert("Failed to link feeds");
  }

  const linkedFeedCount = useMemo(
    () => (survey?.linked_feed_ids || []).length,
    [survey]
  );

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div
        style={{
          width: 260,
          flex: "0 0 260px",
          borderRight: "1px solid #e5e7eb",
          paddingRight: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Surveys</h3>
          {loading && <span style={{ fontSize: 12, color: "#6b7280" }}>Loading…</span>}
        </div>

        <button
          onClick={handleCreateSurvey}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          + New Survey
        </button>

        <div style={{ marginTop: 12 }}>
          {surveys.map((s) => (
            <div
              key={s.survey_id}
              onClick={() => handleSelectSurvey(s.survey_id)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderRadius: 8,
                marginBottom: 6,
                background: selectedSurveyId === s.survey_id ? "#eef2ff" : "transparent",
                border: selectedSurveyId === s.survey_id ? "1px solid #c7d2fe" : "1px solid transparent",
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.name || s.survey_id}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {(s.questions || []).length} questions
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!survey && (
          <div style={{ color: "#6b7280" }}>
            Select or create a survey.
          </div>
        )}

        {survey && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Survey Editor</h3>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {linkedFeedCount} linked feed{linkedFeedCount === 1 ? "" : "s"}
              </div>
            </div>

            <FieldBlock label="Survey name">
              <TextInput
                value={survey.name}
                onChange={(v) => setSurvey({ ...survey, name: v })}
                placeholder="Survey name"
              />
            </FieldBlock>

            <FieldBlock label="Description">
              <TextAreaInput
                value={survey.description}
                onChange={(v) => setSurvey({ ...survey, description: v })}
                placeholder="Description"
                rows={3}
              />
            </FieldBlock>

            <h4 style={{ marginTop: 18, marginBottom: 10 }}>Questions</h4>

            {survey.questions?.map((q, i) => (
              <QuestionCard
                key={q.id}
                q={q}
                index={i}
                updateQuestion={updateQuestion}
                removeQuestion={removeQuestion}
              />
            ))}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.TEXT)}>+ Text</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.TEXTAREA)}>+ Long text</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.SINGLE)}>+ Single</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.MULTI)}>+ Multi</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.DROPDOWN)}>+ Dropdown</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.MATRIX_SINGLE)}>+ Matrix single</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.MATRIX_MULTI)}>+ Matrix multi</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.BIPOLAR)}>+ Bipolar</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.SLIDER)}>+ Slider</button>
              <button onClick={() => addQuestion(SURVEY_QUESTION_TYPES.INFO)}>+ Info</button>
            </div>

            <h4 style={{ marginTop: 18, marginBottom: 10 }}>Link to feeds</h4>

            <div
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: 12,
                maxHeight: 220,
                overflow: "auto",
                marginBottom: 12,
              }}
            >
              {feeds.length === 0 && (
                <div style={{ color: "#6b7280" }}>No feeds found.</div>
              )}

              {feeds.map((f) => (
                <div key={f.feed_id} style={{ marginBottom: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={(survey.linked_feed_ids || []).includes(f.feed_id)}
                      onChange={() => toggleFeed(f.feed_id)}
                    />
                    <span>{f.name || f.feed_id}</span>
                    {feedId && f.feed_id === feedId && (
                      <span style={{ fontSize: 12, color: "#6b7280" }}>(current)</span>
                    )}
                  </label>
                </div>
              ))}
            </div>

            <button onClick={handleSaveFeedLinks} style={{ marginBottom: 20 }}>
              Save Feed Links
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleSaveSurvey}>Save Survey</button>
              <button onClick={handleDeleteSurvey}>
                Delete Survey
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}