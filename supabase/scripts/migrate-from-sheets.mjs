#!/usr/bin/env node
// Phase 3: one-off data migration, Google Apps Script + Sheets -> Supabase.
// See ~/.claude/plans/gradual-migrating-codd.md (Phase 3) and
// supabase/README.md for full context.
//
// SAFETY MODEL (do not deviate without re-confirming with the user — same
// rule the plan itself states): this script must point at an ISOLATED COPY
// of the live spreadsheet, never at production. Concretely:
//   1. In Google Sheets, File -> Make a copy of the live study spreadsheet.
//      Google Sheets copies the bound Apps Script project along with it, so
//      the copy has its own independent Code.gs.
//   2. Open the COPY's Apps Script editor (Extensions -> Apps Script) and
//      deploy it as its own new web app (Deploy -> New deployment). This
//      gives a brand new /exec URL, completely separate from the live
//      GS_ENDPOINT the production app talks to.
//   3. Point GS_ENDPOINT below at THAT url, never the production one.
//
// EXTRACTION STRATEGY — deliberately not the raw-Sheets-API approach the
// plan originally sketched: rather than reverse-engineering the undocumented
// on-sheet chunking format for survey definitions (Code.gs isn't in this
// repo, so that format can't be read directly), this script calls the same
// `GS_ENDPOINT?path=...` GET query API the admin dashboard already calls
// (see the *_GET_URL constants in src/utils/utils-backend.js) — endpoints
// that already do 100% of the Sheets-specific reconstruction (chunked JSON,
// dynamic per-post columns, etc.) correctly, because they're the same code
// path the live app depends on every day. This is strictly more reliable
// than re-deriving that reconstruction from scratch, and works against the
// isolated copy exactly as safely as raw cell reads would.
//
// NOT MIGRATED: admin accounts. There's no read API for the Admins sheet
// (by design — it holds password salts/hashes), and a password hash from
// Code.gs's custom scheme can't be carried into Supabase Auth's hashing
// anyway. This script prints the admin email/role list it can discover
// (from whoever's able to log in) so accounts can be recreated by hand in
// Supabase Auth — not something a script should attempt.
//
// USAGE
//   cd supabase/scripts && npm install
//   GS_ENDPOINT=... ADMIN_PASSWORD=... \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node migrate-from-sheets.mjs                 # dry run (default)
//   ... node migrate-from-sheets.mjs --apply      # writes for real
//
// ADMIN_PASSWORD alone logs in via the legacy single owner-password scheme
// (no email). If this project instead uses per-user email+password admin
// accounts, also set ADMIN_EMAIL and that scheme is used instead. Either
// way you can skip both and set ADMIN_TOKEN directly if you already have a
// valid one from a browser session.
//
// Safe to run twice (upserts throughout), per the plan: once early against
// test data to validate the new backend end-to-end, once for real right
// before cutover to catch anything added in between.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { normalizeSurvey, frontendSurveyToBackend } from "./survey-sanitize.mjs";

