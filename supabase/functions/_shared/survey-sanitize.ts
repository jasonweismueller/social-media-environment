// Manual Deno port of the survey normalization/sanitization pipeline in
// src/utils/utils-survey.js (functions: normalizeSurvey, frontendSurveyToBackend,
// reconcilePageBlocks, normalizeQuestion, normalizeExperimentGroups, and their
// helpers — everything up through frontendSurveyToBackend, roughly lines 1-1440
// as of the Phase 1/2 migration work on 2026-08-01).
//
// This is Phase 2's port of Code.gs's sanitizeSurveyDef_ (which this repo can't
// read directly — see CLAUDE.md "Backend: Google Apps Script"): the frontend's
// own normalizeSurvey/frontendSurveyToBackend pipeline IS the authoritative
// shape of a sanitized survey definition (Code.gs's copy is a defensive second
// pass over the same shape), so this ports that pipeline rather than guessing
// at Code.gs's implementation.
//
// IMPORTANT: there is no automated way to share code between the Vite/browser
// frontend and this Deno edge runtime in this repo. If utils-survey.js's
// normalization logic changes, this file needs the same change made by hand —
// same footgun CLAUDE.md already documents for the 4-places page-block-reconciliation
// duplication (Code.gs / utils-survey.js / two admin components). Adding this
// file makes it 5. Whoever owns Phase 4 (wiring the frontend to Supabase) should
// strongly consider collapsing utils-survey.js's pipeline down to one canonical
// copy that both sides import, now that this exists as a second copy to drift
// from — not attempted here since Phase 2 is scoped to standing the backend
// logic up, not restructuring the frontend.

/* =========================
   Basics
   ========================= */

export const uid = (): string =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export const SURVEY_DELIVERY_MODES = {
  FEED_THEN_SURVEY: "feed_then_survey",
  MULTI_FEED_THEN_SURVEY: "multi_feed_then_survey",
  SURVEY_ONLY: "survey_only",
} as const;

export function normalizeSurveyDeliveryMode(value: unknown): string {
  const v = String(value || "").trim().toLowerCase();
  if (v === SURVEY_DELIVERY_MODES.SURVEY_ONLY) return SURVEY_DELIVERY_MODES.SURVEY_ONLY;
  if (v === SURVEY_DELIVERY_MODES.MULTI_FEED_THEN_SURVEY) return SURVEY_DELIVERY_MODES.MULTI_FEED_THEN_SURVEY;
  return SURVEY_DELIVERY_MODES.FEED_THEN_SURVEY;
}

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
} as const;

export function isValidSurveyQuestionType(type: unknown): boolean {
  return Object.values(SURVEY_QUESTION_TYPES).includes(type as never);
}

// Mirrors ATTENTION_CHECK_ELIGIBLE_TYPES in src/utils/utils-survey.js.
const ATTENTION_CHECK_ELIGIBLE_TYPES: string[] = [
  SURVEY_QUESTION_TYPES.SINGLE,
  SURVEY_QUESTION_TYPES.DROPDOWN,
];

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function cleanStringArray(arr: unknown = []): string[] {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

function uniqueStringArray(arr: unknown = []): string[] {
  return Array.from(new Set(cleanStringArray(arr)));
}

function sanitizeQuestionId(value: unknown, fallback = ""): string {
  const cleaned = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
  return cleaned || fallback;
}

function sanitizeStructuredValue(value: unknown, fallback = ""): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");
  return cleaned || fallback;
}

function normalizePageDelaySeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function makeSequentialValue(prefix: string, index: number): string {
  return `${prefix}_${index + 1}`;
}

function makeMatrixRowValue(questionId: unknown, index: number): string {
  const base = sanitizeQuestionId(questionId);
  return base ? `${base}_${index + 1}` : makeSequentialValue("row", index);
}

