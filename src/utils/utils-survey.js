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
  POST_REMINDER: "post_reminder",
  PAGE_BREAK: "page_break",
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

function uniqueStringArray(arr = []) {
  return Array.from(new Set(cleanStringArray(arr)));
}

function sanitizeQuestionId(value, fallback = "") {
  const cleaned = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
  return cleaned || fallback;
}

function sanitizeStructuredValue(value, fallback = "") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");
  return cleaned || fallback;
}

function makeSequentialValue(prefix, index) {
  return `${prefix}_${index + 1}`;
}

function makeMatrixRowValue(questionId, index) {
  const base = sanitizeQuestionId(questionId);
  return base ? `${base}_${index + 1}` : makeSequentialValue("row", index);
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

function normalizeStructuredItems(items = [], prefix = "item") {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, i) => {
      if (typeof item === "string") {
        const label = item.trim();
        return label
          ? {
              value: sanitizeStructuredValue(
                makeSequentialValue(prefix, i),
                makeSequentialValue(prefix, i)
              ),
              label,
            }
          : null;
      }

      if (item && typeof item === "object") {
        const fallbackValue = makeSequentialValue(prefix, i);
        const value = sanitizeStructuredValue(item.value, fallbackValue);
        const label = String(item.label ?? item.value ?? "").trim();
        return value || label
          ? {
              value: value || fallbackValue,
              label,
            }
          : null;
      }

      return null;
    })
    .filter(Boolean);
}

function normalizeMatrixRows(items = [], questionId = "") {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, i) => {
      if (typeof item === "string") {
        const label = item.trim();
        return label
          ? {
              value: makeMatrixRowValue(questionId, i),
              label,
            }
          : null;
      }

      if (item && typeof item === "object") {
        const fallbackValue = makeMatrixRowValue(questionId, i);
        const value = sanitizeStructuredValue(item.value, fallbackValue);
        const label = String(item.label ?? item.value ?? "").trim();
        return value || label
          ? {
              value: value || fallbackValue,
              label,
            }
          : null;
      }

      return null;
    })
    .filter(Boolean);
}

function normalizeBipolarRows(items = [], questionId = "") {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, i) => {
      if (typeof item === "string") {
        const text = item.trim();
        return text
          ? {
              value: makeMatrixRowValue(questionId, i),
              label: text,
              left_label: text,
              right_label: "",
            }
          : null;
      }

      if (item && typeof item === "object") {
        const fallbackValue = makeMatrixRowValue(questionId, i);

        const value = sanitizeStructuredValue(item.value, fallbackValue);
        const label = String(item.label ?? "").trim();
        const leftLabel = String(item.left_label ?? item.label ?? "").trim();
        const rightLabel = String(item.right_label ?? "").trim();

        return value || label || leftLabel || rightLabel
          ? {
              value: value || fallbackValue,
              label: label || leftLabel || `Row ${i + 1}`,
              left_label: leftLabel || label || "",
              right_label: rightLabel,
            }
          : null;
      }

      return null;
    })
    .filter(Boolean);
}

function normalizeVisibleInFeeds(value = []) {
  return uniqueStringArray(value);
}

function normalizeFeedOverrides(value = {}) {
  const source = asObject(value);
  const out = {};

  Object.entries(source).forEach(([feedId, override]) => {
    const cleanFeedId = String(feedId ?? "").trim();
    if (!cleanFeedId) return;

    const safeOverride = asObject(override);
    out[cleanFeedId] = {
      text: String(safeOverride.text ?? ""),
    };
  });

  return out;
}

function pruneFeedOverridesByVisibleFeeds(feedOverrides = {}, visibleInFeeds = []) {
  const allowedFeedIds = normalizeVisibleInFeeds(visibleInFeeds);
  const allowed = new Set(allowedFeedIds);
  const normalized = normalizeFeedOverrides(feedOverrides);
  const out = {};

  Object.entries(normalized).forEach(([feedId, override]) => {
    if (allowed.size > 0 && !allowed.has(feedId)) return;

    if (String(override?.text ?? "").trim()) {
      out[feedId] = {
        text: String(override.text ?? ""),
      };
    }
  });

  return out;
}