// participants and survey_responses have no natural id from the roster
// reads (each row would otherwise get a fresh random uuid on every insert).
// Deriving the id deterministically from a natural key makes re-running
// this script against the same Supabase project idempotent — required per
// the plan ("Run twice... once early against test data... once for real
// right before cutover"), and also means a script crash partway through a
// long migration can just be re-run without duplicating whatever already
// landed.
function deterministicId(...parts) {
  const hex = createHash("sha256").update(parts.join("::")).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// feed_id ("feed_1", "feed_2", ...) is only unique within a single
// (project_id, app) pair in the real backend data — NOT globally, unlike
// project_id/survey_id/post_id. Composing the three into feeds.id is what
// migration 20260801000011 changed the schema to expect; every place a
// feed gets referenced (feeds.id itself, posts.feed_id, participants.feed_id,
// feed_surveys.feed_id) needs this same composed value, not the bare
// original string, or a later project's "feed_1" silently overwrites an
// earlier one's.
function composeFeedId(projectId, app, rawFeedId) {
  return `${projectId}::${app}::${rawFeedId}`;
}

const APPLY = process.argv.includes("--apply") || process.env.APPLY === "1";
const APPS = (process.env.APPS || "fb,ig,amz").split(",").map((s) => s.trim()).filter(Boolean);
const ONLY_PROJECT_IDS = (process.env.PROJECT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const GS_ENDPOINT = requireEnv("GS_ENDPOINT");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. See the header of this file for usage.`);
    process.exit(1);
  }
  return v;
}

if (/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(GS_ENDPOINT)) {
  // Not a real safety check (any /exec URL matches this), just a reminder —
  // the actual guarantee is the user pointing this at their own copy.
  console.warn(
    "Reminder: GS_ENDPOINT must be the COPIED spreadsheet's own deployment, not production. " +
      "See the safety notes at the top of this file if you're not sure.\n"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const summary = {
  projects: 0,
  feeds: 0,
  posts: 0,
  participants: 0,
  surveys: 0,
  feed_surveys: 0,
  survey_responses: 0,
  experiment_assignments: 0,
  warnings: [],
  adminAccountsSeen: new Set(),
};

// Tracks every feeds.id actually written this run, so feed_surveys links
// can be filtered against real feeds rather than risk one stale feed_id
// (a survey listing a since-deleted/renamed feed in feed_sequence_ids)
// failing its FK and silently dropping the whole batch of otherwise-valid
// links for that survey — upsert() below fails a batch atomically, not
// row-by-row.
const migratedFeedKeys = new Set();

/* =========================
   HTTP helpers (mirrors src/utils/utils-backend.js's buildQueryUrl/postJson)
   ========================= */

// Mirrors getJsonWithRetry in src/utils/utils-backend.js — Apps Script is
// known to be occasionally flaky under load (see CLAUDE.md), and this
// script fires several hundred sequential requests at it per run, so it
// needs the same retry-with-backoff the app's own frontend already relies
// on for these exact same endpoints. Without this, a handful of generic
// "fetch failed" (a connection-level error, not an HTTP error — no status
// code to even inspect) are expected on a real run, not a bug in the
// mapping logic.
async function getJson(path, params = {}, { retries = 2 } = {}) {
  const url = new URL(GS_ENDPOINT);
  url.searchParams.set("path", path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`GET path=${path} -> HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function postJson(payload) {
  const res = await fetch(GS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function login() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;

  const password = requireEnv("ADMIN_PASSWORD");
  const email = process.env.ADMIN_EMAIL;

  // Two login schemes exist (see adminLogin/adminLoginUser in
  // utils-backend.js): a legacy single owner password with no email
  // (action: "admin_login"), and per-user email+password accounts with
  // roles (action: "admin_login_user"). Whichever this project actually
  // uses is picked by whether ADMIN_EMAIL is set — leave it unset to use
  // the owner-password scheme.
  const payload = email ? { action: "admin_login_user", email, password } : { action: "admin_login", password };

  const { res, data } = await postJson(payload);
  if (!res.ok || !data?.ok || !data.admin_token) {
    throw new Error(`${payload.action} failed: ${data?.err || `HTTP ${res.status}`}`);
  }
  if (data.email) summary.adminAccountsSeen.add(`${data.email} (${data.role || "?"})`);
  return data.admin_token;
}

/* =========================
   Field mapping: raw backend JSON -> Phase 1 Postgres schema
   ========================= */

function normalizeFlags(raw = {}) {
  // Mirrors normalizeFlagsForStore in utils-backend.js: accepts either the
  // legacy (random_time) or current (randomize_times) key names.
  return {
    randomize_times: !!(raw.randomize_times ?? raw.random_time),
    randomize_avatars: !!(raw.randomize_avatars ?? raw.random_avatar),
    randomize_names: !!(raw.randomize_names ?? raw.random_name),
    randomize_images: !!(raw.randomize_images ?? raw.random_image),
    randomize_bios: !!(raw.randomize_bios ?? raw.random_bio),
  };
}

function mapPost(raw, feedId, index) {
  return {
    id: String(raw.id),
    feed_id: feedId,
    sort_order: index,

    post_name: raw.postName ?? raw.name ?? null,
    author: raw.author ?? null,
    post_time: raw.time ?? null,
    body_text: raw.text ?? null,
    links: Array.isArray(raw.links) ? raw.links : [],

    badge: !!raw.badge,
    author_type: raw.authorType ?? null,
    topic: raw.topic ?? null,

    show_bio: !!raw.showBio,
    bio_text: raw.bio_text ?? null,
    bio_url: raw.bio_url ?? null,
    bio_posts: Number.isFinite(raw.bio_posts) ? raw.bio_posts : null,
    bio_followers: Number.isFinite(raw.bio_followers) ? raw.bio_followers : null,
    bio_following: Number.isFinite(raw.bio_following) ? raw.bio_following : null,

    avatar_mode: raw.avatarMode ?? null,
    avatar_random_kind: raw.avatarRandomKind ?? null,
    avatar_url: raw.avatarUrl ?? null,

    image_mode: raw.imageMode ?? null,
    // image/video are jsonb (see migration 0009) — a real post's `image` is
    // an object ({url, alt, svg}) when it's a generated/randomized
    // placeholder rather than a plain URL string, so this is passed through
    // as-is rather than coerced to a string.
    image: raw.image ?? null,
    images: Array.isArray(raw.images) ? raw.images : [],
    image_topic: raw.imageTopic ?? null,
    video_mode: raw.videoMode ?? null,
    video: raw.video ?? null,
    video_poster_url: raw.videoPosterUrl ?? null,
    video_autoplay_muted: !!raw.videoAutoplayMuted,
    video_show_controls: raw.videoShowControls !== false,
    video_loop: !!raw.videoLoop,
    show_ghost_comments: !!raw.showGhostComments,

    intervention_type: raw.interventionType || "none",
    note_text: raw.noteText ?? null,
    note_meta_enabled: !!raw.noteMetaEnabled,
    note_reader_groups: Array.isArray(raw.noteReaderGroups) ? raw.noteReaderGroups : [],
    note_reader_group2_enabled: !!raw.noteReaderGroup2Enabled,

    show_reactions: raw.showReactions !== false,
    selected_reactions: Array.isArray(raw.selectedReactions) ? raw.selectedReactions : [],
    reactions: raw.reactions && typeof raw.reactions === "object" ? raw.reactions : {},
    metrics: raw.metrics && typeof raw.metrics === "object" ? raw.metrics : {},

    ad_type: raw.adType || "none",
    ad_domain: raw.adDomain ?? null,
    ad_headline: raw.adHeadline ?? null,
    ad_subheadline: raw.adSubheadline ?? null,
    ad_button_text: raw.adButtonText ?? null,
    ad_url: raw.adUrl ?? null,

    news_domain: raw.newsDomain ?? null,
    news_headline: raw.newsHeadline ?? null,
    news_description: raw.newsDescription ?? null,
    news_url: raw.newsUrl ?? null,
  };
}

// Fixed participant columns that get their own Postgres column; everything
// else on the raw row (the ${postId}_reacted / _commented / ... dynamic
// per-post columns, and any study-specific extras) is preserved verbatim in
// `extra` rather than dropped — safer than guessing the exact dynamic
// column-naming scheme, since nothing gets silently lost either way.
const PARTICIPANT_FIXED_KEYS = new Set([
  "session_id",
  "participant_id",
  "prolific_pid",
  "prolific_session_id",
  "session_id_ext",
  "prolific_study_id",
  "study_id",
  "ip_address",
  "entered_at_iso",
  "entered_at",
  "submitted_at_iso",
  "submitted_at",
  "ms_enter_to_submit",
  "ms_enter_to_last_interaction",
  "feed_id",
  "survey_id",
  "feed_checksum",
  "project_id",
]);

function mapParticipant(raw, { projectId, feedId }) {
  const extra = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!PARTICIPANT_FIXED_KEYS.has(k)) extra[k] = v;
  }

  const sessionId = String(raw.session_id ?? raw.session_id_ext ?? "");

  return {
    id: deterministicId("participant", feedId, sessionId),
    project_id: projectId,
    // feedId (the caller's already-composed value) is trusted over
    // raw.feed_id — participants are always fetched scoped to one already-
    // known feed, and raw.feed_id would be the bare uncomposed string.
    feed_id: feedId,
    survey_id: raw.survey_id || null,
    feed_checksum: raw.feed_checksum ?? null,

    session_id: sessionId,
    participant_id: raw.participant_id ?? null,
    prolific_pid: raw.prolific_pid ?? null,
    prolific_session_id: raw.prolific_session_id ?? raw.session_id_ext ?? null,
    prolific_study_id: raw.prolific_study_id ?? raw.study_id ?? null,
    ip_address: raw.ip_address ?? null,

    entered_at: raw.entered_at_iso || raw.entered_at || null,
    submitted_at: raw.submitted_at_iso || raw.submitted_at || null,
    ms_enter_to_submit: Number.isFinite(raw.ms_enter_to_submit) ? raw.ms_enter_to_submit : null,
    ms_enter_to_last_interaction: Number.isFinite(raw.ms_enter_to_last_interaction)
      ? raw.ms_enter_to_last_interaction
      : null,

    extra,
  };
}

function mapSurveyResponse(raw, { projectId, app }) {
  const surveyId = String(raw.survey_id);
  const sessionId = String(raw.session_id ?? "");

  return {
    id: deterministicId("survey_response", surveyId, sessionId),
    survey_id: surveyId,
    // No FK on this column (20260801000011 dropped it) — response data is
    // historical and can legitimately reference a since-renamed/deleted
    // feed. Composed the same way as everywhere else for consistency, but
    // stored purely as informational text.
    feed_id: raw.feed_id ? composeFeedId(raw.project_id || projectId, app, raw.feed_id) : null,
    project_id: raw.project_id || projectId || null,

    session_id: sessionId,
    participant_id: raw.participant_id ?? null,
    experiment_group_id: raw.experiment_group_id || null,

    prolific_pid: raw.prolific_pid ?? null,
    prolific_session_id: raw.prolific_session_id ?? null,
    prolific_study_id: raw.prolific_study_id ?? null,
    ip_address: raw.ip_address ?? null,

    entered_at: raw.entered_at_iso || raw.entered_at || null,
    submitted_at: raw.submitted_at_iso || raw.submitted_at || null,
    duration_ms: Number.isFinite(raw.duration_ms) ? raw.duration_ms : null,

    responses: raw.responses && typeof raw.responses === "object" ? raw.responses : {},
  };
}

/* =========================
   Load helpers (upsert into Supabase)
   ========================= */

// Returns whether the write actually succeeded (or would have, in dry
// run) — callers that need to know a row genuinely landed before trusting
// it as a valid FK target (e.g. feed_surveys filtering against
// migratedFeedKeys) check this rather than assuming success.
async function upsert(table, rows, conflictCols, label) {
  if (!rows.length) return true;
  if (!APPLY) {
    console.log(`  [dry run] would upsert ${rows.length} row(s) into ${table}`);
    return true;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictCols });
  if (error) {
    summary.warnings.push(`${label}: upsert into ${table} failed: ${error.message}`);
    console.error(`  upsert into ${table} failed:`, error.message);
    return false;
  }
  return true;
}