function normalizeChoiceArray(rawChoices: unknown = []): string[] {
  if (!Array.isArray(rawChoices)) return [];
  return rawChoices
    .map((c) => {
      if (typeof c === "string") return c.trim();
      if (c && typeof c === "object") {
        return String((c as any).label ?? (c as any).value ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeStructuredItems(items: unknown = [], prefix = "item"): Array<{ value: string; label: string }> {
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
        const value = sanitizeStructuredValue((item as any).value, fallbackValue);
        const label = String((item as any).label ?? (item as any).value ?? "").trim();
        return value || label ? { value: value || fallbackValue, label } : null;
      }

      return null;
    })
    .filter((x): x is { value: string; label: string } => Boolean(x));
}

type MatrixRow = {
  value: string;
  label: string;
  is_attention_check: boolean;
  attention_check_value: string;
};

function normalizeMatrixRows(items: unknown = [], questionId = ""): MatrixRow[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, i) => {
      if (typeof item === "string") {
        const label = item.trim();
        return label
          ? { value: makeMatrixRowValue(questionId, i), label, is_attention_check: false, attention_check_value: "" }
          : null;
      }

      if (item && typeof item === "object") {
        const fallbackValue = makeMatrixRowValue(questionId, i);
        const value = sanitizeStructuredValue((item as any).value, fallbackValue);
        const label = String((item as any).label ?? (item as any).value ?? "").trim();
        return value || label
          ? {
              value: value || fallbackValue,
              label,
              is_attention_check: !!(item as any).is_attention_check,
              attention_check_value: String((item as any).attention_check_value ?? ""),
            }
          : null;
      }

      return null;
    })
    .filter((x): x is MatrixRow => Boolean(x));
}

type BipolarRow = {
  value: string;
  label: string;
  left_label: string;
  right_label: string;
  is_attention_check: boolean;
  attention_check_value: string;
};

function normalizeBipolarRows(items: unknown = [], questionId = ""): BipolarRow[] {
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
              is_attention_check: false,
              attention_check_value: "",
            }
          : null;
      }

      if (item && typeof item === "object") {
        const fallbackValue = makeMatrixRowValue(questionId, i);
        const value = sanitizeStructuredValue((item as any).value, fallbackValue);
        const label = String((item as any).label ?? "").trim();
        const leftLabel = String((item as any).left_label ?? (item as any).label ?? "").trim();
        const rightLabel = String((item as any).right_label ?? "").trim();

        return value || label || leftLabel || rightLabel
          ? {
              value: value || fallbackValue,
              label: label || leftLabel || `Row ${i + 1}`,
              left_label: leftLabel || label || "",
              right_label: rightLabel,
              is_attention_check: !!(item as any).is_attention_check,
              attention_check_value: String((item as any).attention_check_value ?? ""),
            }
          : null;
      }

      return null;
    })
    .filter((x): x is BipolarRow => Boolean(x));
}

function normalizeVisibleInFeeds(value: unknown = []): string[] {
  return uniqueStringArray(value);
}

function normalizeFeedOverrides(value: unknown = {}): Record<string, { text: string }> {
  const source = asObject(value);
  const out: Record<string, { text: string }> = {};

  Object.entries(source).forEach(([feedId, override]) => {
    const cleanFeedId = String(feedId ?? "").trim();
    if (!cleanFeedId) return;

    const safeOverride = asObject(override);
    out[cleanFeedId] = { text: String(safeOverride.text ?? "") };
  });

  return out;
}

function pruneFeedOverridesByVisibleFeeds(
  feedOverrides: unknown = {},
  visibleInFeeds: unknown = []
): Record<string, { text: string }> {
  const allowedFeedIds = normalizeVisibleInFeeds(visibleInFeeds);
  const allowed = new Set(allowedFeedIds);
  const normalized = normalizeFeedOverrides(feedOverrides);
  const out: Record<string, { text: string }> = {};

  Object.entries(normalized).forEach(([feedId, override]) => {
    if (allowed.size > 0 && !allowed.has(feedId)) return;
    if (String(override?.text ?? "").trim()) {
      out[feedId] = { text: String(override.text ?? "") };
    }
  });

  return out;
}

