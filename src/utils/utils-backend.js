// utils-backend.js
// Depends on utils-core exports only (no circulars).
import {
  qProject,
  getProjectId,
  getFeedIdFromUrl,
  injectVideoPreload,
  primeVideoCache,
  DRIVE_RE,
  CF_BASE,
} from "./utils-core";
import { isSupabaseBackend } from "./utils-supabase-client";
import {
  supabaseAdminSignIn,
  supabaseAdminSignOut,
  supabaseAdminTouch,
  supabaseListProjects,
  supabaseLoadPosts,
  supabaseListFeeds,
  supabaseGetDefaultFeedId,
  supabaseSetDefaultFeedId,
  supabaseListSurveys,
  supabaseLoadSurveyDefinition,
  supabaseGetLinkedFeedIds,
  supabaseSaveSurvey,
  supabasePublishPosts,
  supabaseDeleteSurvey,
  supabaseCreateProject,
  supabaseDeleteProject,
  supabaseDeleteFeed,
  supabaseFetchFeedFlags,
  supabaseGetSurveyIdForFeed,
  supabaseGetSurveyBootForFeed,
  supabaseGetSurveyBootById,
  supabaseAssignExperimentGroup,
  supabaseResetExperimentGroupAssignments,
  supabaseGetExperimentGroupCounts,
  supabaseLogParticipant,
  supabaseLogSurveyResponse,
  supabaseLoadParticipantsRoster,
  supabaseLoadSurveyResponsesRoster,
  supabaseLoadSurveyResponsesBySurveyRoster,
  supabaseLoadSurveyParticipantsRoster,
  supabaseLoadSurveyParticipantsStats,
  supabaseDeleteSurveyResponses,
  supabaseAdminListUsers,
  supabaseAdminCreateUser,
  supabaseAdminUpdateUser,
  supabaseAdminDeleteUser,
  supabaseWipeParticipants,
  supabaseGetWipePolicy,
  supabaseSetWipePolicy,
  supabaseLoadPostById,
  supabaseLinkSurveyToFeeds,
  supabaseSetFeedFlags,
  supabaseFetchParticipantsStats,
  supabaseListCustomMeasureGroups,
  supabaseSaveCustomMeasureGroups,
  supabaseListProjectAccess,
  supabaseSetUserProjectAccess,
} from "./utils-backend-supabase";

/* --------------------- App + endpoints ------------------------ */
function msToSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  return Math.round((n / 1000) * 100) / 100;
}

export const getApp = () => {
  const q = new URLSearchParams(window.location.search);
  const fromUrl = (q.get("app") || "").toLowerCase();
  const fromWin = (window.APP || "").toLowerCase();

  if (["amazon", "amz", "reviews", "amazon_reviews"].includes(fromUrl) || ["amazon", "amz", "reviews", "amazon_reviews"].includes(fromWin)) return "amz";
  if (["instagram", "ig"].includes(fromUrl) || ["instagram", "ig"].includes(fromWin)) return "ig";
  if (["facebook", "fb"].includes(fromUrl) || ["facebook", "fb"].includes(fromWin)) return "fb";
  return "fb";
};

export const APP = getApp();

async function loadPublicSurveyDefinitionForFeed(
  surveyId,
  feedId,
  { projectId = getProjectId(), signal, force = false } = {}
) {
  if (!surveyId || !feedId) return null;

  if (!force) {
    const cached = __getCachedSurvey(surveyId, projectId);
    if (cached) return cached;
  }

  try {
    const data = isSupabaseBackend()
      ? await supabaseLoadSurveyDefinition({ surveyId })
      : await (async () => {
          const url = buildQueryUrl(SURVEY_DEFINITION_GET_URL(), {
            survey_id: surveyId,
            feed_id: feedId,
            project_id: projectId || undefined,
            _ts: Date.now(),
          });

          return getJsonWithRetry(
            url,
            { method: "GET", mode: "cors", cache: "no-store", signal },
            { retries: 1, timeoutMs: 8000 }
          );
        })();

    if (!data || Array.isArray(data) || !data.survey_id) return null;

        const out = {
      ...makeEmptySurveyShell(surveyId),
      ...data,
      survey_id: data.survey_id || surveyId,
      linked_project_id: projectId || "",
      linked_feed_ids: normalizeFeedSequenceIds(data.linked_feed_ids),
      feed_sequence_ids: normalizeFeedSequenceIds(data.feed_sequence_ids, data.linked_feed_ids),
      delivery_mode: normalizeSurveyDeliveryMode(data.delivery_mode),
    };

    __setCachedSurvey(surveyId, projectId, out);
    return out;
  } catch (e) {
    console.warn("loadPublicSurveyDefinitionForFeed failed:", e);
    return null;
  }
}

async function loadPublicSurveyDefinition(
  surveyId,
  { projectId = getProjectId(), signal, force = false } = {}
) {
  if (!surveyId) return null;

  if (!force) {
    const cached = __getCachedSurvey(surveyId, projectId);
    if (cached) return cached;
  }

  try {
    const data = isSupabaseBackend()
      ? await supabaseLoadSurveyDefinition({ surveyId })
      : await (async () => {
          const url = buildQueryUrl(SURVEY_DEFINITION_GET_URL(), {
            survey_id: surveyId,
            project_id: projectId || undefined,
            _ts: Date.now(),
          });

          return getJsonWithRetry(
            url,
            { method: "GET", mode: "cors", cache: "no-store", signal },
            { retries: 1, timeoutMs: 8000 }
          );
        })();

    if (!data || Array.isArray(data) || !data.survey_id) return null;

    const out = {
      ...makeEmptySurveyShell(surveyId),
      ...data,
      survey_id: data.survey_id || surveyId,
      linked_project_id: projectId || "",
      linked_feed_ids: normalizeFeedSequenceIds(data.linked_feed_ids),
      feed_sequence_ids: normalizeFeedSequenceIds(data.feed_sequence_ids, data.linked_feed_ids),
      delivery_mode: normalizeSurveyDeliveryMode(data.delivery_mode),
    };

    __setCachedSurvey(surveyId, projectId, out);
    return out;
  } catch (e) {
    console.warn("loadPublicSurveyDefinition failed:", e);
    return null;
  }
}

export async function getLinkedFeedIdsForSurveyFromBackend({
  surveyId,
  projectId = getProjectId(),
  allFeeds = null,
  signal,
} = {}) {
  if (!surveyId) return [];

  if (isSupabaseBackend()) {
    try {
      return await supabaseGetLinkedFeedIds({ surveyId, projectId, app: getApp() });
    } catch (e) {
      console.warn("getLinkedFeedIdsForSurveyFromBackend (supabase) failed:", e);
      return [];
    }
  }

  const feedList = Array.isArray(allFeeds) && allFeeds.length
    ? allFeeds
    : await listFeedsFromBackend({ projectId, signal });

  const candidateFeedIds = uniqueStrings(
    (feedList || []).map((f) => f?.feed_id).filter(Boolean)
  );

  const linkedFeedIds = [];

  await Promise.all(
    candidateFeedIds.map(async (fid) => {
      try {
        const url = buildQueryUrl(FEED_SURVEY_GET_URL(), {
          feed_id: fid,
          project_id: projectId || undefined,
          _ts: Date.now(),
        });

        const link = await getJsonWithRetry(
          url,
          { method: "GET", mode: "cors", cache: "no-store", signal },
          { retries: 1, timeoutMs: 8000 }
        );

        if (link && String(link.survey_id || "") === String(surveyId)) {
          linkedFeedIds.push(fid);
        }
      } catch {
        // ignore individual lookup failures
      }
    })
  );

  return uniqueStrings(linkedFeedIds);
}

/* --------------------- Backend config (via API Gateway proxy) ------------- */
export const GAS_PROXY_BASE =
  (window.CONFIG && window.CONFIG.GAS_PROXY_BASE) ||
  "https://qkbi313c2i.execute-api.us-west-1.amazonaws.com";

export const GAS_PROXY_PATH =
  (window.CONFIG && window.CONFIG.GAS_PROXY_PATH) ||
  "/default/gas";

function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

export const GS_ENDPOINT =
  (window.CONFIG && window.CONFIG.API_BASE) ||
  joinUrl(
    (window.CONFIG && window.CONFIG.GAS_PROXY_BASE) || GAS_PROXY_BASE,
    (window.CONFIG && window.CONFIG.GAS_PROXY_PATH) || GAS_PROXY_PATH
  );

export const GS_TOKEN = "a38d92c1-48f9-4f2c-bc94-12c72b9f3427";

/* ---------------------- Base GET URL builders ----------------------------- */
const FEEDS_GET_URL = () => `${GS_ENDPOINT}?path=feeds&app=${getApp()}`;
const DEFAULT_FEED_GET_URL = () => `${GS_ENDPOINT}?path=default_feed&app=${getApp()}`;
const POSTS_GET_URL = () => `${GS_ENDPOINT}?path=posts&app=${getApp()}`;
const PARTICIPANTS_GET_URL = () => `${GS_ENDPOINT}?path=participants&app=${getApp()}`;
const WIPE_POLICY_GET_URL = () => `${GS_ENDPOINT}?path=wipe_policy&app=${getApp()}`;
// Deliberately no &app= here — projects are shared across platforms (a
// project can hold feeds for Facebook, Instagram, and Amazon at once), and
// project_create/project_delete below never send app either. Filtering the
// list by app would make AdminProjectPicker show a different project set
// depending on which platform bundle happens to be loaded.
const PROJECTS_GET_URL = () => `${GS_ENDPOINT}?path=projects`;
const SURVEYS_GET_URL = () => `${GS_ENDPOINT}?path=surveys&app=${getApp()}`;
const SURVEY_DEFINITION_GET_URL = () => `${GS_ENDPOINT}?path=survey_definition&app=${getApp()}`;
const FEED_SURVEY_GET_URL = () => `${GS_ENDPOINT}?path=feed_survey&app=${getApp()}`;
const SURVEY_RESPONSES_GET_URL = () => `${GS_ENDPOINT}?path=survey_responses&app=${getApp()}`;
const FEED_SURVEY_BOOT_GET_URL = () =>
  `${GS_ENDPOINT}?path=feed_survey_boot&app=${getApp()}`;
const SURVEY_BOOT_GET_URL = () => `${GS_ENDPOINT}?path=survey_boot&app=${getApp()}`;
const SURVEY_RESPONSES_BY_SURVEY_GET_URL = () =>
  `${GS_ENDPOINT}?path=survey_responses_by_survey&app=${getApp()}`;
const SURVEY_PARTICIPANTS_GET_URL = () =>
  `${GS_ENDPOINT}?path=survey_participants&app=${getApp()}`;
const SURVEY_PARTICIPANTS_STATS_GET_URL = () =>
  `${GS_ENDPOINT}?path=survey_participants_stats&app=${getApp()}`;
const POST_BY_ID_GET_URL = () => `${GS_ENDPOINT}?path=post_by_id&app=${getApp()}`;
const EXPERIMENT_GROUP_COUNTS_GET_URL = () =>
  `${GS_ENDPOINT}?path=experiment_group_counts&app=${getApp()}`;

/* --------------------- Fetch helpers (timeout + retry) -------------------- */
async function fetchWithTimeout(url, opts = {}, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const signal = opts.signal || ctrl.signal;
    return await fetch(url, { ...opts, signal });
  } finally {
    clearTimeout(t);
  }
}

async function getJsonWithRetry(url, opts = {}, { retries = 1, timeoutMs = 8000 } = {}) {
  let lastErr;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, opts, { timeoutMs });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }

  throw lastErr;
}

async function postJson(payload, { timeoutMs = 12000, mode = "cors", keepalive = false } = {}) {
  const res = await fetchWithTimeout(
    GS_ENDPOINT,
    {
      method: "POST",
      mode,
      keepalive,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
    },
    { timeoutMs }
  );

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function buildQueryUrl(base, params = {}) {
  const url = new URL(base, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v == null || v === "") return;
    url.searchParams.set(k, String(v));
  });
  return url.toString();
}

