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

export function makeEmptySurvey(overrides = {}) {
  return {
    survey_id: overrides.survey_id || `survey_${uid()}`,
    name: overrides.name || "Untitled Survey",
    description: overrides.description || "",
    questions: Array.isArray(overrides.questions)
      ? overrides.questions.map(normalizeQuestion)
      : [],
    version: Number.isFinite(overrides.version) ? overrides.version : 1,
    status: overrides.status || "draft",
    created_at: overrides.created_at || null,
    updated_at: overrides.updated_at || null,

    // optional linking metadata
    linked_feed_ids: Array.isArray(overrides.linked_feed_ids)
      ? overrides.linked_feed_ids
      : [],
    linked_project_id: overrides.linked_project_id || "",
    trigger: overrides.trigger || "after_feed",
  };
}

export function makeQuestion(type = SURVEY_QUESTION_TYPES.TEXT, overrides = {}) {
  const safeType = isValidSurveyQuestionType(type)
    ? type
    : SURVEY_QUESTION_TYPES.TEXT;

  return {
    id: overrides.id || `q_${uid()}`,
    type: safeType,
    label: overrides.label || "Untitled question",
    description: overrides.description || "",
    required: safeType === SURVEY_QUESTION_TYPES.INFO ? false : !!overrides.required,
    randomize_options: !!overrides.randomize_options,
    options: Array.isArray(overrides.options) ? overrides.options.map(String) : [],
    rows: Array.isArray(overrides.rows) ? overrides.rows.map(String) : [],
    columns: Array.isArray(overrides.columns) ? overrides.columns.map(String) : [],
    min: Number.isFinite(overrides.min) ? overrides.min : 1,
    max: Number.isFinite(overrides.max) ? overrides.max : 7,
    min_label: overrides.min_label || "",
    max_label: overrides.max_label || "",
    visible_if: overrides.visible_if || null,
  };
}

export function normalizeQuestion(raw = {}) {
  const type = isValidSurveyQuestionType(raw.type)
    ? raw.type
    : SURVEY_QUESTION_TYPES.TEXT;

  return {
    id: raw.id || `q_${uid()}`,
    type,
    label: String(raw.label || "Untitled question"),
    description: String(raw.description || ""),
    required: type === SURVEY_QUESTION_TYPES.INFO ? false : !!raw.required,
    randomize_options: !!raw.randomize_options,
    options: Array.isArray(raw.options) ? raw.options.map(String) : [],
    rows: Array.isArray(raw.rows) ? raw.rows.map(String) : [],
    columns: Array.isArray(raw.columns) ? raw.columns.map(String) : [],
    min: Number.isFinite(raw.min) ? raw.min : 1,
    max: Number.isFinite(raw.max) ? raw.max : 7,
    min_label: String(raw.min_label || ""),
    max_label: String(raw.max_label || ""),
    visible_if: raw.visible_if || null,
  };
}

export function normalizeSurvey(raw = {}) {
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map(normalizeQuestion).filter(Boolean)
    : [];

  return {
    survey_id: raw.survey_id || `survey_${uid()}`,
    name: String(raw.name || "Untitled Survey"),
    description: String(raw.description || ""),
    questions,
    version: Number.isFinite(raw.version) ? raw.version : 1,
    status: String(raw.status || "draft"),
    created_at: raw.created_at || null,
    updated_at: raw.updated_at || null,

    // useful for linking / display later
    linked_feed_ids: Array.isArray(raw.linked_feed_ids) ? raw.linked_feed_ids : [],
    linked_project_id: raw.linked_project_id || "",
    trigger: raw.trigger || "after_feed",
  };
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

  for (const q of normalized.questions || []) {
    out[q.id] = emptyValueForQuestion(q);
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
  if (!value || typeof value !== "object") return false;
  const rows = Array.isArray(q?.rows) ? q.rows : [];
  if (!rows.length) return false;

  return rows.every((row) => String(value[row] ?? "").trim() !== "");
}

function isMatrixMultiAnswered(q, value) {
  if (!value || typeof value !== "object") return false;
  const rows = Array.isArray(q?.rows) ? q.rows : [];
  if (!rows.length) return false;

  return rows.every((row) => Array.isArray(value[row]) && value[row].length > 0);
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

  for (const q of normalized.questions || []) {
    if (!isQuestionVisible(q, responses)) continue;

    const value = responses?.[q.id];
    if (!isQuestionAnswered(q, value)) {
      errors[q.id] = "This question is required.";
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

  if (q.randomize_options && Array.isArray(q.options) && q.options.length > 1) {
    q.options = seededShuffle(q.options, `${participantSeed}::${q.id}`);
  }

  return q;
}

/* =========================
   Flatten responses
   ========================= */

export function flattenSurveyResponses(survey, responses) {
  const normalized = normalizeSurvey(survey);
  const row = {};

  for (const q of normalized.questions || []) {
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

  return row;
}

export function unflattenSurveyResponses(survey, row = {}) {
  const normalized = normalizeSurvey(survey);
  const responses = {};

  for (const q of normalized.questions || []) {
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