function isPageBreakQuestion(question: any): boolean {
  return question?.type === SURVEY_QUESTION_TYPES.PAGE_BREAK;
}

function isDisplayOnlyQuestion(question: any): boolean {
  // Mirrors the frontend's identical carve-out (utils-survey.js) — a
  // "recall" post-reminder (recall_enabled) is a real answerable question,
  // not a passive display block.
  if (question?.type === SURVEY_QUESTION_TYPES.POST_REMINDER) {
    return !question?.recall_enabled;
  }
  return (
    question?.type === SURVEY_QUESTION_TYPES.INFO ||
    question?.type === SURVEY_QUESTION_TYPES.PAGE_BREAK
  );
}

// Always exactly 2 entries — mirrors utils-survey.js's identical helper.
function normalizeRecallDistractorTexts(arr: unknown): string[] {
  const out = (Array.isArray(arr) ? arr : []).slice(0, 2).map((v) => String(v ?? ""));
  while (out.length < 2) out.push("");
  return out;
}

function normalizeRichSurveyField(value: unknown, fallback = ""): string {
  return String(value ?? fallback);
}

/* =========================
   Page blocks
   ========================= */

function sanitizePageBlockId(value: unknown, fallback = ""): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned || fallback;
}

function sanitizeExperimentGroupId(value: unknown, fallback = ""): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned || fallback;
}

/**
 * Ensures experiment group ids are unique and non-empty. Legacy/missing
 * names get a positional default ("Group 1", "Group 2", ...).
 */
export function normalizeExperimentGroups(
  experimentGroups: unknown = []
): Array<{ id: string; name: string; feed_sequence_ids: string[] }> {
  const usedIds = new Set<string>();

  return (Array.isArray(experimentGroups) ? experimentGroups : []).map((rawGroup, index) => {
    const source = asObject(rawGroup);

    let groupId = sanitizeExperimentGroupId(source.id, `group_${index + 1}`);

    if (usedIds.has(groupId)) {
      const baseId = groupId;
      let suffix = 2;
      while (usedIds.has(`${baseId}_${suffix}`)) suffix += 1;
      groupId = `${baseId}_${suffix}`;
    }

    usedIds.add(groupId);

    return {
      id: groupId,
      name: String(source.name || `Group ${index + 1}`),
      // Empty means "use the survey's own feed_sequence_ids/linked_feed_ids"
      // — only meaningful for feed_then_survey/multi_feed_then_survey
      // studies reached via a direct survey link (no ?feed_id= pinned).
      feed_sequence_ids: uniqueStringArray(source.feed_sequence_ids),
    };
  });
}

export function frontendExperimentGroupsToBackend(
  experimentGroups: unknown = []
): Array<{ id: string; name: string; feed_sequence_ids: string[] }> {
  return normalizeExperimentGroups(experimentGroups).map((group) => ({
    id: group.id,
    name: group.name,
    feed_sequence_ids: group.feed_sequence_ids,
  }));
}

/**
 * Drops question-level visible_to_group_ids references to experiment groups
 * that no longer exist (e.g. a group was deleted from the survey).
 */
function pruneQuestionGroupVisibility(pages: any[] = [], validGroupIds: string[] | null = null): any[] {
  if (!Array.isArray(validGroupIds)) return pages;
  const validSet = new Set(validGroupIds);

  return (Array.isArray(pages) ? pages : []).map((page) => ({
    ...page,
    questions: (Array.isArray(page?.questions) ? page.questions : []).map((question: any) => ({
      ...question,
      visible_to_group_ids: uniqueStringArray(question?.visible_to_group_ids).filter((groupId) =>
        validSet.has(groupId)
      ),
    })),
  }));
}

/**
 * Ensures that: every page belongs to exactly one block; deleted page IDs
 * are removed; duplicate page assignments are removed; block IDs are
 * unique; legacy surveys receive one default block; newly created/
 * unassigned pages are appended to the final block.
 */