/* =========================
   Orchestration
   ========================= */

async function migrateSurvey({ project, app, adminToken, surveyStub }) {
  const surveyId = surveyStub.survey_id || surveyStub.id;
  if (!surveyId) return;

  let rawDefinition;
  try {
    rawDefinition = await getJson("survey_definition", {
      survey_id: surveyId,
      project_id: project.project_id,
      admin_token: adminToken,
    });
  } catch (e) {
    summary.warnings.push(`survey ${surveyId}: failed to fetch definition: ${e.message}`);
    return;
  }
  if (!rawDefinition || !rawDefinition.survey_id) {
    summary.warnings.push(`survey ${surveyId}: survey_definition returned nothing, skipped`);
    return;
  }

  // Same normalize-once-then-derive pattern as the save-survey Edge
  // Function, so migrated surveys land in exactly the shape a fresh save
  // through the new backend would produce.
  const normalized = normalizeSurvey(rawDefinition);
  const definition = frontendSurveyToBackend(normalized);

  await upsert(
    "surveys",
    [
      {
        id: normalized.survey_id,
        project_id: project.project_id,
        name: normalized.name,
        status: normalized.status,
        version: normalized.version,
        completion_mode: normalized.completion_mode,
        completion_redirect_url: normalized.completion_redirect_url,
        definition,
      },
    ],
    "id",
    `survey ${surveyId}`
  );
  summary.surveys += 1;

  const feedIds = Array.isArray(definition.feed_sequence_ids) ? definition.feed_sequence_ids : [];
  if (feedIds.length) {
    const composedFeedIds = feedIds.map((feed_id) => composeFeedId(project.project_id, app, feed_id));
    // Filter rather than let a stale feed_id (a survey's feed_sequence_ids
    // listing a since-deleted/renamed feed) fail the whole batch and
    // silently drop every otherwise-valid link for this survey too — see
    // migratedFeedKeys' declaration for why.
    const validFeedIds = composedFeedIds.filter((id) => migratedFeedKeys.has(id));
    const staleCount = composedFeedIds.length - validFeedIds.length;
    if (staleCount > 0) {
      summary.warnings.push(
        `survey ${surveyId}: ${staleCount} feed_sequence_ids entr${staleCount === 1 ? "y" : "ies"} reference feed(s) not found in the current feed list, skipped`
      );
    }

    if (validFeedIds.length) {
      await upsert(
        "feed_surveys",
        validFeedIds.map((feed_id) => ({ feed_id, survey_id: normalized.survey_id })),
        "feed_id,survey_id",
        `survey ${surveyId} feed links`
      );
      summary.feed_surveys += validFeedIds.length;
    }
  }

  let responses = [];
  try {
    responses = await getJson("survey_responses_by_survey", {
      survey_id: surveyId,
      project_id: project.project_id,
      admin_token: adminToken,
    });
  } catch (e) {
    summary.warnings.push(`survey ${surveyId}: failed to fetch responses: ${e.message}`);
  }
  if (!Array.isArray(responses)) responses = [];

  if (responses.length) {
    await upsert(
      "survey_responses",
      responses.map((r) => mapSurveyResponse(r, { projectId: project.project_id, app })),
      "id",
      `survey ${surveyId} responses`
    );
    summary.survey_responses += responses.length;

    // Derived, not read from a raw ExperimentAssignments sheet: every
    // completed response already carries the experiment_group_id it was
    // assigned (see CLAUDE.md, "Experiment group missing from survey CSV
    // export"). This only captures assignments that reached a submitted
    // response — a participant assigned a group who never finished won't
    // show up here, which is an accepted gap for a one-time cutover (see
    // supabase/README.md).
    const assignments = responses
      .filter((r) => r.experiment_group_id && r.session_id)
      .map((r) => ({
        survey_id: String(r.survey_id || surveyId),
        session_id: String(r.session_id),
        participant_id: r.participant_id || null,
        group_id: String(r.experiment_group_id),
      }));

    if (assignments.length) {
      await upsert("experiment_assignments", assignments, "survey_id,session_id", `survey ${surveyId} assignments`);
      summary.experiment_assignments += assignments.length;

      if (APPLY) {
        const { error } = await supabase
          .from("experiment_group_counters")
          .upsert({ survey_id: normalized.survey_id, counter: assignments.length }, { onConflict: "survey_id" });
        if (error) {
          summary.warnings.push(`survey ${surveyId}: failed to seed experiment_group_counters: ${error.message}`);
        }
      }
    }
  }
}