function uniqueStrings(arr = []) {
  return Array.from(
    new Set(
      (Array.isArray(arr) ? arr : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeSurveyDeliveryMode(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "survey_only") return "survey_only";
  if (v === "multi_feed_then_survey") return "multi_feed_then_survey";
  return "feed_then_survey";
}

function normalizeFeedSequenceIds(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return Array.from(new Set((Array.isArray(source) ? source : [])
    .map((x) => String(x || "").trim())
    .filter(Boolean)));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeProjectId(projectId) {
  return projectId || getProjectId() || "";
}

function makeEmptySurveyShell(surveyId = "") {
  return {
    survey_id: surveyId || "",
    name: "",
    description: "",
    version: 1,
    status: "draft",

    participant_information_title: "Participant Information",
    participant_information_html: "",
    consent_title: "Consent",
    consent_text_html: "",
    consent_decline_message_html:
      "<p>You cannot proceed because you did not provide consent.</p>",
    instructions_title: "Instructions",
    instructions_html: "",
    pre_feed_button_label: "Go to feed",

    pages: [],
    linked_feed_ids: [],
    feed_sequence_ids: [],
    linked_project_id: normalizeProjectId(),
    trigger: "after_feed_submit",

    // Only meaningful when a survey exists
    delivery_mode: "feed_then_survey",
    thank_you_message_html:
      "<p>Your response has been recorded.</p>",
    completion_code: "",
    completion_mode: "message",
    completion_redirect_url: "",
  };
}

/* ======================= merged survey export helpers ====================== */

const SURVEY_EXPORT_PREFIX = "survey";
export const SURVEY_COLUMN_LABEL_MODE = {
  VARIABLE: "variable",
  TEXT: "text",
};

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseMaybeJson(value, fallback = {}) {
  if (isPlainObject(value) || Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function sanitizeSurveyExportKeyPart(value, fallback = "") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");
  return cleaned || fallback;
}

function makeSurveyExportColumnKey(questionId, rowValue = "") {
  const q = sanitizeSurveyExportKeyPart(questionId, "question");
  const r = sanitizeSurveyExportKeyPart(rowValue, "");

  if (!r) return `${SURVEY_EXPORT_PREFIX}_${q}`;

  if (r === q) return `${SURVEY_EXPORT_PREFIX}_${q}`;
  if (r.startsWith(`${q}_`)) return `${SURVEY_EXPORT_PREFIX}_${r}`;

  return `${SURVEY_EXPORT_PREFIX}_${q}_${r}`;
}

function makeSurveyVariableLabel(questionId, rowValue = "") {
  const q = sanitizeSurveyExportKeyPart(questionId, "question");
  const r = sanitizeSurveyExportKeyPart(rowValue, "");

  if (!r) return q;

  if (r === q) return q;
  if (r.startsWith(`${q}_`)) return r;

  return `${q}_${r}`;
}

function normalizeSurveyAnswerScalar(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((v) => normalizeSurveyAnswerScalar(v)).filter(Boolean).join(" | ");
  }
  if (isPlainObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

// Curated subset of the shared per-post interaction aggregate
// (makeEmptyPostInteractionAggregate/applyPostInteractionEvent, utils-core.js)
// exported as CSV columns for an interactive post_reminder question — not
// the full ~20-field aggregate, just the like/comment/share/report-shaped
// fields relevant to a reminder (plus Amazon's "helpful", always present for
// column-schema stability regardless of which app a survey is deployed on).
const REMINDER_INTERACTION_FIELDS = [
  { value: "reaction_type", label: "Reaction type" },
  { value: "commented", label: "Commented" },
  { value: "comment_texts", label: "Comment text" },
  { value: "shared", label: "Shared" },
  { value: "share_target", label: "Share target" },
  { value: "reposted", label: "Reposted" },
  { value: "reported_misinfo", label: "Reported" },
  { value: "review_helpful", label: "Marked helpful" },
];

export function flattenSurveyQuestions(definition, { labelMode = SURVEY_COLUMN_LABEL_MODE.VARIABLE } = {}) {
  const survey = definition && typeof definition === "object" ? definition : {};
  const pages = Array.isArray(survey.pages) ? survey.pages : [];
  const questions = [];

  pages.forEach((page, pIdx) => {
    const qs = Array.isArray(page?.questions) ? page.questions : [];
    qs.forEach((q, qIdx) => {
      const questionId = String(q?.id || "").trim();
      const questionType = String(q?.type || "").trim();
      if (!questionId) return;

      if (questionType === "info" || questionType === "page_break") {
        return;
      }

      // Static (default) reminders have nothing to export — same as before.
      // Interactive ones fall through and get one column per curated field
      // below, via the exact same "row" mechanism matrix/bipolar questions
      // already use (a fixed field list stands in for q.rows).
      if (questionType === "post_reminder" && !q?.reminder_interactive) {
        return;
      }

      const questionText = String(q?.text || questionId).trim() || questionId;
      const rows =
        questionType === "post_reminder"
          ? REMINDER_INTERACTION_FIELDS
          : Array.isArray(q?.rows) ? q.rows : [];
      const hasRowStructure = rows.length > 0;

      if (hasRowStructure) {
        rows.forEach((row, rIdx) => {
          const rowValue = String(row?.value || "").trim() || String(rIdx + 1);
          const rowLabel =
            String(
              row?.label ??
              row?.left_label ??
              row?.text ??
              rowValue
            ).trim() || rowValue;

          const variableLabel = makeSurveyVariableLabel(questionId, rowValue);
          const textLabel = `${questionText} [${rowLabel}]`;

          questions.push({
            kind: "row",
            question_id: questionId,
            question_text: questionText,
            question_type: questionType,
            row_value: rowValue,
            row_label: rowLabel,
            column_key: makeSurveyExportColumnKey(questionId, rowValue),
            variable_label: variableLabel,
            text_label: textLabel,
            label:
              labelMode === SURVEY_COLUMN_LABEL_MODE.TEXT
                ? textLabel
                : variableLabel,
            page_index: pIdx,
            question_index: qIdx,
            row_index: rIdx,
          });
        });
      } else {
        const variableLabel = makeSurveyVariableLabel(questionId);
        const textLabel = questionText;

        questions.push({
          kind: "question",
          question_id: questionId,
          question_text: questionText,
          question_type: questionType,
          row_value: "",
          row_label: "",
          column_key: makeSurveyExportColumnKey(questionId),
          variable_label: variableLabel,
          text_label: textLabel,
          label:
            labelMode === SURVEY_COLUMN_LABEL_MODE.TEXT
              ? textLabel
              : variableLabel,
          page_index: pIdx,
          question_index: qIdx,
          row_index: -1,
        });
      }
    });
  });

  return questions;
}

function buildSurveyExportColumns(
  definition,
  surveyRows = [],
  { labelMode = SURVEY_COLUMN_LABEL_MODE.VARIABLE } = {}
) {
  const fromDefinition = flattenSurveyQuestions(definition, { labelMode });
  if (fromDefinition.length) return fromDefinition;

  const seen = new Map();

  (Array.isArray(surveyRows) ? surveyRows : []).forEach((row) => {
    const raw = parseMaybeJson(row?.response_json, {});
    if (!isPlainObject(raw)) return;

    Object.entries(raw).forEach(([questionId, value]) => {
      if (!questionId) return;

      if (isPlainObject(value)) {
        Object.keys(value).forEach((rowKey) => {
          const colKey = makeSurveyExportColumnKey(questionId, rowKey);
          if (!seen.has(colKey)) {
            const variableLabel = makeSurveyVariableLabel(questionId, rowKey);
            const textLabel = `${questionId} [${rowKey}]`;

            seen.set(colKey, {
              kind: "row",
              question_id: questionId,
              question_text: questionId,
              question_type: "",
              row_value: rowKey,
              row_label: rowKey,
              column_key: colKey,
              variable_label: variableLabel,
              text_label: textLabel,
              label:
                labelMode === SURVEY_COLUMN_LABEL_MODE.TEXT
                  ? textLabel
                  : variableLabel,
              page_index: 0,
              question_index: 0,
              row_index: 0,
            });
          }
        });
      } else {
        const colKey = makeSurveyExportColumnKey(questionId);
        if (!seen.has(colKey)) {
          const variableLabel = makeSurveyVariableLabel(questionId);
          const textLabel = questionId;

          seen.set(colKey, {
            kind: "question",
            question_id: questionId,
            question_text: questionId,
            question_type: "",
            row_value: "",
            row_label: "",
            column_key: colKey,
            variable_label: variableLabel,
            text_label: textLabel,
            label:
              labelMode === SURVEY_COLUMN_LABEL_MODE.TEXT
                ? textLabel
                : variableLabel,
            page_index: 0,
            question_index: 0,
            row_index: -1,
          });
        }
      }
    });
  });

  return Array.from(seen.values());
}

export function flattenSurveyResponseRecord(responseRow, surveyColumns) {
  const out = {};
  const rawResponses = parseMaybeJson(
    responseRow?.response_json ?? responseRow?.responses ?? {},
    {}
  );

  const responses = isPlainObject(rawResponses) ? rawResponses : {};

  (Array.isArray(surveyColumns) ? surveyColumns : []).forEach((col) => {
    if (!col?.column_key || !col?.question_id) return;

    const value = responses[col.question_id];

    if (col.kind === "row") {
      if (isPlainObject(value)) {
        out[col.column_key] = normalizeSurveyAnswerScalar(value[col.row_value]);
      } else {
        out[col.column_key] = "";
      }
      return;
    }

    out[col.column_key] = normalizeSurveyAnswerScalar(value);
  });

  return out;
}

function makeSurveyResponseLookup(surveyRows = [], surveyColumns = []) {
  const bySessionId = new Map();
  const byParticipantId = new Map();

  (Array.isArray(surveyRows) ? surveyRows : []).forEach((row) => {
    const flattened = flattenSurveyResponseRecord(row, surveyColumns);
    const record = {
      raw: row,
      flat: flattened,
    };

    const sessionId = String(row?.session_id || "").trim();
    const participantId = String(row?.participant_id || "").trim();

    if (sessionId && !bySessionId.has(sessionId)) {
      bySessionId.set(sessionId, record);
    }
    if (participantId && !byParticipantId.has(participantId)) {
      byParticipantId.set(participantId, record);
    }
  });

  return { bySessionId, byParticipantId };
}

export async function getSurveyBootForFeedFromBackend(
  feedId,
  { projectId = getProjectId(), signal } = {}
) {
  if (!feedId) return null;

  try {
    const data = isSupabaseBackend()
      ? await supabaseGetSurveyBootForFeed({ feedId, projectId, app: getApp() })
      : await (async () => {
          const url = buildQueryUrl(FEED_SURVEY_BOOT_GET_URL(), {
            feed_id: feedId,
            project_id: projectId || undefined,
            _ts: Date.now(),
          });

          return getJsonWithRetry(
            url,
            { method: "GET", mode: "cors", cache: "no-store", signal },
            { retries: 1, timeoutMs: 8000 }
          );
        })();

    if (!data || typeof data !== "object") return null;

    if (!data.has_survey) {
      return {
        has_survey: false,
        survey_id: "",
        trigger: "",
        has_preface: false,
        preface: {
          participant_information: false,
          consent: false,
          instructions: false,
        },
        participant_information_title: "",
        participant_information_html: "",
        consent_title: "",
        consent_text_html: "",
        consent_decline_message_html: "",
        instructions_title: "",
        instructions_html: "",
        pre_feed_button_label: "",
      };
    }

    const deliveryMode = normalizeSurveyDeliveryMode(data.delivery_mode);
    const defaultButtonLabel =
      deliveryMode === "survey_only" ? "Start survey" : "Go to feed";

    return {
      ...data,
      has_survey: true,
      survey_id: String(data.survey_id || ""),
      trigger: String(data.trigger || "after_feed_submit"),
      delivery_mode: deliveryMode,
      linked_feed_ids: normalizeFeedSequenceIds(data.linked_feed_ids),
      feed_sequence_ids: normalizeFeedSequenceIds(data.feed_sequence_ids, data.linked_feed_ids),
      preferred_feed_id: String(data.preferred_feed_id || ""),
      has_preface: !!data.has_preface,
      preface: {
        participant_information: !!data?.preface?.participant_information,
        consent: !!data?.preface?.consent,
        instructions: !!data?.preface?.instructions,
      },
      participant_information_title: String(
        data.participant_information_title || "Participant Information"
      ),
      participant_information_html: String(data.participant_information_html || ""),
      consent_title: String(data.consent_title || "Participant Consent"),
      consent_text_html: String(data.consent_text_html || ""),
      consent_decline_message_html: String(
        data.consent_decline_message_html ||
          "<p>You cannot proceed because you did not provide consent to participate.</p>"
      ),
      instructions_title: String(data.instructions_title || "Instructions"),
      instructions_html: String(data.instructions_html || ""),
      pre_feed_button_label: String(
        data.pre_feed_button_label || defaultButtonLabel
      ),
    };
  } catch (e) {
    console.warn("getSurveyBootForFeedFromBackend failed:", e);
    return null;
  }
}


export async function getSurveyBootFromBackend(
  surveyId,
  { projectId = getProjectId(), signal } = {}
) {
  if (!surveyId) return null;

  try {
    const data = isSupabaseBackend()
      ? await supabaseGetSurveyBootById({ surveyId })
      : await (async () => {
          const url = buildQueryUrl(SURVEY_BOOT_GET_URL(), {
            survey_id: surveyId,
            project_id: projectId || undefined,
            _ts: Date.now(),
          });

          return getJsonWithRetry(
            url,
            { method: "GET", mode: "cors", cache: "no-store", signal },
            { retries: 1, timeoutMs: 8000 }
          );
        })();

    if (!data || typeof data !== "object") return null;

    const deliveryMode = normalizeSurveyDeliveryMode(data.delivery_mode);
    const defaultButtonLabel =
      deliveryMode === "survey_only" ? "Start survey" : "Go to feed";

    return {
      ...data,
      has_survey: !!data.has_survey,
      survey_id: String(data.survey_id || surveyId || ""),
      trigger: String(data.trigger || "after_feed_submit"),
      delivery_mode: deliveryMode,
      linked_feed_ids: normalizeFeedSequenceIds(data.linked_feed_ids),
      feed_sequence_ids: normalizeFeedSequenceIds(data.feed_sequence_ids, data.linked_feed_ids),
      preferred_feed_id: String(data.preferred_feed_id || ""),
      has_preface: !!data.has_preface,
      preface: {
        participant_information: !!data?.preface?.participant_information,
        consent: !!data?.preface?.consent,
        instructions: !!data?.preface?.instructions,
      },
      participant_information_title: String(
        data.participant_information_title || "Participant Information"
      ),
      participant_information_html: String(data.participant_information_html || ""),
      consent_title: String(data.consent_title || "Participant Consent"),
      consent_text_html: String(data.consent_text_html || ""),
      consent_decline_message_html: String(
        data.consent_decline_message_html ||
          "<p>You cannot proceed because you did not provide consent to participate.</p>"
      ),
      instructions_title: String(data.instructions_title || "Instructions"),
      instructions_html: String(data.instructions_html || ""),
      pre_feed_button_label: String(
        data.pre_feed_button_label || defaultButtonLabel
      ),
    };
  } catch (e) {
    console.warn("getSurveyBootFromBackend failed:", e);
    return null;
  }
}

// Looks up a between-subjects experiment group's display name from the
// survey definition (falls back to "" if the survey has no groups, or the
// id no longer matches one — e.g. a group was renamed/removed after
// responses were already recorded with the old id).
function resolveExperimentGroupName(surveyDefinition, groupId) {
  const gid = String(groupId || "").trim();
  if (!gid) return "";
  const groups = Array.isArray(surveyDefinition?.experiment_groups)
    ? surveyDefinition.experiment_groups
    : [];
  const match = groups.find((g) => String(g?.id || "").trim() === gid);
  return match?.name ? String(match.name) : "";
}

function mergeParticipantRowsWithSurveyRows({
  participantRows = [],
  surveyRows = [],
  surveyDefinition = null,
  fillValue = "NA",
  labelMode = SURVEY_COLUMN_LABEL_MODE.VARIABLE,
} = {}) {
  const participants = Array.isArray(participantRows) ? participantRows : [];
  const surveyColumns = buildSurveyExportColumns(surveyDefinition, surveyRows, { labelMode });
  const surveyColumnKeys = surveyColumns.map((c) => c.column_key);
  const surveyColumnLabels = surveyColumns.map((c) => c.label || c.column_key);
  const lookup = makeSurveyResponseLookup(surveyRows, surveyColumns);

  const mergedRows = participants.map((participant) => {
    const sessionId = String(participant?.session_id || "").trim();
    const participantId = String(participant?.participant_id || "").trim();

    const match =
      (sessionId && lookup.bySessionId.get(sessionId)) ||
      (participantId && lookup.byParticipantId.get(participantId)) ||
      null;

    const surveyPayload = {};
    surveyColumnKeys.forEach((key) => {
      const value = match?.flat?.[key];
      surveyPayload[key] = value === "" || value == null ? fillValue : value;
    });

    const durationMs =
  match?.raw?.duration_ms ??
  participant?.ms_enter_to_submit ??
  participant?.duration_ms ??
  "";

    const remainingParticipantFields = { ...participant };

    delete remainingParticipantFields.session_id;
    delete remainingParticipantFields.participant_id;
    delete remainingParticipantFields.ip_address;
    delete remainingParticipantFields.prolific_pid;
    delete remainingParticipantFields.entered_at_iso;
    delete remainingParticipantFields.submitted_at_iso;
    delete remainingParticipantFields.feed_id;

    delete remainingParticipantFields.session_id_ext;
    delete remainingParticipantFields.study_id;
    delete remainingParticipantFields.prolific_session_id;
    delete remainingParticipantFields.prolific_study_id;

    delete remainingParticipantFields.ms_enter_to_submit;
    delete remainingParticipantFields.ms_enter_to_last_interaction;
    delete remainingParticipantFields.feed_checksum;

    delete remainingParticipantFields.experiment_group_id;

    const experimentGroupId =
      match?.raw?.experiment_group_id ?? participant?.experiment_group_id ?? "";

    const orderedParticipant = {
  session_id: participant?.session_id ?? "",
  participant_id: participant?.participant_id ?? "",
  ip_address: participant?.ip_address ?? "",
  prolific_pid: participant?.prolific_pid ?? "",
  entered_at_iso: participant?.entered_at_iso ?? "",
  submitted_at_iso:
    match?.raw?.submitted_at_iso ??
    participant?.submitted_at_iso ??
    "",
  duration_s: msToSeconds(durationMs),
  feed_id: participant?.feed_id ?? "",
  ...(Array.isArray(surveyDefinition?.experiment_groups) && surveyDefinition.experiment_groups.length
    ? {
        experiment_group_id: experimentGroupId,
        experiment_group_name: resolveExperimentGroupName(surveyDefinition, experimentGroupId),
      }
    : {}),
};

    return {
      ...orderedParticipant,
      ...remainingParticipantFields,
      ...surveyPayload,
    };
  });

  return {
    rows: mergedRows,
    surveyColumns,
    surveyColumnKeys,
    surveyColumnLabels,
    hasSurveyColumns: surveyColumnKeys.length > 0,
  };
}

export async function loadMergedParticipantSurveyRoster({
  feedId,
  projectId = getProjectId(),
  signal,
  fillValue = "NA",
  forceSurveyDefinition = false,
  labelMode = SURVEY_COLUMN_LABEL_MODE.VARIABLE,
} = {}) {
  const effectiveFeedId = String(feedId || "").trim();
  if (!effectiveFeedId) {
    return {
      rows: [],
      participants: [],
      surveyResponses: [],
      survey: null,
      surveyLink: null,
      surveyColumns: [],
      surveyColumnKeys: [],
      surveyColumnLabels: [],
      hasSurvey: false,
      hasMergedSurveyColumns: false,
    };
  }

  const [participants, surveyLink] = await Promise.all([
    loadParticipantsRoster(effectiveFeedId, { projectId, signal }),
    (async () => {
      try {
        const url = buildQueryUrl(FEED_SURVEY_GET_URL(), {
          feed_id: effectiveFeedId,
          project_id: projectId || undefined,
          _ts: Date.now(),
        });
        const link = await getJsonWithRetry(
          url,
          { method: "GET", mode: "cors", cache: "no-store", signal },
          { retries: 1, timeoutMs: 8000 }
        );
        return link && link.survey_id ? link : null;
      } catch (e) {
        console.warn("loadMergedParticipantSurveyRoster feed_survey lookup failed:", e);
        return null;
      }
    })(),
  ]);

  if (!surveyLink?.survey_id) {
    return {
      rows: Array.isArray(participants) ? participants : [],
      participants: Array.isArray(participants) ? participants : [],
      surveyResponses: [],
      survey: null,
      surveyLink: null,
      surveyColumns: [],
      surveyColumnKeys: [],
      surveyColumnLabels: [],
      hasSurvey: false,
      hasMergedSurveyColumns: false,
    };
  }

  const surveyId = String(surveyLink.survey_id || "").trim();

  const [surveyDefinition, surveyResponses] = await Promise.all([
    loadPublicSurveyDefinitionForFeed(surveyId, effectiveFeedId, {
      projectId,
      signal,
      force: !!forceSurveyDefinition,
    }),
    loadSurveyResponsesRoster(surveyId, {
      feedId: effectiveFeedId,
      projectId,
      signal,
    }),
  ]);

  const merged = mergeParticipantRowsWithSurveyRows({
    participantRows: participants,
    surveyRows: surveyResponses,
    surveyDefinition,
    fillValue,
    labelMode,
  });

  return {
    rows: merged.rows,
    participants: Array.isArray(participants) ? participants : [],
    surveyResponses: Array.isArray(surveyResponses) ? surveyResponses : [],
    survey: surveyDefinition || null,
    surveyLink,
    surveyColumns: merged.surveyColumns,
    surveyColumnKeys: merged.surveyColumnKeys,
    surveyColumnLabels: merged.surveyColumnLabels,
    hasSurvey: true,
    hasMergedSurveyColumns: !!merged.hasSurveyColumns,
  };
}


export async function loadMultiFeedParticipantSurveyRoster({
  surveyId,
  feedIds = [],
  projectId = getProjectId(),
  signal,
  fillValue = "NA",
  forceSurveyDefinition = false,
  labelMode = SURVEY_COLUMN_LABEL_MODE.VARIABLE,
} = {}) {
  const effectiveSurveyId = String(surveyId || "").trim();
  const sequence = normalizeFeedSequenceIds(feedIds);

  if (!effectiveSurveyId || !sequence.length) {
    return {
      rows: [],
      participants: [],
      surveyResponses: [],
      survey: null,
      surveyColumns: [],
      surveyColumnKeys: [],
      surveyColumnLabels: [],
      hasSurvey: !!effectiveSurveyId,
      hasMergedSurveyColumns: false,
      feedIds: sequence,
    };
  }

  const [surveyDefinition, allSurveyResponses, participantGroups] = await Promise.all([
    loadPublicSurveyDefinition(effectiveSurveyId, {
      projectId,
      signal,
      force: !!forceSurveyDefinition,
    }),
    loadSurveyResponsesBySurveyRoster(effectiveSurveyId, {
      projectId,
      signal,
    }),
    Promise.all(
      sequence.map(async (fid) => ({
        feedId: fid,
        rows: await loadParticipantsRoster(fid, { projectId, signal }),
      }))
    ),
  ]);

  const surveyResponses = (Array.isArray(allSurveyResponses) ? allSurveyResponses : [])
    .filter((row) => String(row?.feed_id || "").trim() === sequence[sequence.length - 1]);

  const surveyColumns = buildSurveyExportColumns(surveyDefinition, surveyResponses, { labelMode });
  const surveyColumnKeys = surveyColumns.map((c) => c.column_key);
  const surveyColumnLabels = surveyColumns.map((c) => c.label || c.column_key);
  const surveyLookup = makeSurveyResponseLookup(surveyResponses, surveyColumns);

  const byParticipant = new Map();

  participantGroups.forEach((group, index) => {
    const fid = group.feedId;
    const prefix = `feed${index + 1}`;
    const rows = Array.isArray(group.rows) ? group.rows : [];

    rows.forEach((row) => {
      const sessionId = String(row?.session_id || "").trim();
      const participantId = String(row?.participant_id || "").trim();
      const key = sessionId || participantId;
      if (!key) return;

      if (!byParticipant.has(key)) {
        byParticipant.set(key, {
          session_id: sessionId,
          participant_id: participantId,
          ip_address: row?.ip_address ?? "",
          prolific_pid: row?.prolific_pid ?? "",
          entered_at_iso: row?.entered_at_iso ?? "",
          submitted_at_iso: "",
          duration_s: "",
        });
      }

      const out = byParticipant.get(key);
      out[`${prefix}_feed_id`] = fid;
      out[`${prefix}_entered_at_iso`] = row?.entered_at_iso ?? "";
      out[`${prefix}_submitted_at_iso`] = row?.submitted_at_iso ?? "";
      out[`${prefix}_duration_s`] = msToSeconds(row?.ms_enter_to_submit ?? row?.duration_ms ?? "");

      Object.entries(row || {}).forEach(([k, v]) => {
        if ([
          "session_id", "participant_id", "ip_address", "prolific_pid",
          "entered_at_iso", "submitted_at_iso", "feed_id",
          "session_id_ext", "study_id", "prolific_session_id", "prolific_study_id",
          "ms_enter_to_submit", "ms_enter_to_last_interaction", "feed_checksum"
        ].includes(k)) return;
        out[`${prefix}_${k}`] = v;
      });
    });
  });

  const rows = Array.from(byParticipant.values()).map((participant) => {
    const sessionId = String(participant.session_id || "").trim();
    const participantId = String(participant.participant_id || "").trim();
    const match =
      (sessionId && surveyLookup.bySessionId.get(sessionId)) ||
      (participantId && surveyLookup.byParticipantId.get(participantId)) ||
      null;

    const surveyPayload = {};
    surveyColumnKeys.forEach((key) => {
      const value = match?.flat?.[key];
      surveyPayload[key] = value === "" || value == null ? fillValue : value;
    });

    const experimentGroupId = match?.raw?.experiment_group_id ?? "";

    return {
      ...participant,
      submitted_at_iso: match?.raw?.submitted_at_iso ?? participant.submitted_at_iso ?? "",
      duration_s: msToSeconds(match?.raw?.duration_ms ?? ""),
      feed_sequence_ids: sequence.join(" | "),
      final_survey_feed_id: sequence[sequence.length - 1],
      ...(Array.isArray(surveyDefinition?.experiment_groups) && surveyDefinition.experiment_groups.length
        ? {
            experiment_group_id: experimentGroupId,
            experiment_group_name: resolveExperimentGroupName(surveyDefinition, experimentGroupId),
          }
        : {}),
      ...surveyPayload,
    };
  });

  return {
    rows,
    participants: participantGroups.flatMap((g) => g.rows || []),
    surveyResponses,
    survey: surveyDefinition || null,
    surveyColumns,
    surveyColumnKeys,
    surveyColumnLabels,
    hasSurvey: true,
    hasMergedSurveyColumns: !!surveyColumnKeys.length,
    feedIds: sequence,
  };
}

export async function loadSurveyOnlyRoster({
  surveyId,
  projectId = getProjectId(),
  signal,
  fillValue = "NA",
  forceSurveyDefinition = false,
  labelMode = SURVEY_COLUMN_LABEL_MODE.VARIABLE,
} = {}) {
  const effectiveSurveyId = String(surveyId || "").trim();
  if (!effectiveSurveyId) {
    return {
      rows: [],
      participants: [],
      surveyResponses: [],
      survey: null,
      surveyColumns: [],
      surveyColumnKeys: [],
      surveyColumnLabels: [],
      hasSurvey: false,
      hasMergedSurveyColumns: false,
    };
  }

  const [surveyDefinition, allSurveyResponses] = await Promise.all([
  loadPublicSurveyDefinition(effectiveSurveyId, {
    projectId,
    signal,
    force: !!forceSurveyDefinition,
  }),
  loadSurveyResponsesBySurveyRoster(effectiveSurveyId, {
    projectId,
    signal,
  }),
]);

const surveyDeliveryMode = normalizeSurveyDeliveryMode(
  surveyDefinition?.delivery_mode
);

// loadSurveyResponsesBySurveyRoster already scopes strictly by survey_id, so
// every row it returns genuinely belongs to this survey regardless of which
// feed (if any) delivered it. Every response for this survey_id belongs in
// its export — a feed_id filter here used to silently drop every response
// from ordinary feed_then_survey studies (the common case), which is why
// "Download survey CSV" could come back empty/wrong for those studies.
const surveyResponses = Array.isArray(allSurveyResponses) ? allSurveyResponses : [];

const participantRows = surveyResponses.map((row) => ({
  session_id: row?.session_id ?? "",
  participant_id: row?.participant_id ?? "",
  ip_address: row?.ip_address ?? "",
  prolific_pid: row?.prolific_pid ?? "",
  entered_at_iso: row?.entered_at_iso ?? row?.submitted_at_iso ?? "",
  submitted_at_iso: row?.submitted_at_iso ?? "",
  duration_ms: row?.duration_ms ?? "",
  feed_id:
    surveyDeliveryMode === "survey_only"
      ? "SURVEY_ONLY"
      : (row?.feed_id ?? "SURVEY_ONLY"),
  original_feed_id: row?.feed_id ?? "",
  survey_id: row?.survey_id ?? effectiveSurveyId,
  project_id: row?.project_id ?? projectId ?? "",
  experiment_group_id: row?.experiment_group_id ?? "",
}));

  const merged = mergeParticipantRowsWithSurveyRows({
    participantRows,
    surveyRows: surveyResponses,
    surveyDefinition,
    fillValue,
    labelMode,
  });

  return {
    rows: merged.rows,
    participants: participantRows,
    surveyResponses: Array.isArray(surveyResponses) ? surveyResponses : [],
    survey: surveyDefinition || null,
    surveyColumns: merged.surveyColumns,
    surveyColumnKeys: merged.surveyColumnKeys,
    surveyColumnLabels: merged.surveyColumnLabels,
    hasSurvey: true,
    hasMergedSurveyColumns: !!merged.hasSurveyColumns,
  };
}

/* ======================= Admin User Management APIs ======================= */
export async function adminListUsers() {
  if (isSupabaseBackend()) return supabaseAdminListUsers();

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson({
      action: "admin_list_users",
      admin_token,
    });

    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    return { ok: true, users: Array.isArray(data.users) ? data.users : [] };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

export async function adminCreateUser(email, password, role = "viewer", username = "") {
  if (isSupabaseBackend()) return supabaseAdminCreateUser(email, password, role, username);

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson({
      action: "admin_create_user",
      admin_token,
      email,
      password,
      role,
    });

    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

export async function adminUpdateUser({ email, role, password, disabled, username }) {
  if (isSupabaseBackend()) return supabaseAdminUpdateUser({ email, role, password, disabled, username });

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const payload = { action: "admin_update_user", admin_token, email };
    if (role != null) payload.role = role;
    if (password != null) payload.password = password;
    if (typeof disabled === "boolean") payload.disabled = !!disabled;

    const { res, data } = await postJson(payload);

    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

export async function adminDeleteUser(email) {
  if (isSupabaseBackend()) return supabaseAdminDeleteUser(email);

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson({
      action: "admin_delete_user",
      admin_token,
      email,
    });

    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

/* ======================= Flags (backend) ======================= */
export async function fetchFeedFlags({ app, projectId, feedId, endpoint = GS_ENDPOINT, signal } = {}) {
  if (isSupabaseBackend()) {
    try {
      const raw = await supabaseFetchFeedFlags({ projectId, app: app || APP, feedId });
      return normalizeFlagsForRead(raw);
    } catch (e) {
      console.warn("fetchFeedFlags (supabase) failed:", e);
      return normalizeFlagsForRead({ random_time: false });
    }
  }

  const qp = new URLSearchParams({ path: "get_feed_flags", app: app || APP });
  if (projectId) qp.append("project_id", projectId);
  if (feedId) qp.append("feed_id", feedId);

  const res = await fetch(`${endpoint}?${qp.toString()}`, {
    credentials: "omit",
    signal,
  });

  const j = await res.json().catch(() => ({}));
  const raw = j && j.flags ? j.flags : { random_time: false };
  return normalizeFlagsForRead(raw);
}

export function normalizeFlagsForStore(flags) {
  const out = {};
  if (!flags) return out;

  if (typeof flags.randomize_times !== "undefined" || typeof flags.random_time !== "undefined") {
    out.random_time = !!(flags.randomize_times ?? flags.random_time);
  }
  if (typeof flags.randomize_avatars !== "undefined" || typeof flags.random_avatar !== "undefined") {
    out.random_avatar = !!(flags.randomize_avatars ?? flags.random_avatar);
  }
  if (typeof flags.randomize_names !== "undefined" || typeof flags.random_name !== "undefined") {
    out.random_name = !!(flags.randomize_names ?? flags.random_name);
  }
  if (typeof flags.randomize_images !== "undefined" || typeof flags.random_image !== "undefined") {
    out.random_image = !!(flags.randomize_images ?? flags.random_image);
  }
  if (typeof flags.randomize_bios !== "undefined" || typeof flags.random_bio !== "undefined") {
    out.random_bio = !!(flags.randomize_bios ?? flags.random_bio);
  }

  return out;
}

export function normalizeFlagsForRead(flags) {
  const out = { ...(flags || {}) };
  out.randomize_times = !!(out.randomize_times ?? out.random_time);
  out.randomize_avatars = !!(out.randomize_avatars ?? out.random_avatar);
  out.randomize_names = !!(out.randomize_names ?? out.random_name);
  out.randomize_images = !!(out.randomize_images ?? out.random_image);
  out.randomize_bios = !!(out.randomize_bios ?? out.random_bio);

  delete out.random_time;
  delete out.random_avatar;
  delete out.random_name;
  delete out.random_image;
  delete out.random_bio;

  return out;
}

// Ported from a local, GAS-only duplicate in components-admin-dashboard.jsx
// (found during a full audit for unported functions, 2026-08-02 — see
// CLAUDE.md "Backend migration"). Writes a single-flag patch (e.g.
// `{random_avatar: true}`, either naming) for one feed's randomize_* flags.
// No pre-existing Supabase counterpart existed anywhere before this — the
// admin dashboard's randomize toggles were silently non-functional under
// `VITE_BACKEND=supabase`, not just still-on-GAS like the other functions
// found in the same audit.
export async function setFeedFlagsOnBackend({ projectId = getProjectId(), feedId, patch } = {}) {
  if (isSupabaseBackend()) {
    try {
      await supabaseSetFeedFlags({ projectId, app: getApp(), feedId, patch });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e?.message || e) };
    }
  }

  const admin = getAdminToken();
  if (!admin) return { ok: false, err: "admin token missing" };

  const payload = {
    action: "set_feed_flags",
    app: APP,
    feed_id: String(feedId),
    flags: normalizeFlagsForStore(patch || {}),
    admin_token: admin,
  };
  if (projectId && projectId !== "global") payload.project_id = projectId;

  const doPost = async (body) => {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
    }).catch(() => null);
    return res ? res.json().catch(() => ({ ok: false })) : { ok: false };
  };

  let out = await doPost(payload);

  if (!out?.ok && /unknown action/i.test(String(out?.err || ""))) {
    out = await doPost({ ...payload, action: "set_flags" });
  }

  return out || { ok: false, err: "no response" };
}

// Ported alongside setFeedFlagsOnBackend, same audit/same source file —
// backs the Feeds table's Total/Submitted/Avg columns.
export async function fetchParticipantsStats(projectId, feedId) {
  if (!feedId) return null;

  if (isSupabaseBackend()) {
    try {
      return await supabaseFetchParticipantsStats({ projectId, app: getApp(), feedId });
    } catch (e) {
      console.warn("fetchParticipantsStats (supabase) failed:", e);
      return null;
    }
  }

  try {
    const admin = getAdminToken?.();
    if (!admin) return null;

    const params = new URLSearchParams({
      path: "participants_stats",
      app: APP,
      feed_id: String(feedId),
      admin_token: admin,
    });
    const effPid = projectId && projectId !== "global" ? String(projectId) : "";
    if (effPid) params.set("project_id", effPid);

    const res = await fetch(`${GS_ENDPOINT}?${params.toString()}`, {
      mode: "cors",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json || null;
  } catch {
    return null;
  }
}

/* ====================== Admin auth (session token + role/email) ============
 * Deliberately NOT namespaced by ${APP} — admin accounts/sessions are shared
 * across the Facebook/Instagram/Amazon bundles, so logging in once should
 * carry over when the platform picker navigates to a different ?app=.
 */
const ADMIN_TOKEN_KEY = `admin_token_v1`;
const ADMIN_TOKEN_EXP_KEY = `admin_token_exp_v1`;
const ADMIN_ROLE_KEY = `admin_role_v1`;
const ADMIN_EMAIL_KEY = `admin_email_v1`;
const ADMIN_USERNAME_KEY = `admin_username_v1`;

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

export function hasAdminRole(minRole = "viewer") {
  const r = (getAdminRole() || "viewer").toLowerCase();
  return (ROLE_RANK[r] || 0) >= (ROLE_RANK[minRole] || 0);
}

export async function touchAdminSession() {
  if (isSupabaseBackend()) {
    const res = await supabaseAdminTouch();
    if (!res.ok) return { ok: false, err: res.err };

    setAdminSession({ token: res.token, ttlSec: res.ttlSec, role: res.role, email: res.email, username: res.username });
    return { ok: true, ttl_s: Number(res.ttlSec || 0), role: res.role, email: res.email };
  }

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson({
      action: "admin_touch",
      admin_token,
    });

    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    if (data.ttl_s && data.ttl_s > 0) {
      setAdminSession({
        token: admin_token,
        ttlSec: Number(data.ttl_s),
        role: data.role || getAdminRole(),
        email: data.email || getAdminEmail(),
      });
    }

    return {
      ok: true,
      ttl_s: Number(data.ttl_s || 0),
      role: data.role,
      email: data.email,
    };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export function getAdminExpiryMs() {
  try {
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (!exp) return null;
    if (Date.now() > exp) {
      clearAdminSession();
      return null;
    }
    return exp;
  } catch {
    return null;
  }
}

export function getAdminSecondsLeft() {
  const exp = getAdminExpiryMs();
  if (!exp) return null;
  return Math.max(0, Math.floor((exp - Date.now()) / 1000));
}

export function startSessionWatch({ warnAtSec = 120, tickMs = 1000, onExpiring, onExpired } = {}) {
  let firedExpired = false;

  const tick = () => {
    const left = getAdminSecondsLeft();
    if (left == null) {
      if (!firedExpired) {
        firedExpired = true;
        onExpired?.();
      }
      return;
    }
    if (left <= 0) {
      if (!firedExpired) {
        firedExpired = true;
        onExpired?.();
      }
    } else if (left <= warnAtSec) {
      onExpiring?.(left);
    }
  };

  const id = setInterval(tick, tickMs);
  tick();
  return () => clearInterval(id);
}

export function setAdminSession({ token, ttlSec, role, email, username } = {}) {
  try {
    if (!token) {
      clearAdminSession();
      return;
    }

    localStorage.setItem(ADMIN_TOKEN_KEY, token);

    if (Number.isFinite(Number(ttlSec)) && ttlSec > 0) {
      localStorage.setItem(ADMIN_TOKEN_EXP_KEY, String(Date.now() + Number(ttlSec) * 1000));
    } else {
      localStorage.removeItem(ADMIN_TOKEN_EXP_KEY);
    }

    if (role) localStorage.setItem(ADMIN_ROLE_KEY, String(role));
    if (email) localStorage.setItem(ADMIN_EMAIL_KEY, String(email));
    // Explicit `undefined` (the GAS backend never passes this — see
    // adminLoginUser/adminLogin below) leaves whatever's already stored
    // alone; an explicit empty string (a Supabase account with no username
    // set) actively clears it, same "absent key vs. empty value" convention
    // admin-users/index.ts's own `update` action already uses.
    if (username !== undefined) {
      if (username) localStorage.setItem(ADMIN_USERNAME_KEY, String(username));
      else localStorage.removeItem(ADMIN_USERNAME_KEY);
    }
  } catch {}
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_EXP_KEY);
  localStorage.removeItem(ADMIN_ROLE_KEY);
  localStorage.removeItem(ADMIN_EMAIL_KEY);
  localStorage.removeItem(ADMIN_USERNAME_KEY);
}

export function getAdminToken() {
  try {
    const t = localStorage.getItem(ADMIN_TOKEN_KEY);
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (!t || !t.trim()) return null;
    if (exp && Date.now() > exp) {
      clearAdminSession();
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export function getAdminRole() {
  try {
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (exp && Date.now() > exp) {
      clearAdminSession();
      return "viewer";
    }
    return (localStorage.getItem(ADMIN_ROLE_KEY) || "viewer").toLowerCase();
  } catch {
    return "viewer";
  }
}

export function getAdminEmail() {
  try {
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (exp && Date.now() > exp) {
      clearAdminSession();
      return null;
    }
    return localStorage.getItem(ADMIN_EMAIL_KEY) || null;
  } catch {
    return null;
  }
}

// Supabase-only (profiles.username, see 20260801000017_profiles_username.sql
// and the Users page rework in CLAUDE.md) — null on GAS, or on a Supabase
// account that hasn't set one yet. Callers should fall back to
// getAdminEmail() the same way components-admin-users.jsx's own user rows
// already do.
export function getAdminUsername() {
  try {
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (exp && Date.now() > exp) {
      clearAdminSession();
      return null;
    }
    return localStorage.getItem(ADMIN_USERNAME_KEY) || null;
  } catch {
    return null;
  }
}

export function hasAdminSession() {
  return !!getAdminToken();
}

export async function adminLogin(password) {
  if (isSupabaseBackend()) {
    // Supabase Auth has no equivalent of the GAS backend's single shared
    // owner-password login — every admin account (including the owner) is
    // its own Supabase Auth user with an email, so this mode only makes
    // sense against the GAS backend. Fail explicitly rather than silently
    // misbehaving; the "Sign in as Admin" (email + password) tab is the
    // Supabase-backed path (see adminLoginUser below).
    return {
      ok: false,
      err: "Owner-password sign-in isn't available on the Supabase backend — use Sign in as Admin (email + password).",
    };
  }

  try {
    const { res, data } = await postJson({
      action: "admin_login",
      password,
    });

    if (res.ok && data?.ok && data.admin_token) {
      setAdminSession({
        token: data.admin_token,
        ttlSec: data.ttl_s || data.ttl_sec || null,
        role: data.role || "owner",
        email: data.email || "owner",
        // GAS has no username concept at all (see getAdminUsername's own
        // comment) — pass an explicit empty string, not just omit the key,
        // so a stale username from a previous Supabase session on the same
        // browser can't leak into a GAS session's display.
        username: "",
      });
      return { ok: true };
    }

    return { ok: false, err: data?.err || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function adminLoginUser(email, password) {
  if (isSupabaseBackend()) {
    const res = await supabaseAdminSignIn(email, password);
    if (!res.ok) return { ok: false, err: res.err };

    setAdminSession({ token: res.token, ttlSec: res.ttlSec, role: res.role, email: res.email, username: res.username });
    return { ok: true };
  }

  try {
    const { res, data } = await postJson({
      action: "admin_login_user",
      email,
      password,
    });

    if (res.ok && data?.ok && data.admin_token) {
      setAdminSession({
        token: data.admin_token,
        ttlSec: data.ttl_s || data.ttl_sec || null,
        role: data.role || "viewer",
        email: data.email || email,
        username: "",
      });
      return { ok: true };
    }

    return { ok: false, err: data?.err || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function adminLogout() {
  if (isSupabaseBackend()) {
    clearAdminSession();
    return await supabaseAdminSignOut();
  }

  const admin_token = getAdminToken();
  clearAdminSession();

  if (!admin_token) return { ok: true };

  try {
    await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action: "admin_logout", admin_token }),
      keepalive: true,
    });
  } catch {}

  return { ok: true };
}

/* --------------------- Logging participants & events ---------------------- */
export async function sendToSheet(header, row, _events, feed_id, options = {}) {
  const survey_id = String(options?.survey_id || row?.survey_id || "");

  if (!feed_id && !survey_id) {
    console.warn("sendToSheet: feed_id or survey_id required");
    return false;
  }

  if (isSupabaseBackend()) {
    try {
      return await supabaseLogParticipant({
        row,
        feedId: feed_id || null,
        surveyId: survey_id || null,
        projectId: getProjectId(),
        app: getApp(),
      });
    } catch (e) {
      console.warn("sendToSheet (supabase) failed:", e);
      return false;
    }
  }

  const payload = {
    token: GS_TOKEN,
    action: "log_participant",
    app: APP,
    feed_id: feed_id || "",
    survey_id: survey_id || undefined,
    header,
    row,
    project_id: getProjectId() || undefined,
  };

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon && body.length < 60000) {
    try {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      const ok = navigator.sendBeacon(GS_ENDPOINT, blob);
      if (ok) return true;
    } catch {}
  }

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
    });
    return res.ok;
  } catch (err) {
    console.warn("sendToSheet(fetch) failed:", err);
    return false;
  }
}

/* --------------------- Surveys: participant submit ------------------------ */
/*
  Supports either:
  1) direct fields expected by code.gs
  2) legacy { header, row, survey_id, feed_id, project_id }
*/
export async function sendSurveyResponseToBackend(args = {}) {
  const survey_id = String(args.survey_id || "");
  if (!survey_id) {
    console.warn("sendSurveyResponseToBackend: survey_id required");
    return false;
  }

  const legacyRow = args.row && typeof args.row === "object" ? args.row : {};
  const directResponses = args.responses && typeof args.responses === "object" ? args.responses : null;
  const rowResponses =
    legacyRow.responses && typeof legacyRow.responses === "object"
      ? legacyRow.responses
      : legacyRow.response_json
        ? (() => {
            try {
              return JSON.parse(legacyRow.response_json);
            } catch {
              return {};
            }
          })()
        : {};

  const payload = {
    token: GS_TOKEN,
    action: "log_survey_response",
    app: APP,
    survey_id,
    feed_id: args.feed_id || legacyRow.feed_id || "SURVEY_ONLY",
    project_id: args.project_id || legacyRow.project_id || getProjectId() || undefined,
    session_id: args.session_id || legacyRow.session_id || "",
    participant_id: args.participant_id || legacyRow.participant_id || "",
    entered_at_iso:
  args.entered_at_iso ||
  legacyRow.entered_at_iso ||
  "",
    submitted_at_iso: args.submitted_at_iso || legacyRow.submitted_at_iso || new Date().toISOString(),
    duration_ms: Number(args.duration_ms ?? legacyRow.duration_ms ?? 0) || 0,
    responses: directResponses || rowResponses || {},
    ip_address: args.ip_address || legacyRow.ip_address || "",
    prolific_pid: args.prolific_pid || legacyRow.prolific_pid || "",
    prolific_session_id: args.prolific_session_id || legacyRow.prolific_session_id || "",
    prolific_study_id: args.prolific_study_id || legacyRow.prolific_study_id || "",
    experiment_group_id: args.experiment_group_id || legacyRow.experiment_group_id || "",
  };

  if (isSupabaseBackend()) {
    try {
      return await supabaseLogSurveyResponse({ ...payload, app: APP });
    } catch (e) {
      console.warn("sendSurveyResponseToBackend (supabase) failed:", e);
      return false;
    }
  }

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon && body.length < 60000) {
    try {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      const ok = navigator.sendBeacon(GS_ENDPOINT, blob);
      if (ok) return true;
    } catch {}
  }

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
    });
    return res.ok;
  } catch (err) {
    console.warn("sendSurveyResponseToBackend(fetch) failed:", err);
    return false;
  }
}

/**
 * Assigns (or recalls) this participant's experiment group for a survey.
 * The backend does round-robin assignment across a shared, persistent
 * per-survey counter (so distribution stays even across all participants,
 * not just this browser), and is idempotent per session_id — calling this
 * again for the same session returns the same group_id rather than
 * reassigning. Returns null if the survey has no experiment groups, or on
 * any failure (callers should treat that the same as "no group scoping").
 */
export async function assignExperimentGroup({
  projectId = getProjectId(),
  surveyId,
  sessionId = "",
  participantId = "",
} = {}) {
  const survey_id = String(surveyId || "").trim();
  if (!survey_id) return null;

  if (isSupabaseBackend()) {
    try {
      return await supabaseAssignExperimentGroup({
        surveyId: survey_id,
        sessionId: String(sessionId || ""),
        participantId: String(participantId || ""),
      });
    } catch (e) {
      console.warn("assignExperimentGroup (supabase) failed:", e);
      return null;
    }
  }

  try {
    const { res, data } = await postJson({
      token: GS_TOKEN,
      action: "assign_experiment_group",
      app: APP,
      project_id: projectId || undefined,
      survey_id,
      session_id: String(sessionId || ""),
      participant_id: String(participantId || ""),
    });

    if (!res.ok || data?.ok === false) return null;
    return data?.group_id ? String(data.group_id) : null;
  } catch (e) {
    console.warn("assignExperimentGroup failed:", e);
    return null;
  }
}

/* --------------------- Feeds listing (Admin switcher) --------------------- */
export async function listFeedsFromBackend({ projectId = getProjectId(), signal } = {}) {
  if (isSupabaseBackend()) {
    try {
      return await supabaseListFeeds({ projectId, app: getApp() });
    } catch (e) {
      console.warn("listFeedsFromBackend (supabase) failed:", e);
      return [];
    }
  }

  try {
    const data = await getJsonWithRetry(
      buildQueryUrl(FEEDS_GET_URL(), {
        project_id: projectId || undefined,
        _ts: Date.now(),
      }),
      { method: "GET", mode: "cors", cache: "no-store", signal },
      { retries: 1, timeoutMs: 8000 }
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("listFeedsFromBackend failed:", e);
    return [];
  }
}

/* -------- default feed helpers (persisted on backend) --------------------- */
export async function getDefaultFeedFromBackend({ projectId = getProjectId(), signal } = {}) {
  if (isSupabaseBackend()) {
    return supabaseGetDefaultFeedId({ app: getApp(), projectId });
  }

  try {
    const data = await getJsonWithRetry(
      buildQueryUrl(DEFAULT_FEED_GET_URL(), {
        project_id: projectId || undefined,
        _ts: Date.now(),
      }),
      { method: "GET", mode: "cors", cache: "no-store", signal },
      { retries: 1, timeoutMs: 8000 }
    );
    return data && typeof data === "object" ? data.feed_id || null : null;
  } catch (e) {
    console.warn("getDefaultFeedFromBackend failed:", e);
    return null;
  }
}

export async function setDefaultFeedOnBackend(feedId, { projectId = getProjectId() } = {}) {
  if (isSupabaseBackend()) {
    return supabaseSetDefaultFeedId({ app: getApp(), projectId, feedId });
  }

  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("setDefaultFeedOnBackend: missing admin_token");
    return false;
  }

  try {
    const { res } = await postJson({
      action: "set_default_feed",
      app: APP,
      feed_id: feedId || "",
      admin_token,
      project_id: projectId || undefined,
    });

    return res.ok;
  } catch (e) {
    console.warn("setDefaultFeedOnBackend failed:", e);
    return false;
  }
}

export async function deleteFeedOnBackend(feedId, { projectId = getProjectId() } = {}) {
  if (!hasAdminSession()) return false;

  if (isSupabaseBackend()) {
    try {
      return await supabaseDeleteFeed({ projectId, app: getApp(), feedId });
    } catch (e) {
      console.warn("deleteFeedOnBackend (supabase) failed:", e);
      return false;
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return false;

  try {
    const { res } = await postJson({
      action: "delete_feed",
      app: APP,
      admin_token,
      feed_id: feedId,
      project_id: projectId || undefined,
    });

    return res.ok;
  } catch (e) {
    console.error("deleteFeedOnBackend failed", e);
    return false;
  }
}

/* ------------------------- POSTS API (multi-feed + cache) ----------------- */
const __postsCache = new Map();
const POSTS_STALE_MS = 60_000;

function __postsCacheKey(feedId, projectId = getProjectId()) {
  const pid = projectId || "";
  return `${APP}::${pid}::${feedId || ""}`;
}

function __getCachedPosts(feedId, projectId = getProjectId()) {
  const rec = __postsCache.get(__postsCacheKey(feedId, projectId));
  if (!rec) return null;
  if (Date.now() - rec.at > POSTS_STALE_MS) return null;
  return rec.data;
}

function __setCachedPosts(feedId, data, projectId = getProjectId()) {
  __postsCache.set(__postsCacheKey(feedId, projectId), { at: Date.now(), data });
}

export function invalidatePostsCache(feedId = null, projectId = getProjectId()) {
  const fid = String(feedId || "");
  const pid = String(projectId || "");
  for (const k of __postsCache.keys()) {
    if (!k.startsWith(`${APP}::${pid}::`)) continue;
    if (!fid || k.endsWith(`::${fid}`)) __postsCache.delete(k);
  }
}

export async function loadPostsFromBackend(arg1, arg2) {
  let feedId = null;
  let force = false;
  let signal;
  let projectId = getProjectId();

  if (typeof arg1 === "string") {
    feedId = arg1 || null;
    if (arg2 && typeof arg2 === "object") {
      force = !!arg2.force;
      signal = arg2.signal;
      projectId = arg2.projectId || projectId;
    }
  } else if (arg1 && typeof arg1 === "object") {
    feedId = arg1.feedId || null;
    force = !!arg1.force;
    signal = arg1.signal;
    projectId = arg1.projectId || projectId;
  }

  if (!feedId) {
    feedId = await getDefaultFeedFromBackend({ projectId, signal });
  }

  if (!force) {
    const cached = __getCachedPosts(feedId, projectId);
    if (cached) return cached;
  }

  try {
    const arr = isSupabaseBackend()
      ? await supabaseLoadPosts({ projectId, feedId, app: getApp() })
      : await (async () => {
          const url = buildQueryUrl(POSTS_GET_URL(), {
            project_id: projectId || undefined,
            feed_id: feedId || undefined,
            _ts: Date.now(),
          });

          const data = await getJsonWithRetry(
            url,
            { method: "GET", mode: "cors", cache: "no-store", signal },
            { retries: 1, timeoutMs: 8000 }
          );

          return Array.isArray(data) ? data : [];
        })();

    arr
      .filter((p) => p?.videoMode && p?.videoMode !== "none" && p?.video?.url && !DRIVE_RE.test(p.video.url))
      .forEach((p) => {
        injectVideoPreload(p.video.url, p.video?.mime || "video/mp4");
        primeVideoCache(p.video.url);
      });

    __setCachedPosts(feedId, arr, projectId);
    return arr;
  } catch (e) {
    console.warn("loadPostsFromBackend failed:", e);
    const cached = __getCachedPosts(feedId, projectId);
    return cached || [];
  }
}

/**
 * savePostsToBackend(posts, { feedId, name } = {})
 */
export async function savePostsToBackend(rawPosts, ctx = {}) {
  const { feedId = null, name = null, projectId = getProjectId() } = ctx || {};
  if (!hasAdminSession()) {
    console.warn("savePostsToBackend: missing admin session");
    return false;
  }

  const nameMap = readPostNames(projectId || undefined, feedId) || {};

  const offenders = [];
  (rawPosts || []).forEach((p) => {
    const id = p?.id || "(no id)";
    if (p?.image?.url?.startsWith?.("data:")) offenders.push({ id, field: "image.url" });
    if (p?.video?.url?.startsWith?.("data:")) offenders.push({ id, field: "video.url" });
    if (p?.videoPosterUrl?.startsWith?.("data:")) offenders.push({ id, field: "videoPosterUrl" });
  });

  if (offenders.length) {
    const lines = offenders.map((o) => `• Post ${o.id}: ${o.field}`).join("\n");
    alert(
      "One or more posts still contain local data URLs.\n\n" +
        "Please upload images/videos so they use https URLs, then try saving again.\n\n" +
        lines
    );
    return false;
  }

  const posts = (rawPosts || []).map((p) => {
    const q = { ...p };
    delete q._localMyCommentText;
    delete q._tempUpload;
    if (q.image && q.image.svg && q.image.url) delete q.image.svg;
    const nm = (q.postName ?? nameMap[q.id] ?? q.name ?? "").trim();
    if (nm) q.name = nm;
    return q;
  });

  if (isSupabaseBackend()) {
    try {
      await supabasePublishPosts({ posts, feedId, name, projectId, app: getApp() });
      invalidatePostsCache(feedId, projectId);
      return true;
    } catch (err) {
      console.warn("Publish failed (supabase):", err);
      alert(`Save failed: ${String(err?.message || err)}`);
      return false;
    }
  }

  const admin_token = getAdminToken();

  try {
    const { res } = await postJson(
      {
        action: "publish_posts",
        app: APP,
        posts,
        feed_id: feedId,
        name,
        admin_token,
        project_id: projectId || undefined,
      },
      { timeoutMs: 20000 }
    );

    if (!res.ok) {
      alert(`Save failed: HTTP ${res.status}`);
      return false;
    }

    invalidatePostsCache(feedId, projectId);
    return true;
  } catch (err) {
    console.warn("Publish failed:", err);
    alert(`Save failed: ${String(err?.message || err)}`);
    return false;
  }
}

/* --------------------------- Surveys API (admin) --------------------------- */
const __surveysCache = new Map();
const SURVEYS_STALE_MS = 30_000;

function __surveyListCacheKey(projectId = getProjectId()) {
  return `${APP}::${projectId || ""}::surveys`;
}
function __surveyItemCacheKey(surveyId, projectId = getProjectId()) {
  return `${APP}::${projectId || ""}::survey::${surveyId || ""}`;
}
function __feedSurveyCacheKey(feedId, projectId = getProjectId()) {
  return `${APP}::${projectId || ""}::feed_survey::${feedId || ""}`;
}
function __getCachedSurveyList(projectId = getProjectId()) {
  const rec = __surveysCache.get(__surveyListCacheKey(projectId));
  if (!rec) return null;
  if (Date.now() - rec.at > SURVEYS_STALE_MS) return null;
  return rec.data;
}
function __setCachedSurveyList(projectId = getProjectId(), data) {
  __surveysCache.set(__surveyListCacheKey(projectId), { at: Date.now(), data });
}
function __getCachedSurvey(surveyId, projectId = getProjectId()) {
  const rec = __surveysCache.get(__surveyItemCacheKey(surveyId, projectId));
  if (!rec) return null;
  if (Date.now() - rec.at > SURVEYS_STALE_MS) return null;
  return rec.data;
}
function __setCachedSurvey(surveyId, projectId = getProjectId(), data) {
  __surveysCache.set(__surveyItemCacheKey(surveyId, projectId), { at: Date.now(), data });
}
function __getCachedFeedSurvey(feedId, projectId = getProjectId()) {
  const rec = __surveysCache.get(__feedSurveyCacheKey(feedId, projectId));
  if (!rec) return null;
  if (Date.now() - rec.at > SURVEYS_STALE_MS) return null;
  return rec.data;
}
function __setCachedFeedSurvey(feedId, projectId = getProjectId(), data) {
  __surveysCache.set(__feedSurveyCacheKey(feedId, projectId), { at: Date.now(), data });
}

export function invalidateSurveysCache({ surveyId = null, projectId = getProjectId(), feedId = null } = {}) {
  const pid = String(projectId || "");
  const sid = String(surveyId || "");
  const fid = String(feedId || "");

  for (const k of __surveysCache.keys()) {
    const matchesProject = k.startsWith(`${APP}::${pid}::`);
    if (!matchesProject) continue;

    if (!sid && !fid) {
      __surveysCache.delete(k);
      continue;
    }

    if (sid && k.endsWith(`::${sid}`)) {
      __surveysCache.delete(k);
      continue;
    }

    if (fid && k.endsWith(`::${fid}`)) {
      __surveysCache.delete(k);
    }
  }
}

async function rebuildSurveyRegistryOnBackend(projectId = getProjectId()) {
  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson({
      action: "survey_rebuild_registry",
      app: APP,
      admin_token,
      project_id: projectId || undefined,
    });

    if (!res.ok || data?.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    invalidateSurveysCache({ projectId });
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function listSurveysFromBackend({ projectId = getProjectId(), signal, force = false } = {}) {
  if (!hasAdminSession()) {
    console.warn("listSurveysFromBackend: missing admin session");
    return [];
  }

  if (!force) {
    const cached = __getCachedSurveyList(projectId);
    if (cached) return cached;
  }

  if (isSupabaseBackend()) {
    try {
      const arr = await supabaseListSurveys({ projectId });
      __setCachedSurveyList(projectId, arr);
      return arr;
    } catch (e) {
      console.warn("listSurveysFromBackend (supabase) failed:", e);
      return [];
    }
  }

  const admin_token = getAdminToken();

  const fetchList = async () => {
    const url = buildQueryUrl(SURVEYS_GET_URL(), {
      project_id: projectId || undefined,
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal },
      { retries: 1, timeoutMs: 8000 }
    );

    return Array.isArray(data) ? data : [];
  };

  try {
    let arr = await fetchList();

    if (arr.length === 0) {
      const rebuild = await rebuildSurveyRegistryOnBackend(projectId);
      if (rebuild.ok) {
        arr = await fetchList();
      }
    }

    __setCachedSurveyList(projectId, arr);
    return arr;
  } catch (e) {
    console.warn("listSurveysFromBackend failed:", e);
    return [];
  }
}

export async function loadSurveyFromBackend(
  surveyId,
  { projectId = getProjectId(), signal, force = false, returnEmptyOnFail = true } = {}
) {
  if (!hasAdminSession()) {
    console.warn("loadSurveyFromBackend: missing admin session");
    return returnEmptyOnFail ? makeEmptySurveyShell(surveyId) : null;
  }
  if (!surveyId) return returnEmptyOnFail ? makeEmptySurveyShell("") : null;

  if (!force) {
    const cached = __getCachedSurvey(surveyId, projectId);
    if (cached) return cached;
  }

  if (isSupabaseBackend()) {
    try {
      const survey = await supabaseLoadSurveyDefinition({ surveyId });
      if (!survey) return returnEmptyOnFail ? makeEmptySurveyShell(surveyId) : null;

      const out = {
        ...makeEmptySurveyShell(surveyId),
        ...survey,
        survey_id: survey.survey_id || surveyId,
        linked_project_id: projectId || "",
        delivery_mode: normalizeSurveyDeliveryMode(survey.delivery_mode),
      };

      __setCachedSurvey(surveyId, projectId, out);
      return out;
    } catch (e) {
      console.warn("loadSurveyFromBackend (supabase) failed:", e);
      return returnEmptyOnFail ? makeEmptySurveyShell(surveyId) : null;
    }
  }

  const admin_token = getAdminToken();

  const fetchDefinition = async () => {
    const url = buildQueryUrl(SURVEY_DEFINITION_GET_URL(), {
      survey_id: surveyId,
      project_id: projectId || undefined,
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal },
      { retries: 1, timeoutMs: 8000 }
    );

    return data && !Array.isArray(data) ? data : null;
  };

  try {
    let survey = await fetchDefinition();

    if (!survey || !survey.survey_id) {
      const rebuild = await rebuildSurveyRegistryOnBackend(projectId);
      if (rebuild.ok) {
        survey = await fetchDefinition();
      }
    }

    if (!survey) {
      return returnEmptyOnFail ? makeEmptySurveyShell(surveyId) : null;
    }

        const out = {
      ...makeEmptySurveyShell(surveyId),
      ...survey,
      survey_id: survey.survey_id || surveyId,
      linked_project_id: projectId || "",
      delivery_mode: normalizeSurveyDeliveryMode(survey.delivery_mode),
    };

    __setCachedSurvey(surveyId, projectId, out);
    return out;
  } catch (e) {
    console.warn("loadSurveyFromBackend failed:", e);
    return returnEmptyOnFail ? makeEmptySurveyShell(surveyId) : null;
  }
}

export async function getSurveyForFeedFromBackend(
  feedId,
  { projectId = getProjectId(), signal, force = false, knownLink = null } = {}
) {
  if (!feedId) return null;

  if (!force) {
    const cached = __getCachedFeedSurvey(feedId, projectId);
    if (cached !== null) return cached;
  }

  try {
    // Every feed in a survey's feed_sequence_ids is linked to the same
    // survey_id (handleSaveSurvey_ links all of them server-side), so the
    // feed→survey link is already known once surveyBoot has resolved it —
    // callers that already have that (survey_id, trigger) pair can pass it
    // as knownLink to skip this network round trip entirely, cutting one
    // full Apps-Script request out of every survey load.
    const link =
      knownLink && knownLink.survey_id
        ? knownLink
        : isSupabaseBackend()
          ? await (async () => {
              const surveyId = await supabaseGetSurveyIdForFeed({ feedId, projectId, app: getApp() });
              return surveyId ? { survey_id: surveyId, trigger: "after_feed_submit" } : null;
            })()
          : await getJsonWithRetry(
              buildQueryUrl(FEED_SURVEY_GET_URL(), {
                feed_id: feedId,
                project_id: projectId || undefined,
                _ts: Date.now(),
              }),
              { method: "GET", mode: "cors", cache: "no-store", signal },
              { retries: 1, timeoutMs: 8000 }
            );

    if (!link || !link.survey_id) {
      __setCachedFeedSurvey(feedId, projectId, null);
      return null;
    }

    const def = await loadPublicSurveyDefinitionForFeed(link.survey_id, feedId, {
      projectId,
      signal,
      force,
    });

       const out = def
      ? {
          ...makeEmptySurveyShell(link.survey_id),
          ...def,
          survey_id: def.survey_id || link.survey_id,
          linked_feed_id: feedId,
          linked_feed_ids: normalizeFeedSequenceIds(def.linked_feed_ids, [feedId]),
          feed_sequence_ids: normalizeFeedSequenceIds(def.feed_sequence_ids, def.linked_feed_ids || [feedId]),
          linked_project_id: projectId || "",
          trigger: link.trigger || "after_feed_submit",
          delivery_mode: normalizeSurveyDeliveryMode(def.delivery_mode),
        }
      : null;

    __setCachedFeedSurvey(feedId, projectId, out);
    return out;
  } catch (e) {
    console.warn("getSurveyForFeedFromBackend failed:", e);
    __setCachedFeedSurvey(feedId, projectId, null);
    return null;
  }
}

export async function getSurveyFromBackend(
  surveyId,
  { projectId = getProjectId(), signal, force = false } = {}
) {
  if (!surveyId) return null;

  const def = await loadPublicSurveyDefinition(surveyId, {
    projectId,
    signal,
    force,
  });

  return def
    ? {
        ...makeEmptySurveyShell(surveyId),
        ...def,
        survey_id: def.survey_id || surveyId,
        linked_project_id: projectId || "",
        delivery_mode: normalizeSurveyDeliveryMode(def.delivery_mode),
      }
    : null;
}

export async function saveSurveyToBackend(survey, { projectId = getProjectId() } = {}) {
  if (!hasAdminSession()) return { ok: false, err: "admin auth required" };

  if (isSupabaseBackend()) {
    const surveyToSave = {
      ...survey,
      linked_feed_ids: normalizeFeedSequenceIds(survey?.linked_feed_ids),
      feed_sequence_ids: normalizeFeedSequenceIds(survey?.feed_sequence_ids, survey?.linked_feed_ids),
      delivery_mode: normalizeSurveyDeliveryMode(survey?.delivery_mode),
    };

    const res = await supabaseSaveSurvey({ survey: surveyToSave, projectId, app: getApp() });
    if (!res.ok) return res;

    invalidateSurveysCache({ projectId, surveyId: res.survey_id });
    return res;
  }

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  const surveyId = String(survey?.survey_id || "").trim();
  const action = surveyId ? "survey_update" : "survey_create";

  try {
    const payload = {
      action,
      app: APP,
      admin_token,
      project_id: projectId || undefined,
            definition: {
        ...survey,
        delivery_mode: normalizeSurveyDeliveryMode(survey?.delivery_mode),
        linked_feed_ids: normalizeFeedSequenceIds(survey?.linked_feed_ids),
        feed_sequence_ids: normalizeFeedSequenceIds(survey?.feed_sequence_ids, survey?.linked_feed_ids),
      },
    };
    if (surveyId) payload.survey_id = surveyId;

    // Saving a survey fans out to several Apps Script sheet writes server-side
    // (the chunked survey-definition write, the surveys registry, and a
    // link/unlink pass across every linked feed × app) — that grows with
    // survey size and linked-feed count, and can comfortably exceed the
    // default 12s client timeout for larger surveys, surfacing as an
    // "AbortError: signal is aborted without reason" here even though the
    // save frequently completes fine server-side after the client gives up.
    const { res, data } = await postJson(payload, { timeoutMs: 45000 });

    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    const finalSurveyId = data?.survey_id || surveyId || null;

    invalidateSurveysCache({
      projectId,
      surveyId: finalSurveyId,
    });

    return {
      ok: true,
      survey_id: finalSurveyId,
      checksum: data?.checksum || null,
    };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function deleteSurveyOnBackend(surveyId, { projectId = getProjectId() } = {}) {
  if (!hasAdminSession()) return { ok: false, err: "admin auth required" };
  if (!surveyId) return { ok: false, err: "survey_id required" };

  if (isSupabaseBackend()) {
    try {
      await supabaseDeleteSurvey({ surveyId });
      invalidateSurveysCache({ projectId, surveyId });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e?.message || e) };
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson({
      action: "survey_delete",
      app: APP,
      admin_token,
      project_id: projectId || undefined,
      survey_id: surveyId,
    });

    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    invalidateSurveysCache({ projectId, surveyId });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

/**
 * Deletes every submitted response row for a survey (SurveyResponses sheet),
 * without touching the survey definition itself. Use when a survey was
 * repeatedly test-run before real participants and the admin wants a clean
 * slate for the actual study — as opposed to deleteSurveyOnBackend, which
 * removes the survey (questions, pages, launch links) entirely.
 *
 * Destructive and irreversible server-side.
 */
export async function deleteSurveyResponsesOnBackend({
  projectId = getProjectId(),
  surveyId,
} = {}) {
  if (!hasAdminSession()) return { ok: false, err: "admin auth required" };

  const survey_id = String(surveyId || "").trim();
  if (!survey_id) return { ok: false, err: "survey_id required" };

  if (isSupabaseBackend()) {
    try {
      await supabaseDeleteSurveyResponses({ surveyId: survey_id });
      return { ok: true, deleted_count: null };
    } catch (e) {
      return { ok: false, err: String(e?.message || e) };
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson({
      action: "delete_survey_responses",
      app: APP,
      admin_token,
      project_id: projectId || undefined,
      survey_id,
    });

    if (!res.ok || data?.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    return { ok: true, deleted_count: data?.deleted_count ?? null };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

/*
  code.gs only supports linking one feed at a time:
  - link_survey_to_feed
  - unlink_survey_from_feed

  So this helper synchronizes the survey across multiple feeds by:
  1) discovering current feeds linked to this survey in the current project
  2) unlinking removed feeds
  3) linking newly selected feeds
*/
export async function linkSurveyToFeedsOnBackend({
  surveyId,
  feedIds = [],
  projectId = getProjectId(),
  allFeeds = null,
  trigger = "after_feed_submit",
} = {}) {
  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };
  if (!surveyId) return { ok: false, err: "survey_id required" };

  const desiredFeedIds = uniqueStrings(feedIds);

  if (isSupabaseBackend()) {
    try {
      const res = await supabaseLinkSurveyToFeeds({
        surveyId,
        feedIds: desiredFeedIds,
        projectId,
        app: getApp(),
      });
      invalidateSurveysCache({ projectId, surveyId });
      return { ok: true, ...res };
    } catch (e) {
      return { ok: false, err: String(e?.message || e) };
    }
  }

  try {
    const surveyExists = await loadSurveyFromBackend(surveyId, {
      projectId,
      force: true,
      returnEmptyOnFail: false,
    });

    if (!surveyExists || !surveyExists.survey_id) {
      return { ok: false, err: "survey not found" };
    }

    const feedList =
      Array.isArray(allFeeds) && allFeeds.length
        ? allFeeds
        : await listFeedsFromBackend({ projectId });

    const candidateFeedIds = uniqueStrings(
      (feedList || []).map((f) => f?.feed_id).filter(Boolean)
    );

    const currentLinkedFeedIds = [];
    await Promise.all(
      candidateFeedIds.map(async (fid) => {
        try {
          const url = buildQueryUrl(FEED_SURVEY_GET_URL(), {
            feed_id: fid,
            project_id: projectId || undefined,
            _ts: Date.now(),
          });
          const link = await getJsonWithRetry(
            url,
            { method: "GET", mode: "cors", cache: "no-store" },
            { retries: 1, timeoutMs: 8000 }
          );
          if (link && String(link.survey_id || "") === String(surveyId)) {
            currentLinkedFeedIds.push(fid);
          }
        } catch {
          // ignore per-feed lookup failures
        }
      })
    );

    const currentSet = new Set(uniqueStrings(currentLinkedFeedIds));
    const desiredSet = new Set(desiredFeedIds);

    const toUnlink = [...currentSet].filter((fid) => !desiredSet.has(fid));
    const toLink = [...desiredSet].filter((fid) => !currentSet.has(fid));

    for (const fid of toUnlink) {
      const { res, data } = await postJson({
        action: "unlink_survey_from_feed",
        app: APP,
        admin_token,
        project_id: projectId || undefined,
        feed_id: fid,
      });
      if (!res.ok || data.ok === false) {
        return { ok: false, err: data?.err || `Failed unlinking ${fid}` };
      }
      invalidateSurveysCache({ projectId, feedId: fid });
    }

    for (const fid of toLink) {
      const { res, data } = await postJson({
        action: "link_survey_to_feed",
        app: APP,
        admin_token,
        project_id: projectId || undefined,
        survey_id: surveyId,
        feed_id: fid,
        trigger,
      });
      if (!res.ok || data.ok === false) {
        return { ok: false, err: data?.err || `Failed linking ${fid}` };
      }
      invalidateSurveysCache({ projectId, feedId: fid });
    }

    invalidateSurveysCache({ projectId, surveyId });

    return {
      ok: true,
      linked_feed_ids: desiredFeedIds,
      added_feed_ids: toLink,
      removed_feed_ids: toUnlink,
    };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function loadSurveyResponsesRoster(arg1, arg2) {
  let surveyId = null;
  let opts = {};

  if (typeof arg1 === "string") {
    surveyId = arg1 || null;
    opts = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    surveyId = arg1.surveyId || null;
    opts = arg1;
  }

  if (!hasAdminSession()) {
    console.warn("loadSurveyResponsesRoster: missing admin session");
    return [];
  }

  const projectId = opts.projectId || getProjectId();
  const feedId = opts.feedId || null;

  if (isSupabaseBackend()) {
    try {
      return await supabaseLoadSurveyResponsesRoster({ surveyId, feedId, projectId, app: getApp() });
    } catch (e) {
      console.warn("loadSurveyResponsesRoster (supabase) failed:", e);
      return [];
    }
  }

  const admin_token = getAdminToken();

  try {
    const url = buildQueryUrl(SURVEY_RESPONSES_GET_URL(), {
      project_id: projectId || undefined,
      survey_id: surveyId || undefined,
      feed_id: feedId || undefined,
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal: opts.signal },
      { retries: 1, timeoutMs: 8000 }
    );

    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("loadSurveyResponsesRoster failed:", e);
    return [];
  }
}

export async function loadSurveyResponsesBySurveyRoster(arg1, arg2) {
  let surveyId = null;
  let opts = {};

  if (typeof arg1 === "string") {
    surveyId = arg1 || null;
    opts = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    surveyId = arg1.surveyId || null;
    opts = arg1;
  }

  if (!hasAdminSession()) {
    console.warn("loadSurveyResponsesBySurveyRoster: missing admin session");
    return [];
  }

  const projectId = opts.projectId || getProjectId();

  if (isSupabaseBackend()) {
    try {
      return await supabaseLoadSurveyResponsesBySurveyRoster({ surveyId });
    } catch (e) {
      console.warn("loadSurveyResponsesBySurveyRoster (supabase) failed:", e);
      return [];
    }
  }

  const admin_token = getAdminToken();

  try {
    const url = buildQueryUrl(SURVEY_RESPONSES_BY_SURVEY_GET_URL(), {
      project_id: projectId || undefined,
      survey_id: surveyId || undefined,
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal: opts.signal },
      { retries: 1, timeoutMs: 8000 }
    );

    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("loadSurveyResponsesBySurveyRoster failed:", e);
    return [];
  }
}

/* --------------------------- File upload: local signer (legacy) ------------ */
export async function uploadVideoToBackend(
  fileOrDataUrl,
  filename,
  mime = "video/mp4",
  signerBase = "http://localhost:4000"
) {
  let blob;

  if (typeof fileOrDataUrl === "string" && fileOrDataUrl.startsWith("data:")) {
    const base64 = fileOrDataUrl.split(",")[1] || "";
    const binStr = atob(base64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else if (fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob) {
    blob = fileOrDataUrl;
    mime = blob.type || mime;
    if (!filename && fileOrDataUrl instanceof File) filename = fileOrDataUrl.name;
  } else {
    throw new Error("uploadVideoToBackend: expected File/Blob or dataURL");
  }

  const q = new URLSearchParams({
    filename: filename || `video-${Date.now()}.mp4`,
    type: mime || "video/mp4",
  });

  const signRes = await fetch(`${signerBase}/sign-upload?${q.toString()}`);
  if (!signRes.ok) {
    const txt = await signRes.text().catch(() => "");
    throw new Error(`Signer failed: HTTP ${signRes.status} ${txt}`);
  }

  const { uploadUrl, fileUrl, error } = await signRes.json();
  if (!uploadUrl || !fileUrl || error) {
    throw new Error(error || "Signer did not return uploadUrl/fileUrl");
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: blob,
  });

  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    throw new Error(`S3 PUT failed: HTTP ${putRes.status} ${txt}`);
  }

  return fileUrl;
}

/* ========================= S3 Upload via Presigner ========================= */
export const SIGNER_BASE =
  (window.CONFIG && window.CONFIG.SIGNER_BASE) ||
  "https://qkbi313c2i.execute-api.us-west-1.amazonaws.com";

export const SIGNER_PATH =
  (window.CONFIG && window.CONFIG.SIGNER_PATH) ||
  "/default/presign-upload";

export function encodePathKeepSlashes(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

export function sanitizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

function sniffFileMeta(file) {
  const contentType = file.type || "application/octet-stream";
  const ext =
    (file.name.split(".").pop() || "").toLowerCase() ||
    (contentType.startsWith("video/") ? "mp4" : "bin");
  const nameNoExt = (file.name || "").replace(/\.[^.]+$/, "");
  return { contentType, ext, nameNoExt };
}

export async function getPresignedPutUrl({ key, contentType, timeoutMs = 30000 }) {
  const url = new URL(joinUrl(SIGNER_BASE, SIGNER_PATH));
  url.searchParams.set("key", key);
  url.searchParams.set("contentType", contentType);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`.trim());
    }

    const j = await res.json();
    const uploadUrl = j.url || j.uploadUrl;
    const fileUrl = j.cdnUrl || j.fileUrl || null;
    if (!uploadUrl) throw new Error("presigner response missing URL");
    return { uploadUrl, fileUrl };
  } finally {
    clearTimeout(t);
  }
}

export async function putToS3({ file, signedPutUrl, onProgress, contentType }) {
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedPutUrl);
    xhr.timeout = 10 * 60 * 1000;
    xhr.setRequestHeader("Content-Type", contentType || file.type || "application/octet-stream");

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`S3 PUT ${xhr.status}: ${xhr.responseText || xhr.statusText}`));

    xhr.onerror = () => reject(new Error("Network error during S3 upload"));
    xhr.ontimeout = () => reject(new Error("S3 upload timed out"));
    xhr.send(file);
  });
}

export async function uploadFileToS3ViaSigner({
  file,
  feedId,
  projectId,
  onProgress,
  prefix = "images",
}) {
  if (!file) throw new Error("No file selected");
  if (!feedId) throw new Error("Missing feedId");

  const { contentType, ext, nameNoExt } = sniffFileMeta(file);
  const ts = Date.now();
  const base = sanitizeName(nameNoExt) || `file_${ts}`;
  const proj = sanitizeName(projectId || "global");
  const key = `${prefix}/${proj}/${feedId}/${ts}_${base}.${ext}`;

  const { uploadUrl, fileUrl } = await getPresignedPutUrl({ key, contentType });
  if (typeof onProgress === "function") onProgress(0);
  await putToS3({ file, signedPutUrl: uploadUrl, onProgress, contentType });

  const cdnUrl =
    fileUrl ||
    `${String(CF_BASE).replace(/\/+$/, "")}/${encodePathKeepSlashes(key)}`;

  try {
    console.log("[S3] uploaded", { key, cdnUrl });
  } catch {}

  if (typeof onProgress === "function") onProgress(100);
  return { key, cdnUrl };
}

export async function uploadJsonToS3ViaSigner({ data, feedId, prefix = "backups", filename, onProgress }) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const file = new File([blob], filename || "backup.json", { type: blob.type });
  return uploadFileToS3ViaSigner({ file, feedId, prefix, onProgress });
}

/* --------------------- Participants (admin panels & roster) ---------------- */
export async function loadParticipantsRoster(arg1, arg2) {
  let feedId = null;
  let opts = {};

  if (typeof arg1 === "string") {
    feedId = arg1 || null;
    opts = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    feedId = arg1.feedId || null;
    opts = arg1;
  }

  if (!hasAdminSession()) {
    console.warn("loadParticipantsRoster: missing admin session");
    return [];
  }

  const projectId = opts.projectId || getProjectId();

  if (isSupabaseBackend()) {
    try {
      return await supabaseLoadParticipantsRoster({ feedId, projectId, app: getApp() });
    } catch (e) {
      console.warn("loadParticipantsRoster (supabase) failed:", e);
      return [];
    }
  }

  const admin_token = getAdminToken();

  try {
    const url = buildQueryUrl(PARTICIPANTS_GET_URL(), {
      project_id: projectId || undefined,
      feed_id: feedId || undefined,
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal: opts.signal },
      { retries: 1, timeoutMs: 8000 }
    );

    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("loadParticipantsRoster failed:", e);
    return [];
  }
}

export async function loadSurveyParticipantsRoster(arg1, arg2) {
  let surveyId = null;
  let opts = {};

  if (typeof arg1 === "string") {
    surveyId = arg1 || null;
    opts = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    surveyId = arg1.surveyId || null;
    opts = arg1;
  }

  if (!hasAdminSession()) {
    console.warn("loadSurveyParticipantsRoster: missing admin session");
    return [];
  }

  const projectId = opts.projectId || getProjectId();

  if (isSupabaseBackend()) {
    try {
      return await supabaseLoadSurveyParticipantsRoster({ surveyId, projectId, app: getApp() });
    } catch (e) {
      console.warn("loadSurveyParticipantsRoster (supabase) failed:", e);
      return [];
    }
  }

  const admin_token = getAdminToken();

  try {
    const url = buildQueryUrl(SURVEY_PARTICIPANTS_GET_URL(), {
      project_id: projectId || undefined,
      survey_id: surveyId || undefined,
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal: opts.signal },
      { retries: 1, timeoutMs: 8000 }
    );

    if (Array.isArray(data)) return data;
    return Array.isArray(data?.rows) ? data.rows : [];
  } catch (e) {
    console.warn("loadSurveyParticipantsRoster failed:", e);
    return [];
  }
}

export async function loadSurveyParticipantsStats(arg1, arg2) {
  let surveyId = null;
  let opts = {};

  if (typeof arg1 === "string") {
    surveyId = arg1 || null;
    opts = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    surveyId = arg1.surveyId || null;
    opts = arg1;
  }

  if (!hasAdminSession()) {
    console.warn("loadSurveyParticipantsStats: missing admin session");
    return { total: 0 };
  }

  if (isSupabaseBackend()) {
    try {
      return await supabaseLoadSurveyParticipantsStats({ surveyId });
    } catch (e) {
      console.warn("loadSurveyParticipantsStats (supabase) failed:", e);
      return { total: 0 };
    }
  }

  const admin_token = getAdminToken();

  const projectId = opts.projectId || getProjectId();

  try {
    const url = buildQueryUrl(SURVEY_PARTICIPANTS_STATS_GET_URL(), {
      project_id: projectId || undefined,
      survey_id: surveyId || undefined,
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal: opts.signal },
      { retries: 1, timeoutMs: 8000 }
    );

    return data && typeof data === "object" ? data : { total: 0 };
  } catch (e) {
    console.warn("loadSurveyParticipantsStats failed:", e);
    return { total: 0 };
  }
}

export async function loadExperimentGroupCounts({
  projectId = getProjectId(),
  surveyId,
  signal,
} = {}) {
  if (!hasAdminSession()) {
    console.warn("loadExperimentGroupCounts: missing admin session");
    return { counts: {}, total: 0 };
  }

  const survey_id = String(surveyId || "").trim();
  if (!survey_id) return { counts: {}, total: 0 };

  if (isSupabaseBackend()) {
    try {
      return await supabaseGetExperimentGroupCounts({ surveyId: survey_id });
    } catch (e) {
      console.warn("loadExperimentGroupCounts (supabase) failed:", e);
      return { counts: {}, total: 0 };
    }
  }

  const admin_token = getAdminToken();

  try {
    const url = buildQueryUrl(EXPERIMENT_GROUP_COUNTS_GET_URL(), {
      project_id: projectId || undefined,
      survey_id,
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal },
      { retries: 1, timeoutMs: 8000 }
    );

    return data && typeof data === "object" ? data : { counts: {}, total: 0 };
  } catch (e) {
    console.warn("loadExperimentGroupCounts failed:", e);
    return { counts: {}, total: 0 };
  }
}

/**
 * Clears every recorded experiment-group assignment for a survey and resets
 * the round-robin counter back to zero, so the next participant lands in
 * group 1 again. Use when the live balance has drifted (e.g. participants
 * started but never finished, so their slot is "spent" without a completed
 * response) and the study needs to restart assignment from a clean slate.
 *
 * Destructive and irreversible server-side — existing participants' already-
 * recorded group_id (in ExperimentAssignments and in any submitted
 * SurveyResponses rows) is untouched, but anyone who started the survey and
 * has not yet had their assignment logged again will be reassigned on their
 * next request.
 */
export async function resetExperimentGroupAssignments({
  projectId = getProjectId(),
  surveyId,
} = {}) {
  if (!hasAdminSession()) return { ok: false, err: "admin auth required" };

  const survey_id = String(surveyId || "").trim();
  if (!survey_id) return { ok: false, err: "survey_id required" };

  if (isSupabaseBackend()) {
    try {
      await supabaseResetExperimentGroupAssignments({ surveyId: survey_id });
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e?.message || e) };
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson({
      action: "reset_experiment_group_assignments",
      app: APP,
      admin_token,
      project_id: projectId || undefined,
      survey_id,
    });

    if (!res.ok || data?.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

/**
 * Custom measure groups (Survey Participants analysis hub's cross-cutting
 * tag-pattern groups, e.g. "every BL item across all 10 stimuli" — CLAUDE.md
 * "Survey Participants analysis hub: correctness fixes"). Supabase-only —
 * this feature was built entirely after the GAS->Supabase cutover and has no
 * GAS counterpart, so the fallback branch is a plain no-op rather than an
 * admin_token-based GAS call that was never wired up anywhere.
 */
export async function loadCustomMeasureGroups({ surveyId, projectId = getProjectId() } = {}) {
  if (!hasAdminSession()) return [];
  const survey_id = String(surveyId || "").trim();
  if (!survey_id) return [];

  if (!isSupabaseBackend()) return [];

  try {
    return await supabaseListCustomMeasureGroups({ surveyId: survey_id });
  } catch (e) {
    console.warn("loadCustomMeasureGroups failed:", e);
    return [];
  }
}

export async function saveCustomMeasureGroups(surveyId, groups, { projectId = getProjectId() } = {}) {
  if (!hasAdminSession()) return { ok: false, err: "admin auth required" };
  const survey_id = String(surveyId || "").trim();
  if (!survey_id) return { ok: false, err: "survey_id required" };

  if (!isSupabaseBackend()) return { ok: false, err: "custom measure groups require the Supabase backend" };

  try {
    await supabaseSaveCustomMeasureGroups({ surveyId: survey_id, groups: Array.isArray(groups) ? groups : [] });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

/**
 * Per-user project access (Users admin page rework, 2026-08-04 — see
 * CLAUDE.md). Supabase-only, same reasoning as custom measure groups above:
 * this is a brand-new restriction concept with no GAS admin-account
 * equivalent (GAS/Sheets roles were always global, see
 * 20260801000002_profiles.sql's own comment), so the GAS branch is a plain
 * no-op rather than a call to an action that was never built there.
 */
export async function listAllProjectAccess() {
  if (!hasAdminSession() || !isSupabaseBackend()) return [];
  try {
    return await supabaseListProjectAccess();
  } catch (e) {
    console.warn("listAllProjectAccess failed:", e);
    return [];
  }
}

export async function setUserProjectAccess(userId, entries) {
  if (!hasAdminSession()) return { ok: false, err: "admin auth required" };
  if (!userId) return { ok: false, err: "userId required" };
  if (!isSupabaseBackend()) return { ok: false, err: "project access requires the Supabase backend" };

  try {
    await supabaseSetUserProjectAccess(userId, Array.isArray(entries) ? entries : []);
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

const __postByIdCache = new Map();
const __postByIdPromiseCache = new Map();

function postByIdCacheKey({ projectId = "", feedId = "", postId = "" } = {}) {
  return [
    String(projectId || "").trim(),
    String(feedId || "").trim(),
    String(postId || "").trim(),
  ].join("::");
}

export async function loadPostByIdFromBackend({
  feedId,
  postId,
  projectId = getProjectId(),
  signal,
  force = false,
} = {}) {
  const cleanFeedId = String(feedId || "").trim();
  const cleanPostId = String(postId || "").trim();
  const cleanProjectId = String(projectId || "").trim();

  if (!cleanFeedId || !cleanPostId) return null;

  const cacheKey = postByIdCacheKey({
    projectId: cleanProjectId,
    feedId: cleanFeedId,
    postId: cleanPostId,
  });

  if (!force && __postByIdCache.has(cacheKey)) {
    return __postByIdCache.get(cacheKey);
  }

  if (!force && __postByIdPromiseCache.has(cacheKey)) {
    return __postByIdPromiseCache.get(cacheKey);
  }

  const request = (async () => {
    try {
      const data = isSupabaseBackend()
        ? await supabaseLoadPostById({
            projectId: cleanProjectId,
            app: getApp(),
            feedId: cleanFeedId,
            postId: cleanPostId,
          })
        : await (async () => {
            const url = buildQueryUrl(POST_BY_ID_GET_URL(), {
              project_id: cleanProjectId || undefined,
              feed_id: cleanFeedId,
              post_id: cleanPostId,
              _ts: Date.now(),
            });

            return getJsonWithRetry(
              url,
              { method: "GET", mode: "cors", cache: "no-store", signal },
              { retries: 1, timeoutMs: 8000 }
            );
          })();

      const post = data && typeof data === "object" ? data : null;
      __postByIdCache.set(cacheKey, post);
      return post;
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.warn("loadPostByIdFromBackend failed:", e);
      }
      return null;
    } finally {
      __postByIdPromiseCache.delete(cacheKey);
    }
  })();

  __postByIdPromiseCache.set(cacheKey, request);
  return request;
}

export async function preloadSurveyPostRemindersFromBackend({
  survey,
  fallbackFeedId = "",
  projectId = getProjectId(),
  signal,
} = {}) {
  const pages = Array.isArray(survey?.pages) ? survey.pages : [];
  const uniqueTargets = new Map();

  pages.forEach((page) => {
    const questions = Array.isArray(page?.questions) ? page.questions : [];

    questions.forEach((question) => {
      if (String(question?.type || "").trim() !== "post_reminder") return;

      const postId = String(
        question?.post_id ?? question?.meta?.post_id ?? ""
      ).trim();
      const feedId = String(
        question?.post_feed_id ??
          question?.meta?.post_feed_id ??
          fallbackFeedId ??
          ""
      ).trim();

      if (!postId || !feedId) return;

      const key = postByIdCacheKey({ projectId, feedId, postId });
      if (!uniqueTargets.has(key)) {
        uniqueTargets.set(key, { feedId, postId });
      }
    });
  });

  if (!uniqueTargets.size) return [];

  return Promise.all(
    Array.from(uniqueTargets.values()).map(({ feedId, postId }) =>
      loadPostByIdFromBackend({
        projectId,
        feedId,
        postId,
        signal,
      })
    )
  );
}

export async function wipeParticipantsOnBackend(feedId, { projectId = getProjectId() } = {}) {
  if (!feedId) return false;

  if (isSupabaseBackend()) {
    try {
      return await supabaseWipeParticipants({ projectId, app: getApp(), feedId });
    } catch (e) {
      console.warn("wipeParticipantsOnBackend (supabase) failed:", e);
      return false;
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return false;

  try {
    const { res, data } = await postJson(
      {
        action: "wipe_participants",
        app: APP,
        feed_id: feedId,
        admin_token,
        project_id: projectId || undefined,
      },
      { keepalive: true }
    );

    return !!(res.ok && data.ok !== false);
  } catch {
    return false;
  }
}

export async function getWipePolicyFromBackend({ signal, projectId = getProjectId() } = {}) {
  if (isSupabaseBackend()) {
    try {
      return await supabaseGetWipePolicy({ projectId });
    } catch (e) {
      console.warn("getWipePolicyFromBackend (supabase) failed:", e);
      return null;
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return null;

  try {
    const url = buildQueryUrl(WIPE_POLICY_GET_URL(), {
      admin_token,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store" },
      { retries: 1, timeoutMs: 8000 }
    );

    if (data && data.ok !== false && typeof data.wipe_on_change !== "undefined") {
      return !!data.wipe_on_change;
    }

    return null;
  } catch (e) {
    console.warn("getWipePolicyFromBackend failed:", e);
    return null;
  }
}

export async function setWipePolicyOnBackend(wipeOnChange, { projectId = getProjectId() } = {}) {
  if (isSupabaseBackend()) {
    try {
      const applied = await supabaseSetWipePolicy({ projectId, wipeOnChange });
      return { ok: true, wipe_on_change: applied };
    } catch (e) {
      return { ok: false, err: String(e.message || e) };
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const { res, data } = await postJson(
      {
        action: "set_wipe_policy",
        admin_token,
        wipe_on_change: !!wipeOnChange,
      },
      { keepalive: true }
    );

    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }

    return { ok: true, wipe_on_change: !!data.wipe_on_change };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

/* ============================ Project helpers (backend) ============================ */
export async function listProjectsFromBackend({ signal } = {}) {
  if (isSupabaseBackend()) {
    try {
      const rows = await supabaseListProjects();
      return rows.length ? rows : [{ project_id: "global", name: "Global" }];
    } catch (e) {
      console.warn("listProjectsFromBackend (supabase) failed:", e);
      return [{ project_id: "global", name: "Global" }];
    }
  }

  try {
    const data = await getJsonWithRetry(
      buildQueryUrl(PROJECTS_GET_URL(), { _ts: Date.now() }),
      { method: "GET", mode: "cors", cache: "no-store", signal },
      { retries: 1, timeoutMs: 8000 }
    );

    if (!Array.isArray(data) || data.length === 0) {
      return [{ project_id: "global", name: "Global" }];
    }

    return data;
  } catch (e) {
    console.warn("listProjectsFromBackend failed:", e);
    return [{ project_id: "global", name: "Global" }];
  }
}

/** Default project handling (client side, stored locally) */
const DEFAULT_PROJECT_KEY = "DEFAULT_PROJECT_ID";

export async function getDefaultProjectFromBackend() {
  return localStorage.getItem(DEFAULT_PROJECT_KEY) || "global";
}

export async function setDefaultProjectOnBackend(projectId) {
  localStorage.setItem(DEFAULT_PROJECT_KEY, projectId || "global");
  return true;
}

export async function createProjectOnBackend({ projectId, name, notes } = {}) {
  if (!hasAdminSession()) return false;

  if (isSupabaseBackend()) {
    try {
      return await supabaseCreateProject({ projectId, name, notes });
    } catch (e) {
      console.warn("createProjectOnBackend (supabase) failed:", e);
      return false;
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return false;

  try {
    const { data } = await postJson({
      action: "project_create",
      admin_token,
      project_id: projectId,
      name,
      notes,
    });

    return !!data?.ok;
  } catch (e) {
    console.warn("createProjectOnBackend failed:", e);
    return false;
  }
}

export async function deleteProjectOnBackend(projectId) {
  if (!hasAdminSession()) return false;

  if (isSupabaseBackend()) {
    try {
      return await supabaseDeleteProject({ projectId });
    } catch (e) {
      console.warn("deleteProjectOnBackend (supabase) failed:", e);
      return false;
    }
  }

  const admin_token = getAdminToken();
  if (!admin_token) return false;

  try {
    const { data } = await postJson({
      action: "project_delete",
      admin_token,
      project_id: projectId,
    });

    return !!data?.ok;
  } catch (e) {
    console.warn("deleteProjectOnBackend failed:", e);
    return false;
  }
}

/* --------------------- Post-name storage (scoped by app+project+feed) ------ */
const POST_NAMES_KEY = (projectId, feedId) =>
  `${APP}::${projectId || "global"}::${feedId || ""}::post_names_v1`;

export function readPostNames(projectId = getProjectId(), feedId = getFeedIdFromUrl()) {
  try {
    const raw = localStorage.getItem(POST_NAMES_KEY(projectId, feedId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writePostNames(projectId = getProjectId(), feedId = getFeedIdFromUrl(), map = {}) {
  try {
    localStorage.setItem(POST_NAMES_KEY(projectId, feedId), JSON.stringify(map || {}));
  } catch {}
}

export function labelForPostId(
  postId,
  { projectId = getProjectId(), feedId = getFeedIdFromUrl(), fallback = postId } = {}
) {
  if (!postId) return fallback;
  const m = readPostNames(projectId, feedId);
  return (m && m[postId]) || fallback;
}

export function postDisplayName(p, { projectId = getProjectId(), feedId = getFeedIdFromUrl() } = {}) {
  const id = p?.id || "";
  const nm = String(p?.name || p?.postName || "").trim();
  if (nm) return nm;
  const saved = readPostNames(projectId, feedId);
  if (saved && saved[id]) return saved[id];
  if (APP === "amz") {
    const title = String(p?.review_title || p?.title || p?.headline || "").trim();
    const reviewer = String(p?.reviewer || p?.reviewer_name || p?.author || "").trim();
    return title || reviewer || id;
  }
  return id;
}

export function headerLabelsForKeys(keys, posts, { projectId = getProjectId(), feedId = getFeedIdFromUrl() } = {}) {
  const nameMap = {};
  (posts || []).forEach((p) => {
    const id = p?.id;
    if (!id) return;
    nameMap[id] = postDisplayName(p, { projectId, feedId });
  });

  return keys.map((k) => {
    if (k.startsWith(`${SURVEY_EXPORT_PREFIX}_`)) {
      return k;
    }

    const m = /^(.+?)_(.+)$/.exec(k);
    if (!m) return nameMap[k] || k;
    const [, id, suffix] = m;
    const base = nameMap[id] || id;
    return `${base}_${suffix}`;
  });
}

export function seedNamesFromPosts(posts, { projectId = getProjectId(), feedId = getFeedIdFromUrl() } = {}) {
  if (!Array.isArray(posts)) return;

  const map = readPostNames(projectId, feedId);
  let changed = false;

  for (const p of posts) {
    const id = p?.id;
    const nm = String(p?.name || p?.postName || (APP === "amz" ? (p?.review_title || p?.title || p?.reviewer || p?.author || "") : "")).trim();
    if (id && nm && !map[id]) {
      map[id] = nm;
      changed = true;
    }
  }

  if (changed) writePostNames(projectId, feedId, map);
}