export function reconcilePageBlocks(
  pages: any[] = [],
  pageBlocks: any[] = [],
  experimentGroupIds: string[] | null = null
): any[] {
  const safePages = (Array.isArray(pages) ? pages : []).map(normalizePage).filter(Boolean);

  const pageIds = safePages.map((page) => String(page?.id ?? "").trim()).filter(Boolean);

  const validPageIds = new Set(pageIds);
  const assignedPageIds = new Set<string>();
  const usedBlockIds = new Set<string>();

  const validGroupIds = Array.isArray(experimentGroupIds)
    ? new Set(experimentGroupIds.map((id) => String(id ?? "").trim()).filter(Boolean))
    : null;

  const sourceBlocks = Array.isArray(pageBlocks) ? pageBlocks : [];
  const normalizedBlocks: any[] = [];

  sourceBlocks.forEach((rawBlock, blockIndex) => {
    const source = asObject(rawBlock);

    let blockId = sanitizePageBlockId(source.id, `block_${blockIndex + 1}`);

    if (usedBlockIds.has(blockId)) {
      const baseId = blockId;
      let suffix = 2;
      while (usedBlockIds.has(`${baseId}_${suffix}`)) suffix += 1;
      blockId = `${baseId}_${suffix}`;
    }

    usedBlockIds.add(blockId);

    const blockPageIds: string[] = [];

    uniqueStringArray(source.page_ids).forEach((pageId) => {
      if (!validPageIds.has(pageId)) return;
      if (assignedPageIds.has(pageId)) return;

      assignedPageIds.add(pageId);
      blockPageIds.push(pageId);
    });

    const rawVisibleToGroupIds = uniqueStringArray(source.visible_to_group_ids);
    const visibleToGroupIds = validGroupIds
      ? rawVisibleToGroupIds.filter((groupId) => validGroupIds.has(groupId))
      : rawVisibleToGroupIds;

    normalizedBlocks.push({
      id: blockId,
      title: String(source.title || `Block ${blockIndex + 1}`),
      randomize_pages: !!source.randomize_pages,
      page_ids: blockPageIds,
      visible_to_group_ids: visibleToGroupIds,
    });
  });

  const unassignedPageIds = pageIds.filter((pageId) => !assignedPageIds.has(pageId));

  if (!normalizedBlocks.length) {
    return [
      {
        id: "block_1",
        title: "All pages",
        randomize_pages: false,
        page_ids: [...pageIds],
        visible_to_group_ids: [],
      },
    ];
  }

  if (unassignedPageIds.length) {
    const lastIndex = normalizedBlocks.length - 1;
    normalizedBlocks[lastIndex] = {
      ...normalizedBlocks[lastIndex],
      page_ids: [...normalizedBlocks[lastIndex].page_ids, ...unassignedPageIds],
    };
  }

  return normalizedBlocks;
}

export function frontendPageBlocksToBackend(
  pageBlocks: any[] = [],
  pages: any[] = [],
  experimentGroupIds: string[] | null = null
): any[] {
  return reconcilePageBlocks(pages, pageBlocks, experimentGroupIds).map((block) => ({
    id: block.id,
    title: block.title,
    randomize_pages: !!block.randomize_pages,
    page_ids: [...block.page_ids],
    visible_to_group_ids: [...(block.visible_to_group_ids || [])],
  }));
}

/* =========================
   Question mapping
   ========================= */

