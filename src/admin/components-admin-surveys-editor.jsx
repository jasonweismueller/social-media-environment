import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  makeEmptySurvey,
  makeQuestionByType,
  SURVEY_QUESTION_TYPES,
  VISIBLE_IF_ELIGIBLE_TYPES,
  ATTENTION_CHECK_ELIGIBLE_TYPES,
} from "../utils";
import { Button, IconButton, Card, Toggle, Modal, EmptyState, useConfirm } from "./ui";
import { SurveyPreviewModal } from "./components-admin-survey-preview";

/* =========================
   Small helpers
   ========================== */

export const EDITOR_PAGE_BREAK_TYPE = "page_break";
const POST_REMINDER_TYPE =
  SURVEY_QUESTION_TYPES.POST_REMINDER || "post_reminder";

export const QUESTION_TYPE_LABELS = {
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
  [POST_REMINDER_TYPE]: "Post reminder",
  [EDITOR_PAGE_BREAK_TYPE]: "Page break",
};

export const QUESTION_TYPE_SHORT_LABELS = {
  [SURVEY_QUESTION_TYPES.TEXT]: "Txt",
  [SURVEY_QUESTION_TYPES.TEXTAREA]: "Long",
  [SURVEY_QUESTION_TYPES.SINGLE]: "1-ch",
  [SURVEY_QUESTION_TYPES.MULTI]: "M-ch",
  [SURVEY_QUESTION_TYPES.DROPDOWN]: "Drop",
  [SURVEY_QUESTION_TYPES.MATRIX_SINGLE]: "Mtx1",
  [SURVEY_QUESTION_TYPES.MATRIX_MULTI]: "MtxM",
  [SURVEY_QUESTION_TYPES.BIPOLAR]: "Bip",
  [SURVEY_QUESTION_TYPES.SLIDER]: "Sldr",
  [SURVEY_QUESTION_TYPES.INFO]: "Info",
  [POST_REMINDER_TYPE]: "Post",
};

export const INSERTABLE_TYPES = [
  SURVEY_QUESTION_TYPES.TEXT,
  SURVEY_QUESTION_TYPES.TEXTAREA,
  SURVEY_QUESTION_TYPES.SINGLE,
  SURVEY_QUESTION_TYPES.MULTI,
  SURVEY_QUESTION_TYPES.DROPDOWN,
  SURVEY_QUESTION_TYPES.MATRIX_SINGLE,
  SURVEY_QUESTION_TYPES.MATRIX_MULTI,
  SURVEY_QUESTION_TYPES.BIPOLAR,
  SURVEY_QUESTION_TYPES.SLIDER,
  SURVEY_QUESTION_TYPES.INFO,
  POST_REMINDER_TYPE,
  EDITOR_PAGE_BREAK_TYPE,
];

const INPUT_HEIGHT = 42;
const TOP_ROW_LABEL_HEIGHT = 18;

export function makeEditorId() {
  return `editor_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizePageDelaySeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export function makeSequentialValue(prefix, index) {
  return `${prefix}_${index + 1}`;
}

export function makeNumericValue(index) {
  return String(index + 1);
}

export function sanitizeQuestionId(value, fallback = "") {
  const cleaned = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
  return cleaned || fallback;
}

export function sanitizeFreeformValue(value, fallback = "") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");
  return cleaned || fallback;
}

export function preserveEmptyOrSanitize(value, fallback = "") {
  if (value === "") return "";
  if (value === null || value === undefined) return fallback;
  return sanitizeFreeformValue(value, fallback);
}

function uniqueStringList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
    )
  );
}


function orderFeedsBySequence(feeds = [], sequenceIds = []) {
  const safeFeeds = Array.isArray(feeds) ? feeds : [];
  const sequence = uniqueStringList(sequenceIds);
  if (!sequence.length) return safeFeeds;

  const byId = new Map(
    safeFeeds
      .map((feed) => [String(feed?.feed_id || "").trim(), feed])
      .filter(([feedId]) => !!feedId)
  );

  const ordered = sequence.map((feedId) => byId.get(feedId)).filter(Boolean);
  const used = new Set(ordered.map((feed) => String(feed?.feed_id || "").trim()));
  const leftovers = safeFeeds.filter(
    (feed) => !used.has(String(feed?.feed_id || "").trim())
  );

  return [...ordered, ...leftovers];
}

export function normalizeVisibleInFeeds(values = []) {
  return uniqueStringList(values);
}

function normalizeRichTextHtml(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
  if (looksLikeHtml) return raw;

  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function stripHtmlForEmptyCheck(html = "") {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/p>\s*<p>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

export function normalizeFeedOverridesMap(value = {}) {
  const input =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};

  Object.entries(input).forEach(([feedId, override]) => {
    const cleanFeedId = String(feedId || "").trim();
    if (!cleanFeedId) return;

    const safeOverride =
      override && typeof override === "object" && !Array.isArray(override)
        ? override
        : {};

    out[cleanFeedId] = {
      text: normalizeRichTextHtml(safeOverride.text ?? ""),
    };
  });

  return out;
}

export function pruneFeedOverridesMap(value = {}, allowedFeedIds = []) {
  const allowed = new Set(uniqueStringList(allowedFeedIds));
  const normalized = normalizeFeedOverridesMap(value);
  const out = {};

  Object.entries(normalized).forEach(([feedId, override]) => {
    if (allowed.size && !allowed.has(feedId)) return;
    if (stripHtmlForEmptyCheck(override?.text ?? "")) {
      out[feedId] = {
        text: normalizeRichTextHtml(override.text ?? ""),
      };
    }
  });

  return out;
}

export function isQuestionIdAutoGenerated(value = "") {
  return /^(Q_\d+|Q_\d+_\d+|Q_\d{6,}|Q_[A-Z0-9]+|q_\d+|q_[A-Za-z0-9_-]+)$/.test(
    String(value || "").trim()
  );
}

export function makeMatrixRowValue(questionId, index) {
  const base = sanitizeQuestionId(questionId);
  return base ? `${base}_${index + 1}` : makeSequentialValue("row", index);
}

export function shouldAutoRewriteRowValues(question) {
  const type = question?.type;
  return (
    type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
    type === SURVEY_QUESTION_TYPES.MATRIX_MULTI ||
    type === SURVEY_QUESTION_TYPES.BIPOLAR
  );
}

// Accepts either a bare type string (conservative default: a post_reminder
// with unknown recall status is treated as display-only) or a
// question-like object with `.type`/`.recall_enabled` — a "recall" reminder
// is a real answerable question, not a passive display block, mirroring
// isDisplayOnlyQuestion's identical carve-out in utils-survey.js.
function isEditorDisplayOnlyType(questionOrType) {
  const isObj = questionOrType && typeof questionOrType === "object";
  const type = isObj ? questionOrType.type : questionOrType;
  if (type === POST_REMINDER_TYPE) {
    return isObj ? !questionOrType.recall_enabled : true;
  }
  return type === SURVEY_QUESTION_TYPES.INFO;
}

// Always exactly 2 entries — mirrors utils-survey.js's identical helper.
function normalizeRecallDistractorTextsForEditor(arr) {
  const out = (Array.isArray(arr) ? arr : []).slice(0, 2).map((v) => String(v ?? ""));
  while (out.length < 2) out.push("");
  return out;
}

export function ensureChoiceArray(items = []) {
  return (Array.isArray(items) ? items : []).map((item, i) => ({
    value: preserveEmptyOrSanitize(item?.value, makeNumericValue(i)),
    label: String(item?.label ?? ""),
  }));
}

export function ensureMatrixArray(items = [], prefix = "item") {
  const useNumericDefault = prefix === "col";

  return (Array.isArray(items) ? items : []).map((item, i) => ({
    value: preserveEmptyOrSanitize(
      item?.value,
      useNumericDefault ? makeNumericValue(i) : makeSequentialValue(prefix, i)
    ),
    label: String(item?.label ?? ""),
  }));
}

export function ensureMatrixRowsFromQuestionId(items = [], questionId = "") {
  return (Array.isArray(items) ? items : []).map((item, i) => ({
    value: preserveEmptyOrSanitize(item?.value, makeMatrixRowValue(questionId, i)),
    label: String(item?.label ?? ""),
    is_attention_check: !!item?.is_attention_check,
    attention_check_value: String(item?.attention_check_value ?? ""),
  }));
}

export function ensureBipolarRowArray(items = [], questionId = "") {
  return (Array.isArray(items) ? items : []).map((item, i) => {
    const leftLabel = String(item?.left_label ?? item?.label ?? "");
    const rightLabel = String(item?.right_label ?? "");
    const label = String(item?.label ?? item?.left_label ?? `Row ${i + 1}`);

    return {
      value: preserveEmptyOrSanitize(item?.value, makeMatrixRowValue(questionId, i)),
      label,
      left_label: leftLabel,
      right_label: rightLabel,
      is_attention_check: !!item?.is_attention_check,
      attention_check_value: String(item?.attention_check_value ?? ""),
    };
  });
}

export function rewriteQuestionRowValues(question, nextQuestionId) {
  if (!shouldAutoRewriteRowValues(question)) return question;

  const nextId = sanitizeQuestionId(nextQuestionId, question?.id || "");
  if (!nextId) return question;

  return {
    ...question,
    rows: (Array.isArray(question?.rows) ? question.rows : []).map((row, i) => ({
      ...row,
      value: makeMatrixRowValue(nextId, i),
    })),
  };
}

export function makeCopiedQuestionId(existingIds = [], sourceId = "") {
  const cleanSourceId = sanitizeQuestionId(sourceId, `Q_${Date.now()}`);
  const idSet = new Set(
    (Array.isArray(existingIds) ? existingIds : []).map((x) =>
      String(x || "").trim()
    )
  );

  let nextId = `${cleanSourceId}_COPY`;
  if (!idSet.has(nextId)) return nextId;

  let counter = 2;
  while (idSet.has(`${cleanSourceId}_COPY_${counter}`)) {
    counter += 1;
  }

  return `${cleanSourceId}_COPY_${counter}`;
}

export function reorderArray(list = [], fromIndex, toIndex) {
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

export function isCountedQuestionType(type) {
  return (
    type !== SURVEY_QUESTION_TYPES.INFO &&
    type !== POST_REMINDER_TYPE &&
    type !== EDITOR_PAGE_BREAK_TYPE
  );
}

export function computeQuestionDisplayNumbers(items = []) {
  let count = 0;
  return (Array.isArray(items) ? items : []).map((item) => {
    if (isCountedQuestionType(item?.type)) {
      count += 1;
      return count;
    }
    return null;
  });
}

function derivePostOptionLabel(post = {}, index = 0, feedName = "") {
  const explicitName = String(post?.name || "").trim();
  if (explicitName) return feedName ? `${feedName} · ${explicitName}` : explicitName;

  const author = String(post?.author || post?.username || "").trim();
  const text = String(post?.text || post?.caption || post?.body || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let base = `Post ${index + 1}`;
  if (author && text) base = `${author}: ${text.slice(0, 80)}`;
  else if (author) base = author;
  else if (text) base = text.slice(0, 80);

  return feedName ? `${feedName} · ${base}` : base;
}

function makePostReminderOptionValue(feedId, postId) {
  const safeFeedId = String(feedId || "").trim();
  const safePostId = String(postId || "").trim();
  return safeFeedId && safePostId ? `${safeFeedId}::${safePostId}` : "";
}

function parsePostReminderOptionValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return { feedId: "", postId: "" };

  const marker = raw.indexOf("::");
  if (marker === -1) return { feedId: "", postId: raw };

  return {
    feedId: raw.slice(0, marker),
    postId: raw.slice(marker + 2),
  };
}

function getRelevantFeedIdsForQuestion(q, linkedFeeds = []) {
  const linkedFeedIds = (Array.isArray(linkedFeeds) ? linkedFeeds : [])
    .map((feed) => String(feed?.feed_id || "").trim())
    .filter(Boolean);

  const visibleFeedIds = normalizeVisibleInFeeds(q?.visible_in_feeds);

  if (visibleFeedIds.length === 0) return linkedFeedIds;

  const linkedSet = new Set(linkedFeedIds);
  return visibleFeedIds.filter((feedId) => linkedSet.has(feedId));
}

function getAvailablePostsForQuestion(q, linkedFeeds = [], linkedFeedPostsMap = {}) {
  if (q?.type !== POST_REMINDER_TYPE) return [];

  const relevantFeedIds = getRelevantFeedIdsForQuestion(q, linkedFeeds);
  const linkedFeedLookup = new Map(
    (Array.isArray(linkedFeeds) ? linkedFeeds : []).map((feed) => [
      String(feed?.feed_id || "").trim(),
      feed,
    ])
  );


  const seen = new Set();
  const out = [];

  relevantFeedIds.forEach((feedId) => {
    const posts = Array.isArray(linkedFeedPostsMap?.[feedId])
      ? linkedFeedPostsMap[feedId]
      : [];
    const feed = linkedFeedLookup.get(feedId);
    const feedName = String(feed?.name || feedId || "").trim();

    posts.forEach((post, postIndex) => {
      const postId = String(post?.id || "").trim();
      if (!postId) return;

      const dedupeKey = `${feedId}::${postId}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      out.push({
        ...post,
        _feed_id: feedId,
        _feed_name: feedName,
        _option_label: derivePostOptionLabel(post, postIndex, feedName),
      });
    });
  });

  return out;
}

export function normalizeQuestionForEditor(q = {}, index = 0) {
  const type = q?.type || SURVEY_QUESTION_TYPES.TEXT;

  if (type === EDITOR_PAGE_BREAK_TYPE) {
    return {
      _editorId: q?._editorId || makeEditorId(),
      id: q?.id || `page_break_${index + 1}`,
      type: EDITOR_PAGE_BREAK_TYPE,
      text: "",
      required: false,
      choices: [],
      rows: [],
      columns: [],
      min: 1,
      max: 7,
      left_label: "",
      right_label: "",
      placeholder: "",
      visible_if: null,
      visible_in_feeds: [],
      feed_overrides: {},
      visible_to_group_ids: [],
      post_id: "",
      post_label: "",
      post_feed_id: "",
      next_delay_seconds: normalizePageDelaySeconds(q?.next_delay_seconds),
      meta: q?.meta || {},
    };
  }

  const normalizedId = sanitizeQuestionId(q?.id, "");
  const recallEnabled = !!(q?.recall_enabled ?? q?.meta?.recall_enabled ?? false);

  return {
    _editorId: q?._editorId || makeEditorId(),
    id: normalizedId,
    type,
    text: normalizeRichTextHtml(q?.text ?? ""),
    required: isEditorDisplayOnlyType({ type, recall_enabled: recallEnabled }) ? false : !!q?.required,
    choices: ensureChoiceArray(q?.choices),
    rows:
      type === SURVEY_QUESTION_TYPES.BIPOLAR
        ? ensureBipolarRowArray(q?.rows, normalizedId)
        : type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
            type === SURVEY_QUESTION_TYPES.MATRIX_MULTI
          ? ensureMatrixRowsFromQuestionId(q?.rows, normalizedId)
          : [],
    columns: ensureMatrixArray(q?.columns, "col"),
    min: Number.isFinite(q?.min) ? q.min : 1,
    max: Number.isFinite(q?.max) ? q.max : 7,
    left_label: String(q?.left_label ?? ""),
    right_label: String(q?.right_label ?? ""),
    placeholder: String(q?.placeholder ?? ""),
    visible_if: q?.visible_if || null,
    visible_in_feeds: normalizeVisibleInFeeds(q?.visible_in_feeds),
    feed_overrides: normalizeFeedOverridesMap(q?.feed_overrides),
    visible_to_group_ids: uniqueStringList(q?.visible_to_group_ids),
    post_id: String(q?.post_id ?? ""),
    post_label: String(q?.post_label ?? ""),
    post_feed_id: String(q?.post_feed_id ?? q?.meta?.post_feed_id ?? ""),
    apply_feed_randomization:
      (q?.apply_feed_randomization ?? q?.meta?.apply_feed_randomization ?? true) !== false,
    reminder_interactive:
      !!(q?.reminder_interactive ?? q?.meta?.reminder_interactive ?? false),
    recall_enabled: recallEnabled,
    recall_distractor_texts: normalizeRecallDistractorTextsForEditor(
      q?.recall_distractor_texts ?? q?.meta?.recall_distractor_texts
    ),
    is_attention_check: ATTENTION_CHECK_ELIGIBLE_TYPES.includes(type) && !!q?.is_attention_check,
    attention_check_value: String(q?.attention_check_value ?? ""),
    meta: q?.meta || {},
  };
}

export function flattenSurveyPagesForEditor(survey) {
  const sourceSurvey =
    survey && typeof survey === "object" ? survey : makeEmptySurvey();

  const pages = Array.isArray(sourceSurvey.pages) ? sourceSurvey.pages : [];
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
        _editorId: `editor_page_break_${pageIndex + 1}`,
        id: `page_break_${pageIndex + 1}`,
        type: EDITOR_PAGE_BREAK_TYPE,
        next_delay_seconds: normalizePageDelaySeconds(page?.next_delay_seconds),
      },
      flat.length
    )
  );
}
  });

  return flat;
}