function isPageBreakQuestion(question) {
  return question?.type === SURVEY_QUESTION_TYPES.PAGE_BREAK;
}

function isDisplayOnlyQuestion(question) {
  return (
    question?.type === SURVEY_QUESTION_TYPES.INFO ||
    question?.type === SURVEY_QUESTION_TYPES.POST_REMINDER ||
    question?.type === SURVEY_QUESTION_TYPES.PAGE_BREAK
  );
}

function normalizeRichSurveyField(value, fallback = "") {
  return String(value ?? fallback);
}

/* =========================
   Post reminder helpers
   ========================= */

export function isPostReminderQuestion(question) {
  return question?.type === SURVEY_QUESTION_TYPES.POST_REMINDER;
}

export function questionHasPostReminderTarget(question) {
  if (!isPostReminderQuestion(question)) return false;
  const normalized = normalizeQuestion(question);
  return !!String(normalized.post_id ?? "").trim();
}

export function getPostReminderRequest(question, fallbackFeedId = "") {
  const normalized = normalizeQuestion(question);
  if (!isPostReminderQuestion(normalized)) return null;

  const postId = String(normalized.post_id ?? "").trim();
  const feedId = String(normalized.post_feed_id ?? fallbackFeedId ?? "").trim();

  if (!postId) return null;

  return {
    post_id: postId,
    post_feed_id: feedId,
    post_label: String(normalized.post_label ?? "").trim(),
  };
}

export function collectSurveyPostReminderTargets(survey, fallbackFeedId = "") {
  return surveyQuestions(survey)
    .filter(isPostReminderQuestion)
    .map((q) => getPostReminderRequest(q, fallbackFeedId))
    .filter(Boolean);
}

export function surveyHasPostReminders(survey) {
  return collectSurveyPostReminderTargets(survey).length > 0;
}

export function surveyCanLazyLoadAllPostReminders(survey, fallbackFeedId = "") {
  const targets = collectSurveyPostReminderTargets(survey, fallbackFeedId);
  if (!targets.length) return true;
  return targets.every((target) => !!String(target.post_feed_id ?? "").trim());
}

export function surveyNeedsFeedContext(survey, fallbackFeedId = "") {
  const normalized = normalizeSurvey(survey);
  const deliveryMode = String(normalized.delivery_mode || "").trim().toLowerCase();

  if (deliveryMode === "feed_then_survey") return true;
  return !surveyCanLazyLoadAllPostReminders(normalized, fallbackFeedId);
}

/* =========================
   Question mapping
   ========================= */

export function makeQuestion(type = SURVEY_QUESTION_TYPES.TEXT, overrides = {}) {
  const safeType = isValidSurveyQuestionType(type)
    ? type
    : SURVEY_QUESTION_TYPES.TEXT;

  const defaultText =
    safeType === SURVEY_QUESTION_TYPES.PAGE_BREAK
      ? "Page break"
      : safeType === SURVEY_QUESTION_TYPES.POST_REMINDER
        ? "Please look at this post again before answering."
        : "Untitled question";

  const text = String(overrides.text ?? overrides.label ?? defaultText);
  const questionId = sanitizeQuestionId(overrides.id, `Q_${uid()}`);
  const visibleInFeeds = normalizeVisibleInFeeds(overrides.visible_in_feeds);
  const feedOverrides = pruneFeedOverridesByVisibleFeeds(
    overrides.feed_overrides,
    visibleInFeeds
  );

  return {
    id: questionId,
    type: safeType,
    text,
    label: text,
    description: overrides.description || "",
    required: isDisplayOnlyQuestion({ type: safeType }) ? false : !!overrides.required,
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
    visible_in_feeds: visibleInFeeds,
    feed_overrides: feedOverrides,
    placeholder: String(overrides.placeholder || ""),
    post_id: String(overrides.post_id ?? ""),
    post_label: String(overrides.post_label ?? ""),
    post_feed_id: String(overrides.post_feed_id ?? ""),
    meta: asObject(overrides.meta),
  };
}