export function normalizeQuestion(raw: any = {}): any {
  const type = isValidSurveyQuestionType(raw.type) ? raw.type : SURVEY_QUESTION_TYPES.TEXT;

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

  const normalizedColumns = Array.isArray(raw.columns) ? normalizeStructuredItems(raw.columns, "col") : [];

  const visibleInFeeds = normalizeVisibleInFeeds(raw.visible_in_feeds);
  const feedOverrides = pruneFeedOverridesByVisibleFeeds(raw.feed_overrides, visibleInFeeds);

  const postId = type === SURVEY_QUESTION_TYPES.POST_REMINDER ? String(raw.post_id ?? meta.post_id ?? "") : "";
  const postLabel =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER ? String(raw.post_label ?? meta.post_label ?? "") : "";
  const postFeedId =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER ? String(raw.post_feed_id ?? meta.post_feed_id ?? "") : "";
  const applyFeedRandomization =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER
      ? (raw.apply_feed_randomization ?? meta.apply_feed_randomization ?? true) !== false
      : true;
  const reminderInteractive =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER
      ? !!(raw.reminder_interactive ?? meta.reminder_interactive ?? false)
      : false;
  const recallEnabled =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER
      ? !!(raw.recall_enabled ?? meta.recall_enabled ?? false)
      : false;
  const recallDistractorTexts =
    type === SURVEY_QUESTION_TYPES.POST_REMINDER
      ? normalizeRecallDistractorTexts(raw.recall_distractor_texts ?? meta.recall_distractor_texts)
      : normalizeRecallDistractorTexts([]);

  return {
    id: questionId,
    type,
    text,
    label: text,
    description: String(raw.description || ""),
    required: isDisplayOnlyQuestion({ type, recall_enabled: recallEnabled }) ? false : !!raw.required,
    randomize_options: !!raw.randomize_options,
    is_attention_check: ATTENTION_CHECK_ELIGIBLE_TYPES.includes(type) && !!raw.is_attention_check,
    attention_check_value: String(raw.attention_check_value ?? ""),

    choices: Array.isArray(raw.choices)
      ? raw.choices.map((c: any, i: number) => ({
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
                  Number.isFinite(raw.max) && Number.isFinite(raw.min) ? Number(raw.max) - Number(raw.min) + 1 : 7
                ),
              },
              (_, i) => ({
                value: String((Number.isFinite(raw.min) ? Number(raw.min) : 1) + i),
                label: String((Number.isFinite(raw.min) ? Number(raw.min) : 1) + i),
              })
            )
        : normalizedColumns,

    options: cleanStringArray(
      Array.isArray(raw.options) && raw.options.length ? raw.options : normalizeChoiceArray(raw.choices)
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
    visible_to_group_ids: uniqueStringArray(raw.visible_to_group_ids),
    placeholder: String(raw.placeholder || ""),
    post_id: postId,
    post_label: postLabel,
    post_feed_id: postFeedId,
    apply_feed_randomization: applyFeedRandomization,
    reminder_interactive: reminderInteractive,
    recall_enabled: recallEnabled,
    recall_distractor_texts: recallDistractorTexts,
    next_delay_seconds: normalizePageDelaySeconds(raw.next_delay_seconds),
    meta: {
      ...meta,
      ...(type === SURVEY_QUESTION_TYPES.POST_REMINDER
        ? {
            post_id: postId,
            post_label: postLabel,
            post_feed_id: postFeedId,
            apply_feed_randomization: applyFeedRandomization,
            reminder_interactive: reminderInteractive,
            recall_enabled: recallEnabled,
            recall_distractor_texts: recallDistractorTexts,
          }
        : {}),
    },
  };
}

export function frontendQuestionToBackend(question: any = {}): any {
  const q = normalizeQuestion(question);

  const base = {
    id: q.id,
    type: q.type,
    text: q.text,
    description: q.description,
    required: isDisplayOnlyQuestion(q) ? false : !!q.required,
    visible_in_feeds: q.visible_in_feeds,
    feed_overrides: q.feed_overrides,
    visible_to_group_ids: q.visible_to_group_ids,
    is_attention_check: ATTENTION_CHECK_ELIGIBLE_TYPES.includes(q.type) && !!q.is_attention_check,
    attention_check_value: String(q.attention_check_value ?? ""),
    meta: {
      ...(q.meta || {}),
      ...(q.type === SURVEY_QUESTION_TYPES.POST_REMINDER
        ? {
            post_id: String(q.post_id ?? ""),
            post_label: String(q.post_label ?? ""),
            post_feed_id: String(q.post_feed_id ?? ""),
            apply_feed_randomization: q.apply_feed_randomization !== false,
            reminder_interactive: !!q.reminder_interactive,
            recall_enabled: !!q.recall_enabled,
            recall_distractor_texts: normalizeRecallDistractorTexts(q.recall_distractor_texts),
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
            ? q.choices.map((choice: any, i: number) => ({
                value: sanitizeStructuredValue(choice?.value, `opt_${i + 1}`),
                label: String(choice?.label ?? ""),
              }))
            : q.options.map((opt: string, i: number) => ({ value: `opt_${i + 1}`, label: opt })),
        randomize_options: !!q.randomize_options,
      };

    case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
    case SURVEY_QUESTION_TYPES.MATRIX_MULTI:
      return {
        ...base,
        rows: Array.isArray(q.rows)
          ? q.rows.map((row: any, i: number) => ({
              value: sanitizeStructuredValue(row?.value, makeMatrixRowValue(q.id, i)),
              label: String(row?.label ?? ""),
              is_attention_check: q.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE && !!row?.is_attention_check,
              attention_check_value:
                q.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ? String(row?.attention_check_value ?? "") : "",
            }))
          : [],
        columns: Array.isArray(q.columns)
          ? q.columns.map((col: any, i: number) => ({
              value: sanitizeStructuredValue(col?.value, `col_${i + 1}`),
              label: String(col?.label ?? ""),
            }))
          : [],
      };

    case SURVEY_QUESTION_TYPES.BIPOLAR:
      return {
        ...base,
        rows: Array.isArray(q.rows)
          ? q.rows.map((row: any, i: number) => ({
              value: sanitizeStructuredValue(row?.value, makeMatrixRowValue(q.id, i)),
              label: String(row?.label ?? row?.left_label ?? ""),
              left_label: String(row?.left_label ?? row?.label ?? ""),
              right_label: String(row?.right_label ?? ""),
              is_attention_check: !!row?.is_attention_check,
              attention_check_value: String(row?.attention_check_value ?? ""),
            }))
          : [],
        columns:
          Array.isArray(q.columns) && q.columns.length
            ? q.columns.map((col: any, i: number) => ({
                value: String(col?.value ?? String((Number.isFinite(q.min) ? Number(q.min) : 1) + i)),
                label: String(col?.label ?? col?.value ?? String((Number.isFinite(q.min) ? Number(q.min) : 1) + i)),
              }))
            : Array.from(
                {
                  length: Math.max(2, Number.isFinite(q.max) && Number.isFinite(q.min) ? Number(q.max) - Number(q.min) + 1 : 7),
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
        // base.required already resolves to false for an ordinary
        // (non-recall) reminder via isDisplayOnlyQuestion — a recall
        // reminder is a real answerable question, so it keeps whatever
        // `required` the admin actually set instead of being forced off.
        post_id: String(q.post_id ?? ""),
        post_label: String(q.post_label ?? ""),
        post_feed_id: String(q.post_feed_id ?? ""),
        apply_feed_randomization: q.apply_feed_randomization !== false,
        reminder_interactive: !!q.reminder_interactive,
        recall_enabled: !!q.recall_enabled,
        recall_distractor_texts: normalizeRecallDistractorTexts(q.recall_distractor_texts),
      };

    case SURVEY_QUESTION_TYPES.PAGE_BREAK:
      return { ...base, required: false, next_delay_seconds: normalizePageDelaySeconds(q.next_delay_seconds) };

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

function normalizePage(raw: any = {}): any {
  const safeRaw = asObject(raw);

  return {
    id: safeRaw.id || `page_${uid()}`,
    title: String(safeRaw.title || ""),
    description: String(safeRaw.description || ""),
    next_delay_seconds: normalizePageDelaySeconds(safeRaw.next_delay_seconds),
    questions: Array.isArray(safeRaw.questions)
      ? safeRaw.questions.map(normalizeQuestion).filter((q: any) => q && !isPageBreakQuestion(q))
      : [],
  };
}

function makePage(overrides: any = {}): any {
  const safeOverrides = asObject(overrides);

  return {
    id: safeOverrides.id || `page_${uid()}`,
    title: String(safeOverrides.title || ""),
    description: String(safeOverrides.description || ""),
    next_delay_seconds: normalizePageDelaySeconds(safeOverrides.next_delay_seconds),
    questions: Array.isArray(safeOverrides.questions)
      ? safeOverrides.questions.map(normalizeQuestion).filter((q: any) => q && !isPageBreakQuestion(q))
      : [],
  };
}

function splitQuestionsIntoPages(questions: any[] = []): any[] {
  const normalizedQuestions = (Array.isArray(questions) ? questions : []).map(normalizeQuestion).filter(Boolean);

  const pages: any[] = [];
  let currentQuestions: any[] = [];
  let currentPageTitle = "";
  let currentPageDescription = "";
  let pageCounter = 1;

  const pushPage = (nextDelaySeconds: unknown = 0) => {
    pages.push(
      makePage({
        id: `page_${pageCounter}`,
        title: currentPageTitle,
        description: currentPageDescription,
        next_delay_seconds: normalizePageDelaySeconds(nextDelaySeconds),
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
      pushPage(question?.next_delay_seconds);
      currentPageTitle = String(question.text || "");
      currentPageDescription = String(question.description || "");
      return;
    }
    currentQuestions.push(question);
  });

  pushPage(0);

  return pages.filter((page, idx) => {
    if ((page.questions || []).length > 0) return true;
    return pages.length === 1 && idx === 0;
  });
}

function coerceQuestionsIntoPages(raw: any = {}): any[] {
  const safeRaw = asObject(raw);

  if (Array.isArray(safeRaw.pages) && safeRaw.pages.length > 0) {
    const flattenedQuestions = safeRaw.pages.flatMap((page: any) => {
      const normalizedPage = asObject(page);
      return Array.isArray(normalizedPage.questions) ? normalizedPage.questions : [];
    });

    const hasEmbeddedPageBreaks = flattenedQuestions.some(
      (q: any) => q?.type === SURVEY_QUESTION_TYPES.PAGE_BREAK
    );

    if (!hasEmbeddedPageBreaks) {
      return safeRaw.pages.map(normalizePage).filter(Boolean);
    }

    const rebuiltPages: any[] = [];
    let pageCounter = 1;

    safeRaw.pages.forEach((rawPage: any) => {
      const page = asObject(rawPage);
      const splitPages = splitQuestionsIntoPages(page.questions || []);

      splitPages.forEach((splitPage, splitIdx) => {
        rebuiltPages.push(
          makePage({
            id: splitPage.id || `page_${pageCounter}`,
            title: splitIdx === 0 ? String(page.title || splitPage.title || "") : String(splitPage.title || ""),
            description:
              splitIdx === 0 ? String(page.description || splitPage.description || "") : String(splitPage.description || ""),
            next_delay_seconds:
              splitIdx === 0
                ? normalizePageDelaySeconds(page.next_delay_seconds)
                : normalizePageDelaySeconds(splitPage.next_delay_seconds),
            questions: splitPage.questions || [],
          })
        );
        pageCounter += 1;
      });
    });

    return rebuiltPages.length
      ? rebuiltPages
      : [makePage({ id: "page_1", title: "", description: "", next_delay_seconds: 0, questions: [] })];
  }

  const legacyQuestions = Array.isArray(safeRaw.questions) ? safeRaw.questions : [];
  return splitQuestionsIntoPages(legacyQuestions);
}

export function frontendPagesToBackend(pages: any[] = []): any[] {
  const safePages = Array.isArray(pages) ? pages : [];
  return safePages.map((page, pIdx) => {
    const pg = normalizePage(page);
    return {
      id: pg.id || `page_${pIdx + 1}`,
      title: pg.title || "",
      description: pg.description || "",
      next_delay_seconds: normalizePageDelaySeconds(pg.next_delay_seconds),
      questions: (pg.questions || []).map(frontendQuestionToBackend),
    };
  });
}

/* =========================
   Survey mapping
   ========================= */

export function normalizeSurvey(raw: any = {}): any {
  const safeRaw = asObject(raw);
  const rawPages = coerceQuestionsIntoPages(safeRaw);

  const experimentGroups = normalizeExperimentGroups(safeRaw.experiment_groups);

  const pages = pruneQuestionGroupVisibility(
    rawPages,
    experimentGroups.map((group) => group.id)
  );

  const pageBlocks = reconcilePageBlocks(
    pages,
    safeRaw.page_blocks,
    experimentGroups.map((group) => group.id)
  );

  return {
    survey_id: safeRaw.survey_id || `survey_${uid()}`,
    name: String(safeRaw.name || "Untitled Survey"),
    description: String(safeRaw.description || ""),
    pages,
    page_blocks: pageBlocks,
    experiment_groups: experimentGroups,
    version: Number.isFinite(safeRaw.version) ? safeRaw.version : 1,
    status: String(safeRaw.status || "draft"),
    created_at: safeRaw.created_at || null,
    updated_at: safeRaw.updated_at || null,

    linked_feed_ids: Array.isArray(safeRaw.linked_feed_ids) ? safeRaw.linked_feed_ids.map(String).filter(Boolean) : [],

    feed_sequence_ids: Array.isArray(safeRaw.feed_sequence_ids)
      ? safeRaw.feed_sequence_ids.map(String).filter(Boolean)
      : Array.isArray(safeRaw.linked_feed_ids)
        ? safeRaw.linked_feed_ids.map(String).filter(Boolean)
        : [],

    linked_project_id: safeRaw.linked_project_id || "",
    trigger: safeRaw.trigger || "after_feed_submit",

    participant_information_title: normalizeRichSurveyField(safeRaw.participant_information_title, "Participant Information"),
    participant_information_html: normalizeRichSurveyField(safeRaw.participant_information_html, ""),

    consent_title: normalizeRichSurveyField(safeRaw.consent_title, "Participant Consent"),
    consent_text_html: normalizeRichSurveyField(safeRaw.consent_text_html, ""),
    consent_decline_message_html: normalizeRichSurveyField(
      safeRaw.consent_decline_message_html,
      "You cannot proceed because you did not provide consent to participate."
    ),

    instructions_title: normalizeRichSurveyField(safeRaw.instructions_title, "Instructions"),
    instructions_html: normalizeRichSurveyField(safeRaw.instructions_html, ""),
    pre_feed_button_label: normalizeRichSurveyField(safeRaw.pre_feed_button_label, "Go to feed"),

    thank_you_message_html: normalizeRichSurveyField(
      safeRaw.thank_you_message_html,
      "<p>Thank you for completing the study.</p><p>You may now close this window.</p>"
    ),

    completion_code: normalizeRichSurveyField(safeRaw.completion_code, ""),

    completion_mode:
      String(safeRaw.completion_mode || "").trim().toLowerCase() === "redirect" ? "redirect" : "message",

    completion_redirect_url: normalizeRichSurveyField(safeRaw.completion_redirect_url, ""),

    delivery_mode: normalizeSurveyDeliveryMode(safeRaw.delivery_mode),

    allow_dark_mode: !!safeRaw.allow_dark_mode,
  };
}

export function frontendSurveyToBackend(survey: any = {}): any {
  const s = normalizeSurvey(survey);
  const experimentGroups = frontendExperimentGroupsToBackend(s.experiment_groups);

  return {
    survey_id: s.survey_id,
    name: s.name,
    description: s.description,
    version: s.version,
    status: s.status,

    pages: frontendPagesToBackend(s.pages),

    page_blocks: frontendPageBlocksToBackend(
      s.page_blocks,
      s.pages,
      experimentGroups.map((group) => group.id)
    ),

    experiment_groups: experimentGroups,

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
    linked_feed_ids: s.linked_feed_ids,

    feed_sequence_ids:
      Array.isArray(s.feed_sequence_ids) && s.feed_sequence_ids.length ? s.feed_sequence_ids : s.linked_feed_ids,

    allow_dark_mode: s.allow_dark_mode,
  };
}