async function migrateFeed({ project, app, feed, adminToken }) {
  // `flags` already comes back on each row of `path=feeds` — as a JSON
  // *string* (`"{\"randomize_times\":true,...}"`), not a pre-parsed object,
  // and sometimes an empty string for a feed with no flags set at all.
  // Confirmed against a real deployment; the separate `get_feed_flags` call
  // this used to make was both redundant and had never actually been
  // checked against a live response.
  let flagsRaw = {};
  if (typeof feed.flags === "string" && feed.flags.trim()) {
    try {
      flagsRaw = JSON.parse(feed.flags);
    } catch (e) {
      summary.warnings.push(`feed ${feed.feed_id}: failed to parse flags JSON: ${e.message}`);
    }
  } else if (feed.flags && typeof feed.flags === "object") {
    flagsRaw = feed.flags;
  }

  const feedKey = composeFeedId(project.project_id, app, feed.feed_id);

  const feedWritten = await upsert(
    "feeds",
    [
      {
        id: feedKey,
        feed_id: String(feed.feed_id),
        project_id: project.project_id,
        app,
        name: feed.name || feed.feed_id,
        checksum: feed.checksum || null,
        flags: normalizeFlags(flagsRaw),
      },
    ],
    "id",
    `feed ${feed.feed_id}`
  );
  summary.feeds += 1;
  if (feedWritten) migratedFeedKeys.add(feedKey);

  let posts = [];
  try {
    // Query the backend with the bare feed_id — that's what Code.gs's API
    // expects. Only what gets WRITTEN to Postgres uses the composed key.
    posts = await getJson("posts", { project_id: project.project_id, feed_id: feed.feed_id });
  } catch (e) {
    summary.warnings.push(`feed ${feed.feed_id}: failed to fetch posts: ${e.message}`);
  }
  if (Array.isArray(posts) && posts.length) {
    await upsert(
      "posts",
      posts.map((p, i) => mapPost(p, feedKey, i)),
      "id",
      `feed ${feed.feed_id} posts`
    );
    summary.posts += posts.length;
  }

  let participants = [];
  try {
    participants = await getJson("participants", {
      project_id: project.project_id,
      feed_id: feed.feed_id,
      admin_token: adminToken,
    });
  } catch (e) {
    summary.warnings.push(`feed ${feed.feed_id}: failed to fetch participants: ${e.message}`);
  }
  if (Array.isArray(participants) && participants.length) {
    const rows = participants
      .map((p) => mapParticipant(p, { projectId: project.project_id, feedId: feedKey }))
      .filter((r) => r.session_id);
    if (rows.length) {
      await upsert("participants", rows, "id", `feed ${feed.feed_id} participants`);
      summary.participants += rows.length;
    }
  }
}