export function normalizeQuestion(raw = {}) {
  const type = isValidSurveyQuestionType(raw.type)
    ? raw.type
    : SURVEY_QUESTION_TYPES.TEXT;

  const defaultText =
    type === SURVEY_QUESTION_TYPES.PAGE_BREAK
      ? "Page break"
      : type === SURVEY_QUESTION_TYPES.POST_REMINDER
        ? "Please look at this post again before answering."
        : "Untitled question";

  const text = String(raw.text ?? raw.label ?? defaultText);
  const questionId = sanitizeQuestionId(raw.id, `Q_${uid()}`);
  const meta = asObject(raw.meta);

  const normalizedRows =
    type === SURVEY_QUESTION_TYPES.BIPOLAR
      ? normalizeBipolarRows(raw.rows, questionId)
      : Array.isArray(raw.rows)
        ? normalizeMatrixRows(raw.rows, questionId)
        : [];

  const normalizedColumns = Array.isArray(raw.columns)
    ? normalizeStructuredItems(raw.columns, "col")
    : [];

  const visibleInFeeds = normalizeVisibleInFeeds(raw.visible_in_feeds);
  const feedOverrides = pruneFeedOverridesByVisibleFeeds(
    raw.feed_overrides,
    visibleInFeeds
  );

  const postId =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER
      ? String(raw.post_id ?? meta.post_id ?? "")
      : "";

  const postLabel =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER
      ? String(raw.post_label ?? meta.post_label ?? "")
      : "";

  const postFeedId =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER
      ? String(raw.post_feed_id ?? meta.post_feed_id ?? "")
      : "";

  return {
    id: questionId,
    type,
    text,
    label: text,
    description: String(raw.description || ""),
    required: isDisplayOnlyQuestion({ type }) ? false : !!raw.required,
    randomize_options: !!raw.randomize_options,

    choices: Array.isArray(raw.choices)
      ? raw.choices.map((c, i) => ({
          value: sanitizeStructuredValue(c?.value, `opt_${i + 1}`),
          label: String(c?.label ?? ""),
        }))
      : [],

    rows: normalizedRows,

    columns:
      type === SURVEY_QUESTION_TYPES.BIPOLAR
        ? normalizedColumns.length
          ? normalizedColumns
          : Array.from(
              {
                length: Math.max(
                  2,
                  Number.isFinite(raw.max) && Number.isFinite(raw.min)
                    ? Number(raw.max) - Number(raw.min) + 1
                    : 7
                ),
              },
              (_, i) => ({
                value: String(
                  (Number.isFinite(raw.min) ? Number(raw.min) : 1) + i
                ),
                label: String(
                  (Number.isFinite(raw.min) ? Number(raw.min) : 1) + i
                ),
              })
            )
        : normalizedColumns,

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
    visible_in_feeds: visibleInFeeds,
    feed_overrides: feedOverrides,
    placeholder: String(raw.placeholder || ""),
    post_id: postId,
    post_label: postLabel,
    post_feed_id: postFeedId,
    meta: {
      ...meta,
      ...(type === SURVEY_QUESTION_TYPES.POST_REMINDER
        ? {
            post_id: postId,
            post_label: postLabel,
            post_feed_id: postFeedId,
          }
        : {}),
    },
  };
}

