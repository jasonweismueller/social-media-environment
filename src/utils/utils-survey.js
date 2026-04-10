// utils-survey.js

import { uid } from "./utils-core";

/* =========================
   Survey schema
   ========================== */

export const SURVEY_QUESTION_TYPES = {
  TEXT: "text",
  TEXTAREA: "textarea",
  SINGLE: "single_choice",
  MULTI: "multi_choice",
  DROPDOWN: "dropdown",
  MATRIX_SINGLE: "matrix_single",
  MATRIX_MULTI: "matrix_multi",
  BIPOLAR: "bipolar",
  SLIDER: "slider",
  INFO: "info",
};

export function isValidSurveyQuestionType(type) {
  return Object.values(SURVEY_QUESTION_TYPES).includes(type);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanStringArray(arr = []) {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

function normalizeChoiceArray(rawChoices = []) {
  if (!Array.isArray(rawChoices)) return [];
  return rawChoices
    .map((c) => {
      if (typeof c === "string") return c.trim();
      if (c && typeof c === "object") {
        return String(c.label ?? c.value ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeMatrixArray(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object") {
        return String(x.label ?? x.value ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

/* =========================
   Question mapping
   ========================= */

export function makeQuestion(type = SURVEY_QUESTION_TYPES.TEXT, overrides = {}) {
  const safeType = isValidSurveyQuestionType(type)
    ? type
    : SURVEY_QUESTION_TYPES.TEXT;

  const text = String(overrides.text ?? overrides.label ?? "Untitled question");

  return {
    id: overrides.id || `q_${uid()}`,
    type: safeType,
    text,
    label: text,
    description: overrides.description || "",
    required: safeType === SURVEY_QUESTION_TYPES.INFO ? false : !!overrides.required,
    randomize_options: !!overrides.randomize_options,
    options: cleanStringArray(overrides.options),
    rows: cleanStringArray(overrides.rows),
    columns: cleanStringArray(overrides.columns),
    min: Number.isFinite(overrides.min) ? overrides.min : 1,
    max: Number.isFinite(overrides.max) ? overrides.max : 7,
    min_label: overrides.min_label || "",
    max_label: overrides.max_label || "",
    left_label: overrides.left_label ?? overrides.min_label ?? "",
    right_label: overrides.right_label ?? overrides.max_label ?? "",
    visible_if: overrides.visible_if || null,
  };
}

export function normalizeQuestion(raw = {}) {
  const type = isValidSurveyQuestionType(raw.type)
    ? raw.type
    : SURVEY_QUESTION_TYPES.TEXT;

  const text = String(raw.text ?? raw.label ?? "Untitled question");

  return {
    id: raw.id || `q_${uid()}`,
    type,
    text,
    label: text,
    description: String(raw.description || ""),
    required: type === SURVEY_QUESTION_TYPES.INFO ? false : !!raw.required,
    randomize_options: !!raw.randomize_options,

    // preserve backend/editor structured arrays
    choices: Array.isArray(raw.choices)
      ? raw.choices.map((c, i) => ({
          value: String(c?.value ?? `opt_${i + 1}`),
          label: String(c?.label ?? ""),
        }))
      : [],

    rows: Array.isArray(raw.rows)
      ? raw.rows.map((r, i) => ({
          value: String(r?.value ?? `row_${i + 1}`),
          label: String(r?.label ?? ""),
        }))
      : [],

    columns: Array.isArray(raw.columns)
      ? raw.columns.map((c, i) => ({
          value: String(c?.value ?? `col_${i + 1}`),
          label: String(c?.label ?? ""),
        }))
      : [],

    // keep legacy string arrays too if needed elsewhere
    options: cleanStringArray(
      Array.isArray(raw.options) && raw.options.length
        ? raw.options
        : normalizeChoiceArray(raw.choices)
    ),

    min: Number.isFinite(raw.min) ? raw.min : 1,
    max: Number.isFinite(raw.max) ? raw.max : 7,
    min_label: String(raw.min_label ?? raw.left_label ?? ""),
    max_label: String(raw.max_label ?? raw.right_label ?? ""),
    left_label: String(raw.left_label ?? raw.min_label ?? ""),
    right_label: String(raw.right_label ?? raw.max_label ?? ""),
    visible_if: raw.visible_if || null,
    placeholder: String(raw.placeholder || ""),
    meta: raw.meta || {},
  };
}
export function frontendQuestionToBackend(question = {}) {
  const q = normalizeQuestion(question);

  const base = {
    id: q.id,
    type: q.type,
    text: q.text,
    description: q.description,
    required: !!q.required,
    meta: q.meta || {},
  };

  switch (q.type) {
    case SURVEY_QUESTION_TYPES.SINGLE:
    case SURVEY_QUESTION_TYPES.MULTI:
    case SURVEY_QUESTION_TYPES.DROPDOWN:
      return {
        ...base,
        choices: Array.isArray(q.choices) && q.choices.length
          ? q.choices.map((choice, i) => ({
              value: String(choice?.value ?? `opt_${i + 1}`),
              label: String(choice?.label ?? ""),
            }))
          : q.options.map((opt, i) => ({
              value: `opt_${i + 1}`,
              label: opt,
            })),
        randomize_options: !!q.randomize_options,
      };

    case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
    case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
      return {
        ...base,
        rows: Array.isArray(q.rows)
          ? q.rows.map((row, i) => ({
              value: String(row?.value ?? `row_${i + 1}`),
              label: String(row?.label ?? ""),
            }))
          : [],
        columns: Array.isArray(q.columns)
          ? q.columns.map((col, i) => ({
              value: String(col?.value ?? `col_${i + 1}`),
              label: String(col?.label ?? ""),
            }))
          : [],
      };

    case SURVEY_QUESTION_TYPES.BIPOLAR:
    case SURVEY_QUESTION_TYPES.SLIDER:
      return {
        ...base,
        min: q.min,
        max: q.max,
        left_label: q.left_label ?? q.min_label ?? "",
        right_label: q.right_label ?? q.max_label ?? "",
      };

    case SURVEY_QUESTION_TYPES.TEXT:
    case SURVEY_QUESTION_TYPES.TEXTAREA:
    case SURVEY_QUESTION_TYPES.INFO:
    default:
      return base;
  }
}

/* =========================
   Page mapping
   ========================= */

export function makePage(overrides = {}) {
  const safeOverrides = asObject(overrides);

  return {
    id: safeOverrides.id || `page_${uid()}`,
    title: String(safeOverrides.title || ""),
    description: String(safeOverrides.description || ""),
    questions: Array.isArray(safeOverrides.questions)
      ? safeOverrides.questions.map(normalizeQuestion).filter(Boolean)
      : [],
  };
}

export function normalizePage(raw = {}) {
  const safeRaw = asObject(raw);

  return {
    id: safeRaw.id || `page_${uid()}`,
    title: String(safeRaw.title || ""),
    description: String(safeRaw.description || ""),
    questions: Array.isArray(safeRaw.questions)
      ? safeRaw.questions.map(normalizeQuestion).filter(Boolean)
      : [],
  };
}

function coerceQuestionsIntoPages(raw = {}) {
  const safeRaw = asObject(raw);

  if (Array.isArray(safeRaw.pages) && safeRaw.pages.length > 0) {
    return safeRaw.pages.map(normalizePage).filter(Boolean);
  }

  const legacyQuestions = Array.isArray(safeRaw.questions)
    ? safeRaw.questions.map(normalizeQuestion).filter(Boolean)
    : [];

  return [
    makePage({
      id: "page_1",
      title: "",
      description: "",
      questions: legacyQuestions,
    }),
  ];
}

export function frontendPagesToBackend(pages = []) {
  const safePages = Array.isArray(pages) ? pages : [];
  return safePages.map((page, pIdx) => {
    const pg = normalizePage(page);
    return {
      id: pg.id || `page_${pIdx + 1}`,
      title: pg.title || "",
      description: pg.description || "",
      questions: (pg.questions || []).map(frontendQuestionToBackend),
    };
  });
}

/* =========================
   Survey mapping
   ========================= */

export function makeEmptySurvey(overrides = {}) {
  const safeOverrides = asObject(overrides);
  const pages = coerceQuestionsIntoPages(safeOverrides);

  return {
    survey_id: safeOverrides.survey_id || `survey_${uid()}`,
    name: safeOverrides.name || "Untitled Survey",
    description: safeOverrides.description || "",
    pages,
    version: Number.isFinite(safeOverrides.version) ? safeOverrides.version : 1,
    status: safeOverrides.status || "draft",
    created_at: safeOverrides.created_at || null,
    updated_at: safeOverrides.updated_at || null,

    linked_feed_ids: Array.isArray(safeOverrides.linked_feed_ids)
      ? safeOverrides.linked_feed_ids.map(String)
      : [],
    linked_project_id: safeOverrides.linked_project_id || "",
    trigger: safeOverrides.trigger || "after_feed_submit",
  };
}

export function normalizeSurvey(raw = {}) {
  const safeRaw = asObject(raw);
  const pages = coerceQuestionsIntoPages(safeRaw);

  return {
    survey_id: safeRaw.survey_id || `survey_${uid()}`,
    name: String(safeRaw.name || "Untitled Survey"),
    description: String(safeRaw.description || ""),
    pages,
    version: Number.isFinite(safeRaw.version) ? safeRaw.version : 1,
    status: String(safeRaw.status || "draft"),
    created_at: safeRaw.created_at || null,
    updated_at: safeRaw.updated_at || null,

    linked_feed_ids: Array.isArray(safeRaw.linked_feed_ids)
      ? safeRaw.linked_feed_ids.map(String)
      : [],
    linked_project_id: safeRaw.linked_project_id || "",
    trigger: safeRaw.trigger || "after_feed_submit",
  };
}

export function frontendSurveyToBackend(survey = {}) {
  const s = normalizeSurvey(survey);

  return {
    survey_id: s.survey_id,
    name: s.name,
    description: s.description,
    version: s.version,
    status: s.status,
    pages: frontendPagesToBackend(s.pages),
  };
}

export function surveyQuestions(survey) {
  const normalized = normalizeSurvey(survey);
  return normalized.pages?.[0]?.questions || [];
}

export function setSurveyQuestions(survey, questions = []) {
  const normalized = normalizeSurvey(survey);
  const firstPage = normalizePage(normalized.pages?.[0] || { id: "page_1" });

  const nextFirstPage = {
    ...firstPage,
    questions: (Array.isArray(questions) ? questions : [])
      .map(normalizeQuestion)
      .filter(Boolean),
  };

  return {
    ...normalized,
    pages: [nextFirstPage, ...(normalized.pages || []).slice(1)],
  };
}

export function surveyQuestionCount(survey) {
  return surveyQuestions(survey).length;
}

/* =========================
   Defaults by type
   ========================= */

export function makeQuestionByType(type) {
  switch (type) {
    case SURVEY_QUESTION_TYPES.SINGLE:
      return makeQuestion(type, {
        label: "Select one option",
        options: ["Option 1", "Option 2", "Option 3"],
      });

    case SURVEY_QUESTION_TYPES.MULTI:
      return makeQuestion(type, {
        label: "Select all that apply",
        options: ["Option 1", "Option 2", "Option 3"],
      });

    case SURVEY_QUESTION_TYPES.DROPDOWN:
      return makeQuestion(type, {
        label: "Choose an option",
        options: ["Option 1", "Option 2", "Option 3"],
      });

    case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
      return makeQuestion(type, {
        label: "Please indicate your agreement",
        rows: ["Item 1", "Item 2", "Item 3"],
        columns: [
          "Strongly disagree",
          "Disagree",
          "Neutral",
          "Agree",
          "Strongly agree",
        ],
      });

    case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
      return makeQuestion(type, {
        label: "Select all that apply for each row",
        rows: ["Item 1", "Item 2"],
        columns: ["Column 1", "Column 2", "Column 3"],
      });

    case SURVEY_QUESTION_TYPES.BIPOLAR:
      return makeQuestion(type, {
        label: "How would you rate this?",
        min: 1,
        max: 7,
        min_label: "Negative",
        max_label: "Positive",
      });

    case SURVEY_QUESTION_TYPES.SLIDER:
      return makeQuestion(type, {
        label: "Move the slider",
        min: 0,
        max: 100,
        min_label: "Low",
        max_label: "High",
      });

    case SURVEY_QUESTION_TYPES.TEXTAREA:
      return makeQuestion(type, {
        label: "Please elaborate",
      });

    case SURVEY_QUESTION_TYPES.INFO:
      return makeQuestion(type, {
        label: "Information text",
        required: false,
      });

    case SURVEY_QUESTION_TYPES.TEXT:
    default:
      return makeQuestion(SURVEY_QUESTION_TYPES.TEXT, {
        label: "Short answer",
      });
  }
}

/* =========================
   Visibility
   ========================= */

export function isQuestionVisible(question, responses = {}) {
  const rule = question?.visible_if;
  if (!rule || !rule.question_id) return true;

  const sourceValue = responses?.[rule.question_id];

  if (Object.prototype.hasOwnProperty.call(rule, "equals")) {
    return sourceValue === rule.equals;
  }

  if (Object.prototype.hasOwnProperty.call(rule, "not_equals")) {
    return sourceValue !== rule.not_equals;
  }

  if (Object.prototype.hasOwnProperty.call(rule, "includes")) {
    return Array.isArray(sourceValue) && sourceValue.includes(rule.includes);
  }

  return true;
}

/* =========================
   Response shaping
   ========================= */

export function makeEmptySurveyResponses(survey) {
  const normalized = normalizeSurvey(survey);
  const out = {};

  for (const page of normalized.pages || []) {
    for (const q of page.questions || []) {
      out[q.id] = emptyValueForQuestion(q);
    }
  }

  return out;
}

export function emptyValueForQuestion(q) {
  switch (q?.type) {
    case SURVEY_QUESTION_TYPES.MULTI:
      return [];

    case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
    case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
      return {};

    case SURVEY_QUESTION_TYPES.INFO:
      return null;

    default:
      return "";
  }
}

/* =========================
   Validation
   ========================= */

function isMatrixSingleAnswered(q, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rows = Array.isArray(q?.rows) ? q.rows : [];
  if (!rows.length) return false;

  return rows.every((row, i) => {
    const key = String(row?.value ?? `row_${i + 1}`);
    return String(value[key] ?? "").trim() !== "";
  });
}

function isMatrixMultiAnswered(q, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rows = Array.isArray(q?.rows) ? q.rows : [];
  if (!rows.length) return false;

  return rows.every((row, i) => {
    const key = String(row?.value ?? `row_${i + 1}`);
    return Array.isArray(value[key]) && value[key].length > 0;
  });
}

export function isQuestionAnswered(q, value) {
  if (!q || q.type === SURVEY_QUESTION_TYPES.INFO) return true;
  if (!q.required) return true;

  switch (q.type) {
    case SURVEY_QUESTION_TYPES.MULTI:
      return Array.isArray(value) && value.length > 0;

    case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
      return isMatrixSingleAnswered(q, value);

    case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
      return isMatrixMultiAnswered(q, value);

    case SURVEY_QUESTION_TYPES.TEXT:
    case SURVEY_QUESTION_TYPES.TEXTAREA:
    case SURVEY_QUESTION_TYPES.SINGLE:
    case SURVEY_QUESTION_TYPES.DROPDOWN:
    case SURVEY_QUESTION_TYPES.BIPOLAR:
    case SURVEY_QUESTION_TYPES.SLIDER:
    default:
      return String(value ?? "").trim() !== "";
  }
}

export function validateSurveyResponses(survey, responses) {
  const normalized = normalizeSurvey(survey);
  const errors = {};

  for (const page of normalized.pages || []) {
    for (const q of page.questions || []) {
      if (!isQuestionVisible(q, responses)) continue;

      const value = responses?.[q.id];
      if (!isQuestionAnswered(q, value)) {
        errors[q.id] = "This question is required.";
      }
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
}

/* =========================
   Option randomization
   ========================= */

function seededShuffle(items = [], seed = "") {
  const arr = [...items];
  let h = 2166136261;

  for (let i = 0; i < String(seed).length; i++) {
    h ^= String(seed).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  function rand() {
    h += 0x6D2B79F5;
    let r = Math.imul(h ^ (h >>> 15), 1 | h);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

export function getRenderedQuestion(question, { participantSeed = "" } = {}) {
  const q = normalizeQuestion(question);

  if (q.randomize_options) {
    if (Array.isArray(q.choices) && q.choices.length > 1) {
      q.choices = seededShuffle(q.choices, `${participantSeed}::${q.id}`);
    }

    if (Array.isArray(q.options) && q.options.length > 1) {
      q.options = seededShuffle(q.options, `${participantSeed}::${q.id}`);
    }
  }

  return q;
}

/* =========================
   Flatten responses
   ========================= */

export function flattenSurveyResponses(survey, responses) {
  const normalized = normalizeSurvey(survey);
  const row = {};

  for (const page of normalized.pages || []) {
    for (const q of page.questions || []) {
      const value = responses?.[q.id];

      switch (q.type) {
        case SURVEY_QUESTION_TYPES.MULTI:
          row[q.id] = Array.isArray(value) ? value.join(" | ") : "";
          break;

        case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
        case SURVEY_QUESTION_TYPES.MATRIX_MULTI: {
          const obj = value && typeof value === "object" ? value : {};
          for (const [k, v] of Object.entries(obj)) {
            row[`${q.id}__${k}`] = Array.isArray(v) ? v.join(" | ") : String(v ?? "");
          }
          break;
        }

        case SURVEY_QUESTION_TYPES.INFO:
          break;

        default:
          row[q.id] = value == null ? "" : String(value);
          break;
      }
    }
  }

  return row;
}

export function unflattenSurveyResponses(survey, row = {}) {
  const normalized = normalizeSurvey(survey);
  const responses = {};

  for (const page of normalized.pages || []) {
    for (const q of page.questions || []) {
      switch (q.type) {
        case SURVEY_QUESTION_TYPES.MULTI: {
          const raw = row[q.id];
          responses[q.id] = raw ? String(raw).split(" | ").filter(Boolean) : [];
          break;
        }

        case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
        case SURVEY_QUESTION_TYPES.MATRIX_MULTI: {
          const obj = {};
          for (const key of Object.keys(row)) {
            if (key.startsWith(`${q.id}__`)) {
              const subKey = key.slice(`${q.id}__`.length);
              const raw = row[key];
              obj[subKey] =
                q.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI
                  ? (raw ? String(raw).split(" | ").filter(Boolean) : [])
                  : String(raw ?? "");
            }
          }
          responses[q.id] = obj;
          break;
        }

        case SURVEY_QUESTION_TYPES.INFO:
          responses[q.id] = null;
          break;

        default:
          responses[q.id] = row[q.id] ?? "";
          break;
      }
    }
  }

  return responses;
}

/* =========================
   Payload
   ========================= */

export function buildSurveyResponsePayload({
  session_id,
  participant_id,
  project_id,
  feed_id,
  survey_id,
  survey,
  responses,
}) {
  const normalizedSurvey = normalizeSurvey(survey);

  return {
    session_id: session_id || "",
    participant_id: participant_id || "",
    project_id: project_id || "",
    feed_id: feed_id || "",
    survey_id: survey_id || normalizedSurvey?.survey_id || "",
    submitted_at_iso: new Date().toISOString(),
    ...flattenSurveyResponses(normalizedSurvey, responses),
  };
}