async function main() {
  console.log(APPLY ? "Running in APPLY mode — this will write to Supabase.\n" : "Running in DRY RUN mode (default). Pass --apply to write for real.\n");

  const adminToken = await login();

  const projects = await getJson("projects", {});
  const filteredProjects = ONLY_PROJECT_IDS.length
    ? projects.filter((p) => ONLY_PROJECT_IDS.includes(p.project_id))
    : projects;

  await upsert(
    "projects",
    filteredProjects.map((p) => ({
      id: p.project_id,
      name: p.name || p.project_id,
      notes: p.notes ?? null,
      // Omit (rather than null) when absent so Postgres' own default
      // applies instead of stamping "now" over a genuinely unknown value —
      // real data always has these, but this stays defensive either way.
      ...(p.created_at ? { created_at: p.created_at } : {}),
      ...(p.updated_at ? { updated_at: p.updated_at } : {}),
    })),
    "id",
    "projects"
  );
  summary.projects = filteredProjects.length;

  for (const project of filteredProjects) {
    console.log(`\nProject ${project.project_id} (${project.name})`);

    for (const app of APPS) {
      let feeds = [];
      try {
        feeds = await getJson("feeds", { project_id: project.project_id, app });
      } catch (e) {
        summary.warnings.push(`project ${project.project_id} app ${app}: failed to fetch feeds: ${e.message}`);
      }

      for (const feed of Array.isArray(feeds) ? feeds : []) {
        console.log(`  feed ${feed.feed_id} (${app})`);
        await migrateFeed({ project, app, feed, adminToken });
      }

      let surveys = [];
      try {
        surveys = await getJson("surveys", { project_id: project.project_id, app, admin_token: adminToken });
      } catch (e) {
        summary.warnings.push(`project ${project.project_id} app ${app}: failed to fetch surveys: ${e.message}`);
      }

      for (const surveyStub of Array.isArray(surveys) ? surveys : []) {
        console.log(`  survey ${surveyStub.survey_id || surveyStub.id} (${app})`);
        await migrateSurvey({ project, app, adminToken, surveyStub });
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(APPLY ? "APPLY run complete." : "DRY RUN complete (nothing was written).");
  console.log("=".repeat(60));
  console.log(`projects:               ${summary.projects}`);
  console.log(`feeds:                  ${summary.feeds}`);
  console.log(`posts:                  ${summary.posts}`);
  console.log(`participants:           ${summary.participants}`);
  console.log(`surveys:                ${summary.surveys}`);
  console.log(`feed_surveys links:     ${summary.feed_surveys}`);
  console.log(`survey_responses:       ${summary.survey_responses}`);
  console.log(`experiment_assignments: ${summary.experiment_assignments}`);

  console.log("\nAdmin accounts — NOT migrated by this script (see header comment).");
  console.log("Recreate these by hand in Supabase Auth + set their profiles.role:");
  if (summary.adminAccountsSeen.size) {
    for (const a of summary.adminAccountsSeen) console.log(`  - ${a}`);
  } else {
    console.log("  (none observed — only the account used to run this script is known to it)");
  }

  if (summary.warnings.length) {
    console.log(`\n${summary.warnings.length} warning(s):`);
    for (const w of summary.warnings) console.log(`  - ${w}`);
  }
}

main().catch((e) => {
  console.error("\nMigration failed:", e);
  process.exit(1);
});