export function frontendQuestionToBackend(question = {}) {
  const q = normalizeQuestion(question);

  const base = {
    id: q.id,
    type: q.type,
    text: q.text,
    description: q.description,
    required: isDisplayOnlyQuestion(q) ? false : !!q.required,
    visible_in_feeds: q.visible_in_feeds,
    feed_overrides: q.feed_overrides,
    meta: {
      ...(q.meta || {}),
      ...(q.type === SURVEY_QUESTION_TYPES.POST_REMINDER
        ? {
            post_id: String(q.post_id ?? ""),
            post_label: String(q.post_label ?? ""),
            post_feed_id: String(q.post_feed_id ?? ""),
          }
        : {}),
    },
  };

  switch (q.type) {
    case SURVEY_QUESTION_TYPES.SINGLE:
    case SURVEY_QUESTION_TYPES.MULTI:
    case SURVEY_QUESTION_TYPES.DROPDOWN:
      return {
        ...base,
        choices:
          Array.isArray(q.choices) && q.choices.length
            ? q.choices.map((choice, i) => ({
                value: sanitizeStructuredValue(choice?.value, `opt_${i + 1}`),
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
              value: sanitizeStructuredValue(row?.value, makeMatrixRowValue(q.id, i)),
              label: String(row?.label ?? ""),
            }))
          : [],
        columns: Array.isArray(q.columns)
          ? q.columns.map((col, i) => ({
              value: sanitizeStructuredValue(col?.value, `col_${i + 1}`),
              label: String(col?.label ?? ""),
            }))
          : [],
      };

    case SURVEY_QUESTION_TYPES.BIPOLAR:
      return {
        ...base,
        rows: Array.isArray(q.rows)
          ? q.rows.map((row, i) => ({
              value: sanitizeStructuredValue(row?.value, makeMatrixRowValue(q.id, i)),
              label: String(row?.label ?? row?.left_label ?? ""),
              left_label: String(row?.left_label ?? row?.label ?? ""),
              right_label: String(row?.right_label ?? ""),
            }))
          : [],
        columns:
          Array.isArray(q.columns) && q.columns.length
            ? q.columns.map((col, i) => ({
                value: String(
                  col?.value ??
                    String((Number.isFinite(q.min) ? Number(q.min) : 1) + i)
                ),
                label: String(
                  col?.label ??
                    col?.value ??
                    String((Number.isFinite(q.min) ? Number(q.min) : 1) + i)
                ),
              }))
            : Array.from(
                {
                  length: Math.max(
                    2,
                    Number.isFinite(q.max) && Number.isFinite(q.min)
                      ? Number(q.max) - Number(q.min) + 1
                      : 7
                  ),
                },
                (_, i) => ({
                  value: String((Number.isFinite(q.min) ? Number(q.min) : 1) + i),
                  label: String((Number.isFinite(q.min) ? Number(q.min) : 1) + i),
                })
              ),
        min: q.min,
        max: q.max,
        left_label: q.left_label ?? q.min_label ?? "",
        right_label: q.right_label ?? q.max_label ?? "",
      };

    case SURVEY_QUESTION_TYPES.SLIDER:
      return {
        ...base,
        min: q.min,
        max: q.max,
        left_label: q.left_label ?? q.min_label ?? "",
        right_label: q.right_label ?? q.max_label ?? "",
      };

    case SURVEY_QUESTION_TYPES.POST_REMINDER:
      return {
        ...base,
        required: false,
        post_id: String(q.post_id ?? ""),
        post_label: String(q.post_label ?? ""),
        post_feed_id: String(q.post_feed_id ?? ""),
      };

    case SURVEY_QUESTION_TYPES.PAGE_BREAK:
      return {
        ...base,
        required: false,
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
      ? safeOverrides.questions
          .map(normalizeQuestion)
          .filter((q) => q && !isPageBreakQuestion(q))
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
      ? safeRaw.questions
          .map(normalizeQuestion)
          .filter((q) => q && !isPageBreakQuestion(q))
      : [],
  };
}

function splitQuestionsIntoPages(questions = []) {
  const normalizedQuestions = (Array.isArray(questions) ? questions : [])
    .map(normalizeQuestion)
    .filter(Boolean);

  const pages = [];
  let currentQuestions = [];
  let currentPageTitle = "";
  let currentPageDescription = "";
  let pageCounter = 1;

  const pushPage = () => {
    pages.push(
      makePage({
        id: `page_${pageCounter}`,
        title: currentPageTitle,
        description: currentPageDescription,
        questions: currentQuestions,
      })
    );
    pageCounter += 1;
    currentQuestions = [];
    currentPageTitle = "";
    currentPageDescription = "";
  };

  normalizedQuestions.forEach((question) => {
    if (isPageBreakQuestion(question)) {
      pushPage();
      currentPageTitle = String(question.text || "");
      currentPageDescription = String(question.description || "");
      return;
    }
    currentQuestions.push(question);
  });

  pushPage();

  return pages.filter((page, idx) => {
    if ((page.questions || []).length > 0) return true;
    return pages.length === 1 && idx === 0;
  });
}

function coerceQuestionsIntoPages(raw = {}) {
  const safeRaw = asObject(raw);

  if (Array.isArray(safeRaw.pages) && safeRaw.pages.length > 0) {
    const flattenedQuestions = safeRaw.pages.flatMap((page) => {
      const normalizedPage = asObject(page);
      return Array.isArray(normalizedPage.questions) ? normalizedPage.questions : [];
    });

    const hasEmbeddedPageBreaks = flattenedQuestions.some(
      (q) => q?.type === SURVEY_QUESTION_TYPES.PAGE_BREAK
    );

    if (!hasEmbeddedPageBreaks) {
      return safeRaw.pages.map(normalizePage).filter(Boolean);
    }

    const rebuiltPages = [];
    let pageCounter = 1;

    safeRaw.pages.forEach((rawPage) => {
      const page = asObject(rawPage);
      const splitPages = splitQuestionsIntoPages(page.questions || []);

      splitPages.forEach((splitPage, splitIdx) => {
        rebuiltPages.push(
          makePage({
            id: splitPage.id || `page_${pageCounter}`,
            title:
              splitIdx === 0
                ? String(page.title || splitPage.title || "")
                : String(splitPage.title || ""),
            description:
              splitIdx === 0
                ? String(page.description || splitPage.description || "")
                : String(splitPage.description || ""),
            questions: splitPage.questions || [],
          })
        );
        pageCounter += 1;
      });
    });

    return rebuiltPages.length
      ? rebuiltPages
      : [makePage({ id: "page_1", title: "", description: "", questions: [] })];
  }

  const legacyQuestions = Array.isArray(safeRaw.questions) ? safeRaw.questions : [];
  return splitQuestionsIntoPages(legacyQuestions);
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

    participant_information_title: normalizeRichSurveyField(
      safeOverrides.participant_information_title,
      "Participant Information"
    ),
    participant_information_html: normalizeRichSurveyField(
      safeOverrides.participant_information_html,
      ""
    ),
    consent_title: normalizeRichSurveyField(
      safeOverrides.consent_title,
      "Participant Consent"
    ),
    consent_text_html: normalizeRichSurveyField(
      safeOverrides.consent_text_html,
      ""
    ),
    consent_decline_message_html: normalizeRichSurveyField(
      safeOverrides.consent_decline_message_html,
      "You cannot proceed because you did not provide consent to participate."
    ),
    instructions_title: normalizeRichSurveyField(
      safeOverrides.instructions_title,
      "Instructions"
    ),
    instructions_html: normalizeRichSurveyField(
      safeOverrides.instructions_html,
      ""
    ),
    pre_feed_button_label: normalizeRichSurveyField(
      safeOverrides.pre_feed_button_label,
      "Go to feed"
    ),

    thank_you_message_html: normalizeRichSurveyField(
      safeOverrides.thank_you_message_html,
      "<p>Thank you for completing the study.</p><p>You may now close this window.</p>"
    ),
    completion_code: normalizeRichSurveyField(
      safeOverrides.completion_code,
      ""
    ),
    completion_mode:
      String(safeOverrides.completion_mode || "").trim().toLowerCase() === "redirect"
        ? "redirect"
        : "message",
    completion_redirect_url: normalizeRichSurveyField(
      safeOverrides.completion_redirect_url,
      ""
    ),
    delivery_mode:
      String(safeOverrides.delivery_mode || "").trim().toLowerCase() === "survey_only"
        ? "survey_only"
        : "feed_then_survey",
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

    participant_information_title: normalizeRichSurveyField(
      safeRaw.participant_information_title,
      "Participant Information"
    ),
    participant_information_html: normalizeRichSurveyField(
      safeRaw.participant_information_html,
      ""
    ),
    consent_title: normalizeRichSurveyField(
      safeRaw.consent_title,
      "Participant Consent"
    ),
    consent_text_html: normalizeRichSurveyField(
      safeRaw.consent_text_html,
      ""
    ),
    consent_decline_message_html: normalizeRichSurveyField(
      safeRaw.consent_decline_message_html,
      "You cannot proceed because you did not provide consent to participate."
    ),
    instructions_title: normalizeRichSurveyField(
      safeRaw.instructions_title,
      "Instructions"
    ),
    instructions_html: normalizeRichSurveyField(
      safeRaw.instructions_html,
      ""
    ),
    pre_feed_button_label: normalizeRichSurveyField(
      safeRaw.pre_feed_button_label,
      "Go to feed"
    ),

    thank_you_message_html: normalizeRichSurveyField(
      safeRaw.thank_you_message_html,
      "<p>Thank you for completing the study.</p><p>You may now close this window.</p>"
    ),
    completion_code: normalizeRichSurveyField(
      safeRaw.completion_code,
      ""
    ),
    completion_mode:
      String(safeRaw.completion_mode || "").trim().toLowerCase() === "redirect"
        ? "redirect"
        : "message",
    completion_redirect_url: normalizeRichSurveyField(
      safeRaw.completion_redirect_url,
      ""
    ),
    delivery_mode:
      String(safeRaw.delivery_mode || "").trim().toLowerCase() === "survey_only"
        ? "survey_only"
        : "feed_then_survey",
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

    participant_information_title: s.participant_information_title,
    participant_information_html: s.participant_information_html,
    consent_title: s.consent_title,
    consent_text_html: s.consent_text_html,
    consent_decline_message_html: s.consent_decline_message_html,
    instructions_title: s.instructions_title,
    instructions_html: s.instructions_html,
    pre_feed_button_label: s.pre_feed_button_label,

    thank_you_message_html: s.thank_you_message_html,
    completion_code: s.completion_code,
    completion_mode: s.completion_mode,
    completion_redirect_url: s.completion_redirect_url,
    delivery_mode: s.delivery_mode,
  };
}