export function buildSurveyPagesFromFlatQuestions(survey, items) {
  const safeSurvey =
    survey && typeof survey === "object" ? survey : makeEmptySurvey();

  const flatItems = Array.isArray(items) ? items : [];
  const existingPages = Array.isArray(safeSurvey.pages) ? safeSurvey.pages : [];
  const splitPages = [];
let currentQuestions = [];

flatItems.forEach((item) => {
  if (item?.type === EDITOR_PAGE_BREAK_TYPE) {
    splitPages.push({
      questions: currentQuestions,
      next_delay_seconds: normalizePageDelaySeconds(item?.next_delay_seconds),
    });
    currentQuestions = [];
  } else {
    currentQuestions.push(
      normalizeQuestionForEditor(item, currentQuestions.length)
    );
  }
});

splitPages.push({
  questions: currentQuestions,
  next_delay_seconds: 0,
});

const pages = splitPages.map((pageData, pageIndex) => {
  const existingPage = existingPages[pageIndex] || {};
  return {
    id: existingPage.id || `page_${pageIndex + 1}`,
    title: String(existingPage.title ?? ""),
    description: String(existingPage.description ?? ""),
    next_delay_seconds: normalizePageDelaySeconds(
      pageData?.next_delay_seconds ?? existingPage?.next_delay_seconds
    ),
    questions: (pageData?.questions || []).map((q, i) =>
      normalizeQuestionForEditor(q, i)
    ),
  };
});

  const nextSurvey = {
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

  return reconcileSurveyPageBlocks(nextSurvey);
}


export function normalizeSurveyExperimentGroups(survey) {
  const safeSurvey = survey && typeof survey === "object" ? survey : {};
  const sourceGroups = Array.isArray(safeSurvey.experiment_groups)
    ? safeSurvey.experiment_groups
    : [];

  const usedIds = new Set();

  return sourceGroups.map((rawGroup, index) => {
    const group = rawGroup && typeof rawGroup === "object" ? rawGroup : {};
    let groupId = String(group.id || `group_${index + 1}`).trim() || `group_${index + 1}`;
    if (usedIds.has(groupId)) {
      let suffix = 2;
      const baseId = groupId;
      while (usedIds.has(`${baseId}_${suffix}`)) suffix += 1;
      groupId = `${baseId}_${suffix}`;
    }
    usedIds.add(groupId);

    return {
      id: groupId,
      name: String(group.name || `Group ${index + 1}`),
      // Empty means "use the survey's own feed_sequence_ids/linked_feed_ids"
      // (today's behavior, unchanged) — only meaningful for feed_then_survey/
      // multi_feed_then_survey studies reached via a direct survey link.
      feed_sequence_ids: uniqueStringArrayLocal(group.feed_sequence_ids),
    };
  });
}

export function normalizeSurveyPageBlocks(survey) {
  const safeSurvey = survey && typeof survey === "object" ? survey : {};
  const pages = Array.isArray(safeSurvey.pages) ? safeSurvey.pages : [];
  const validPageIds = pages
    .map((page, index) => String(page?.id || `page_${index + 1}`).trim())
    .filter(Boolean);
  const validSet = new Set(validPageIds);
  const assigned = new Set();
  const sourceBlocks = Array.isArray(safeSurvey.page_blocks)
    ? safeSurvey.page_blocks
    : [];
  const validGroupIdSet = new Set(
    normalizeSurveyExperimentGroups(safeSurvey).map((group) => group.id)
  );

  const blocks = sourceBlocks.map((rawBlock, blockIndex) => {
    const block = rawBlock && typeof rawBlock === "object" ? rawBlock : {};
    const pageIds = uniqueStringList(block.page_ids)
      .filter((pageId) => validSet.has(pageId))
      .filter((pageId) => {
        if (assigned.has(pageId)) return false;
        assigned.add(pageId);
        return true;
      });

    const visibleToGroupIds = uniqueStringList(block.visible_to_group_ids).filter(
      (groupId) => validGroupIdSet.has(groupId)
    );

    return {
      id: String(block.id || `block_${blockIndex + 1}`),
      title: String(block.title || `Block ${blockIndex + 1}`),
      randomize_pages: !!block.randomize_pages,
      page_ids: pageIds,
      visible_to_group_ids: visibleToGroupIds,
    };
  });

  if (!blocks.length) {
    return [
      {
        id: "block_1",
        title: "Survey pages",
        randomize_pages: false,
        page_ids: validPageIds,
        visible_to_group_ids: [],
      },
    ];
  }

  const unassigned = validPageIds.filter((pageId) => !assigned.has(pageId));
  if (unassigned.length) {
    blocks[blocks.length - 1] = {
      ...blocks[blocks.length - 1],
      page_ids: [...blocks[blocks.length - 1].page_ids, ...unassigned],
    };
  }

  return blocks;
}

export function reconcileSurveyPageBlocks(survey) {
  const safeSurvey = survey && typeof survey === "object" ? survey : makeEmptySurvey();
  const withGroups = {
    ...safeSurvey,
    experiment_groups: normalizeSurveyExperimentGroups(safeSurvey),
  };
  return {
    ...withGroups,
    page_blocks: normalizeSurveyPageBlocks(withGroups),
  };
}

// Shared by SurveyEditor's "Pages and questions" list and StudyOutlineModal
// (the "Study overview" popup) — both flatten survey.pages into one list
// with page-break marker rows in between; this maps each flat index to its
// 1-based page number. A page-break row itself is labeled with the page
// number that FOLLOWS it (not the one it closes), which lines up naturally
// with rendering a block-boundary divider directly on/above that row when
// the new page belongs to a different block.
export function computePageNumbersForQuestions(items = []) {
  let page = 1;
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item?.type === EDITOR_PAGE_BREAK_TYPE) {
      page += 1;
      return page;
    }
    return page;
  });
}

// Returns one entry per flat item: null (no divider needed here), or
// { block, blockIndex } when this item starts a page belonging to a
// different block than the previous rendered page. Only meaningful once a
// survey actually has more than one block — every survey implicitly has
// exactly one ("All pages"/"Survey pages", from normalizeSurveyPageBlocks'
// no-blocks-defined fallback), and showing a divider for that on every
// single survey would be pure noise for the vast majority that never touch
// this feature.
export function computeBlockBoundariesForQuestions(survey, currentQuestions, pageNumbers) {
  const pages = Array.isArray(survey?.pages) ? survey.pages : [];
  const blocks = normalizeSurveyPageBlocks(survey);

  if (blocks.length <= 1) {
    return currentQuestions.map(() => null);
  }

  const pageIdToBlockIndex = new Map();
  blocks.forEach((block, blockIndex) => {
    block.page_ids.forEach((pageId) => pageIdToBlockIndex.set(pageId, blockIndex));
  });

  function blockIndexForPageNumber(pageNumber) {
    const page = pages[pageNumber - 1];
    const pageId = String(page?.id || `page_${pageNumber}`);
    return pageIdToBlockIndex.has(pageId) ? pageIdToBlockIndex.get(pageId) : null;
  }

  let lastBlockIndex = null;
  let lastPageNumber = null;

  return currentQuestions.map((item, i) => {
    const pageNumber = pageNumbers[i];
    if (pageNumber === lastPageNumber) return null;
    lastPageNumber = pageNumber;

    const blockIndex = blockIndexForPageNumber(pageNumber);
    if (blockIndex === lastBlockIndex) return null;
    lastBlockIndex = blockIndex;

    return blockIndex != null ? { block: blocks[blockIndex], blockIndex } : null;
  });
}

