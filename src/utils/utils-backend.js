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

/* --------------------- App + endpoints ----------------------- */
export const getApp = () => {
  const q = new URLSearchParams(window.location.search);
  const fromUrl = (q.get("app") || "").toLowerCase();
  const fromWin = (window.APP || "").toLowerCase();

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
    const url = buildQueryUrl(SURVEY_DEFINITION_GET_URL(), {
      survey_id: surveyId,
      feed_id: feedId,
      project_id: projectId || undefined,
      _ts: Date.now(),
    });

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal },
      { retries: 1, timeoutMs: 8000 }
    );

    if (!data || Array.isArray(data) || !data.survey_id) return null;

    const out = {
      ...makeEmptySurveyShell(surveyId),
      ...data,
      survey_id: data.survey_id || surveyId,
      linked_project_id: projectId || "",
    };

    __setCachedSurvey(surveyId, projectId, out);
    return out;
  } catch (e) {
    console.warn("loadPublicSurveyDefinitionForFeed failed:", e);
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
const PROJECTS_GET_URL = () => `${GS_ENDPOINT}?path=projects&app=${APP}`;
const SURVEYS_GET_URL = () => `${GS_ENDPOINT}?path=surveys&app=${getApp()}`;
const SURVEY_DEFINITION_GET_URL = () => `${GS_ENDPOINT}?path=survey_definition&app=${getApp()}`;
const FEED_SURVEY_GET_URL = () => `${GS_ENDPOINT}?path=feed_survey&app=${getApp()}`;
const SURVEY_RESPONSES_GET_URL = () => `${GS_ENDPOINT}?path=survey_responses&app=${getApp()}`;

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
    pages: [],
    linked_feed_ids: [],
    linked_project_id: normalizeProjectId(),
    trigger: "after_feed_submit",
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

function flattenSurveyQuestions(definition, { labelMode = SURVEY_COLUMN_LABEL_MODE.VARIABLE } = {}) {
  const survey = definition && typeof definition === "object" ? definition : {};
  const pages = Array.isArray(survey.pages) ? survey.pages : [];
  const questions = [];

  pages.forEach((page, pIdx) => {
    const qs = Array.isArray(page?.questions) ? page.questions : [];
    qs.forEach((q, qIdx) => {
      const questionId = String(q?.id || "").trim();
      const questionType = String(q?.type || "").trim();
      if (!questionId) return;
      if (questionType === "info" || questionType === "page_break") return;

      const questionText = String(q?.text || questionId).trim() || questionId;
      const rows = Array.isArray(q?.rows) ? q.rows : [];
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

function flattenSurveyResponseRecord(responseRow, surveyColumns) {
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

    return {
      ...participant,
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

/* ======================= Admin User Management APIs ======================= */
export async function adminListUsers() {
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

export async function adminCreateUser(email, password, role = "viewer") {
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

export async function adminUpdateUser({ email, role, password, disabled }) {
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

/* ====================== Admin auth (session token + role/email) ============ */
const ADMIN_TOKEN_KEY = `${APP}_admin_token_v1`;
const ADMIN_TOKEN_EXP_KEY = `${APP}_admin_token_exp_v1`;
const ADMIN_ROLE_KEY = `${APP}_admin_role_v1`;
const ADMIN_EMAIL_KEY = `${APP}_admin_email_v1`;

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

export function hasAdminRole(minRole = "viewer") {
  const r = (getAdminRole() || "viewer").toLowerCase();
  return (ROLE_RANK[r] || 0) >= (ROLE_RANK[minRole] || 0);
}

export async function touchAdminSession() {
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

export function setAdminSession({ token, ttlSec, role, email } = {}) {
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
  } catch {}
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_EXP_KEY);
  localStorage.removeItem(ADMIN_ROLE_KEY);
  localStorage.removeItem(ADMIN_EMAIL_KEY);
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

export function hasAdminSession() {
  return !!getAdminToken();
}

export async function adminLogin(password) {
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
      });
      return { ok: true };
    }

    return { ok: false, err: data?.err || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function adminLoginUser(email, password) {
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
      });
      return { ok: true };
    }

    return { ok: false, err: data?.err || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function adminLogout() {
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
export async function sendToSheet(header, row, _events, feed_id) {
  if (!feed_id) {
    console.warn("sendToSheet: feed_id required");
    return false;
  }

  const payload = {
    token: GS_TOKEN,
    action: "log_participant",
    app: APP,
    feed_id,
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
    feed_id: args.feed_id || legacyRow.feed_id || "",
    project_id: args.project_id || legacyRow.project_id || getProjectId() || undefined,
    session_id: args.session_id || legacyRow.session_id || "",
    participant_id: args.participant_id || legacyRow.participant_id || "",
    submitted_at_iso: args.submitted_at_iso || legacyRow.submitted_at_iso || new Date().toISOString(),
    duration_ms: Number(args.duration_ms ?? legacyRow.duration_ms ?? 0) || 0,
    responses: directResponses || rowResponses || {},
    ip_address: args.ip_address || legacyRow.ip_address || "",
    prolific_pid: args.prolific_pid || legacyRow.prolific_pid || "",
    prolific_session_id: args.prolific_session_id || legacyRow.prolific_session_id || "",
    prolific_study_id: args.prolific_study_id || legacyRow.prolific_study_id || "",
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
    console.warn("sendSurveyResponseToBackend(fetch) failed:", err);
    return false;
  }
}

/* --------------------- Feeds listing (Admin switcher) --------------------- */
export async function listFeedsFromBackend({ projectId = getProjectId(), signal } = {}) {
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

    const arr = Array.isArray(data) ? data : [];

    arr
      .filter((p) => p?.videoMode !== "none" && p?.video?.url && !DRIVE_RE.test(p.video.url))
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
  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("savePostsToBackend: missing admin_token");
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
  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("listSurveysFromBackend: missing admin_token");
    return [];
  }

  if (!force) {
    const cached = __getCachedSurveyList(projectId);
    if (cached) return cached;
  }

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
  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("loadSurveyFromBackend: missing admin_token");
    return returnEmptyOnFail ? makeEmptySurveyShell(surveyId) : null;
  }
  if (!surveyId) return returnEmptyOnFail ? makeEmptySurveyShell("") : null;

  if (!force) {
    const cached = __getCachedSurvey(surveyId, projectId);
    if (cached) return cached;
  }

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
  { projectId = getProjectId(), signal, force = false } = {}
) {
  if (!feedId) return null;

  if (!force) {
    const cached = __getCachedFeedSurvey(feedId, projectId);
    if (cached !== null) return cached;
  }

  try {
    const linkUrl = buildQueryUrl(FEED_SURVEY_GET_URL(), {
      feed_id: feedId,
      project_id: projectId || undefined,
      _ts: Date.now(),
    });

    const link = await getJsonWithRetry(
      linkUrl,
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
          linked_feed_ids: [feedId],
          linked_project_id: projectId || "",
          trigger: link.trigger || "after_feed_submit",
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

export async function saveSurveyToBackend(survey, { projectId = getProjectId() } = {}) {
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
      definition: survey,
    };
    if (surveyId) payload.survey_id = surveyId;

    const { res, data } = await postJson(payload);

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
  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };
  if (!surveyId) return { ok: false, err: "survey_id required" };

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

  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("loadSurveyResponsesRoster: missing admin_token");
    return [];
  }

  const projectId = opts.projectId || getProjectId();
  const feedId = opts.feedId || null;

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

  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("loadParticipantsRoster: missing admin_token");
    return [];
  }

  const projectId = opts.projectId || getProjectId();

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

export async function wipeParticipantsOnBackend(feedId, { projectId = getProjectId() } = {}) {
  const admin_token = getAdminToken();
  if (!admin_token || !feedId) return false;

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

export async function getWipePolicyFromBackend() {
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

export async function setWipePolicyOnBackend(wipeOnChange) {
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
  const nm = (p?.name || "").trim();
  if (nm) return nm;
  const saved = readPostNames(projectId, feedId);
  return (saved && saved[id]) || id;
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
    const nm = (p?.name || "").trim();
    if (id && nm && !map[id]) {
      map[id] = nm;
      changed = true;
    }
  }

  if (changed) writePostNames(projectId, feedId, map);
}