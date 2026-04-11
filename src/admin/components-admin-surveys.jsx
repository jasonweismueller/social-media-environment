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

const EDITOR_PAGE_BREAK_TYPE = "page_break";

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
  [EDITOR_PAGE_BREAK_TYPE]: "Page break",
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

function reorderArray(list = [], fromIndex, toIndex) {
  const arr = [...list];
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= arr.length ||
    toIndex >= arr.length
  ) {
    return arr;
  }

  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  return arr;
}

function normalizeQuestionForEditor(q = {}, index = 0) {
  const type = q?.type || SURVEY_QUESTION_TYPES.TEXT;

  if (type === EDITOR_PAGE_BREAK_TYPE) {
    return {
      id: q?.id || `page_break_${index + 1}`,
      type: EDITOR_PAGE_BREAK_TYPE,
      text: "",
      description: "",
      required: false,
      randomize_options: false,
      choices: [],
      rows: [],
      columns: [],
      min: 1,
      max: 7,
      left_label: "",
      right_label: "",
      placeholder: "",
      visible_if: null,
      meta: q?.meta || {},
    };
  }

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

function flattenSurveyPagesForEditor(survey) {
  const safeSurvey = normalizeSurvey(survey || makeEmptySurvey());
  const pages = Array.isArray(safeSurvey.pages) ? safeSurvey.pages : [];
  const flat = [];

  if (pages.length === 0) return [];

  pages.forEach((page, pageIndex) => {
    const questions = Array.isArray(page?.questions) ? page.questions : [];
    questions.forEach((q) => {
      flat.push(normalizeQuestionForEditor(q, flat.length));
    });

    if (pageIndex < pages.length - 1) {
      flat.push(
        normalizeQuestionForEditor(
          {
            id: `page_break_${pageIndex + 1}`,
            type: EDITOR_PAGE_BREAK_TYPE,
          },
          flat.length
        )
      );
    }
  });

  return flat;
}

function buildSurveyPagesFromFlatQuestions(survey, items) {
  const safeSurvey = normalizeSurvey(survey || makeEmptySurvey());
  const flatItems = Array.isArray(items) ? items : [];

  const existingPages = Array.isArray(safeSurvey.pages) ? safeSurvey.pages : [];
  const splitPages = [];
  let currentQuestions = [];

  flatItems.forEach((item) => {
    if (item?.type === EDITOR_PAGE_BREAK_TYPE) {
      splitPages.push(currentQuestions);
      currentQuestions = [];
    } else {
      currentQuestions.push(normalizeQuestionForEditor(item, currentQuestions.length));
    }
  });
  splitPages.push(currentQuestions);

  const pages = splitPages.map((questions, pageIndex) => {
    const existingPage = existingPages[pageIndex] || {};
    return {
      id: existingPage.id || `page_${pageIndex + 1}`,
      title: String(existingPage.title ?? ""),
      description: String(existingPage.description ?? ""),
      questions: questions.map((q, i) => normalizeQuestionForEditor(q, i)),
    };
  });

  return {
    ...safeSurvey,
    pages: pages.length
      ? pages
      : [
          {
            id: "page_1",
            title: "",
            description: "",
            questions: [],
          },
        ],
  };
}

function getQuestionList(survey) {
  return flattenSurveyPagesForEditor(survey);
}

function setQuestionList(survey, questions) {
  return buildSurveyPagesFromFlatQuestions(survey, questions);
}

function makePageBreakForEditor(index = 0) {
  return normalizeQuestionForEditor(
    {
      id: `page_break_${Date.now()}_${index}`,
      type: EDITOR_PAGE_BREAK_TYPE,
    },
    index
  );
}

function makeBackendQuestionFromType(type) {
  if (type === EDITOR_PAGE_BREAK_TYPE) {
    return makePageBreakForEditor();
  }

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

function buildSavedQuestion(q, index) {
  const cleanQ = normalizeQuestionForEditor(q, index);

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
}

/* =========================
   Small icon/button helpers
   ========================= */

function TrashIcon({ size = 16 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function IconOnlyButton({
  onClick,
  title,
  danger = false,
  disabled = false,
  style = {},
  size = 16,
  children = null,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        width: 36,
        height: 36,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: `1px solid ${danger ? "#dc2626" : "#d1d5db"}`,
        background: "#fff",
        color: danger ? "#dc2626" : disabled ? "#9ca3af" : "#111827",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        lineHeight: 1,
        ...style,
      }}
    >
      {children || <TrashIcon size={size} />}
    </button>
  );
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

function SelectInput({ value, onChange, children, style, disabled = false }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
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

  const singularTitle =
    String(title || "item")
      .replace(/ \/ .*/g, "")
      .replace(/s$/i, "")
      .toLowerCase() || "item";

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
            <IconOnlyButton
              onClick={() => removeItem(i)}
              title={`Delete ${singularTitle}`}
              danger
            />
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

function QuestionCard({
  q,
  index,
  totalQuestions,
  updateQuestion,
  removeQuestion,
  moveQuestion,
  draggingId,
  dragOverId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const type = q?.type;
  const isPageBreak = type === EDITOR_PAGE_BREAK_TYPE;

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

  const isDragging = draggingId === q.id;
  const isDragOver = dragOverId === q.id;

  if (isPageBreak) {
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, q.id)}
        onDragOver={(e) => onDragOver(e, q.id)}
        onDrop={(e) => onDrop(e, q.id)}
        onDragEnd={onDragEnd}
        style={{
          border: isDragOver ? "2px solid #6366f1" : "1px dashed #9ca3af",
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
          background: isDragging ? "#f8fafc" : "#f9fafb",
          opacity: isDragging ? 0.65 : 1,
          boxShadow: isDragOver ? "0 0 0 3px rgba(99,102,241,0.12)" : "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              title="Drag to reorder"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 40,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                background: "#fff",
                cursor: "grab",
                fontSize: 18,
                color: "#6b7280",
                userSelect: "none",
              }}
            >
              ⋮⋮
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "#374151" }}>Page break</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Questions after this will appear on the next page.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => moveQuestion(index, index - 1)}
              disabled={index === 0}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: index === 0 ? "#9ca3af" : "#111827",
                cursor: index === 0 ? "not-allowed" : "pointer",
              }}
            >
              ↑
            </button>

            <button
              type="button"
              onClick={() => moveQuestion(index, index + 1)}
              disabled={index === totalQuestions - 1}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: index === totalQuestions - 1 ? "#9ca3af" : "#111827",
                cursor: index === totalQuestions - 1 ? "not-allowed" : "pointer",
              }}
            >
              ↓
            </button>

            <IconOnlyButton
              onClick={() => removeQuestion(index)}
              title="Delete page break"
              danger
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, q.id)}
      onDragOver={(e) => onDragOver(e, q.id)}
      onDrop={(e) => onDrop(e, q.id)}
      onDragEnd={onDragEnd}
      style={{
        border: isDragOver ? "2px solid #6366f1" : "1px solid #d1d5db",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        background: isDragging ? "#f8fafc" : "#fff",
        opacity: isDragging ? 0.65 : 1,
        boxShadow: isDragOver ? "0 0 0 3px rgba(99,102,241,0.12)" : "none",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr 220px auto",
          gap: 10,
          alignItems: "start",
          marginBottom: 10,
        }}
      >
        <div
          title="Drag to reorder"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 40,
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#f9fafb",
            cursor: "grab",
            fontSize: 18,
            color: "#6b7280",
            userSelect: "none",
          }}
        >
          ⋮⋮
        </div>

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
                if (nextType === EDITOR_PAGE_BREAK_TYPE) {
                  updateQuestion(index, makePageBreakForEditor(index));
                  return;
                }

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
              {[
                ...Object.values(SURVEY_QUESTION_TYPES),
                EDITOR_PAGE_BREAK_TYPE,
              ].map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t] || t}
                </option>
              ))}
            </SelectInput>
          </FieldBlock>
        </div>

        <div style={{ paddingTop: 23, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => moveQuestion(index, index - 1)}
            disabled={index === 0}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: index === 0 ? "#9ca3af" : "#111827",
              cursor: index === 0 ? "not-allowed" : "pointer",
            }}
          >
            ↑
          </button>

          <button
            type="button"
            onClick={() => moveQuestion(index, index + 1)}
            disabled={index === totalQuestions - 1}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: index === totalQuestions - 1 ? "#9ca3af" : "#111827",
              cursor: index === totalQuestions - 1 ? "not-allowed" : "pointer",
            }}
          >
            ↓
          </button>

          <IconOnlyButton
            onClick={() => removeQuestion(index)}
            title="Delete question"
            danger
          />
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

  const [draggingQuestionId, setDraggingQuestionId] = useState(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState(null);

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

      const flatQuestions = getQuestionList(normalized);
      const rebuiltSurvey = buildSurveyPagesFromFlatQuestions(normalized, flatQuestions);

      const payload = {
        ...normalized,
        pages: (rebuiltSurvey.pages || []).map((page) => ({
          ...(page || { id: "page_1", title: "", description: "" }),
          questions: (page.questions || []).map((q, i) => buildSavedQuestion(q, i)),
        })),
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

  function addPageBreak() {
    setSurvey((prev) => {
      const currentQuestions = getQuestionList(prev);
      return setQuestionList(
        prev,
        [...currentQuestions, makePageBreakForEditor(currentQuestions.length)]
      );
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

  function moveQuestion(fromIndex, toIndex) {
    setSurvey((prev) => {
      const currentQuestions = getQuestionList(prev);
      const reordered = reorderArray(currentQuestions, fromIndex, toIndex);
      return setQuestionList(prev, reordered);
    });
  }

  function handleQuestionDragStart(e, questionId) {
    setDraggingQuestionId(questionId);
    setDragOverQuestionId(questionId);
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(questionId));
    } catch {}
  }

  function handleQuestionDragOver(e, questionId) {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch {}
    if (dragOverQuestionId !== questionId) {
      setDragOverQuestionId(questionId);
    }
  }

  function handleQuestionDrop(e, targetQuestionId) {
    e.preventDefault();

    if (!survey || !draggingQuestionId || draggingQuestionId === targetQuestionId) {
      setDraggingQuestionId(null);
      setDragOverQuestionId(null);
      return;
    }

    const questions = getQuestionList(survey);
    const fromIndex = questions.findIndex((q) => q.id === draggingQuestionId);
    const toIndex = questions.findIndex((q) => q.id === targetQuestionId);

    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
      moveQuestion(fromIndex, toIndex);
    }

    setDraggingQuestionId(null);
    setDragOverQuestionId(null);
  }

  function handleQuestionDragEnd() {
    setDraggingQuestionId(null);
    setDragOverQuestionId(null);
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

  const pageCount = useMemo(() => {
    if (!survey) return 0;
    const pages = buildSurveyPagesFromFlatQuestions(survey, currentQuestions).pages || [];
    return pages.length;
  }, [survey, currentQuestions]);

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
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {linkedFeedCount} linked feed{linkedFeedCount === 1 ? "" : "s"} · {pageCount} page{pageCount === 1 ? "" : "s"}
                </div>

                {!!survey?.survey_id && (
                  <IconOnlyButton
                    onClick={handleDeleteSurvey}
                    title="Delete survey"
                    danger
                    size={17}
                  />
                )}
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

            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              Drag questions by the dotted handle to reorder them, use ↑ / ↓, or insert page breaks to split the survey across pages.
            </div>

            {currentQuestions.map((q, i) => (
              <QuestionCard
                key={q.id}
                q={q}
                index={i}
                totalQuestions={currentQuestions.length}
                updateQuestion={updateQuestion}
                removeQuestion={removeQuestion}
                moveQuestion={moveQuestion}
                draggingId={draggingQuestionId}
                dragOverId={dragOverQuestionId}
                onDragStart={handleQuestionDragStart}
                onDragOver={handleQuestionDragOver}
                onDrop={handleQuestionDrop}
                onDragEnd={handleQuestionDragEnd}
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
              <button type="button" onClick={addPageBreak}>+ Page break</button>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}