function BlockBoundaryDivider({ boundary }) {
  if (!boundary?.block) return null;
  const { block, blockIndex } = boundary;
  const groupCount = (block.visible_to_group_ids || []).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        margin: "18px 0 10px",
        padding: "7px 12px",
        borderRadius: 8,
        background: "var(--admin-accent-soft)",
        border: "1px solid var(--admin-accent-border)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "var(--admin-accent-ink)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Block {blockIndex + 1}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--admin-accent-ink)" }}>{block.title}</span>
      {block.randomize_pages && (
        <span style={{ fontSize: 10.5, color: "var(--admin-accent)", fontWeight: 600 }}>Pages randomised</span>
      )}
      {groupCount > 0 && (
        <span style={{ fontSize: 10.5, color: "var(--admin-accent)", fontWeight: 600 }}>
          Visible to {groupCount} group{groupCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

// Shared by the Study overview modal's search/filter box — matches on
// question id, plain-text question content (HTML-stripped, same helper the
// collapsed-row preview already uses), or type label. Page-break rows always
// pass through so the filtered list keeps its structural page markers rather
// than collapsing pages together.
export function matchesQuestionFilter(item, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  if (item?.type === EDITOR_PAGE_BREAK_TYPE) return true;

  const haystack = [
    item?.id,
    stripHtmlForEmptyCheck(item?.text || ""),
    QUESTION_TYPE_LABELS[item?.type] || item?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

// Shared by SurveyEditor's main question list and StudyOutlineModal's
// outline list — a question id used more than once in the same survey is a
// real problem (visible_in_feeds/feed_overrides/visible_to_group_ids/CSV
// columns all key off it), but nothing previously warned about it unless
// the id happened to be auto-generated via Copy.
export function computeDuplicateQuestionIds(questions) {
  const counts = new Map();
  (Array.isArray(questions) ? questions : []).forEach((q) => {
    if (q?.type === EDITOR_PAGE_BREAK_TYPE) return;
    const id = String(q?.id || "").trim();
    if (!id) return;
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id)
  );
}

// Same shared-by-both-lists pattern as computeDuplicateQuestionIds above. A
// question's visible_if.question_id can go stale three ways: the source
// question was deleted, reordered to after this one (isQuestionVisible has
// no forward-reference support, same as ConditionalDisplayEditor's picker),
// or changed to a type VISIBLE_IF_ELIGIBLE_TYPES no longer covers. Returns
// the ids of the *dependent* questions (the ones whose own condition is now
// broken), not the missing source ids.
export function computeBrokenVisibleIfQuestionIds(questions) {
  const list = Array.isArray(questions) ? questions : [];
  const indexById = new Map();
  const typeById = new Map();
  list.forEach((q, i) => {
    const id = String(q?.id || "").trim();
    if (!id) return;
    indexById.set(id, i);
    typeById.set(id, q?.type);
  });

  const broken = new Set();
  list.forEach((q, i) => {
    const sourceId = String(q?.visible_if?.question_id || "").trim();
    if (!sourceId) return;
    const id = String(q?.id || "").trim();
    if (!id) return;

    const sourceIndex = indexById.get(sourceId);
    const sourceType = typeById.get(sourceId);
    const sourceIsValid =
      sourceIndex !== undefined &&
      sourceIndex < i &&
      VISIBLE_IF_ELIGIBLE_TYPES.includes(sourceType);

    if (!sourceIsValid) broken.add(id);
  });

  return broken;
}

function makePageBlock(index = 0) {
  return {
    id: `block_${Date.now()}_${index}`,
    title: `Block ${index + 1}`,
    randomize_pages: false,
    page_ids: [],
    visible_to_group_ids: [],
  };
}

function uniqueStringArrayLocal(arr = []) {
  return Array.from(
    new Set((Array.isArray(arr) ? arr : []).map((v) => String(v ?? "").trim()).filter(Boolean))
  );
}

function makeExperimentGroup(index = 0) {
  return {
    id: `group_${Date.now()}_${index}`,
    name: `Group ${index + 1}`,
    feed_sequence_ids: [],
  };
}

export function getQuestionList(survey) {
  return flattenSurveyPagesForEditor(survey);
}

export function setQuestionList(survey, questions) {
  return buildSurveyPagesFromFlatQuestions(survey, questions);
}

export function makePageBreakForEditor(index = 0) {
  return normalizeQuestionForEditor(
    {
      id: `page_break_${Date.now()}_${index}`,
      type: EDITOR_PAGE_BREAK_TYPE,
    },
    index
  );
}

export function makeBackendQuestionFromType(type, index = 0) {
  if (type === EDITOR_PAGE_BREAK_TYPE) {
    return makePageBreakForEditor(index);
  }

  const base = makeQuestionByType(type);
  const fallbackId = sanitizeQuestionId(base?.id, `Q_${Date.now()}`);

  const question = {
    id:
      base?.id && !isQuestionIdAutoGenerated(base.id)
        ? sanitizeQuestionId(base.id, fallbackId)
        : `Q_${Date.now()}`,
    type,
    text: normalizeRichTextHtml(String(base?.text ?? base?.label ?? "")),
    required: isEditorDisplayOnlyType(type) ? false : !!base?.required,
    choices: [],
    rows: [],
    columns: [],
    min: Number.isFinite(base?.min) ? base.min : 1,
    max: Number.isFinite(base?.max) ? base.max : 7,
    left_label: String(base?.left_label ?? base?.min_label ?? ""),
    right_label: String(base?.right_label ?? base?.max_label ?? ""),
    placeholder: String(base?.placeholder ?? ""),
    visible_if: base?.visible_if || null,
    visible_in_feeds: normalizeVisibleInFeeds(base?.visible_in_feeds),
    feed_overrides: normalizeFeedOverridesMap(base?.feed_overrides),
    post_id: String(base?.post_id ?? ""),
    post_label: String(base?.post_label ?? ""),
    post_feed_id: String(base?.post_feed_id ?? ""),
    apply_feed_randomization: base?.apply_feed_randomization !== false,
    reminder_interactive: !!base?.reminder_interactive,
    recall_enabled: !!base?.recall_enabled,
    recall_distractor_texts: normalizeRecallDistractorTextsForEditor(base?.recall_distractor_texts),
    meta: base?.meta || {},
  };

  if (type === POST_REMINDER_TYPE) {
    question.text =
      normalizeRichTextHtml(
        String(
          base?.text ??
            "<p><b>Please look at this post again before answering.</b></p>"
        )
      ) ||
      "<p><b>Please look at this post again before answering.</b></p>";
    question.required = false;
  }

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
              value: makeNumericValue(i),
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
    const srcCols =
      Array.isArray(base?.columns) && base.columns.length ? base.columns : [];
    question.rows = ensureMatrixRowsFromQuestionId(srcRows, question.id);
    question.columns = ensureMatrixArray(srcCols, "col");
  }

  if (type === SURVEY_QUESTION_TYPES.BIPOLAR) {
    const srcRows = Array.isArray(base?.rows) && base.rows.length ? base.rows : [];
    question.rows = ensureBipolarRowArray(srcRows, question.id);
  }

  return normalizeQuestionForEditor(question, index);
}

export function buildSavedQuestion(q, index) {
  const cleanQ = normalizeQuestionForEditor(q, index);

  return {
    id: sanitizeQuestionId(cleanQ.id, `Q_${index + 1}`),
    type: cleanQ.type,
    text: cleanQ.text,
    description: "",
    required: isEditorDisplayOnlyType(cleanQ) ? false : !!cleanQ.required,
    choices:
      cleanQ.type === SURVEY_QUESTION_TYPES.SINGLE ||
      cleanQ.type === SURVEY_QUESTION_TYPES.MULTI ||
      cleanQ.type === SURVEY_QUESTION_TYPES.DROPDOWN
        ? ensureChoiceArray(cleanQ.choices)
        : [],
    rows:
      cleanQ.type === SURVEY_QUESTION_TYPES.BIPOLAR
        ? (Array.isArray(cleanQ.rows) ? cleanQ.rows : []).map((row, i) => ({
            value: preserveEmptyOrSanitize(
              row?.value,
              makeMatrixRowValue(cleanQ.id, i)
            ),
            label: String(
              row?.label ?? row?.left_label ?? `Row ${i + 1}`
            ).trim(),
            left_label: String(row?.left_label ?? row?.label ?? "").trim(),
            right_label: String(row?.right_label ?? "").trim(),
            is_attention_check: !!row?.is_attention_check,
            attention_check_value: String(row?.attention_check_value ?? ""),
          }))
        : cleanQ.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
            cleanQ.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI
          ? ensureMatrixRowsFromQuestionId(cleanQ.rows, cleanQ.id).map((row) => ({
              ...row,
              // Only MATRIX_SINGLE has a UI path to ever set this — gated
              // again here anyway, same defensive posture as every other
              // type-eligibility check in this feature.
              is_attention_check:
                cleanQ.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE && !!row.is_attention_check,
              attention_check_value:
                cleanQ.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE
                  ? row.attention_check_value
                  : "",
            }))
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
    visible_in_feeds: normalizeVisibleInFeeds(cleanQ.visible_in_feeds),
    feed_overrides: pruneFeedOverridesMap(
      cleanQ.feed_overrides,
      normalizeVisibleInFeeds(cleanQ.visible_in_feeds)
    ),
    visible_to_group_ids: uniqueStringList(cleanQ.visible_to_group_ids),
    post_id: cleanQ.type === POST_REMINDER_TYPE ? String(cleanQ.post_id || "") : "",
    post_label:
      cleanQ.type === POST_REMINDER_TYPE ? String(cleanQ.post_label || "") : "",
    post_feed_id:
      cleanQ.type === POST_REMINDER_TYPE
        ? String(cleanQ.post_feed_id || "")
        : "",
    apply_feed_randomization:
      cleanQ.type === POST_REMINDER_TYPE
        ? cleanQ.apply_feed_randomization !== false
        : true,
    reminder_interactive:
      cleanQ.type === POST_REMINDER_TYPE
        ? !!cleanQ.reminder_interactive
        : false,
    recall_enabled:
      cleanQ.type === POST_REMINDER_TYPE ? !!cleanQ.recall_enabled : false,
    recall_distractor_texts:
      cleanQ.type === POST_REMINDER_TYPE
        ? normalizeRecallDistractorTextsForEditor(cleanQ.recall_distractor_texts)
        : normalizeRecallDistractorTextsForEditor([]),
    meta:
      cleanQ.type === POST_REMINDER_TYPE
        ? {
            ...(cleanQ.meta || {}),
            post_feed_id: String(cleanQ.post_feed_id || ""),
            apply_feed_randomization: cleanQ.apply_feed_randomization !== false,
            reminder_interactive: !!cleanQ.reminder_interactive,
            recall_enabled: !!cleanQ.recall_enabled,
            recall_distractor_texts: normalizeRecallDistractorTextsForEditor(cleanQ.recall_distractor_texts),
          }
        : cleanQ.meta || {},
    randomize_options: false,
    is_attention_check:
      ATTENTION_CHECK_ELIGIBLE_TYPES.includes(cleanQ.type) && !!cleanQ.is_attention_check,
    attention_check_value:
      ATTENTION_CHECK_ELIGIBLE_TYPES.includes(cleanQ.type) && cleanQ.is_attention_check
        ? String(cleanQ.attention_check_value || "")
        : "",
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

function PlusIcon({ size = 15 }) {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CopyIcon({ size = 16 }) {
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function BoldIcon({ size = 14 }) {
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
      <path d="M7 5h6a4 4 0 0 1 0 8H7z" />
      <path d="M7 13h7a4 4 0 0 1 0 8H7z" />
    </svg>
  );
}

function ItalicIcon({ size = 14 }) {
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
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function ListIcon({ size = 14 }) {
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
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function OrderedListIcon({ size = 14 }) {
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
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 7V4l-1 1" />
      <path d="M3 10h1a1 1 0 0 1 0 2H3l2 2h-2" />
      <path d="M3 16h2a1 1 0 0 1 0 2H3m1-3v6" />
    </svg>
  );
}

function EyeIcon({ size = 14 }) {
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
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UsersIcon({ size = 14 }) {
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GitBranchIcon({ size = 14 }) {
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
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function TextCursorIcon({ size = 14 }) {
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
      <path d="M4 7V5h16v2" />
      <path d="M12 5v14" />
      <path d="M8 19h8" />
    </svg>
  );
}

function ChevronDownIcon({ size = 14, open = false }) {
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
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
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
    <IconButton
      onClick={onClick}
      title={title}
      aria-label={title}
      danger={danger}
      disabled={disabled}
      style={style}
    >
      {children || <TrashIcon size={size} />}
    </IconButton>
  );
}

function SecondaryPillButton({
  onClick,
  active = false,
  children,
  title,
  disabled = false,
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--admin-accent-border)" : "var(--admin-border)"}`,
        background: active ? "var(--admin-accent-soft)" : "var(--admin-surface)",
        color: active ? "var(--admin-accent-ink)" : disabled ? "var(--admin-muted-2)" : "var(--admin-text)",
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function DragHandle({ onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title="Drag to reorder"
      style={{
        width: INPUT_HEIGHT,
        height: INPUT_HEIGHT,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: "1px solid var(--admin-border)",
        background: "var(--admin-surface)",
        cursor: "grab",
        fontSize: 15,
        color: "var(--admin-muted)",
        userSelect: "none",
      }}
    >
      ⋮⋮
    </div>
  );
}

// Kept as a compact pill button rather than swapped to the shared `Toggle`
// switch — this sits inline in QuestionActions' tight horizontal action bar
// (chevron, drag handle, up/down, copy, delete), and Toggle's label+switch
// layout wants to span a full settings-row width, which doesn't fit here.
function RequiredToggleButton({ active, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={active ? "Required" : "Optional"}
      style={{
        height: INPUT_HEIGHT,
        minWidth: 92,
        padding: "0 12px",
        borderRadius: 8,
        border: `1px solid ${active ? "var(--admin-accent)" : "var(--admin-border)"}`,
        background: active ? "var(--admin-accent-soft)" : "var(--admin-surface)",
        color: active ? "var(--admin-accent-ink)" : disabled ? "var(--admin-muted-2)" : "var(--admin-text)",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {active ? "Required" : "Optional"}
    </button>
  );
}

function TopField({ label, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 4,
          height: TOP_ROW_LABEL_HEIGHT,
          lineHeight: `${TOP_ROW_LABEL_HEIGHT}px`,
        }}
      >
        {label}
      </div>
      {children}
    </div>
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
        height: INPUT_HEIGHT,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid var(--admin-border)",
        boxSizing: "border-box",
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
        height: INPUT_HEIGHT,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid var(--admin-border)",
        boxSizing: "border-box",
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
        border: "1px solid var(--admin-border)",
        resize: "vertical",
        boxSizing: "border-box",
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
        height: INPUT_HEIGHT,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid var(--admin-border)",
        background: "var(--admin-surface)",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </select>
  );
}

function FieldBlock({ label, children, hint = "" }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      {children}
      {hint ? (
        <div style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function RichToolbarButton({ title, onMouseDown, active = false, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={onMouseDown}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: `1px solid ${active ? "var(--admin-accent)" : "var(--admin-border)"}`,
        background: active ? "var(--admin-accent-soft)" : "var(--admin-surface)",
        color: active ? "var(--admin-accent-ink)" : "var(--admin-text)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function RichTextEditor({ value, onChange, placeholder = "Question text" }) {
  const editorRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    insertUnorderedList: false,
    insertOrderedList: false,
  });

  const normalizedValue = normalizeRichTextHtml(value);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    if (el.innerHTML !== normalizedValue) {
      el.innerHTML = normalizedValue || "";
    }
  }, [normalizedValue]);

  function updateFormats() {
    try {
      setFormats({
        bold: !!document.queryCommandState("bold"),
        italic: !!document.queryCommandState("italic"),
        insertUnorderedList: !!document.queryCommandState("insertUnorderedList"),
        insertOrderedList: !!document.queryCommandState("insertOrderedList"),
      });
    } catch {
      setFormats({
        bold: false,
        italic: false,
        insertUnorderedList: false,
        insertOrderedList: false,
      });
    }
  }

  function emitChange() {
    const el = editorRef.current;
    if (!el) return;

    const rawHtml = el.innerHTML || "";
    const textOnly = stripHtmlForEmptyCheck(rawHtml);

    if (!textOnly) {
      onChange("");
      return;
    }

    onChange(rawHtml);
  }

  function runCommand(command, commandValue = null) {
    const el = editorRef.current;
    if (!el) return;

    el.focus();

    try {
      document.execCommand(command, false, commandValue);
    } catch {}

    if (command === "formatBlock") {
      try {
        document.execCommand("defaultParagraphSeparator", false, "p");
      } catch {}
    }

    updateFormats();
    emitChange();
  }

  function handleInput() {
    emitChange();
    updateFormats();
  }

  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") || "";
    try {
      document.execCommand("insertText", false, text);
    } catch {
      const el = editorRef.current;
      if (!el) return;
      el.innerText = `${el.innerText || ""}${text}`;
    }
    emitChange();
    updateFormats();
  }

  const isEmpty = !stripHtmlForEmptyCheck(normalizedValue);

  return (
    <div
      style={{
        border: `1px solid ${focused ? "var(--admin-accent)" : "var(--admin-border)"}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--admin-surface)",
        boxShadow: focused ? "0 0 0 3px var(--admin-accent-ring)" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: 8,
          borderBottom: "1px solid var(--admin-border-subtle)",
          background: "var(--admin-surface-alt)",
          flexWrap: "wrap",
        }}
      >
        <RichToolbarButton
          title="Bold"
          active={formats.bold}
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand("bold");
          }}
        >
          <BoldIcon size={14} />
        </RichToolbarButton>

        <RichToolbarButton
          title="Italic"
          active={formats.italic}
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand("italic");
          }}
        >
          <ItalicIcon size={14} />
        </RichToolbarButton>

        <RichToolbarButton
          title="Bullet list"
          active={formats.insertUnorderedList}
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand("insertUnorderedList");
          }}
        >
          <ListIcon size={14} />
        </RichToolbarButton>

        <RichToolbarButton
          title="Numbered list"
          active={formats.insertOrderedList}
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand("insertOrderedList");
          }}
        >
          <OrderedListIcon size={14} />
        </RichToolbarButton>

        <RichToolbarButton
          title="Paragraph"
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand("formatBlock", "p");
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700 }}>P</span>
        </RichToolbarButton>
      </div>

      <div style={{ position: "relative" }}>
        {isEmpty && !focused && (
          <div
            style={{
              position: "absolute",
              left: 12,
              top: 12,
              color: "var(--admin-muted-2)",
              pointerEvents: "none",
              fontSize: 14,
            }}
          >
            {placeholder}
          </div>
        )}

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => {
            setFocused(true);
            updateFormats();
          }}
          onBlur={() => {
            setFocused(false);
            emitChange();
          }}
          onInput={handleInput}
          onKeyUp={updateFormats}
          onMouseUp={updateFormats}
          onPaste={handlePaste}
          style={{
            minHeight: 120,
            padding: 12,
            outline: "none",
            lineHeight: 1.5,
            fontSize: 14,
          }}
        />
      </div>
    </div>
  );
}

function InsertAtBorderButton({ position = "top", onInsert }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [selectedType, setSelectedType] = useState(SURVEY_QUESTION_TYPES.TEXT);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const isTop = position === "top";
  const isActive = hovered || open;

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        top: isTop ? -11 : "auto",
        bottom: !isTop ? -11 : "auto",
        zIndex: 6,
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={isTop ? "Insert above" : "Insert below"}
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          border: "1px solid var(--admin-border)",
          background: "var(--admin-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          boxShadow: isActive ? "var(--admin-shadow-sm)" : "none",
          opacity: isActive ? 1 : 0.4,
          transition:
            "opacity 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
          transform: isActive ? "scale(1)" : "scale(0.96)",
        }}
      >
        <PlusIcon size={10} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: isTop ? 28 : "auto",
            bottom: !isTop ? 28 : "auto",
            minWidth: 220,
            padding: 10,
            borderRadius: 10,
            border: "1px solid var(--admin-border)",
            background: "var(--admin-surface)",
            boxShadow: "var(--admin-shadow-md)",
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 6 }}>Add question</div>

          <SelectInput value={selectedType} onChange={setSelectedType}>
            {INSERTABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t] || t}
              </option>
            ))}
          </SelectInput>

          <button
            type="button"
            onClick={() => {
              onInsert(selectedType);
              setOpen(false);
            }}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid var(--admin-border)",
              background: "var(--admin-surface)",
              cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// Compact per-row attention-check control, shared by the matrix rows editor
// and the bipolar rows editor — a small pill toggle that expands into a
// column-value picker once turned on. Deliberately not the full FieldBlock+
// Toggle treatment ChoiceEditorBlock uses for a whole question — this lives
// inline in a dense row list, so it stays small.
function RowAttentionCheckControl({ isAttentionCheck, attentionCheckValue, columns, onToggle, onValueChange }) {
  const safeColumns = (columns || []).filter((c) => String(c?.value || "").trim());

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, gridColumn: "1 / -1", paddingLeft: 2 }}>
      <button
        type="button"
        onClick={() => onToggle(!isAttentionCheck)}
        title="Mark this row as an attention check — it's excluded from the composite's mean/reliability and never gets shuffled or moved by page randomization."
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 999,
          border: "1px solid",
          cursor: "pointer",
          borderColor: isAttentionCheck ? "var(--admin-accent-border)" : "var(--admin-border)",
          background: isAttentionCheck ? "var(--admin-accent-soft)" : "var(--admin-surface)",
          color: isAttentionCheck ? "var(--admin-accent-ink)" : "var(--admin-muted)",
        }}
      >
        {isAttentionCheck ? "✓ Attention check" : "Mark as attention check"}
      </button>

      {isAttentionCheck && (
        <SelectInput
          value={attentionCheckValue}
          onChange={onValueChange}
          disabled={!safeColumns.length}
          style={{ height: 30, fontSize: 12, maxWidth: 220 }}
        >
          <option value="">
            {safeColumns.length ? "Expected answer…" : "Add columns first"}
          </option>
          {safeColumns.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label || c.value}
            </option>
          ))}
        </SelectInput>
      )}
    </div>
  );
}

function ItemTableEditor({
  title,
  items,
  onChange,
  attentionCheckColumns = null,
  prefix = "opt",
  addLabel = "Add row",
  valuePlaceholder = "Value",
  labelPlaceholder = "Label",
}) {
  const safeItems = Array.isArray(items) ? items : [];

  function updateItem(index, patch) {
    onChange(safeItems.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    const nextValue =
      prefix === "opt" || prefix === "col"
        ? makeNumericValue(safeItems.length)
        : makeSequentialValue(prefix, safeItems.length);

    onChange([
      ...safeItems,
      {
        value: nextValue,
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
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        padding: 10,
        background: "var(--admin-surface-alt)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>

      {safeItems.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 8 }}>
          No items yet.
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {safeItems.map((item, i) => (
          <div
            key={`${prefix}_${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <TextInput
              value={item?.value ?? ""}
              onChange={(v) => updateItem(i, { value: v })}
              placeholder={valuePlaceholder}
            />
            <TextInput
              value={item?.label ?? ""}
              onChange={(v) => updateItem(i, { label: v })}
              placeholder={labelPlaceholder}
            />
            <IconOnlyButton
              onClick={() => removeItem(i)}
              title={`Delete ${singularTitle}`}
              danger
            />

            {attentionCheckColumns && (
              <RowAttentionCheckControl
                isAttentionCheck={!!item?.is_attention_check}
                attentionCheckValue={item?.attention_check_value || ""}
                columns={attentionCheckColumns}
                onToggle={(v) =>
                  updateItem(i, {
                    is_attention_check: v,
                    ...(v ? {} : { attention_check_value: "" }),
                  })
                }
                onValueChange={(v) => updateItem(i, { attention_check_value: v })}
              />
            )}
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
          border: "1px solid var(--admin-border)",
          background: "var(--admin-surface)",
          cursor: "pointer",
        }}
      >
        + {addLabel}
      </button>
    </div>
  );
}

function BipolarRowTableEditor({ items, onChange, questionId, columns = null }) {
  const safeItems = Array.isArray(items) ? items : [];

  function updateItem(index, patch) {
    onChange(safeItems.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    onChange([
      ...safeItems,
      {
        value: makeMatrixRowValue(questionId, safeItems.length),
        left_label: "",
        right_label: "",
      },
    ]);
  }

  function removeItem(index) {
    onChange(safeItems.filter((_, i) => i !== index));
  }

  return (
    <div
      style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        padding: 10,
        background: "var(--admin-surface-alt)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        Rows / bipolar anchors
      </div>

      {safeItems.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 8 }}>
          No rows yet.
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {safeItems.map((item, i) => (
          <div
            key={`bipolar_row_${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr 1fr auto",
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
              value={item?.left_label ?? ""}
              onChange={(v) => updateItem(i, { left_label: v })}
              placeholder="Left label"
            />
            <TextInput
              value={item?.right_label ?? ""}
              onChange={(v) => updateItem(i, { right_label: v })}
              placeholder="Right label"
            />
            <IconOnlyButton onClick={() => removeItem(i)} title="Delete row" danger />

            {columns && (
              <RowAttentionCheckControl
                isAttentionCheck={!!item?.is_attention_check}
                attentionCheckValue={item?.attention_check_value || ""}
                columns={columns}
                onToggle={(v) =>
                  updateItem(i, {
                    is_attention_check: v,
                    ...(v ? {} : { attention_check_value: "" }),
                  })
                }
                onValueChange={(v) => updateItem(i, { attention_check_value: v })}
              />
            )}
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
          border: "1px solid var(--admin-border)",
          background: "var(--admin-surface)",
          cursor: "pointer",
        }}
      >
        + Add row
      </button>
    </div>
  );
}

function FeedVisibilityEditor({ availableFeeds, value, onChange }) {
  const safeFeeds = Array.isArray(availableFeeds) ? availableFeeds : [];
  const selected = new Set(normalizeVisibleInFeeds(value));

  function toggleFeed(feedId) {
    const next = new Set(selected);
    if (next.has(feedId)) next.delete(feedId);
    else next.add(feedId);
    onChange(Array.from(next));
  }

  function selectAll() {
    onChange(safeFeeds.map((f) => String(f.feed_id || "")).filter(Boolean));
  }

  function clearSelection() {
    onChange([]);
  }

  if (safeFeeds.length === 0) {
    return (
      <div
        style={{
          border: "1px solid var(--admin-border)",
          borderRadius: 10,
          padding: 12,
          background: "var(--admin-surface-alt)",
          color: "var(--admin-muted)",
          fontSize: 13,
        }}
      >
        Link the survey to feeds first. Question-level feed visibility becomes available once the
        survey has linked feeds.
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        padding: 12,
        background: "var(--admin-surface-alt)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--admin-text)" }}>
          If no feeds are selected, this question is shown in all linked feeds.
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={selectAll}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--admin-border)",
              background: "var(--admin-surface)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Select all
          </button>

          <button
            type="button"
            onClick={clearSelection}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--admin-border)",
              background: "var(--admin-surface)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Show in all
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {safeFeeds.map((feed) => {
          const feedId = String(feed?.feed_id || "").trim();
          if (!feedId) return null;

          return (
            <label
              key={feedId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                padding: "6px 2px",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(feedId)}
                onChange={() => toggleFeed(feedId)}
              />
              <span>{feed?.name || feedId}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function QuestionGroupVisibilityEditor({ experimentGroups, value, onChange }) {
  const safeGroups = Array.isArray(experimentGroups) ? experimentGroups : [];
  const selected = new Set(uniqueStringList(value));

  function toggleGroup(groupId) {
    const next = new Set(selected);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    onChange(Array.from(next));
  }

  function clearSelection() {
    onChange([]);
  }

  return (
    <div
      style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        padding: 12,
        background: "var(--admin-surface-alt)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--admin-text)" }}>
          If no groups are selected, this question is shown to everyone.
        </div>

        <button
          type="button"
          onClick={clearSelection}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--admin-border)",
            background: "var(--admin-surface)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Show to everyone
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {safeGroups.map((group) => {
          const groupId = String(group?.id || "").trim();
          if (!groupId) return null;

          return (
            <label
              key={groupId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                padding: "6px 2px",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(groupId)}
                onChange={() => toggleGroup(groupId)}
              />
              <span>{group?.name || groupId}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// Only SINGLE/DROPDOWN/MULTI/SLIDER/TEXT/TEXTAREA are ever offered as a
// source here (VISIBLE_IF_ELIGIBLE_TYPES) — matrix/bipolar responses are
// objects keyed by row and can't be matched by isQuestionVisible's
// equals/not_equals/includes without extending the evaluator.
function ConditionalDisplayEditor({ eligibleSourceQuestions, value, onChange }) {
  const safeQuestions = Array.isArray(eligibleSourceQuestions)
    ? eligibleSourceQuestions
    : [];
  const rule = value && typeof value === "object" ? value : null;
  const sourceId = String(rule?.question_id || "");
  const sourceQuestion =
    safeQuestions.find((sq) => String(sq?.id || "") === sourceId) || null;
  const isMultiSource = sourceQuestion?.type === SURVEY_QUESTION_TYPES.MULTI;

  const operator = !rule
    ? "equals"
    : Object.prototype.hasOwnProperty.call(rule, "includes")
      ? "includes"
      : Object.prototype.hasOwnProperty.call(rule, "not_equals")
        ? "not_equals"
        : "equals";

  const rawValue = rule ? rule[operator] : "";

  function questionLabel(q) {
    const text = stripHtmlForEmptyCheck(q?.text || "") || q?.id || "";
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  }

  function setSource(nextSourceId) {
    if (!nextSourceId) {
      onChange(null);
      return;
    }
    const nextSource = safeQuestions.find(
      (sq) => String(sq?.id || "") === nextSourceId
    );
    if (!nextSource) return;

    // Seed a valid starting value per type rather than an empty string, so
    // the rule is immediately meaningful (an empty equals/includes almost
    // never matches a real choice value).
    if (nextSource.type === SURVEY_QUESTION_TYPES.MULTI) {
      onChange({
        question_id: nextSourceId,
        includes: nextSource.choices?.[0]?.value ?? "",
      });
    } else if (
      nextSource.type === SURVEY_QUESTION_TYPES.SINGLE ||
      nextSource.type === SURVEY_QUESTION_TYPES.DROPDOWN
    ) {
      onChange({
        question_id: nextSourceId,
        equals: nextSource.choices?.[0]?.value ?? "",
      });
    } else if (nextSource.type === SURVEY_QUESTION_TYPES.SLIDER) {
      // Stored as a string — the real slider response value is always a
      // numeric string (see ui-survey.jsx's handleSliderChange), and
      // isQuestionVisible's equals/not_equals use strict ===.
      onChange({
        question_id: nextSourceId,
        equals: String(nextSource.min ?? 0),
      });
    } else {
      onChange({ question_id: nextSourceId, equals: "" });
    }
  }

  function setOperator(nextOperator) {
    if (!sourceQuestion) return;
    onChange({ question_id: sourceId, [nextOperator]: rawValue ?? "" });
  }

  function setValue(nextValue) {
    if (!sourceQuestion) return;
    onChange({ question_id: sourceId, [operator]: nextValue });
  }

  if (safeQuestions.length === 0) {
    return (
      <div
        style={{
          border: "1px solid var(--admin-border)",
          borderRadius: 10,
          padding: 12,
          background: "var(--admin-surface-alt)",
          color: "var(--admin-muted)",
          fontSize: 13,
        }}
      >
        No earlier text, choice, or slider questions yet to condition this one on.
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        padding: 12,
        background: "var(--admin-surface-alt)",
      }}
    >
      <div style={{ fontSize: 13, color: "var(--admin-text)", marginBottom: 10 }}>
        Only show this question if an earlier answer matches a condition.
        Leave unset to always show it.
      </div>

      <FieldBlock label="Condition based on">
        <SelectInput value={sourceId} onChange={setSource}>
          <option value="">No condition (always show)</option>
          {safeQuestions.map((sq, i) => (
            <option key={sq.id} value={sq.id}>
              {`Q${i + 1} · ${questionLabel(sq)}`}
            </option>
          ))}
        </SelectInput>
      </FieldBlock>

      {sourceQuestion && isMultiSource && (
        <FieldBlock label="and it includes">
          <SelectInput value={String(rawValue ?? "")} onChange={setValue}>
            {(sourceQuestion.choices || []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label || c.value}
              </option>
            ))}
          </SelectInput>
        </FieldBlock>
      )}

      {sourceQuestion && !isMultiSource && (
        <>
          <FieldBlock label="Condition">
            <SelectInput value={operator} onChange={setOperator}>
              <option value="equals">Equals</option>
              <option value="not_equals">Does not equal</option>
            </SelectInput>
          </FieldBlock>

          <FieldBlock
            label="Value"
            hint={
              sourceQuestion.type === SURVEY_QUESTION_TYPES.TEXT ||
              sourceQuestion.type === SURVEY_QUESTION_TYPES.TEXTAREA
                ? "Exact match against the participant's typed answer."
                : ""
            }
          >
            {sourceQuestion.type === SURVEY_QUESTION_TYPES.SINGLE ||
            sourceQuestion.type === SURVEY_QUESTION_TYPES.DROPDOWN ? (
              <SelectInput value={String(rawValue ?? "")} onChange={setValue}>
                <option value="">Select an option</option>
                {(sourceQuestion.choices || []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label || c.value}
                  </option>
                ))}
              </SelectInput>
            ) : sourceQuestion.type === SURVEY_QUESTION_TYPES.SLIDER ? (
              <NumberInput
                value={rawValue ?? ""}
                min={sourceQuestion.min}
                max={sourceQuestion.max}
                onChange={setValue}
              />
            ) : (
              <TextInput
                value={rawValue ?? ""}
                onChange={setValue}
                placeholder="Exact text to match"
              />
            )}
          </FieldBlock>
        </>
      )}

      {rule && (
        <button
          type="button"
          onClick={() => onChange(null)}
          style={{
            marginTop: 4,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--admin-border)",
            background: "var(--admin-surface)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Clear condition
        </button>
      )}
    </div>
  );
}

function FeedOverridesEditor({ availableFeeds, value, onChange }) {
  const safeFeeds = Array.isArray(availableFeeds) ? availableFeeds : [];
  const normalized = normalizeFeedOverridesMap(value);

  function updateFeedText(feedId, nextText) {
    const next = {
      ...normalized,
      [feedId]: {
        ...(normalized[feedId] || {}),
        text: normalizeRichTextHtml(nextText ?? ""),
      },
    };

    onChange(next);
  }

  if (safeFeeds.length === 0) {
    return (
      <div
        style={{
          border: "1px solid var(--admin-border)",
          borderRadius: 10,
          padding: 12,
          background: "var(--admin-surface-alt)",
          color: "var(--admin-muted)",
          fontSize: 13,
        }}
      >
        No linked feeds available for feed-specific question text yet.
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        padding: 12,
        background: "var(--admin-surface-alt)",
      }}
    >
      <div style={{ fontSize: 13, color: "var(--admin-text)", marginBottom: 10 }}>
        Leave a field blank to use the default question text.
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {safeFeeds.map((feed) => {
          const feedId = String(feed?.feed_id || "").trim();
          if (!feedId) return null;

          return (
            <div
              key={feedId}
              style={{
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text)" }}>
                {feed?.name || feedId}
              </div>

              <RichTextEditor
                value={normalized?.[feedId]?.text ?? ""}
                onChange={(v) => updateFeedText(feedId, v)}
                placeholder="Alternative question text for this feed"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostReminderEditor({
  availablePosts,
  value,
  label,
  selectedFeedIds = [],
  selectedPostFeedId = "",
  onChange,
}) {
  const safePosts = Array.isArray(availablePosts) ? availablePosts : [];
  const safeValue = String(value || "").trim();
  const safeSelectedPostFeedId = String(selectedPostFeedId || "").trim();
  const selectedCompositeValue = safeValue
    ? makePostReminderOptionValue(safeSelectedPostFeedId, safeValue) || safeValue
    : "";
  const hasRelevantFeeds = Array.isArray(selectedFeedIds) && selectedFeedIds.length > 0;

  if (!hasRelevantFeeds) {
    return (
      <div
        style={{
          border: "1px solid var(--admin-border)",
          borderRadius: 10,
          padding: 12,
          background: "var(--admin-surface-alt)",
          color: "var(--admin-muted)",
          fontSize: 13,
        }}
      >
        Link this survey to feeds first. Then you can choose which linked-feed post should be shown
        again in the survey.
      </div>
    );
  }

  if (safePosts.length === 0) {
    return (
      <div
        style={{
          border: "1px solid var(--admin-border)",
          borderRadius: 10,
          padding: 12,
          background: "var(--admin-surface-alt)",
          color: "var(--admin-muted)",
          fontSize: 13,
        }}
      >
        No posts were found in the relevant linked feed(s). Save or load posts in those feeds first,
        then choose which one should be shown again in the survey.
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        padding: 12,
        background: "var(--admin-surface-alt)",
      }}
    >
      <SelectInput
        value={selectedCompositeValue}
        onChange={(nextCompositeValue) => {
          const parsed = parsePostReminderOptionValue(nextCompositeValue);
          const nextPostId = parsed.postId;
          const nextFeedId = parsed.feedId;

          const selectedPost = safePosts.find((post) => {
            const postId = String(post?.id || "").trim();
            const feedId = String(post?._feed_id || "").trim();
            return postId === String(nextPostId || "") && feedId === String(nextFeedId || "");
          });

          onChange({
            post_id: String(nextPostId || ""),
            post_label: nextPostId ? String(selectedPost?._option_label || "") : "",
            post_feed_id: nextPostId ? String(selectedPost?._feed_id || nextFeedId || "") : "",
            meta: {
              post_feed_id: nextPostId ? String(selectedPost?._feed_id || nextFeedId || "") : "",
            },
          });
        }}
      >
        <option value="">Select a post</option>
        {safePosts.map((post, postIndex) => {
          const postId = String(post?.id || "").trim();
          const optionFeedId = String(post?._feed_id || "").trim();
          if (!postId || !optionFeedId) return null;

          const optionValue = makePostReminderOptionValue(optionFeedId, postId);

          return (
            <option key={optionValue} value={optionValue}>
              {post._option_label || derivePostOptionLabel(post, postIndex, post?._feed_name || "")}
            </option>
          );
        })}
      </SelectInput>

      {value ? (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--admin-muted)" }}>
          Selected: {label || value}
          {selectedPostFeedId ? ` · source feed: ${selectedPostFeedId}` : ""}
        </div>
      ) : null}
    </div>
  );
}

function QuestionAdvancedFeedTools({
  q,
  linkedFeeds,
  experimentGroups,
  openSubEditors,
  onToggleVisibilityEditor,
  onToggleOverridesEditor,
  onToggleGroupVisibilityEditor,
  onToggleConditionalDisplayEditor,
}) {
  const visibleFeedCount = normalizeVisibleInFeeds(q?.visible_in_feeds).length;
  const overrideCount = Object.keys(pruneFeedOverridesMap(q?.feed_overrides)).length;
  const hasLinkedFeeds = Array.isArray(linkedFeeds) && linkedFeeds.length > 0;
  const hasExperimentGroups = Array.isArray(experimentGroups) && experimentGroups.length > 0;
  const groupCount = uniqueStringList(q?.visible_to_group_ids).length;
  const hasCondition = !!q?.visible_if?.question_id;

  return (
    <div
      style={{
        marginTop: 14,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <SecondaryPillButton
        onClick={onToggleVisibilityEditor}
        active={openSubEditors.has("feedVisibility")}
        title="Question display by linked feed"
        disabled={!hasLinkedFeeds}
      >
        <EyeIcon size={14} />
        <span>
          Display logic
          {visibleFeedCount > 0 ? ` (${visibleFeedCount})` : ""}
        </span>
        <ChevronDownIcon size={12} open={openSubEditors.has("feedVisibility")} />
      </SecondaryPillButton>

      <SecondaryPillButton
        onClick={onToggleOverridesEditor}
        active={openSubEditors.has("feedOverrides")}
        title="Alternative question text by linked feed"
        disabled={!hasLinkedFeeds}
      >
        <TextCursorIcon size={14} />
        <span>
          Alternative text
          {overrideCount > 0 ? ` (${overrideCount})` : ""}
        </span>
        <ChevronDownIcon size={12} open={openSubEditors.has("feedOverrides")} />
      </SecondaryPillButton>

      {hasExperimentGroups && (
        <SecondaryPillButton
          onClick={onToggleGroupVisibilityEditor}
          active={openSubEditors.has("groupVisibility")}
          title="Question display by experiment group"
        >
          <UsersIcon size={14} />
          <span>
            Group visibility
            {groupCount > 0 ? ` (${groupCount})` : ""}
          </span>
          <ChevronDownIcon size={12} open={openSubEditors.has("groupVisibility")} />
        </SecondaryPillButton>
      )}

      <SecondaryPillButton
        onClick={onToggleConditionalDisplayEditor}
        active={openSubEditors.has("conditionalDisplay")}
        title="Only show this question if an earlier answer matches a condition"
      >
        <GitBranchIcon size={14} />
        <span>Conditional display{hasCondition ? " (1)" : ""}</span>
        <ChevronDownIcon size={12} open={openSubEditors.has("conditionalDisplay")} />
      </SecondaryPillButton>

      {!hasLinkedFeeds && (
        <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>
          Link this survey to feeds first.
        </span>
      )}
    </div>
  );
}

/* =========================
   Question editor
   ========================= */

function QuestionActions({
  q,
  index,
  totalQuestions,
  moveQuestion,
  removeQuestion,
  duplicateQuestion,
  updateQuestion,
  onDragStart,
  onDragEnd,
  onPreviewQuestion,
}) {
  const isDisplayOnly = isEditorDisplayOnlyType(q);

  return (
    <TopField label="Actions">
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          height: INPUT_HEIGHT,
        }}
      >
        <DragHandle
          onDragStart={(e) => onDragStart(e, q._editorId)}
          onDragEnd={onDragEnd}
        />

        {!isDisplayOnly && (
          <RequiredToggleButton
            active={!!q.required}
            onClick={() => updateQuestion(index, { required: !q.required })}
          />
        )}

        <button
          type="button"
          onClick={() => moveQuestion(index, index - 1)}
          disabled={index === 0}
          style={smallActionButtonStyle(index === 0)}
        >
          ↑
        </button>

        <button
          type="button"
          onClick={() => moveQuestion(index, index + 1)}
          disabled={index === totalQuestions - 1}
          style={smallActionButtonStyle(index === totalQuestions - 1)}
        >
          ↓
        </button>

        {onPreviewQuestion && q?.id && (
          <IconOnlyButton
            onClick={() => onPreviewQuestion(q.id)}
            title="Preview this question"
            style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
          >
            <EyeIcon size={16} />
          </IconOnlyButton>
        )}

        <IconOnlyButton
          onClick={() => duplicateQuestion(index)}
          title="Copy question"
          style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}
        >
          <CopyIcon size={16} />
        </IconOnlyButton>

        <IconOnlyButton
          onClick={() => removeQuestion(index)}
          title="Delete question"
          danger
        />
      </div>
    </TopField>
  );
}

/**
 * Collapsed view of a question card — one row with just enough to identify
 * and act on the question (number, type, required dot, truncated text,
 * reorder/copy/delete), styled to match the compact rows already used in
 * the study outline (OutlineRow) rather than shrinking the full editor.
 */
// True whether the check lives on the question itself (single/dropdown) or
// on one of its rows (matrix single/bipolar) — the "AC" badge doesn't care
// which shape the question is, just whether it has one.
function questionHasAttentionCheck(q) {
  return !!q?.is_attention_check || (Array.isArray(q?.rows) && q.rows.some((r) => r?.is_attention_check));
}

function CollapsedQuestionRow({
  q,
  index,
  displayNumber,
  totalQuestions,
  type,
  isDuplicateId = false,
  hasBrokenCondition = false,
  moveQuestion,
  removeQuestion,
  duplicateQuestion,
  onDragStart,
  onDragEnd,
  onToggleCollapsed,
  onPreviewQuestion,
}) {
  const isDisplayOnly = isEditorDisplayOnlyType(q);
  const isPostReminder = type === POST_REMINDER_TYPE;
  const rawText = stripHtmlForEmptyCheck(q.text || "");
  // A post reminder's content comes from the referenced post, not q.text — an
  // empty caption there is normal, not a missing-content warning like it is
  // for other display-only blocks (e.g. "info"), so it just stays blank.
  const preview = rawText
    ? rawText
    : isPostReminder
      ? ""
      : isDisplayOnly
        ? "(no display text yet)"
        : "(no question text yet)";
  const shortType = QUESTION_TYPE_SHORT_LABELS[type] || type;
  const fullType = QUESTION_TYPE_LABELS[type] || type;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 2px",
      }}
    >
      <IconOnlyButton
        onClick={onToggleCollapsed}
        title="Expand question"
        aria-label="Expand question"
        size={12}
        style={{ width: 24, height: 24, flex: "0 0 auto" }}
      >
        <ChevronDownIcon size={12} open={false} />
      </IconOnlyButton>

      <CompactDragHandle
        onDragStart={(e) => onDragStart(e, q._editorId)}
        onDragEnd={onDragEnd}
      />

      {!isDisplayOnly && (
        <span
          style={{ fontSize: 11, color: "var(--admin-muted-2)", flex: "0 0 auto", minWidth: 20 }}
          title={`Question ${displayNumber}`}
        >
          {`Q${displayNumber}`}
        </span>
      )}

      <span
        title={
          isDuplicateId
            ? `⚠ Another question already uses this ID: ${q.id || ""}`
            : `Question ID: ${q.id || ""}`
        }
        style={{
          fontSize: 10,
          color: isDuplicateId ? "var(--admin-danger)" : "var(--admin-muted-2)",
          fontWeight: isDuplicateId ? 700 : 400,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          flex: "0 0 auto",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 90,
        }}
      >
        {q.id || ""}
      </span>

      <span
        title={fullType}
        style={{
          fontSize: 10,
          color: "var(--admin-muted)",
          background: "var(--admin-surface-alt)",
          borderRadius: 4,
          padding: "2px 6px",
          flex: "0 0 auto",
          whiteSpace: "nowrap",
        }}
      >
        {shortType}
      </span>

      {questionHasAttentionCheck(q) ? (
        <span
          title={
            q.attention_check_value || (q.rows || []).some((r) => r?.is_attention_check)
              ? "Attention check — pinned in place, never shuffled/reordered"
              : "Attention check — no expected answer picked yet"
          }
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--admin-accent-ink)",
            background: "var(--admin-accent-soft)",
            border: "1px solid var(--admin-accent-border)",
            borderRadius: 4,
            padding: "2px 6px",
            flex: "0 0 auto",
            whiteSpace: "nowrap",
          }}
        >
          AC
        </span>
      ) : null}

      {q.required ? (
        <span
          title="Required"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--admin-danger)",
            flex: "0 0 auto",
          }}
        />
      ) : null}

      {hasBrokenCondition ? (
        <span
          title="Its display condition references a question that's no longer available"
          style={{ fontSize: 11, color: "var(--admin-danger)", flex: "0 0 auto" }}
        >
          ⚠
        </span>
      ) : null}

      <button
        type="button"
        onClick={onToggleCollapsed}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
        title="Click to expand"
      >
        <span
          style={{
            fontSize: 13,
            color: "var(--admin-text)",
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {preview}
        </span>
      </button>

      <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
        <button
          type="button"
          onClick={() => moveQuestion(index, index - 1)}
          disabled={index === 0}
          style={compactArrowStyle(index === 0)}
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => moveQuestion(index, index + 1)}
          disabled={index === totalQuestions - 1}
          style={compactArrowStyle(index === totalQuestions - 1)}
          title="Move down"
        >
          ↓
        </button>
        {onPreviewQuestion && q?.id && (
          <IconOnlyButton
            onClick={() => onPreviewQuestion(q.id)}
            title="Preview this question"
            size={11}
            style={{
              width: 20,
              height: 20,
              flex: "0 0 auto",
              borderColor: "var(--admin-border)",
              background: "var(--admin-surface)",
            }}
          >
            <EyeIcon size={11} />
          </IconOnlyButton>
        )}
        <IconOnlyButton
          onClick={() => duplicateQuestion(index)}
          title="Copy question"
          size={11}
          style={{
            width: 20,
            height: 20,
            flex: "0 0 auto",
            borderColor: "var(--admin-border)",
            background: "var(--admin-surface)",
          }}
        >
          <CopyIcon size={11} />
        </IconOnlyButton>
        <IconOnlyButton
          onClick={() => removeQuestion(index)}
          title="Delete question"
          danger
          size={11}
          style={{ width: 20, height: 20, flex: "0 0 auto" }}
        />
      </div>
    </div>
  );
}

/* =========================
   Per-type question body blocks
   ========================= */
// Each block below is a pure lift of QuestionCard's former flat
// {isX && (...)} JSX — same markup, same update-composition logic, just
// named and given only the raw values + plain callbacks it actually needs
// (no `q`, no `index`, no `updateQuestion`), so extracting these didn't just
// relocate the 21-prop soup one level down.

function PostReminderEditorBlock({
  availablePosts,
  selectedFeedIds,
  postId,
  postLabel,
  selectedPostFeedId,
  applyFeedRandomization,
  reminderInteractive,
  recallEnabled,
  recallDistractorTexts,
  onPostChange,
  onApplyFeedRandomizationChange,
  onReminderInteractiveChange,
  onRecallEnabledChange,
  onRecallDistractorTextsChange,
}) {
  const [d1, d2] = recallDistractorTexts || ["", ""];
  const distractorsIncomplete = !String(d1 || "").trim() || !String(d2 || "").trim();

  return (
    <>
      <FieldBlock
        label="Post to show again"
        hint="This will display the selected linked-feed post again in the survey — non-interactive by default, or interactive if turned on below."
      >
        <PostReminderEditor
          availablePosts={availablePosts}
          selectedFeedIds={selectedFeedIds}
          value={postId}
          label={postLabel}
          selectedPostFeedId={selectedPostFeedId}
          onChange={onPostChange}
        />
      </FieldBlock>

      <FieldBlock
        label="Randomization"
        hint="On: the reminder shows the exact version of the post this participant saw (same randomized avatar, image, bio, and time as the feed, if those are turned on). Off: the reminder always shows the original, unrandomized post, the same for every participant."
      >
        <Toggle
          label="Carry over the feed's randomize settings for this reminder"
          checked={applyFeedRandomization}
          onChange={onApplyFeedRandomizationChange}
        />
      </FieldBlock>

      <FieldBlock
        label="Interactivity"
        hint={
          recallEnabled
            ? "Turned off automatically while recall testing (below) is on — a recall question is always a static comparison, not a live interactive post."
            : "On: participants can like/comment/share/report this reminder post exactly like the real feed, and those interactions are recorded as answers to this question (visible as extra columns in the CSV export). Off (default): the reminder is view-only — no hover effects, nothing clickable. Available actions depend on the platform (Amazon posts only support helpful/report)."
        }
      >
        <Toggle
          label="Let participants interact with this reminder post (like, comment, share, report)"
          checked={reminderInteractive && !recallEnabled}
          disabled={recallEnabled}
          onChange={onReminderInteractiveChange}
        />
      </FieldBlock>

      <FieldBlock
        label="Recall test"
        hint="On: instead of the post alone, shows it next to two decoy versions with different text (configured below), in a shuffled order, and asks the participant to pick the one they actually saw. Scored correct/incorrect and recorded as this question's answer (extra CSV columns) — it can also be marked Required like a normal question, unlike a plain reminder."
      >
        <Toggle
          label="Ask participants to pick this post out of decoy versions"
          checked={!!recallEnabled}
          onChange={onRecallEnabledChange}
        />

        {recallEnabled && (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 4 }}>
                Decoy text 1
              </div>
              <TextAreaInput
                value={d1}
                onChange={(v) => onRecallDistractorTextsChange([v, d2])}
                placeholder="A plausible but different version of the post text…"
                rows={3}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 4 }}>
                Decoy text 2
              </div>
              <TextAreaInput
                value={d2}
                onChange={(v) => onRecallDistractorTextsChange([d1, v])}
                placeholder="A plausible but different version of the post text…"
                rows={3}
              />
            </div>

            {distractorsIncomplete && (
              <div style={{ fontSize: 12, color: "var(--admin-warning-ink)" }}>
                Both decoy texts need to be filled in before this shows as a recall test —
                until then, participants just see the plain reminder post above.
              </div>
            )}
          </div>
        )}
      </FieldBlock>
    </>
  );
}

function ChoiceEditorBlock({
  choices,
  onChange,
  showAttentionCheck = false,
  isAttentionCheck = false,
  attentionCheckValue = "",
  onAttentionCheckToggle,
  onAttentionCheckValueChange,
}) {
  const safeChoices = (choices || []).filter((c) => String(c?.value || "").trim());

  return (
    <>
      <ItemTableEditor
        title="Options"
        items={choices}
        onChange={onChange}
        prefix="opt"
        addLabel="Add option"
      />

      {showAttentionCheck && (
        <FieldBlock
          label="Attention check"
          hint="Marks this as an instructional check (e.g. “please select X”). It never gets its own options shuffled, and if its page sits in a randomized block, the page stays pinned in place instead of moving around with the rest — so it always lands where you put it."
        >
          <Toggle
            label="This question is an attention check"
            checked={isAttentionCheck}
            onChange={onAttentionCheckToggle}
          />

          {isAttentionCheck && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 4 }}>
                Expected (correct) answer
              </div>
              <SelectInput
                value={attentionCheckValue}
                onChange={onAttentionCheckValueChange}
                disabled={!safeChoices.length}
              >
                <option value="">
                  {safeChoices.length ? "Choose the correct option…" : "Add options first"}
                </option>
                {safeChoices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label || c.value}
                  </option>
                ))}
              </SelectInput>
            </div>
          )}
        </FieldBlock>
      )}
    </>
  );
}

function MatrixEditorBlock({ rows, columns, questionId, allowAttentionCheck = false, onRowsChange, onColumnsChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <ItemTableEditor
        title="Rows / items"
        items={rows}
        onChange={onRowsChange}
        attentionCheckColumns={allowAttentionCheck ? columns : null}
        prefix={sanitizeQuestionId(questionId, "ROW")}
        addLabel="Add row"
        valuePlaceholder="Auto id"
        labelPlaceholder="Item text"
      />

      <ItemTableEditor
        title="Columns / scale points"
        items={columns}
        onChange={onColumnsChange}
        prefix="col"
        addLabel="Add column"
        valuePlaceholder="Value"
        labelPlaceholder="Label"
      />
    </div>
  );
}

function BipolarEditorBlock({ rows, questionId, min, max, onRowsChange, onMinChange, onMaxChange }) {
  // Bipolar columns are the numeric scale points themselves (min..max), not
  // admin-editable text — the same range frontendQuestionToBackend derives
  // when no explicit columns array is set. Computed here purely to populate
  // the attention-check expected-answer picker per row.
  const safeMin = Number.isFinite(min) ? min : 1;
  const safeMax = Number.isFinite(max) ? max : 7;
  const scaleColumns = Array.from(
    { length: Math.max(2, safeMax - safeMin + 1) },
    (_, i) => ({ value: String(safeMin + i), label: String(safeMin + i) })
  );

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <BipolarRowTableEditor
          items={rows}
          questionId={questionId}
          columns={scaleColumns}
          onChange={onRowsChange}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "120px 120px", gap: 12, alignItems: "end" }}>
        <FieldBlock label="Min">
          <NumberInput value={min} min={1} max={100} onChange={onMinChange} />
        </FieldBlock>

        <FieldBlock label="Max">
          <NumberInput value={max} min={2} max={100} onChange={onMaxChange} />
        </FieldBlock>
      </div>
    </>
  );
}

function SliderEditorBlock({ min, max, leftLabel, rightLabel, onMinChange, onMaxChange, onLeftLabelChange, onRightLabelChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 120px 1fr 1fr", gap: 12, alignItems: "end" }}>
      <FieldBlock label="Min">
        <NumberInput value={min} min={0} max={100} onChange={onMinChange} />
      </FieldBlock>

      <FieldBlock label="Max">
        <NumberInput value={max} min={1} max={100} onChange={onMaxChange} />
      </FieldBlock>

      <FieldBlock label="Left label">
        <TextInput value={leftLabel ?? ""} onChange={onLeftLabelChange} placeholder="e.g. Low" />
      </FieldBlock>

      <FieldBlock label="Right label">
        <TextInput value={rightLabel ?? ""} onChange={onRightLabelChange} placeholder="e.g. High" />
      </FieldBlock>
    </div>
  );
}

// Pure extraction of QuestionCard's former inline SelectInput.onChange body
// — identical logic, just named and easy to find/extend, minus the _show*
// copy-through lines that Stage 4 deleted (this file's QuestionCard no
// longer stores that transient UI state on the question object at all).
function computeQuestionAfterTypeChange(q, nextType, index) {
  if (nextType === EDITOR_PAGE_BREAK_TYPE) {
    return makePageBreakForEditor(index);
  }

  const next = makeBackendQuestionFromType(nextType, index);
  const preservedId = sanitizeQuestionId(q.id, next.id);
  const nextRecallEnabled = nextType === POST_REMINDER_TYPE ? !!q.recall_enabled : false;

  let merged = {
    ...next,
    _editorId: q._editorId,
    id: preservedId,
    text: q.text || next.text,
    required: isEditorDisplayOnlyType({ type: nextType, recall_enabled: nextRecallEnabled })
      ? false
      : !!q.required,
    visible_if: q.visible_if || null,
    visible_in_feeds: normalizeVisibleInFeeds(q.visible_in_feeds),
    feed_overrides: normalizeFeedOverridesMap(q.feed_overrides),
    post_id: nextType === POST_REMINDER_TYPE ? String(q.post_id || "") : "",
    post_label: nextType === POST_REMINDER_TYPE ? String(q.post_label || "") : "",
    post_feed_id: nextType === POST_REMINDER_TYPE ? String(q.post_feed_id || "") : "",
    apply_feed_randomization:
      nextType === POST_REMINDER_TYPE ? q.apply_feed_randomization !== false : true,
    reminder_interactive:
      nextType === POST_REMINDER_TYPE ? !!q.reminder_interactive : false,
    recall_enabled: nextRecallEnabled,
    recall_distractor_texts:
      nextType === POST_REMINDER_TYPE
        ? normalizeRecallDistractorTextsForEditor(q.recall_distractor_texts)
        : normalizeRecallDistractorTextsForEditor([]),
    is_attention_check:
      ATTENTION_CHECK_ELIGIBLE_TYPES.includes(nextType) ? !!q.is_attention_check : false,
    attention_check_value:
      ATTENTION_CHECK_ELIGIBLE_TYPES.includes(nextType)
        ? String(q.attention_check_value || "")
        : "",
    meta: q.meta || {},
  };

  if (shouldAutoRewriteRowValues(merged)) {
    merged = rewriteQuestionRowValues(merged, preservedId);
  }

  return merged;
}

// Mutually exclusive by construction (isChoice/isMatrix/isBipolar/isSlider/
// isPostReminder in the old QuestionCard were derived from the same
// mutually-exclusive `type` value) — a switch, not a uniform {type:
// Component} map, since each block genuinely needs different props.
function renderTypeSpecificFields({
  type,
  q,
  index,
  updateQuestion,
  reminderFeedIds,
  availablePostsForQuestion,
}) {
  switch (type) {
    case POST_REMINDER_TYPE:
      return (
        <PostReminderEditorBlock
          availablePosts={availablePostsForQuestion}
          selectedFeedIds={reminderFeedIds}
          postId={q.post_id}
          postLabel={q.post_label}
          selectedPostFeedId={q.post_feed_id || q?.meta?.post_feed_id || ""}
          applyFeedRandomization={q.apply_feed_randomization !== false}
          reminderInteractive={!!q.reminder_interactive}
          recallEnabled={!!q.recall_enabled}
          recallDistractorTexts={normalizeRecallDistractorTextsForEditor(q.recall_distractor_texts)}
          onPostChange={(patch) => updateQuestion(index, patch)}
          onApplyFeedRandomizationChange={(v) =>
            updateQuestion(index, { apply_feed_randomization: v })
          }
          onReminderInteractiveChange={(v) =>
            updateQuestion(index, { reminder_interactive: v })
          }
          onRecallEnabledChange={(v) =>
            updateQuestion(index, {
              recall_enabled: v,
              // Recall is a static comparison task — turning it on always
              // implies non-interactive, so it doesn't silently coexist
              // with the Interactivity toggle behind the scenes.
              ...(v ? { reminder_interactive: false } : {}),
              // Turning recall off on a required question would otherwise
              // leave `required` stuck true on a now-display-only block,
              // which the editor UI has no way to clear (the Required
              // toggle is hidden for display-only questions).
              ...(v ? {} : { required: false }),
            })
          }
          onRecallDistractorTextsChange={(next) =>
            updateQuestion(index, { recall_distractor_texts: normalizeRecallDistractorTextsForEditor(next) })
          }
        />
      );
    case SURVEY_QUESTION_TYPES.SINGLE:
    case SURVEY_QUESTION_TYPES.MULTI:
    case SURVEY_QUESTION_TYPES.DROPDOWN:
      return (
        <ChoiceEditorBlock
          choices={q.choices}
          onChange={(items) => updateQuestion(index, { choices: ensureChoiceArray(items) })}
          showAttentionCheck={ATTENTION_CHECK_ELIGIBLE_TYPES.includes(type)}
          isAttentionCheck={!!q.is_attention_check}
          attentionCheckValue={q.attention_check_value || ""}
          onAttentionCheckToggle={(v) =>
            updateQuestion(index, {
              is_attention_check: v,
              // Turning the toggle off clears any previously-picked answer
              // too, rather than leaving a stale expected value sitting on
              // a question that's no longer flagged as a check.
              ...(v ? {} : { attention_check_value: "" }),
            })
          }
          onAttentionCheckValueChange={(v) => updateQuestion(index, { attention_check_value: v })}
        />
      );
    case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
    case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
      return (
        <MatrixEditorBlock
          rows={q.rows}
          columns={q.columns}
          questionId={q.id}
          allowAttentionCheck={type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE}
          onRowsChange={(items) =>
            updateQuestion(index, { rows: ensureMatrixRowsFromQuestionId(items, q.id) })
          }
          onColumnsChange={(items) =>
            updateQuestion(index, { columns: ensureMatrixArray(items, "col") })
          }
        />
      );
    case SURVEY_QUESTION_TYPES.BIPOLAR:
      return (
        <BipolarEditorBlock
          rows={q.rows}
          questionId={q.id}
          min={q.min}
          max={q.max}
          onRowsChange={(items) =>
            updateQuestion(index, { rows: ensureBipolarRowArray(items, q.id) })
          }
          onMinChange={(v) => updateQuestion(index, { min: clampInt(v, 1, 100, q.min ?? 1) })}
          onMaxChange={(v) => updateQuestion(index, { max: clampInt(v, 2, 100, q.max ?? 7) })}
        />
      );
    case SURVEY_QUESTION_TYPES.SLIDER:
      return (
        <SliderEditorBlock
          min={q.min}
          max={q.max}
          leftLabel={q.left_label}
          rightLabel={q.right_label}
          onMinChange={(v) => updateQuestion(index, { min: clampInt(v, 0, 100, q.min ?? 1) })}
          onMaxChange={(v) => updateQuestion(index, { max: clampInt(v, 1, 100, q.max ?? 7) })}
          onLeftLabelChange={(v) => updateQuestion(index, { left_label: v })}
          onRightLabelChange={(v) => updateQuestion(index, { right_label: v })}
        />
      );
    default:
      return null;
  }
}

function QuestionCard({
  q,
  index,
  displayNumber,
  totalQuestions,
  isDuplicateId = false,
  hasBrokenCondition = false,
  linkedFeeds,
  linkedFeedPostsMap,
  experimentGroups,
  eligibleSourceQuestions,
  updateQuestion,
  removeQuestion,
  moveQuestion,
  duplicateQuestion,
  insertQuestionAt,
  draggingId,
  dragOverId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isCollapsed,
  onToggleCollapsed,
  onPreviewQuestion,
}) {
  const confirm = useConfirm();
  const type = q?.type;
  const isPageBreak = type === EDITOR_PAGE_BREAK_TYPE;

  // Which of the 4 advanced sub-editors are expanded — deliberately local
  // component state, not stored on the question data object (as it used to
  // be, via `_show*` fields). This is safe because `SurveyEditor`'s render
  // loop keys each QuestionCard's wrapping fragment by the question's
  // stable `_editorId`, so plain useState here already survives reorders
  // and collapse/expand for free — no explicit keying needed.
  const [openSubEditors, setOpenSubEditors] = useState(() => new Set());
  function toggleSubEditor(key) {
    setOpenSubEditors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function removeQuestionWithConfirm(idx) {
    const ok = await confirm({
      title: isPageBreak ? "Delete this page break?" : "Delete this question?",
      danger: true,
      confirmLabel: "Delete",
    });
    if (ok) removeQuestion(idx);
  }

  const isChoice =
    type === SURVEY_QUESTION_TYPES.SINGLE ||
    type === SURVEY_QUESTION_TYPES.MULTI ||
    type === SURVEY_QUESTION_TYPES.DROPDOWN;

  const isMatrix =
    type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
    type === SURVEY_QUESTION_TYPES.MATRIX_MULTI;

  const isBipolar = type === SURVEY_QUESTION_TYPES.BIPOLAR;
  const isSlider = type === SURVEY_QUESTION_TYPES.SLIDER;
  const isPostReminder = type === POST_REMINDER_TYPE;

  const isDragging = draggingId === q._editorId;
  const isDragOver = dragOverId === q._editorId;

  const scopedFeedIds = normalizeVisibleInFeeds(q?.visible_in_feeds);
  const scopedFeeds = Array.isArray(linkedFeeds)
    ? linkedFeeds.filter((feed) =>
        scopedFeedIds.includes(String(feed?.feed_id || "").trim())
      )
    : [];

  const hasFeedVisibilitySelection = scopedFeedIds.length > 0;
  const safeOverrideFeeds = hasFeedVisibilitySelection ? scopedFeeds : linkedFeeds;

  const reminderFeedIds = getRelevantFeedIdsForQuestion(q, linkedFeeds);
  const availablePostsForQuestion = getAvailablePostsForQuestion(
    q,
    linkedFeeds,
    linkedFeedPostsMap
  );

  const shellStyle = {
    position: "relative",
    border: isDragOver
      ? "2px solid var(--admin-accent)"
      : `1px solid ${isPageBreak ? "var(--admin-muted-2)" : "var(--admin-border)"}`,
    borderStyle: isPageBreak ? "dashed" : "solid",
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
    marginBottom: 26,
    background: isDragging ? "var(--admin-surface-sunken)" : isPageBreak ? "var(--admin-surface-alt)" : "var(--admin-surface)",
    opacity: isDragging ? 0.65 : 1,
    boxShadow: isDragOver ? "0 0 0 3px var(--admin-accent-ring)" : "none",
  };

  if (isPageBreak) {
    return (
      <div
        onDragOver={(e) => onDragOver(e, q._editorId)}
        onDrop={(e) => onDrop(e, q._editorId)}
        style={{
          ...shellStyle,
          padding: "6px 12px",
          marginTop: 10,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <InsertAtBorderButton
          position="top"
          onInsert={(nextType) => insertQuestionAt(index, nextType, "above")}
        />
        <InsertAtBorderButton
          position="bottom"
          onInsert={(nextType) => insertQuestionAt(index, nextType, "below")}
        />

        <DragHandle
          onDragStart={(e) => onDragStart(e, q._editorId)}
          onDragEnd={onDragEnd}
        />

        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-muted)", flex: "0 0 auto", whiteSpace: "nowrap" }}>
          Page break
        </span>

        <span style={{ fontSize: 12, color: "var(--admin-muted-2)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Questions after this appear on the next page.
        </span>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--admin-muted)", flex: "0 0 auto" }}>
          Delay
          <NumberInput
            value={q?.next_delay_seconds ?? 0}
            min={0}
            step={1}
            onChange={(v) =>
              updateQuestion(index, {
                next_delay_seconds: normalizePageDelaySeconds(v),
              })
            }
            style={{ width: 60, height: 30, padding: "4px 8px" }}
          />
          sec
        </label>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
          <button
            type="button"
            onClick={() => moveQuestion(index, index - 1)}
            disabled={index === 0}
            style={smallActionButtonStyle(index === 0)}
          >
            ↑
          </button>

          <button
            type="button"
            onClick={() => moveQuestion(index, index + 1)}
            disabled={index === totalQuestions - 1}
            style={smallActionButtonStyle(index === totalQuestions - 1)}
          >
            ↓
          </button>

          <IconOnlyButton
            onClick={() => removeQuestionWithConfirm(index)}
            title="Delete page break"
            danger
          />
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => onDragOver(e, q._editorId)}
      onDrop={(e) => onDrop(e, q._editorId)}
      style={shellStyle}
    >
      <InsertAtBorderButton
        position="top"
        onInsert={(nextType) => insertQuestionAt(index, nextType, "above")}
      />
      <InsertAtBorderButton
        position="bottom"
        onInsert={(nextType) => insertQuestionAt(index, nextType, "below")}
      />

      {isCollapsed ? (
        <CollapsedQuestionRow
          q={q}
          index={index}
          displayNumber={displayNumber}
          totalQuestions={totalQuestions}
          type={type}
          isDuplicateId={isDuplicateId}
          hasBrokenCondition={hasBrokenCondition}
          moveQuestion={moveQuestion}
          removeQuestion={removeQuestionWithConfirm}
          duplicateQuestion={duplicateQuestion}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onToggleCollapsed={onToggleCollapsed}
          onPreviewQuestion={onPreviewQuestion}
        />
      ) : (
      <>
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <TopField label="">
              <IconOnlyButton
                onClick={onToggleCollapsed}
                title="Collapse question"
                aria-label="Collapse question"
              >
                <ChevronDownIcon size={12} open />
              </IconOnlyButton>
            </TopField>

            <div style={{ width: 220, flexShrink: 0 }}>
              <TopField label="Type">
                <SelectInput
                  value={q.type}
                  onChange={(nextType) =>
                    updateQuestion(index, computeQuestionAfterTypeChange(q, nextType, index))
                  }
                >
                  {INSERTABLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t] || t}
                    </option>
                  ))}
                </SelectInput>
              </TopField>
            </div>
          </div>

          <QuestionActions
            q={q}
            index={index}
            totalQuestions={totalQuestions}
            moveQuestion={moveQuestion}
            removeQuestion={removeQuestionWithConfirm}
            duplicateQuestion={duplicateQuestion}
            updateQuestion={updateQuestion}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onPreviewQuestion={onPreviewQuestion}
          />
        </div>

        <TopField
          label={
            isEditorDisplayOnlyType(q)
              ? QUESTION_TYPE_LABELS[type] || "Display block"
              : `Question ${displayNumber}`
          }
        >
          <RichTextEditor
            value={q.text || ""}
            onChange={(v) => updateQuestion(index, { text: v })}
            placeholder={
              isEditorDisplayOnlyType(q) ? "Display text" : "Question text"
            }
          />
        </TopField>
      </div>
      <FieldBlock label="Question ID / variable name">
        <TextInput
          value={q.id || ""}
          onChange={(v) => {
            const cleanedId = sanitizeQuestionId(v, "");
            let nextQuestion = {
              ...q,
              id: cleanedId,
            };

            if (cleanedId && shouldAutoRewriteRowValues(nextQuestion)) {
              nextQuestion = rewriteQuestionRowValues(nextQuestion, cleanedId);
            }

            updateQuestion(index, nextQuestion);
          }}
          placeholder="e.g. AUTH"
          style={isDuplicateId ? { borderColor: "var(--admin-danger)" } : undefined}
        />
        {isDuplicateId && (
          <div style={{ fontSize: 12, color: "var(--admin-danger)", marginTop: 4, fontWeight: 600 }}>
            ⚠ Another question already uses this ID.
          </div>
        )}
      </FieldBlock>

      {renderTypeSpecificFields({
        type,
        q,
        index,
        updateQuestion,
        reminderFeedIds,
        availablePostsForQuestion,
      })}

      <QuestionAdvancedFeedTools
        q={q}
        linkedFeeds={linkedFeeds}
        experimentGroups={experimentGroups}
        openSubEditors={openSubEditors}
        onToggleVisibilityEditor={() => toggleSubEditor("feedVisibility")}
        onToggleOverridesEditor={() => toggleSubEditor("feedOverrides")}
        onToggleGroupVisibilityEditor={() => toggleSubEditor("groupVisibility")}
        onToggleConditionalDisplayEditor={() => toggleSubEditor("conditionalDisplay")}
      />

      {hasBrokenCondition && (
        <div style={{ fontSize: 12, color: "var(--admin-danger)", marginTop: 6, fontWeight: 600 }}>
          ⚠ Its display condition references a question that's no longer available.
        </div>
      )}

      {openSubEditors.has("conditionalDisplay") && (
        <div style={{ marginTop: 12 }}>
          <FieldBlock
            label="Conditional display"
            hint="Only show this question if an earlier answer matches a condition. Leave unset to always show it."
          >
            <ConditionalDisplayEditor
              eligibleSourceQuestions={eligibleSourceQuestions}
              value={q.visible_if}
              onChange={(nextVisibleIf) =>
                updateQuestion(index, { visible_if: nextVisibleIf })
              }
            />
          </FieldBlock>
        </div>
      )}

      {openSubEditors.has("groupVisibility") && (
        <div style={{ marginTop: 12 }}>
          <FieldBlock
            label="Experiment group visibility"
            hint="Restrict this question to participants assigned to selected experiment groups. Leaving all unchecked means it's shown to everyone."
          >
            <QuestionGroupVisibilityEditor
              experimentGroups={experimentGroups}
              value={q.visible_to_group_ids}
              onChange={(nextVisibleToGroupIds) =>
                updateQuestion(index, {
                  visible_to_group_ids: uniqueStringList(nextVisibleToGroupIds),
                })
              }
            />
          </FieldBlock>
        </div>
      )}

      {openSubEditors.has("feedVisibility") && (
        <div style={{ marginTop: 12 }}>
          <FieldBlock
            label="Feed visibility"
            hint="Restrict this question to selected linked feeds. Leaving all unchecked means it will show in all linked feeds."
          >
            <FeedVisibilityEditor
              availableFeeds={linkedFeeds}
              value={q.visible_in_feeds}
              onChange={(nextVisibleInFeeds) => {
                const normalizedVisibleFeeds =
                  normalizeVisibleInFeeds(nextVisibleInFeeds);
                const prunedOverrides = pruneFeedOverridesMap(
                  q.feed_overrides,
                  normalizedVisibleFeeds
                );

                updateQuestion(index, {
                  visible_in_feeds: normalizedVisibleFeeds,
                  feed_overrides: prunedOverrides,
                });
              }}
            />
          </FieldBlock>
        </div>
      )}

      {openSubEditors.has("feedOverrides") && (
        <div style={{ marginTop: 12 }}>
          <FieldBlock
            label="Feed-specific question text"
            hint={
              hasFeedVisibilitySelection
                ? "These alternative texts apply to the currently selected display-logic feeds."
                : "Optional alternative text shown for linked feeds. Leave a field blank to use the default question text."
            }
          >
            <FeedOverridesEditor
              availableFeeds={safeOverrideFeeds}
              value={q.feed_overrides}
              onChange={(nextOverrides) =>
                updateQuestion(index, {
                  feed_overrides: pruneFeedOverridesMap(
                    nextOverrides,
                    hasFeedVisibilitySelection
                      ? normalizeVisibleInFeeds(q.visible_in_feeds)
                      : []
                  ),
                })
              }
            />
          </FieldBlock>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function smallActionButtonStyle(disabled) {
  return {
    width: INPUT_HEIGHT,
    height: INPUT_HEIGHT,
    borderRadius: 8,
    border: "1px solid var(--admin-border)",
    background: "var(--admin-surface)",
    color: disabled ? "var(--admin-muted-2)" : "var(--admin-text)",
    cursor: disabled ? "not-allowed" : "pointer",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  };
}

/* =========================
   Study outline (compact overview + reorder)
   ========================= */

function CompactDragHandle({ onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title="Drag to reorder"
      style={{
        width: 18,
        height: 18,
        flex: "0 0 auto",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 5,
        border: "1px solid var(--admin-border)",
        background: "var(--admin-surface)",
        cursor: "grab",
        fontSize: 10,
        color: "var(--admin-muted-2)",
        userSelect: "none",
      }}
    >
      ⋮⋮
    </div>
  );
}

function compactArrowStyle(disabled) {
  return {
    width: 16,
    height: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    border: "1px solid var(--admin-border)",
    background: "var(--admin-surface)",
    color: disabled ? "var(--admin-border)" : "var(--admin-muted)",
    cursor: disabled ? "not-allowed" : "pointer",
    padding: 0,
    lineHeight: 1,
    fontSize: 9,
  };
}

function InsertPageBreakIcon({ size = 12 }) {
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
      <line x1="3" y1="7" x2="21" y2="7" strokeDasharray="3 3" />
      <line x1="3" y1="17" x2="21" y2="17" strokeDasharray="3 3" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function OutlineRow({
  item,
  flatIndex,
  displayNumber,
  pageNumber,
  isDuplicateId = false,
  hasBrokenCondition = false,
  totalCount,
  onMoveUp,
  onMoveDown,
  onJump,
  onIdChange,
  onDuplicate,
  onInsertPageBreakAfter,
  onDelete,
  draggingId,
  dragOverId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const isPageBreak = item.type === EDITOR_PAGE_BREAK_TYPE;
  const isDragging = draggingId === item._editorId;
  const isDragOver = dragOverId === item._editorId;

  const arrowPair = (
    <div style={{ display: "flex", gap: 2, flex: "0 0 auto" }}>
      <button
        type="button"
        onClick={onMoveUp}
        disabled={flatIndex === 0}
        style={compactArrowStyle(flatIndex === 0)}
        title="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={flatIndex === totalCount - 1}
        style={compactArrowStyle(flatIndex === totalCount - 1)}
        title="Move down"
      >
        ↓
      </button>
    </div>
  );

  if (isPageBreak) {
    return (
      <div
        onDragOver={(e) => onDragOver(e, item._editorId)}
        onDrop={(e) => onDrop(e, item._editorId)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          margin: "3px 0",
          padding: "2px 5px",
          borderRadius: 5,
          borderTop: isDragOver ? "2px solid var(--admin-accent)" : "1px dashed var(--admin-muted-2)",
          opacity: isDragging ? 0.5 : 1,
        }}
      >
        <CompactDragHandle
          onDragStart={(e) => onDragStart(e, item._editorId)}
          onDragEnd={onDragEnd}
        />
        {arrowPair}
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "var(--admin-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          Page break · Page {pageNumber} starts below
          {item.next_delay_seconds ? ` · ${item.next_delay_seconds}s delay` : ""}
        </span>

        <IconOnlyButton
          onClick={onDelete}
          title="Delete page break"
          danger
          size={11}
          style={{ width: 20, height: 20, flex: "0 0 auto", marginLeft: "auto" }}
        >
          <TrashIcon size={11} />
        </IconOnlyButton>
      </div>
    );
  }

  const rawText = stripHtmlForEmptyCheck(item.text || "");
  const preview = rawText || "(no question text yet)";
  const shortType = QUESTION_TYPE_SHORT_LABELS[item.type] || item.type;
  const fullType = QUESTION_TYPE_LABELS[item.type] || item.type;

  return (
    <div
      onDragOver={(e) => onDragOver(e, item._editorId)}
      onDrop={(e) => onDrop(e, item._editorId)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 5px",
        borderRadius: 6,
        border: isDragOver ? "2px solid var(--admin-accent)" : "1px solid var(--admin-border-subtle)",
        background: isDragging ? "var(--admin-surface-sunken)" : "var(--admin-surface)",
        opacity: isDragging ? 0.6 : 1,
        marginBottom: 2,
      }}
    >
      <CompactDragHandle
        onDragStart={(e) => onDragStart(e, item._editorId)}
        onDragEnd={onDragEnd}
      />

      {arrowPair}

      <span
        style={{
          fontSize: 10,
          color: "var(--admin-muted-2)",
          flex: "0 0 auto",
          minWidth: 16,
        }}
        title={displayNumber != null ? `Question ${displayNumber}` : ""}
      >
        {displayNumber != null ? `Q${displayNumber}` : ""}
      </span>

      <input
        value={item.id || ""}
        onChange={(e) => onIdChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="ID"
        title={
          isDuplicateId
            ? "⚠ Another question already uses this ID"
            : "Question ID / variable name"
        }
        style={{
          width: 78,
          flex: "0 0 auto",
          height: 20,
          padding: "0 5px",
          borderRadius: 5,
          border: isDuplicateId ? "1px solid var(--admin-danger)" : "1px solid var(--admin-border)",
          color: isDuplicateId ? "var(--admin-danger)" : undefined,
          fontSize: 10,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          boxSizing: "border-box",
        }}
      />

      <span
        title={fullType}
        style={{
          fontSize: 9,
          color: "var(--admin-muted)",
          background: "var(--admin-surface-alt)",
          borderRadius: 4,
          padding: "1px 4px",
          flex: "0 0 auto",
          whiteSpace: "nowrap",
        }}
      >
        {shortType}
      </span>

      {item.required ? (
        <span
          title="Required"
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--admin-danger)",
            flex: "0 0 auto",
          }}
        />
      ) : null}

      {hasBrokenCondition ? (
        <span
          title="Its display condition references a question that's no longer available"
          style={{ fontSize: 10, color: "var(--admin-danger)", flex: "0 0 auto" }}
        >
          ⚠
        </span>
      ) : null}

      <button
        type="button"
        onClick={onJump}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
        title="Jump to this question in the editor"
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--admin-text)",
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {preview}
        </span>
      </button>

      <IconOnlyButton
        onClick={onDuplicate}
        title="Copy question"
        size={11}
        style={{ width: 20, height: 20, flex: "0 0 auto" }}
      >
        <CopyIcon size={11} />
      </IconOnlyButton>

      <IconOnlyButton
        onClick={onInsertPageBreakAfter}
        title="Insert a page break after this question"
        size={11}
        style={{ width: 20, height: 20, flex: "0 0 auto" }}
      >
        <InsertPageBreakIcon size={12} />
      </IconOnlyButton>

      <IconOnlyButton
        onClick={onDelete}
        title="Delete question"
        danger
        size={11}
        style={{ width: 20, height: 20, flex: "0 0 auto" }}
      >
        <TrashIcon size={11} />
      </IconOnlyButton>
    </div>
  );
}


function ExperimentGroupsEditor({ survey, onSurveyChange, linkedFeeds = [] }) {
  const groups = normalizeSurveyExperimentGroups(survey);
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set());
  const safeLinkedFeeds = Array.isArray(linkedFeeds) ? linkedFeeds : [];
  const confirm = useConfirm();

  const applyGroups = useCallback(
    (nextGroups) => {
      onSurveyChange((prev) => {
        const withGroups = {
          ...prev,
          experiment_groups: normalizeSurveyExperimentGroups({
            ...prev,
            experiment_groups: nextGroups,
          }),
        };
        return {
          ...withGroups,
          page_blocks: normalizeSurveyPageBlocks(withGroups),
        };
      });
    },
    [onSurveyChange]
  );

  function updateGroup(groupIndex, patch) {
    const next = groups.map((group, index) =>
      index === groupIndex ? { ...group, ...patch } : group
    );
    applyGroups(next);
  }

  function addGroup() {
    applyGroups([...groups, makeExperimentGroup(groups.length)]);
  }

  function toggleGroupFeed(groupIndex, feedId) {
    const group = groups[groupIndex];
    const current = group.feed_sequence_ids || [];
    const next = current.includes(feedId)
      ? current.filter((id) => id !== feedId)
      : [...current, feedId];
    updateGroup(groupIndex, { feed_sequence_ids: next });
  }

  function moveGroupFeed(groupIndex, feedId, direction) {
    const group = groups[groupIndex];
    const current = [...(group.feed_sequence_ids || [])];
    const from = current.indexOf(feedId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= current.length) return;
    [current[from], current[to]] = [current[to], current[from]];
    updateGroup(groupIndex, { feed_sequence_ids: current });
  }

  function toggleExpanded(groupId) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function deleteGroupWithConfirm(groupIndex) {
    const ok = await confirm({
      title: "Delete this experiment group?",
      message: "Removes it from every block and question that references it.",
      danger: true,
      confirmLabel: "Delete",
    });
    if (ok) deleteGroup(groupIndex);
  }

  function deleteGroup(groupIndex) {
    const removed = groups[groupIndex];
    const next = groups.filter((_, index) => index !== groupIndex);
    applyGroups(next);

    // Also drop the deleted group from any block's or question's visibility
    // list, so nothing silently references a group id that no longer
    // exists — previously only blocks got this treatment, leaving a
    // question scoped to a deleted group permanently hidden instead of
    // reverting to "shown to everyone" like blocks correctly do.
    if (removed) {
      onSurveyChange((prev) => {
        const nextBlocks = (Array.isArray(prev?.page_blocks) ? prev.page_blocks : []).map(
          (block) => ({
            ...block,
            visible_to_group_ids: (block.visible_to_group_ids || []).filter(
              (groupId) => groupId !== removed.id
            ),
          })
        );

        const nextQuestions = getQuestionList(prev).map((question) =>
          question?.type === EDITOR_PAGE_BREAK_TYPE
            ? question
            : {
                ...question,
                visible_to_group_ids: (question.visible_to_group_ids || []).filter(
                  (groupId) => groupId !== removed.id
                ),
              }
        );

        return setQuestionList({ ...prev, page_blocks: nextBlocks }, nextQuestions);
      });
    }
  }

  return (
    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--admin-border-subtle)", background: "var(--admin-surface-sunken)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--admin-text)" }}>Experiment groups</div>
          <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 2 }}>
            For between-subjects experiments: define groups here, then scope individual page blocks below to specific
            groups. Each participant is assigned to exactly one group automatically (evenly rotated), the first time
            they reach this survey. Leave this empty if you don't need group-scoped blocks — every block is shown to
            everyone by default.
          </div>
        </div>
        <button
          type="button"
          onClick={addGroup}
          style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--admin-accent)", background: "var(--admin-surface)", color: "var(--admin-accent-ink)", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          + Add group
        </button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          compact
          title="No experiment groups defined — all blocks are shown to every participant."
        />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {groups.map((group, groupIndex) => {
            const feedSeq = group.feed_sequence_ids || [];
            const isExpanded = expandedGroupIds.has(group.id);
            const feedById = new Map(safeLinkedFeeds.map((f) => [String(f.feed_id), f]));
            const summary = feedSeq.length
              ? feedSeq.map((fid) => feedById.get(fid)?.name || fid).join(" → ")
              : "Survey's default feed sequence";

            return (
              <div
                key={group.id}
                style={{ border: "1px solid var(--admin-border-subtle)", borderRadius: 8, background: "var(--admin-surface)", overflow: "hidden" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--admin-muted)", minWidth: 60 }}>
                    Group {groupIndex + 1}
                  </div>
                  <input
                    value={group.name}
                    onChange={(e) => updateGroup(groupIndex, { name: e.target.value })}
                    placeholder={`Group ${groupIndex + 1}`}
                    style={{ flex: 1, minWidth: 120, height: 32, border: "1px solid var(--admin-border)", borderRadius: 7, padding: "0 9px", fontSize: 12 }}
                  />
                  <IconOnlyButton onClick={() => deleteGroupWithConfirm(groupIndex)} title="Delete group" danger>
                    <TrashIcon size={12} />
                  </IconOnlyButton>
                </div>

                {safeLinkedFeeds.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--admin-border-subtle)", padding: "6px 8px", background: "var(--admin-surface-alt)" }}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "100%",
                        background: "none",
                        border: "none",
                        padding: "2px 0",
                        cursor: "pointer",
                        fontSize: 11,
                        color: feedSeq.length ? "var(--admin-info-ink)" : "var(--admin-muted)",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{isExpanded ? "▾" : "▸"} Feed sequence:</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {summary}
                      </span>
                    </button>

                    {isExpanded && (
                      <div style={{ marginTop: 6, paddingLeft: 4 }}>
                        <div style={{ fontSize: 10.5, color: "var(--admin-muted-2)", marginBottom: 6 }}>
                          Leave unchecked to use the survey's own feed sequence for this group. Only applies to
                          participants who arrive via the plain survey link (not a specific feed's link) — group
                          assignment still happens first, round-robin, exactly as before.
                        </div>
                        {safeLinkedFeeds.map((f) => {
                          const fid = String(f.feed_id);
                          const isChecked = feedSeq.includes(fid);
                          const orderIndex = feedSeq.indexOf(fid);
                          return (
                            <div
                              key={fid}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}
                            >
                              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, minWidth: 0 }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleGroupFeed(groupIndex, fid)}
                                />
                                {isChecked && (
                                  <span
                                    style={{
                                      fontSize: 11, fontWeight: 700, color: "var(--admin-info-ink)", background: "var(--admin-info-soft)",
                                      border: "1px solid var(--admin-info-border)", borderRadius: 999, padding: "1px 6px",
                                    }}
                                  >
                                    {orderIndex + 1}
                                  </span>
                                )}
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {f.name || fid}
                                </span>
                              </label>
                              {isChecked && (
                                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onClick={() => moveGroupFeed(groupIndex, fid, -1)}
                                    disabled={orderIndex <= 0}
                                    style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid var(--admin-border)", background: "var(--admin-surface)", fontSize: 11 }}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveGroupFeed(groupIndex, fid, 1)}
                                    disabled={orderIndex < 0 || orderIndex >= feedSeq.length - 1}
                                    style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid var(--admin-border)", background: "var(--admin-surface)", fontSize: 11 }}
                                  >
                                    ↓
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PageBlocksEditor({ survey, onSurveyChange }) {
  // Inclusion = expanded (starts empty = everything collapsed), matching
  // ExperimentGroupsEditor's expandedGroupIds convention just above — any
  // block added later is correctly collapsed by default too, with no extra
  // bookkeeping, unlike the previous inverted scheme this replaced.
  const [expandedBlockIds, setExpandedBlockIds] = useState(() => new Set());
  const confirm = useConfirm();
  const pages = Array.isArray(survey?.pages) ? survey.pages : [];
  const blocks = normalizeSurveyPageBlocks(survey);
  const experimentGroups = normalizeSurveyExperimentGroups(survey);
  const pageById = new Map(
    pages.map((page, index) => [
      String(page?.id || `page_${index + 1}`),
      { ...page, _pageNumber: index + 1 },
    ])
  );

  const applyBlocks = useCallback(
    (nextBlocks) => {
      onSurveyChange((prev) => {
        const normalizedBlocks = normalizeSurveyPageBlocks({
          ...prev,
          page_blocks: nextBlocks,
        });

        // Block order (and page order within/across blocks) is what
        // actually determines participant-facing page sequence
        // (materializePagesFromBlocks in utils-survey.js iterates blocks in
        // array order, each block's own page_ids in order) — but the
        // "Pages and questions" editor below reads survey.pages in its own
        // raw array order, independent of page_blocks. Without this, moving
        // a block/page here had zero visible effect on that list, even
        // though it silently changed the real delivery order. Every block
        // reorder/page-move funnels through this one function, so this is
        // the single place that needs to keep survey.pages in sync.
        const prevPages = Array.isArray(prev.pages) ? prev.pages : [];
        const pageById = new Map(
          prevPages.map((page, index) => [
            String(page?.id || `page_${index + 1}`),
            page,
          ])
        );
        const orderedPageIds = normalizedBlocks.flatMap((block) => block.page_ids);
        const orderedPages = orderedPageIds
          .map((pageId) => pageById.get(pageId))
          .filter(Boolean);

        return {
          ...prev,
          pages: orderedPages.length === prevPages.length ? orderedPages : prevPages,
          page_blocks: normalizedBlocks,
        };
      });
    },
    [onSurveyChange]
  );

  function updateBlock(blockIndex, patch) {
    const next = blocks.map((block, index) =>
      index === blockIndex ? { ...block, ...patch } : block
    );
    applyBlocks(next);
  }

  function moveBlock(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= blocks.length) return;
    applyBlocks(reorderArray(blocks, fromIndex, toIndex));
  }

  function addBlock() {
    applyBlocks([...blocks, makePageBlock(blocks.length)]);
  }

  async function deleteBlockWithConfirm(blockIndex) {
    if (blocks.length <= 1) return;
    const ok = await confirm({
      title: "Delete this block?",
      message: "Its pages will be merged into the previous block.",
      danger: true,
      confirmLabel: "Delete",
    });
    if (ok) deleteBlock(blockIndex);
  }

  function deleteBlock(blockIndex) {
    if (blocks.length <= 1) return;
    const removed = blocks[blockIndex];
    const next = blocks.filter((_, index) => index !== blockIndex);
    const destinationIndex = Math.max(0, blockIndex - 1);
    next[destinationIndex] = {
      ...next[destinationIndex],
      page_ids: [
        ...next[destinationIndex].page_ids,
        ...(removed?.page_ids || []),
      ],
    };
    applyBlocks(next);
  }

  function movePageWithinBlock(blockIndex, fromIndex, toIndex) {
    const block = blocks[blockIndex];
    if (!block || toIndex < 0 || toIndex >= block.page_ids.length) return;
    updateBlock(blockIndex, {
      page_ids: reorderArray(block.page_ids, fromIndex, toIndex),
    });
  }

  function movePageToBlock(pageId, fromBlockIndex, targetBlockId) {
    if (!targetBlockId || blocks[fromBlockIndex]?.id === targetBlockId) return;
    const next = blocks.map((block) => ({
      ...block,
      page_ids: block.page_ids.filter((id) => id !== pageId),
    }));
    const targetIndex = next.findIndex((block) => block.id === targetBlockId);
    if (targetIndex < 0) return;
    next[targetIndex] = {
      ...next[targetIndex],
      page_ids: [...next[targetIndex].page_ids, pageId],
    };
    applyBlocks(next);
  }

  function toggleBlockExpanded(blockId) {
    setExpandedBlockIds((current) => {
      const next = new Set(current);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  function toggleBlockGroupVisibility(blockIndex, groupId) {
    const block = blocks[blockIndex];
    if (!block) return;
    const current = new Set(block.visible_to_group_ids || []);
    if (current.has(groupId)) current.delete(groupId);
    else current.add(groupId);
    updateBlock(blockIndex, { visible_to_group_ids: Array.from(current) });
  }

  return (
    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--admin-border-subtle)", background: "var(--admin-surface-sunken)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--admin-text)" }}>Page blocks</div>
          <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 2 }}>
            Blocks stay in this order. Only pages inside blocks marked for randomisation will be shuffled for participants.
            {experimentGroups.length > 0
              ? " Blocks with no experiment group checked are shown to everyone; check one or more groups to restrict a block to only those participants."
              : ""}
          </div>
        </div>
        <button type="button" onClick={addBlock} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--admin-accent)", background: "var(--admin-surface)", color: "var(--admin-accent-ink)", fontWeight: 700, cursor: "pointer" }}>
          + Add block
        </button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {blocks.map((block, blockIndex) => {
          const isCollapsed = !expandedBlockIds.has(block.id);
          const pageCount = block.page_ids.length;

          return (
          <div key={block.id} style={{ border: "1px solid var(--admin-border-subtle)", borderRadius: 10, background: "var(--admin-surface)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--admin-surface-sunken)", borderBottom: isCollapsed ? "none" : "1px solid var(--admin-border-subtle)" }}>
              <IconOnlyButton
                onClick={() => toggleBlockExpanded(block.id)}
                title={isCollapsed ? "Expand block" : "Collapse block"}
                aria-label={isCollapsed ? `Expand block ${blockIndex + 1}` : `Collapse block ${blockIndex + 1}`}
              >
                <ChevronDownIcon size={12} open={!isCollapsed} />
              </IconOnlyButton>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--admin-muted)", minWidth: 50 }}>Block {blockIndex + 1}</div>
              <input
                value={block.title}
                onChange={(e) => updateBlock(blockIndex, { title: e.target.value })}
                placeholder={`Block ${blockIndex + 1}`}
                style={{ flex: 1, minWidth: 120, height: 32, border: "1px solid var(--admin-border)", borderRadius: 7, padding: "0 9px", fontSize: 12 }}
              />
              <div style={{ fontSize: 10, color: "var(--admin-muted)", whiteSpace: "nowrap" }}>
                {pageCount} {pageCount === 1 ? "page" : "pages"}
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--admin-text)", whiteSpace: "nowrap" }}>
                <input
                  type="checkbox"
                  checked={!!block.randomize_pages}
                  onChange={(e) => updateBlock(blockIndex, { randomize_pages: e.target.checked })}
                />
                Randomise pages
              </label>
              <IconOnlyButton onClick={() => moveBlock(blockIndex, blockIndex - 1)} title="Move block up" disabled={blockIndex === 0}>↑</IconOnlyButton>
              <IconOnlyButton onClick={() => moveBlock(blockIndex, blockIndex + 1)} title="Move block down" disabled={blockIndex === blocks.length - 1}>↓</IconOnlyButton>
              <IconOnlyButton onClick={() => deleteBlockWithConfirm(blockIndex)} title="Delete block" danger disabled={blocks.length <= 1}><TrashIcon size={12} /></IconOnlyButton>
            </div>

            {experimentGroups.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  padding: "6px 10px",
                  borderBottom: isCollapsed ? "none" : "1px solid var(--admin-border-subtle)",
                  background: "var(--admin-surface-alt)",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--admin-muted)", whiteSpace: "nowrap" }}>
                  Visible to:
                </span>
                <span style={{ fontSize: 10, color: "var(--admin-muted-2)", whiteSpace: "nowrap" }}>
                  {(block.visible_to_group_ids || []).length === 0
                    ? "everyone"
                    : null}
                </span>
                {experimentGroups.map((group) => (
                  <label
                    key={group.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      color: "var(--admin-text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={(block.visible_to_group_ids || []).includes(group.id)}
                      onChange={() => toggleBlockGroupVisibility(blockIndex, group.id)}
                    />
                    {group.name}
                  </label>
                ))}
              </div>
            )}

            {!isCollapsed ? (
            <div style={{ padding: 8, display: "grid", gap: 6 }}>
              {block.page_ids.length === 0 ? (
                <EmptyState compact title="No pages in this block." />
              ) : (
                block.page_ids.map((pageId, pageIndex) => {
                  const page = pageById.get(pageId);
                  const questionCount = Array.isArray(page?.questions) ? page.questions.length : 0;
                  return (
                    <div key={pageId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--admin-border-subtle)", borderRadius: 8 }}>
                      <div style={{ width: 52, fontSize: 11, fontWeight: 800, color: "var(--admin-muted)" }}>Page {page?._pageNumber || "?"}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--admin-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {String(page?.title || "").trim() || `Page ${page?._pageNumber || pageIndex + 1}`}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--admin-muted-2)" }}>{questionCount} {questionCount === 1 ? "question" : "questions"}</div>
                      </div>
                      <IconOnlyButton onClick={() => movePageWithinBlock(blockIndex, pageIndex, pageIndex - 1)} title="Move page up within block" disabled={pageIndex === 0}>↑</IconOnlyButton>
                      <IconOnlyButton onClick={() => movePageWithinBlock(blockIndex, pageIndex, pageIndex + 1)} title="Move page down within block" disabled={pageIndex === block.page_ids.length - 1}>↓</IconOnlyButton>
                      <select
                        value={block.id}
                        onChange={(e) => movePageToBlock(pageId, blockIndex, e.target.value)}
                        title="Move page to another block"
                        style={{ height: 30, border: "1px solid var(--admin-border)", borderRadius: 7, fontSize: 11, padding: "0 6px", background: "var(--admin-surface)" }}
                      >
                        {blocks.map((optionBlock, optionIndex) => (
                          <option key={optionBlock.id} value={optionBlock.id}>Block {optionIndex + 1}</option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>
            ) : null}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function StudyOutlineModal({
  survey,
  onSurveyChange,
  linkedFeeds,
  currentQuestions,
  moveQuestion,
  updateQuestion,
  duplicateQuestion,
  insertQuestionAt,
  removeQuestion,
  draggingId,
  dragOverId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onJumpTo,
  onClose,
}) {
  const confirm = useConfirm();
  const displayNumbers = useMemo(
    () => computeQuestionDisplayNumbers(currentQuestions),
    [currentQuestions]
  );

  const pageNumbers = useMemo(
    () => computePageNumbersForQuestions(currentQuestions),
    [currentQuestions]
  );

  const blockBoundaries = useMemo(
    () => computeBlockBoundariesForQuestions(survey, currentQuestions, pageNumbers),
    [survey, currentQuestions, pageNumbers]
  );

  const duplicateQuestionIds = useMemo(
    () => computeDuplicateQuestionIds(currentQuestions),
    [currentQuestions]
  );

  const brokenVisibleIfQuestionIds = useMemo(
    () => computeBrokenVisibleIfQuestionIds(currentQuestions),
    [currentQuestions]
  );

  const [outlineFilter, setOutlineFilter] = useState("");

  const questionCount = currentQuestions.filter(
    (item) => item?.type !== EDITOR_PAGE_BREAK_TYPE
  ).length;
  const pageBreakCount = currentQuestions.filter(
    (item) => item?.type === EDITOR_PAGE_BREAK_TYPE
  ).length;
  const pageCount = Math.max(1, pageBreakCount + 1);

  return (
    <Modal
      title="Study overview"
      subtitle={`${questionCount} ${questionCount === 1 ? "question" : "questions"} across ${pageCount} ${pageCount === 1 ? "page" : "pages"}. Drag to reorder, edit IDs inline, insert a page break, delete, or click question text to jump to it.`}
      onClose={onClose}
      width={860}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <ExperimentGroupsEditor survey={survey} onSurveyChange={onSurveyChange} linkedFeeds={linkedFeeds} />
      <PageBlocksEditor survey={survey} onSurveyChange={onSurveyChange} />

      <div
        style={{
          padding: "6px 8px 14px",
          borderTop: "1px solid var(--admin-border-subtle)",
        }}
      >
            <div
              style={{
                padding: "8px 4px 6px",
                fontSize: 12,
                fontWeight: 800,
                color: "var(--admin-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Pages and questions
            </div>

            {currentQuestions.length > 0 && (
              <input
                type="text"
                value={outlineFilter}
                onChange={(e) => setOutlineFilter(e.target.value)}
                placeholder="Filter by question ID, text, or type…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  height: 34,
                  padding: "0 10px",
                  marginBottom: 8,
                  border: "1px solid var(--admin-border)",
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              />
            )}

            {currentQuestions.length === 0 ? (
              <EmptyState compact title="No questions yet." />
            ) : (
              currentQuestions.map((item, i) => {
                if (!matchesQuestionFilter(item, outlineFilter)) return null;
                return (
                <React.Fragment key={item._editorId || i}>
                <BlockBoundaryDivider boundary={blockBoundaries[i]} />
                <OutlineRow
                item={item}
                flatIndex={i}
                displayNumber={displayNumbers[i]}
                pageNumber={pageNumbers[i]}
                isDuplicateId={item?.id ? duplicateQuestionIds.has(item.id) : false}
                hasBrokenCondition={item?.id ? brokenVisibleIfQuestionIds.has(item.id) : false}
                totalCount={currentQuestions.length}
                onMoveUp={() => moveQuestion(i, i - 1)}
                onMoveDown={() => moveQuestion(i, i + 1)}
                onJump={() => onJumpTo(item._editorId)}
                onIdChange={(nextValue) => {
                  const cleanedId = sanitizeQuestionId(nextValue, "");
                  let nextQuestion = { ...item, id: cleanedId };
                  if (cleanedId && shouldAutoRewriteRowValues(nextQuestion)) {
                    nextQuestion = rewriteQuestionRowValues(nextQuestion, cleanedId);
                  }
                  updateQuestion(i, nextQuestion);
                }}
                onDuplicate={() => duplicateQuestion(i)}
                onInsertPageBreakAfter={() =>
                  insertQuestionAt(i, EDITOR_PAGE_BREAK_TYPE, "below")
                }
                onDelete={async () => {
                  const isBreak = item.type === EDITOR_PAGE_BREAK_TYPE;
                  if (
                    await confirm({
                      title: isBreak ? "Delete this page break?" : "Delete this question?",
                      danger: true,
                      confirmLabel: "Delete",
                    })
                  ) {
                    removeQuestion(i);
                  }
                }}
                draggingId={draggingId}
                dragOverId={dragOverId}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                />
                </React.Fragment>
                );
              })
            )}
          </div>
    </Modal>
  );
}

/* =========================
   Main editor component
   ========================= */

export function SurveyEditor({
  survey,
  onSurveyChange,
  linkedFeeds = [],
  linkedFeedPostsMap = {},
  feedSequenceIds = [],
}) {
  const [draggingQuestionId, setDraggingQuestionId] = useState(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewQuestionId, setPreviewQuestionId] = useState(null);
  const [highlightedQuestionId, setHighlightedQuestionId] = useState(null);

  function openPreview(questionId = null) {
    setPreviewQuestionId(questionId);
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewQuestionId(null);
  }
  // Question cards start collapsed by default (per direct user feedback) —
  // same set of ids collapseAllQuestions() below would produce, just as the
  // initial state instead of a user action.
  const [collapsedQuestionIds, setCollapsedQuestionIds] = useState(
    () =>
      new Set(
        getQuestionList(survey)
          .filter((item) => item?.type !== EDITOR_PAGE_BREAK_TYPE)
          .map((item) => item._editorId)
      )
  );
  const questionNodeRefs = useRef({});

  const currentQuestions = useMemo(() => getQuestionList(survey), [survey]);
  const experimentGroups = useMemo(
    () => normalizeSurveyExperimentGroups(survey),
    [survey]
  );

  function toggleQuestionCollapsed(editorId) {
    setCollapsedQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(editorId)) next.delete(editorId);
      else next.add(editorId);
      return next;
    });
  }

  function collapseAllQuestions() {
    setCollapsedQuestionIds(
      new Set(
        currentQuestions
          .filter((item) => item?.type !== EDITOR_PAGE_BREAK_TYPE)
          .map((item) => item._editorId)
      )
    );
  }

  function expandAllQuestions() {
    setCollapsedQuestionIds(new Set());
  }
  const overviewQuestionCount = currentQuestions.filter(
    (item) => item?.type !== EDITOR_PAGE_BREAK_TYPE
  ).length;
  const overviewPageCount =
    currentQuestions.filter((item) => item?.type === EDITOR_PAGE_BREAK_TYPE).length + 1;
  const overviewBlockCount = normalizeSurveyPageBlocks(survey).length;

  function jumpToQuestion(editorId) {
    setOutlineOpen(false);
    setCollapsedQuestionIds((current) => {
      if (!current.has(editorId)) return current;
      const next = new Set(current);
      next.delete(editorId);
      return next;
    });
    requestAnimationFrame(() => {
      const el = questionNodeRefs.current[editorId];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedQuestionId(editorId);
      setTimeout(() => {
        setHighlightedQuestionId((cur) => (cur === editorId ? null : cur));
      }, 1600);
    });
  }

  const orderedLinkedFeeds = useMemo(
    () => orderFeedsBySequence(linkedFeeds, feedSequenceIds || survey?.feed_sequence_ids || []),
    [linkedFeeds, feedSequenceIds, survey?.feed_sequence_ids]
  );

  const questionDisplayNumbers = useMemo(
    () => computeQuestionDisplayNumbers(currentQuestions),
    [currentQuestions]
  );

  const pageNumbersForBlocks = useMemo(
    () => computePageNumbersForQuestions(currentQuestions),
    [currentQuestions]
  );

  const blockBoundaries = useMemo(
    () => computeBlockBoundariesForQuestions(survey, currentQuestions, pageNumbersForBlocks),
    [survey, currentQuestions, pageNumbersForBlocks]
  );

  const duplicateQuestionIds = useMemo(
    () => computeDuplicateQuestionIds(currentQuestions),
    [currentQuestions]
  );

  const brokenVisibleIfQuestionIds = useMemo(
    () => computeBrokenVisibleIfQuestionIds(currentQuestions),
    [currentQuestions]
  );

  function addQuestion(type) {
    onSurveyChange((prev) => {
      const current = getQuestionList(prev);
      return setQuestionList(prev, [
        ...current,
        makeBackendQuestionFromType(type, current.length),
      ]);
    });
  }

  function insertQuestionAt(index, type, position = "below") {
    onSurveyChange((prev) => {
      const current = getQuestionList(prev);
      const insertIndex = position === "above" ? index : index + 1;
      const nextQuestions = [...current];
      nextQuestions.splice(
        insertIndex,
        0,
        makeBackendQuestionFromType(type, insertIndex)
      );
      return setQuestionList(prev, nextQuestions);
    });
  }

  function duplicateQuestion(index) {
    onSurveyChange((prev) => {
      const currentQuestionsCopy = [...getQuestionList(prev)];
      const sourceQuestion = currentQuestionsCopy[index];

      if (!sourceQuestion) return prev;

      const existingIds = currentQuestionsCopy
        .filter((q) => q?.type !== EDITOR_PAGE_BREAK_TYPE)
        .map((q) => q?.id)
        .filter(Boolean);

      const nextId = makeCopiedQuestionId(existingIds, sourceQuestion.id);

      let copiedQuestion = {
        ...sourceQuestion,
        _editorId: makeEditorId(),
        id: nextId,
        meta: sourceQuestion?.meta ? { ...sourceQuestion.meta } : {},
        visible_if: sourceQuestion?.visible_if
          ? JSON.parse(JSON.stringify(sourceQuestion.visible_if))
          : null,
        visible_in_feeds: normalizeVisibleInFeeds(
          sourceQuestion?.visible_in_feeds
        ),
        feed_overrides: normalizeFeedOverridesMap(
          sourceQuestion?.feed_overrides
        ),
        post_id: String(sourceQuestion?.post_id ?? ""),
        post_label: String(sourceQuestion?.post_label ?? ""),
        post_feed_id: String(sourceQuestion?.post_feed_id ?? ""),
        apply_feed_randomization: sourceQuestion?.apply_feed_randomization !== false,
        reminder_interactive: !!sourceQuestion?.reminder_interactive,
        recall_enabled: !!sourceQuestion?.recall_enabled,
        recall_distractor_texts: normalizeRecallDistractorTextsForEditor(
          sourceQuestion?.recall_distractor_texts
        ),
      };

      if (shouldAutoRewriteRowValues(copiedQuestion)) {
        copiedQuestion = rewriteQuestionRowValues(copiedQuestion, nextId);
      }

      copiedQuestion = normalizeQuestionForEditor(copiedQuestion, index + 1);

      currentQuestionsCopy.splice(index + 1, 0, copiedQuestion);
      return setQuestionList(prev, currentQuestionsCopy);
    });
  }

  function updateQuestion(index, patch) {
    onSurveyChange((prev) => {
      const currentQuestionsCopy = [...getQuestionList(prev)];
      const currentQuestion = currentQuestionsCopy[index] || {};
      const merged =
        patch && typeof patch === "object" && !Array.isArray(patch)
          ? { ...currentQuestion, ...patch }
          : currentQuestion;

      currentQuestionsCopy[index] = normalizeQuestionForEditor(merged, index);
      return setQuestionList(prev, currentQuestionsCopy);
    });
  }

  function removeQuestion(index) {
    onSurveyChange((prev) => {
      const currentQuestionsCopy = [...getQuestionList(prev)];
      const removedId = String(currentQuestionsCopy[index]?.id || "").trim();
      currentQuestionsCopy.splice(index, 1);

      // Mirrors ExperimentGroupsEditor.deleteGroup's cleanup below — deleting
      // a question shouldn't leave some other question silently pointed at a
      // ghost visible_if.question_id.
      const cleaned = removedId
        ? currentQuestionsCopy.map((question) =>
            question?.visible_if?.question_id === removedId
              ? { ...question, visible_if: null }
              : question
          )
        : currentQuestionsCopy;

      return setQuestionList(prev, cleaned);
    });
  }

  function moveQuestion(fromIndex, toIndex) {
    onSurveyChange((prev) => {
      const current = getQuestionList(prev);
      const reordered = reorderArray(current, fromIndex, toIndex);
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
    const fromIndex = questions.findIndex((q) => q._editorId === draggingQuestionId);
    const toIndex = questions.findIndex((q) => q._editorId === targetQuestionId);

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

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 14px",
          marginBottom: 14,
          border: "1px solid var(--admin-border-subtle)",
          borderRadius: 12,
          background: "var(--admin-surface-sunken)",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 750, color: "var(--admin-text)" }}>
            Study structure
          </div>
          <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 2 }}>
            {overviewQuestionCount} {overviewQuestionCount === 1 ? "question" : "questions"} · {overviewPageCount} {overviewPageCount === 1 ? "page" : "pages"} · {overviewBlockCount} {overviewBlockCount === 1 ? "block" : "blocks"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            onClick={collapseAllQuestions}
            disabled={currentQuestions.length === 0}
            title="Collapse every question to just its header row"
          >
            Collapse all
          </Button>

          <Button
            variant="secondary"
            onClick={expandAllQuestions}
            disabled={currentQuestions.length === 0}
            title="Expand every question"
          >
            Expand all
          </Button>

          <Button
            variant="primary"
            onClick={() => setOutlineOpen(true)}
            disabled={currentQuestions.length === 0}
            title="See the whole study structure at once and reorder without scrolling"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
            Study overview
          </Button>

          <Button
            variant="secondary"
            onClick={() => openPreview()}
            disabled={currentQuestions.length === 0}
            title="See exactly what a participant would see, including conditional questions and group variations"
          >
            Preview
          </Button>
        </div>
      </div>

      {previewOpen && (
        <SurveyPreviewModal
          survey={survey}
          experimentGroups={experimentGroups}
          linkedFeeds={orderedLinkedFeeds}
          linkedFeedPostsMap={linkedFeedPostsMap}
          feedSequenceIds={feedSequenceIds}
          initialQuestionId={previewQuestionId}
          onClose={closePreview}
        />
      )}

      <Card title="Questions">
        <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 18 }}>
          Drag items by the dotted handle to reorder them. Use the + buttons on the borders
          to insert new questions, or use Study overview above for a compact, scroll-free view of the full study.
        </div>

        {currentQuestions.map((q, i) => (
          <React.Fragment key={q._editorId || i}>
          <BlockBoundaryDivider boundary={blockBoundaries[i]} />
          <div
            ref={(el) => {
              questionNodeRefs.current[q._editorId] = el;
            }}
            style={{
              borderRadius: 14,
              outline:
                highlightedQuestionId === q._editorId
                  ? "3px solid var(--admin-accent)"
                  : "3px solid transparent",
              outlineOffset: 4,
              transition: "outline-color 0.2s ease",
            }}
          >
            <QuestionCard
              q={q}
              index={i}
              displayNumber={questionDisplayNumbers[i]}
              totalQuestions={currentQuestions.length}
              isDuplicateId={q?.id ? duplicateQuestionIds.has(q.id) : false}
              hasBrokenCondition={q?.id ? brokenVisibleIfQuestionIds.has(q.id) : false}
              linkedFeeds={orderedLinkedFeeds}
              linkedFeedPostsMap={linkedFeedPostsMap}
              experimentGroups={experimentGroups}
              eligibleSourceQuestions={currentQuestions
                .slice(0, i)
                .filter((sq) => VISIBLE_IF_ELIGIBLE_TYPES.includes(sq?.type))}
              updateQuestion={updateQuestion}
              removeQuestion={removeQuestion}
              moveQuestion={moveQuestion}
              duplicateQuestion={duplicateQuestion}
              insertQuestionAt={insertQuestionAt}
              draggingId={draggingQuestionId}
              dragOverId={dragOverQuestionId}
              onDragStart={handleQuestionDragStart}
              onDragOver={handleQuestionDragOver}
              onDrop={handleQuestionDrop}
              onDragEnd={handleQuestionDragEnd}
              isCollapsed={collapsedQuestionIds.has(q._editorId)}
              onToggleCollapsed={() => toggleQuestionCollapsed(q._editorId)}
              onPreviewQuestion={openPreview}
            />
          </div>
          </React.Fragment>
        ))}

        {currentQuestions.length === 0 && (
          <EmptyState
            title="No questions yet"
            action={
              <InsertAtBorderButton
                position="bottom"
                onInsert={(nextType) => addQuestion(nextType)}
              />
            }
          />
        )}
      </Card>

      {outlineOpen && (
        <StudyOutlineModal
          survey={survey}
          onSurveyChange={onSurveyChange}
          linkedFeeds={orderedLinkedFeeds}
          currentQuestions={currentQuestions}
          moveQuestion={moveQuestion}
          updateQuestion={updateQuestion}
          duplicateQuestion={duplicateQuestion}
          insertQuestionAt={insertQuestionAt}
          removeQuestion={removeQuestion}
          draggingId={draggingQuestionId}
          dragOverId={dragOverQuestionId}
          onDragStart={handleQuestionDragStart}
          onDragOver={handleQuestionDragOver}
          onDrop={handleQuestionDrop}
          onDragEnd={handleQuestionDragEnd}
          onJumpTo={jumpToQuestion}
          onClose={() => setOutlineOpen(false)}
        />
      )}
    </>
  );
}
