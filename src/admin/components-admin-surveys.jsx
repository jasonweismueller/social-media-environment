import React, { useEffect, useMemo, useState } from "react";
import {
  makeEmptySurvey,
  makeQuestionByType,
  normalizeSurvey,
  SURVEY_QUESTION_TYPES,
  surveyQuestionCount,
  getProjectId,
  listFeedsFromBackend,
  listSurveysFromBackend,
  loadSurveyFromBackend,
  saveSurveyToBackend,
  deleteSurveyOnBackend,
  linkSurveyToFeedsOnBackend,
  getLinkedFeedIdsForSurveyFromBackend,
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

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeLinkedFeedIds(input) {
  return Array.isArray(input) ? input.map(String).filter(Boolean) : [];
}

function makeSequentialValue(prefix, index) {
  return `${prefix}_${index + 1}`;
}

function ensureChoiceArray(items = []) {
  return (Array.isArray(items) ? items : []).map((item, i) => ({
    value: String(item?.value ?? makeSequentialValue("opt", i)).trim(),
    label: String(item?.label ?? ""),
  }));
}

function ensureMatrixArray(items = [], prefix = "item") {
  return (Array.isArray(items) ? items : []).map((item, i) => ({
    value: String(item?.value ?? makeSequentialValue(prefix, i)).trim(),
    label: String(item?.label ?? ""),
  }));
}

function normalizeQuestionForEditor(q = {}, index = 0) {
  const type = q?.type || SURVEY_QUESTION_TYPES.TEXT;

  return {
    id: q?.id || `q_${index + 1}`,
    type,
    text: String(q?.text ?? ""),
    description: String(q?.description ?? ""),
    required: type === SURVEY_QUESTION_TYPES.INFO ? false : !!q?.required,
    randomize_options: !!q?.randomize_options,
    choices: ensureChoiceArray(q?.choices),
    rows: ensureMatrixArray(q?.rows, "row"),
    columns: ensureMatrixArray(q?.columns, "col"),
    min: Number.isFinite(q?.min) ? q.min : 1,
    max: Number.isFinite(q?.max) ? q.max : 7,
    left_label: String(q?.left_label ?? ""),
    right_label: String(q?.right_label ?? ""),
    placeholder: String(q?.placeholder ?? ""),
    visible_if: q?.visible_if || null,
    meta: q?.meta || {},
  };
}

function getQuestionList(survey) {
  const questions = Array.isArray(survey?.pages?.[0]?.questions)
    ? survey.pages[0].questions
    : [];
  return questions.map((q, i) => normalizeQuestionForEditor(q, i));
}

function setQuestionList(survey, questions) {
  const safeSurvey = normalizeSurvey(survey || makeEmptySurvey());
  const firstPage = safeSurvey.pages?.[0] || {
    id: "page_1",
    title: "",
    description: "",
    questions: [],
  };

  return {
    ...safeSurvey,
    pages: [
      {
        ...firstPage,
        questions: (Array.isArray(questions) ? questions : []).map((q, i) =>
          normalizeQuestionForEditor(q, i)
        ),
      },
      ...(safeSurvey.pages || []).slice(1),
    ],
  };
}

function makeBackendQuestionFromType(type) {
  const base = makeQuestionByType(type);

  const question = {
    id: base?.id || `q_${Date.now()}`,
    type,
    text: String(base?.text ?? base?.label ?? ""),
    description: String(base?.description ?? ""),
    required: type === SURVEY_QUESTION_TYPES.INFO ? false : !!base?.required,
    randomize_options: !!base?.randomize_options,
    choices: [],
    rows: [],
    columns: [],
    min: Number.isFinite(base?.min) ? base.min : 1,
    max: Number.isFinite(base?.max) ? base.max : 7,
    left_label: String(base?.left_label ?? base?.min_label ?? ""),
    right_label: String(base?.right_label ?? base?.max_label ?? ""),
    placeholder: String(base?.placeholder ?? ""),
    visible_if: base?.visible_if || null,
    meta: base?.meta || {},
  };

  if (
    type === SURVEY_QUESTION_TYPES.SINGLE ||
    type === SURVEY_QUESTION_TYPES.MULTI ||
    type === SURVEY_QUESTION_TYPES.DROPDOWN
  ) {
    const source =
      Array.isArray(base?.choices) && base.choices.length
        ? base.choices
        : Array.isArray(base?.options)
          ? base.options.map((label, i) => ({
              value: makeSequentialValue("opt", i),
              label: String(label || ""),
            }))
          : [];

    question.choices = ensureChoiceArray(source);
  }

  if (
    type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
    type === SURVEY_QUESTION_TYPES.MATRIX_MULTI
  ) {
    const srcRows = Array.isArray(base?.rows) && base.rows.length ? base.rows : [];
    const srcCols = Array.isArray(base?.columns) && base.columns.length ? base.columns : [];

    question.rows = ensureMatrixArray(srcRows, "row");
    question.columns = ensureMatrixArray(srcCols, "col");
  }

  return normalizeQuestionForEditor(question);
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

function ItemTableEditor({
  title,
  items,
  onChange,
  prefix = "opt",
  addLabel = "Add row",
}) {
  const safeItems = Array.isArray(items) ? items : [];

  function updateItem(index, patch) {
    const next = safeItems.map((item, i) =>
      i === index ? { ...item, ...patch } : item
    );
    onChange(next);
  }

  function addItem() {
    onChange([
      ...safeItems,
      {
        value: makeSequentialValue(prefix, safeItems.length),
        label: "",
      },
    ]);
  }

  function removeItem(index) {
    onChange(safeItems.filter((_, i) => i !== index));
  }

  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: 10,
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>

      {safeItems.length === 0 && (
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          No items yet.
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {safeItems.map((item, i) => (
          <div
            key={`${prefix}_${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <TextInput
              value={item?.value ?? ""}
              onChange={(v) => updateItem(i, { value: v })}
              placeholder="Value"
            />
            <TextInput
              value={item?.label ?? ""}
              onChange={(v) => updateItem(i, { label: v })}
              placeholder="Label"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
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
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        style={{
          marginTop: 10,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        + {addLabel}
      </button>
    </div>
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
              value={q.text || ""}
              onChange={(v) => updateQuestion(index, { text: v })}
              placeholder="Question text"
            />
          </FieldBlock>
        </div>

        <div>
          <FieldBlock label="Type">
            <SelectInput
              value={q.type}
              onChange={(nextType) => {
                const next = makeBackendQuestionFromType(nextType);
                updateQuestion(index, {
                  ...next,
                  id: q.id,
                  text: q.text || next.text,
                  description: q.description || "",
                  required: nextType === SURVEY_QUESTION_TYPES.INFO ? false : !!q.required,
                  visible_if: q.visible_if || null,
                  meta: q.meta || {},
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
            type="button"
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
          value={q.description || ""}
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
          <ItemTableEditor
            title="Options"
            items={q.choices}
            onChange={(items) => updateQuestion(index, { choices: ensureChoiceArray(items) })}
            prefix="opt"
            addLabel="Add option"
          />

          <div style={{ marginTop: 12, marginBottom: 12 }}>
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
          <ItemTableEditor
            title="Rows / items"
            items={q.rows}
            onChange={(items) => updateQuestion(index, { rows: ensureMatrixArray(items, "row") })}
            prefix="row"
            addLabel="Add row"
          />
          <ItemTableEditor
            title="Columns / scale points"
            items={q.columns}
            onChange={(items) => updateQuestion(index, { columns: ensureMatrixArray(items, "col") })}
            prefix="col"
            addLabel="Add column"
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

          <FieldBlock label="Left label">
            <TextInput
              value={q.left_label ?? ""}
              onChange={(v) => updateQuestion(index, { left_label: v })}
              placeholder="e.g. Strongly disagree"
            />
          </FieldBlock>

          <FieldBlock label="Right label">
            <TextInput
              value={q.right_label ?? ""}
              onChange={(v) => updateQuestion(index, { right_label: v })}
              placeholder="e.g. Strongly agree"
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
  const [feeds, setFeeds] = useState(Array.isArray(propFeeds) ? propFeeds : []);
  const [selectedSurveyId, setSelectedSurveyId] = useState(null);
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);

  useEffect(() => {
    if (Array.isArray(propFeeds)) {
      setFeeds(propFeeds);
    }
  }, [propFeeds]);

  async function loadAll() {
    setLoading(true);
    try {
      const incomingFeeds = Array.isArray(propFeeds) ? propFeeds : [];

      const [surveyList, feedList] = await Promise.all([
        listSurveysFromBackend({ projectId, force: true }),
        incomingFeeds.length
          ? Promise.resolve(incomingFeeds)
          : listFeedsFromBackend({ projectId }),
      ]);

      const safeSurveyList = Array.isArray(surveyList) ? surveyList : [];
      const safeFeedList = Array.isArray(feedList) ? feedList : [];

      const enrichedSurveyList = await Promise.all(
        safeSurveyList.map(async (s) => {
          if (!s?.survey_id) return s;

          try {
            const [full, linkedFeedIds] = await Promise.all([
              loadSurveyFromBackend(s.survey_id, {
                projectId,
                force: true,
              }),
              getLinkedFeedIdsForSurveyFromBackend({
                surveyId: s.survey_id,
                projectId,
                allFeeds: safeFeedList,
              }),
            ]);

            const normalizedFull = normalizeSurvey(full || {});
            return {
              ...s,
              ...normalizedFull,
              linked_feed_ids: normalizeLinkedFeedIds(linkedFeedIds),
              linked_project_id: projectId,
              trigger: normalizedFull.trigger || "after_feed_submit",
            };
          } catch {
            return {
              ...s,
              linked_feed_ids: [],
              linked_project_id: projectId,
              trigger: "after_feed_submit",
            };
          }
        })
      );

      setSurveys(enrichedSurveyList);
      setFeeds(safeFeedList);
    } catch (e) {
      console.warn("Failed to load surveys:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectSurvey(id) {
    setSelectedSurveyId(id);
    if (!id) {
      setSurvey(null);
      return;
    }

    try {
      const [s, linkedFeedIds] = await Promise.all([
        loadSurveyFromBackend(id, { projectId, force: true }),
        getLinkedFeedIdsForSurveyFromBackend({
          surveyId: id,
          projectId,
          allFeeds: feeds,
        }),
      ]);

      const normalized = normalizeSurvey(s || {});

      setSurvey({
        ...normalized,
        linked_feed_ids: normalizeLinkedFeedIds(linkedFeedIds),
        linked_project_id: projectId,
        trigger: normalized.trigger || "after_feed_submit",
      });
    } catch (e) {
      console.warn("Failed to load survey:", e);
      setSurvey(null);
    }
  }

  function handleCreateSurvey() {
    const s = makeEmptySurvey({
      linked_project_id: projectId,
      linked_feed_ids: [],
      trigger: "after_feed_submit",
    });
    setSurvey(
      normalizeSurvey({
        ...s,
        trigger: s.trigger || "after_feed_submit",
      })
    );
    setSelectedSurveyId(null);
  }

  async function handleSaveSurvey() {
    if (!survey) return;

    setSavingSurvey(true);
    try {
      const normalized = {
        ...survey,
        linked_project_id: projectId,
        linked_feed_ids: normalizeLinkedFeedIds(survey.linked_feed_ids),
        trigger: survey.trigger || "after_feed_submit",
      };

      const cleanedQuestions = getQuestionList(normalized).map((q, i) => {
        const cleanQ = normalizeQuestionForEditor(q, i);

        return {
          id: cleanQ.id,
          type: cleanQ.type,
          text: cleanQ.text,
          description: cleanQ.description,
          required: cleanQ.type === SURVEY_QUESTION_TYPES.INFO ? false : !!cleanQ.required,
          choices:
            cleanQ.type === SURVEY_QUESTION_TYPES.SINGLE ||
            cleanQ.type === SURVEY_QUESTION_TYPES.MULTI ||
            cleanQ.type === SURVEY_QUESTION_TYPES.DROPDOWN
              ? ensureChoiceArray(cleanQ.choices)
              : [],
          rows:
            cleanQ.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
            cleanQ.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI
              ? ensureMatrixArray(cleanQ.rows, "row")
              : [],
          columns:
            cleanQ.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
            cleanQ.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI
              ? ensureMatrixArray(cleanQ.columns, "col")
              : [],
          left_label: cleanQ.left_label || "",
          right_label: cleanQ.right_label || "",
          min: Number.isFinite(cleanQ.min) ? cleanQ.min : 1,
          max: Number.isFinite(cleanQ.max) ? cleanQ.max : 7,
          placeholder: cleanQ.placeholder || "",
          visible_if: cleanQ.visible_if || null,
          meta: cleanQ.meta || {},
          randomize_options: !!cleanQ.randomize_options,
        };
      });

      const payload = {
        ...normalized,
        pages: [
          {
            ...(normalized.pages?.[0] || { id: "page_1", title: "", description: "" }),
            questions: cleanedQuestions,
          },
          ...(normalized.pages || []).slice(1),
        ],
      };

      const res = await saveSurveyToBackend(payload, { projectId });

      if (res?.ok) {
        const savedSurveyId = res.survey_id || payload.survey_id;

        const [fresh, linkedFeedIds] = await Promise.all([
          loadSurveyFromBackend(savedSurveyId, {
            projectId,
            force: true,
          }),
          getLinkedFeedIdsForSurveyFromBackend({
            surveyId: savedSurveyId,
            projectId,
            allFeeds: feeds,
          }),
        ]);

        const normalizedFresh = normalizeSurvey({
          ...(fresh || {}),
          linked_feed_ids: normalizeLinkedFeedIds(linkedFeedIds),
          linked_project_id: projectId,
          trigger: fresh?.trigger || normalized.trigger || "after_feed_submit",
        });

        setSelectedSurveyId(savedSurveyId);
        setSurvey(normalizedFresh);

        await loadAll();
        alert("Survey saved");
      } else {
        alert(res?.err || "Failed to save survey");
      }
    } catch (e) {
      console.warn("Failed to save survey:", e);
      alert("Failed to save survey");
    } finally {
      setSavingSurvey(false);
    }
  }

  async function handleDeleteSurvey() {
    if (!survey?.survey_id) return;
    if (!window.confirm("Delete this survey?")) return;

    try {
      const res = await deleteSurveyOnBackend(survey.survey_id, { projectId });
      if (res?.ok) {
        setSurvey(null);
        setSelectedSurveyId(null);
        await loadAll();
      } else {
        alert(res?.err || "Failed to delete survey");
      }
    } catch (e) {
      console.warn("Failed to delete survey:", e);
      alert("Failed to delete survey");
    }
  }

  function addQuestion(type) {
    setSurvey((prev) => {
      const currentQuestions = getQuestionList(prev);
      return setQuestionList(prev, [...currentQuestions, makeBackendQuestionFromType(type)]);
    });
  }

  function updateQuestion(index, patch) {
    setSurvey((prev) => {
      const currentQuestions = [...getQuestionList(prev)];
      currentQuestions[index] = normalizeQuestionForEditor(
        { ...currentQuestions[index], ...patch },
        index
      );
      return setQuestionList(prev, currentQuestions);
    });
  }

  function removeQuestion(index) {
    setSurvey((prev) => {
      const currentQuestions = [...getQuestionList(prev)];
      currentQuestions.splice(index, 1);
      return setQuestionList(prev, currentQuestions);
    });
  }

  function toggleFeed(nextFeedId) {
    setSurvey((prev) => {
      const set = new Set(normalizeLinkedFeedIds(prev?.linked_feed_ids));
      if (set.has(nextFeedId)) set.delete(nextFeedId);
      else set.add(nextFeedId);

      return {
        ...prev,
        linked_feed_ids: Array.from(set),
      };
    });
  }

  async function handleSaveFeedLinks() {
    if (!survey?.survey_id) {
      alert("Save survey first before linking feeds.");
      return;
    }

    setSavingLinks(true);
    try {
      const res = await linkSurveyToFeedsOnBackend({
        surveyId: survey.survey_id,
        feedIds: normalizeLinkedFeedIds(survey.linked_feed_ids),
        projectId,
        allFeeds: feeds,
        trigger: survey.trigger || "after_feed_submit",
      });

      if (res?.ok) {
        const linkedIds = await getLinkedFeedIdsForSurveyFromBackend({
          surveyId: survey.survey_id,
          projectId,
          allFeeds: feeds,
        });

        setSurvey((prev) => ({
          ...prev,
          linked_feed_ids: normalizeLinkedFeedIds(linkedIds),
        }));

        await loadAll();
        alert("Feeds linked");
      } else {
        alert(res?.err || "Failed to link feeds");
      }
    } catch (e) {
      console.warn("Failed to link feeds:", e);
      alert("Failed to link feeds");
    } finally {
      setSavingLinks(false);
    }
  }

  const linkedFeedCount = useMemo(
    () => normalizeLinkedFeedIds(survey?.linked_feed_ids).length,
    [survey]
  );

  const currentQuestions = useMemo(
    () => getQuestionList(survey),
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
          type="button"
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
            <button
              key={s.survey_id}
              type="button"
              onClick={() => handleSelectSurvey(s.survey_id)}
              style={{
                width: "100%",
                textAlign: "left",
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
                {surveyQuestionCount(s || {})} questions
              </div>
            </button>
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

            {currentQuestions.map((q, i) => (
              <QuestionCard
                key={q.id}
                q={q}
                index={i}
                updateQuestion={updateQuestion}
                removeQuestion={removeQuestion}
              />
            ))}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.TEXT)}>+ Text</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.TEXTAREA)}>+ Long text</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.SINGLE)}>+ Single</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.MULTI)}>+ Multi</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.DROPDOWN)}>+ Dropdown</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.MATRIX_SINGLE)}>+ Matrix single</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.MATRIX_MULTI)}>+ Matrix multi</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.BIPOLAR)}>+ Bipolar</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.SLIDER)}>+ Slider</button>
              <button type="button" onClick={() => addQuestion(SURVEY_QUESTION_TYPES.INFO)}>+ Info</button>
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
                      checked={normalizeLinkedFeedIds(survey.linked_feed_ids).includes(f.feed_id)}
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

            <button
              type="button"
              onClick={handleSaveFeedLinks}
              disabled={savingLinks}
              style={{ marginBottom: 20 }}
            >
              {savingLinks ? "Saving Feed Links..." : "Save Feed Links"}
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleSaveSurvey}
                disabled={savingSurvey}
              >
                {savingSurvey ? "Saving Survey..." : "Save Survey"}
              </button>

              <button type="button" onClick={handleDeleteSurvey}>
                Delete Survey
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}