export function surveyQuestions(survey) {
  const normalized = normalizeSurvey(survey);
  return (normalized.pages || []).flatMap((page) => page.questions || []);
}

export function setSurveyQuestions(survey, questions = []) {
  const normalized = normalizeSurvey(survey);

  return {
    ...normalized,
    pages: splitQuestionsIntoPages(
      (Array.isArray(questions) ? questions : []).map(normalizeQuestion)
    ),
  };
}

export function surveyQuestionCount(survey) {
  return surveyQuestions(survey).filter((q) => !isDisplayOnlyQuestion(q)).length;
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
        label: "Please rate the following items",
        rows: ["Item 1", "Item 2", "Item 3"],
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

    case SURVEY_QUESTION_TYPES.POST_REMINDER:
      return makeQuestion(type, {
        label: "Please look at this post again before answering.",
        required: false,
        post_id: "",
        post_label: "",
        post_feed_id: "",
      });

    case SURVEY_QUESTION_TYPES.PAGE_BREAK:
      return makeQuestion(type, {
        label: "Next page",
        description: "",
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

export function isQuestionVisible(question, responses = {}, { feedId = "" } = {}) {
  if (question?.type === SURVEY_QUESTION_TYPES.PAGE_BREAK) return true;

  const normalizedQuestion = normalizeQuestion(question);
  const activeFeedId = String(feedId ?? "").trim();
  const visibleInFeeds = Array.isArray(normalizedQuestion.visible_in_feeds)
    ? normalizedQuestion.visible_in_feeds
    : [];

  if (activeFeedId && visibleInFeeds.length > 0 && !visibleInFeeds.includes(activeFeedId)) {
    return false;
  }

  const rule = normalizedQuestion?.visible_if;
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
    case SURVEY_QUESTION_TYPES.BIPOLAR:
      return {};

    case SURVEY_QUESTION_TYPES.INFO:
    case SURVEY_QUESTION_TYPES.POST_REMINDER:
    case SURVEY_QUESTION_TYPES.PAGE_BREAK:
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
    const key = String(row?.value ?? makeMatrixRowValue(q?.id, i));
    return String(value[key] ?? "").trim() !== "";
  });
}

function isMatrixMultiAnswered(q, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rows = Array.isArray(q?.rows) ? q.rows : [];
  if (!rows.length) return false;

  return rows.every((row, i) => {
    const key = String(row?.value ?? makeMatrixRowValue(q?.id, i));
    return Array.isArray(value[key]) && value[key].length > 0;
  });
}

function isBipolarAnswered(q, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rows = Array.isArray(q?.rows) ? q.rows : [];
  if (!rows.length) return false;

  return rows.every((row, i) => {
    const key = String(row?.value ?? makeMatrixRowValue(q?.id, i));
    return String(value[key] ?? "").trim() !== "";
  });
}

export function isQuestionAnswered(q, value) {
  if (!q || isDisplayOnlyQuestion(q)) return true;
  if (!q.required) return true;

  switch (q.type) {
    case SURVEY_QUESTION_TYPES.MULTI:
      return Array.isArray(value) && value.length > 0;

    case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
      return isMatrixSingleAnswered(q, value);

    case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
      return isMatrixMultiAnswered(q, value);

    case SURVEY_QUESTION_TYPES.BIPOLAR:
      return isBipolarAnswered(q, value);

    case SURVEY_QUESTION_TYPES.TEXT:
    case SURVEY_QUESTION_TYPES.TEXTAREA:
    case SURVEY_QUESTION_TYPES.SINGLE:
    case SURVEY_QUESTION_TYPES.DROPDOWN:
    case SURVEY_QUESTION_TYPES.SLIDER:
    default:
      return String(value ?? "").trim() !== "";
  }
}

export function validateSurveyResponses(survey, responses, { feedId = "" } = {}) {
  const normalized = normalizeSurvey(survey);
  const errors = {};

  for (const page of normalized.pages || []) {
    for (const q of page.questions || []) {
      if (!isQuestionVisible(q, responses, { feedId })) continue;

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

export function getRenderedQuestion(
  question,
  { participantSeed = "", feedId = "" } = {}
) {
  const q = normalizeQuestion(question);
  const activeFeedId = String(feedId ?? "").trim();
  const activeOverride =
    activeFeedId && q.feed_overrides && typeof q.feed_overrides === "object"
      ? q.feed_overrides[activeFeedId]
      : null;

  if (activeOverride && String(activeOverride.text ?? "").trim()) {
    q.text = String(activeOverride.text ?? "");
    q.label = q.text;
  }

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
        case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
        case SURVEY_QUESTION_TYPES.BIPOLAR: {
          const obj = value && typeof value === "object" ? value : {};
          for (const [k, v] of Object.entries(obj)) {
            const outKey = String(k ?? "").trim();
            if (!outKey) continue;
            row[outKey] = Array.isArray(v) ? v.join(" | ") : String(v ?? "");
          }
          break;
        }

        case SURVEY_QUESTION_TYPES.INFO:
        case SURVEY_QUESTION_TYPES.POST_REMINDER:
        case SURVEY_QUESTION_TYPES.PAGE_BREAK:
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
        case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
        case SURVEY_QUESTION_TYPES.BIPOLAR: {
          const obj = {};
          const rows = Array.isArray(q.rows) ? q.rows : [];

          rows.forEach((questionRow, i) => {
            const subKey = String(questionRow?.value ?? makeMatrixRowValue(q.id, i));
            const raw = row[subKey];
            obj[subKey] =
              q.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI
                ? (raw ? String(raw).split(" | ").filter(Boolean) : [])
                : String(raw ?? "");
          });

          responses[q.id] = obj;
          break;
        }

        case SURVEY_QUESTION_TYPES.INFO:
        case SURVEY_QUESTION_TYPES.POST_REMINDER:
        case SURVEY_QUESTION_TYPES.PAGE_BREAK:
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
