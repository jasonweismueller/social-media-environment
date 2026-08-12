// utils-survey-simulate.js
//
// Generates fake-but-plausible survey_responses-shaped rows for a survey
// definition, purely client-side — no backend call, nothing written anywhere.
// Built so an admin can prototype/validate an R (or any) analysis script
// against realistic data *before* real participants exist, instead of
// hand-collecting 30+ responses per condition first.
//
// Realism choices, deliberate:
//  - Each participant gets one latent "trait" (theta), and each matrix/
//    bipolar question gets its own trait correlated with theta but with its
//    own noise — so composite scales come out with a non-trivial, plausible
//    Cronbach's alpha instead of pure noise (alpha near 0) or a perfect 1.
//  - A configurable group effect nudges each composite/numeric item by a
//    per-question, per-group amount (direction randomized but stable per
//    question id) — so `computeGroupComparison`'s Welch/ANOVA output isn't
//    always a flat null result, useful for testing pairwise-comparison code.
//  - A small share of "low-effort" participants straight-line every row of
//    whatever matrix/bipolar question they're on — exercises the existing
//    straight-lining data-quality flag (components-admin-participants-survey.jsx)
//    against something other than real data.
// None of this pretends to model a real effect — it's synthetic scaffolding
// for building/testing an analysis pipeline, not a substitute for real data.

import {
  SURVEY_QUESTION_TYPES,
  normalizeSurvey,
  normalizeExperimentGroups,
  materializePagesFromBlocks,
  isQuestionVisible,
} from "./utils-survey";
import {
  hasBio,
  hasMention,
  hasCta,
  hasNote,
  hasNewsLink,
  looksExpandable,
  isRelevantPostMetricForExport,
} from "./utils-backend";
import { REACTION_META } from "./utils-core";

/* ----------------------------- seeded RNG ----------------------------- */

function hashStr(str = "") {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNormal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Stable pseudo-random value in [0, 1) derived from a string id — used so
// "this choice is popular" or "this question's group effect leans this way"
// stays consistent across every simulated participant, not re-rolled per row.
function stableUnit(id) {
  return (hashStr(`${id}::unit`) % 1000) / 1000;
}

// Per-question group-effect direction+magnitude, deliberately kept away from
// zero (magnitude always in [0.5, 1]) — a bare stableSigned() in [-1, 1]
// let a plain hash-of-the-id land near 0 for roughly a third of questions,
// which made the "group differences" control look broken (a user picks
// "Large" and half their composites still show a near-null test) rather
// than "some measures move more than others," which is what it's meant to
// simulate. Sign still varies per question, so it's still a mix of
// increases/decreases across measures, just never a coin-flip-sized nudge.
function stableEffectMultiplier(id) {
  const dir = stableUnit(`${id}::dir`) < 0.5 ? -1 : 1;
  const mag = 0.5 + stableUnit(`${id}::mag`) * 0.5;
  return dir * mag;
}

// Clamped at +-2 rather than +-3 deliberately: with the noise levels used
// below, item z-scores mostly fall within +-2 anyway, so a +-3 range mostly
// just widens the *middle* bucket (rarely-reached tails eat range that would
// otherwise resolve everyday variation) — that under-resolution is what
// made two genuinely-independent items coincidentally land in the same
// bucket far more often than real Likert data would.
function zToIndex(z, n) {
  if (n <= 1) return 0;
  const c = clampNum(z, -2, 2);
  return clampNum(Math.round(((c + 2) / 4) * (n - 1)), 0, n - 1);
}

function zToRange(z, min, max) {
  const c = clampNum(z, -2, 2);
  const v = min + ((c + 2) / 4) * (max - min);
  return clampNum(Math.round(v), min, max);
}

/* ----------------------------- answer generation ----------------------------- */

function choicesAreNumeric(choices) {
  const vals = (choices || [])
    .map((c) => c?.value)
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "");
  return vals.length >= 1 && vals.every((v) => Number.isFinite(Number(v)));
}

function pickChoiceValue(rng, choices, z) {
  const list = Array.isArray(choices) ? choices.filter((c) => c && c.value !== undefined) : [];
  if (!list.length) return "";
  if (choicesAreNumeric(list)) {
    const sorted = [...list].sort((a, b) => Number(a.value) - Number(b.value));
    return sorted[zToIndex(z, sorted.length)].value;
  }
  // Non-ordinal categories (e.g. gender, country) — stable per-choice
  // popularity instead of a trait-driven position, since there's no
  // inherent order to map a continuous trait onto.
  const weights = list.map((c) => 0.35 + stableUnit(`${c.value}::pop`) * 1.3);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i].value;
  }
  return list[list.length - 1].value;
}

const TEXT_FILLERS = [
  "This felt about average to me.",
  "I wasn't fully sure how to answer this.",
  "Nothing in particular stood out.",
  "It seemed fine overall.",
  "I found this somewhat believable.",
  "Not much else to add here.",
  "I'd say this was fairly typical.",
  "I'm neutral on this one.",
];

function looksLikeAge(idAndText) {
  return /\bage\b/i.test(idAndText);
}
function looksLikeGender(idAndText) {
  return /\b(gender|sex)\b/i.test(idAndText);
}

function generateTextAnswer(q, rng) {
  const plain = `${q.id} ${String(q.text || "").replace(/<[^>]*>/g, " ")}`;
  if (looksLikeAge(plain)) {
    return String(Math.round(clampNum(34 + randNormal(rng) * 11, 18, 75)));
  }
  if (looksLikeGender(plain)) {
    const opts = ["Male", "Female", "Non-binary", "Prefer not to say"];
    const weights = [0.47, 0.47, 0.04, 0.02];
    let r = rng();
    let acc = 0;
    for (let i = 0; i < opts.length; i++) {
      acc += weights[i];
      if (r <= acc) return opts[i];
    }
    return opts[0];
  }
  return TEXT_FILLERS[Math.floor(rng() * TEXT_FILLERS.length)];
}

function generateAnswer(q, ctx) {
  const { rng, theta, groupShift, isLowEffort, compositeThetaCache } = ctx;

  switch (q.type) {
    case SURVEY_QUESTION_TYPES.SLIDER: {
      const z = theta + groupShift + randNormal(rng) * 0.5;
      return zToRange(z, q.min, q.max);
    }

    case SURVEY_QUESTION_TYPES.SINGLE:
    case SURVEY_QUESTION_TYPES.DROPDOWN: {
      // Attention checks: everyone who's actually paying attention answers
      // correctly; low-effort participants answer wrong (any other choice)
      // — gives the "Failed attention check" flag in the analysis hub
      // something real to catch when testing against simulated data.
      if (q.is_attention_check) {
        const choices = Array.isArray(q.choices) ? q.choices : [];
        if (!choices.length) return "";
        if (!isLowEffort) return q.attention_check_value || choices[0].value;
        const wrongChoices = choices.filter((c) => c.value !== q.attention_check_value);
        const pool = wrongChoices.length ? wrongChoices : choices;
        return pool[Math.floor(rng() * pool.length)].value;
      }
      const z = theta + groupShift + randNormal(rng) * 0.6;
      return pickChoiceValue(rng, q.choices, z);
    }

    case SURVEY_QUESTION_TYPES.MULTI: {
      const choices = Array.isArray(q.choices) ? q.choices : [];
      const picked = choices
        .filter((c) => {
          const p = clampNum(0.22 + stableUnit(`${c.value}::multi`) * 0.35 + theta * 0.05, 0.03, 0.9);
          return rng() < p;
        })
        .map((c) => c.value);
      if (!picked.length && q.required && choices.length) picked.push(choices[0].value);
      return picked;
    }

    case SURVEY_QUESTION_TYPES.MATRIX_SINGLE:
    case SURVEY_QUESTION_TYPES.BIPOLAR: {
      const rows = Array.isArray(q.rows) ? q.rows : [];
      const out = {};

      // An attention-check row (e.g. "select Strongly Disagree here") isn't
      // a real measurement item, so it's answered independently of theta —
      // same correct-unless-low-effort logic as a standalone attention-check
      // question, just addressed by row instead of by question.
      const answerAttentionCheckRow = (row) => {
        const columns = Array.isArray(q.columns) ? q.columns : [];
        if (!columns.length) return "";
        if (!isLowEffort) return row.attention_check_value || columns[0].value;
        const wrongColumns = columns.filter((c) => c.value !== row.attention_check_value);
        const pool = wrongColumns.length ? wrongColumns : columns;
        return pool[Math.floor(rng() * pool.length)].value;
      };

      if (isLowEffort) {
        const fixed = pickChoiceValue(rng, q.columns, randNormal(rng) * 0.2);
        rows.forEach((row) => {
          out[row.value] = row.is_attention_check ? answerAttentionCheckRow(row) : fixed;
        });
        return out;
      }
      const compositeTheta = getCompositeTheta(q.id, theta, groupShift, rng, compositeThetaCache);

      // Numeric (Likert-style) columns: jitter a *base category index* per
      // row instead of re-quantizing a continuous per-item z-score. The
      // continuous approach (item z = rowW*compositeTheta + residual noise,
      // then rounded to one of ~5 buckets) made independent items land in
      // the exact same bucket far more than real Likert data would — with
      // only a few categories, most of a normal distribution's mass already
      // concentrates in the middle 2-3 buckets, so rounding two correlated-
      // but-independently-noisy items very often ties them regardless of how
      // little they're actually correlated. Jittering the category index
      // directly makes "how often do items actually differ" a single,
      // legible parameter instead of an emergent (and here, unwanted) side
      // effect of the rounding step.
      if (choicesAreNumeric(q.columns)) {
        const sorted = [...q.columns].sort((a, b) => Number(a.value) - Number(b.value));
        const n = sorted.length;
        const baseIdx = zToIndex(compositeTheta, n);
        rows.forEach((row) => {
          if (row.is_attention_check) {
            out[row.value] = answerAttentionCheckRow(row);
            return;
          }
          const jitterScale = 0.75 + stableUnit(`${q.id}::${row.value}::jit`) * 0.35;
          const jitter = Math.round(randNormal(rng) * jitterScale);
          out[row.value] = sorted[clampNum(baseIdx + jitter, 0, n - 1)].value;
        });
        return out;
      }

      rows.forEach((row) => {
        if (row.is_attention_check) {
          out[row.value] = answerAttentionCheckRow(row);
          return;
        }
        const rowW = 0.55 + stableUnit(`${q.id}::${row.value}`) * 0.2;
        const z = rowW * compositeTheta + Math.sqrt(Math.max(0, 1 - rowW * rowW)) * randNormal(rng);
        out[row.value] = pickChoiceValue(rng, q.columns, z);
      });
      return out;
    }

    case SURVEY_QUESTION_TYPES.MATRIX_MULTI: {
      const rows = Array.isArray(q.rows) ? q.rows : [];
      const columns = Array.isArray(q.columns) ? q.columns : [];
      const compositeTheta = getCompositeTheta(q.id, theta, groupShift, rng, compositeThetaCache);
      const out = {};
      rows.forEach((row) => {
        out[row.value] = columns
          .filter(() => rng() < clampNum(0.3 + compositeTheta * 0.05, 0.05, 0.85))
          .map((c) => c.value);
      });
      return out;
    }

    case SURVEY_QUESTION_TYPES.TEXT:
    case SURVEY_QUESTION_TYPES.TEXTAREA:
      return generateTextAnswer(q, rng);

    // Dwell time applies to every post_reminder — static, interactive, or
    // recall alike — the same as the real component measures unconditionally
    // (trackElementDwellMs, utils-core.js), so it's generated regardless of
    // q.recall_enabled/q.reminder_interactive. Low-effort participants dwell
    // far less, matching how they already answer everything else above with
    // minimal engagement.
    case SURVEY_QUESTION_TYPES.POST_REMINDER: {
      const dwellSeconds = isLowEffort
        ? clampNum(2 + Math.abs(randNormal(rng)) * 2, 1, 10)
        : clampNum(9 + (theta + groupShift) * 1.5 + randNormal(rng) * 4, 2, 45);
      const out = {
        dwell_ms: Math.round(dwellSeconds * 1000),
        dwell_s: Math.round(dwellSeconds),
      };

      if (!q.recall_enabled) return out;

      // Recall accuracy: attentive participants correctly pick the post they
      // actually saw out of the 3 candidates; low-effort ones are close to
      // chance (1 in 3) — same "correct-unless-low-effort" shape the
      // standalone attention-check case above already uses.
      const correctProb = isLowEffort
        ? 1 / 3
        : clampNum(0.72 + (theta + groupShift) * 0.08, 0.35, 0.95);
      const wrongOptions = ["distractor_1", "distractor_2"];
      const selected =
        rng() < correctProb ? "real" : wrongOptions[Math.floor(rng() * wrongOptions.length)];
      out.selected_option = selected;
      out.correct = selected === "real";
      return out;
    }

    default:
      return "";
  }
}

function getCompositeTheta(questionId, theta, groupShift, rng, cache) {
  if (cache.has(questionId)) return cache.get(questionId);
  // Item-intercorrelation weight, stable per question — kept in a band that
  // tends to produce alpha roughly in the .6-.85 range for a handful of
  // items, rather than near-zero (pure noise) or a suspicious-looking 1.0.
  const w = 0.4 + stableUnit(`${questionId}::w`) * 0.25;
  const val = w * theta + Math.sqrt(1 - w * w) * randNormal(rng) + groupShift;
  cache.set(questionId, val);
  return val;
}

/* ----------------------------- feed engagement ----------------------------- */
// Fabricates one participant's engagement with one feed's posts, shaped
// exactly like buildParticipantRow's per-post columns (utils-core.js) — so
// it merges into the same "feed + survey" CSV shape real data produces,
// keyed the same way (`${postId}${suffix}`). Reuses the real per-post
// relevance gate (isRelevantPostMetricForExport, utils-backend.js — the
// same logic the actual CSV export uses to hide e.g. Amazon-only fields on
// a Facebook feed, or note_* fields on a post that was never a community-
// note intervention) so a simulated CSV can't drift out of sync with what a
// real export would consider relevant for the same post.

// Skewed toward "like" — real reaction distributions lean heavily on the
// default reaction rather than spreading evenly across all seven.
const REACTION_WEIGHTS = { like: 55, love: 20, haha: 10, wow: 6, sad: 5, care: 3, angry: 1 };

const FAKE_COMMENTS = [
  "Great post!",
  "Thanks for sharing this.",
  "I didn't know that.",
  "Interesting perspective.",
  "This is helpful.",
  "Wow, really?",
  "Not sure I agree with this one.",
  "Following for more like this.",
];

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/**
 * @param {Array} posts - a feed's real posts (as loaded by loadPostsFromBackend).
 * @param {object} ctx - { rng, theta, groupShift, isLowEffort, app }. `theta`/
 *   `groupShift`/`isLowEffort` mirror the same participant's survey-answer
 *   generation (see simulateSurveyResponseRows below) so a "low-effort"
 *   participant is also a low-engagement one in the feed, not just on the
 *   survey. `app` ("fb"/"ig"/"amz") gates the platform-specific fields
 *   (Amazon's review_* shape vs. the reaction/comment/share shape everywhere
 *   else, Instagram-only saved/reposted).
 * @returns {object} `${postId}${suffix}` -> value, for every post/suffix
 *   isRelevantPostMetricForExport says applies.
 */
export function simulateFeedEngagement(posts, { rng, theta = 0, groupShift = 0, isLowEffort = false, app = "fb" } = {}) {
  const engagementLevel = isLowEffort
    ? 0.35
    : clampNum(0.65 + (theta + groupShift) * 0.12, 0.15, 1);
  const isAmz = app === "amz";
  const isIg = app === "ig";
  const row = {};

  (Array.isArray(posts) ? posts : []).forEach((post) => {
    const id = post?.id;
    if (!id) return;

    const attach = (suffix, value) => {
      if (isRelevantPostMetricForExport(post, suffix)) row[`${id}${suffix}`] = value;
    };

    const expandable = looksExpandable(post);
    const dwellSeconds = isLowEffort
      ? clampNum(1 + rng() * 3, 0, 8)
      : clampNum(3 + engagementLevel * 6 + randNormal(rng) * 3, 1, 30);
    attach("_dwell_s", Math.round(dwellSeconds));
    attach("_expandable", expandable ? 1 : 0);

    if (isAmz) {
      const readMore = expandable && rng() < engagementLevel * 0.4;
      const reported = rng() < 0.02;
      attach("_expanded", readMore ? 1 : 0);
      attach("_review_helpful", rng() < engagementLevel * 0.35 ? 1 : 0);
      attach("_review_helpful_removed", 0);
      attach("_review_reported", reported ? 1 : 0);
      attach("_review_read_more", readMore ? 1 : 0);
      attach("_review_read_more_ms", readMore ? String(Math.round(1500 + rng() * 4000)) : "");
      attach("_review_rating", "");
      attach("_reported_misinfo", reported ? 1 : 0);
      return;
    }

    const reacted = rng() < engagementLevel * 0.7;
    attach("_reacted", reacted ? 1 : 0);
    attach("_reaction_type", reacted ? pickWeighted(rng, REACTION_WEIGHTS) : "");

    const expanded = expandable && rng() < engagementLevel * 0.35;
    attach("_expanded", expanded ? 1 : 0);

    const commented = rng() < engagementLevel * 0.15;
    attach("_commented", commented ? 1 : 0);
    attach("_comment_texts", commented ? FAKE_COMMENTS[Math.floor(rng() * FAKE_COMMENTS.length)] : "");

    attach("_reported_misinfo", rng() < 0.02 ? 1 : 0);

    const shared = rng() < engagementLevel * 0.08;
    attach("_shared", shared ? 1 : 0);
    attach("_share_target", shared && rng() < 0.4 ? "Friend" : "");
    attach("_share_text", "");

    if (isIg) {
      attach("_saved", rng() < engagementLevel * 0.1 ? 1 : 0);
      attach("_reposted", rng() < engagementLevel * 0.04 ? 1 : 0);
    }

    if (hasCta(post)) attach("_cta_clicked", rng() < engagementLevel * 0.2 ? 1 : 0);
    if (hasNewsLink(post)) attach("_news_clicked", rng() < engagementLevel * 0.25 ? 1 : 0);

    if (hasBio(post)) {
      const bioOpened = rng() < engagementLevel * 0.12;
      attach("_bio_opened", bioOpened ? 1 : 0);
      attach("_bio_url_clicked", bioOpened && rng() < 0.3 ? 1 : 0);
    }

    if (hasMention(post)) attach("_mention_clicked", rng() < engagementLevel * 0.15 ? 1 : 0);

    if (hasNote(post)) {
      const noteOpened = rng() < engagementLevel * 0.3;
      const viewDetails = noteOpened && rng() < 0.5;
      const helpfulRated = noteOpened && rng() < 0.4;
      attach("_note_opened", noteOpened ? 1 : 0);
      attach("_note_view_details", viewDetails ? 1 : 0);
      attach("_note_link_clicked", viewDetails && rng() < 0.3 ? 1 : 0);
      attach("_note_helpful_rated", helpfulRated ? 1 : 0);
      attach("_note_helpful_value", helpfulRated ? (rng() < 0.6 ? "yes" : "no") : "");
    }
  });

  return row;
}

/* ----------------------------- main entry point ----------------------------- */

/**
 * @param {object} survey - a survey definition (as returned by loadSurveyFromBackend).
 * @param {number} participantsPerGroup - used when the survey has experiment groups.
 * @param {number} totalParticipants - used when the survey has no experiment groups.
 * @param {number} groupEffectSize - 0 = no systematic group differences; ~0.5-1
 *   gives a small-to-medium, question-specific, direction-randomized effect;
 *   higher values give a more obvious effect. Expressed in latent z-score units.
 * @param {boolean} includeLowEffort - sprinkle in a few straight-lining
 *   respondents (~5% of the total, on top of whatever ties happen by chance
 *   on any short, highly-correlated scale) to exercise the data-quality flag
 *   detection in components-admin-participants-survey.jsx.
 * @param {string} seed - optional extra seed component so re-running with the
 *   same inputs reproduces the same data (or differs deliberately if changed).
 * @param {object} postsByFeed - optional { feedId: posts[] } map (as loaded
 *   by loadPostsFromBackend, one entry per feed the survey links). When
 *   provided, each row also gets `feed_engagement` — that participant's
 *   fabricated engagement with the posts on their assigned feed (see
 *   simulateFeedEngagement above), so a feed_then_survey/
 *   multi_feed_then_survey study's simulated data can drive the merged
 *   "feed + survey" CSV, not just the survey-only one. Omitted (default `{}`)
 *   for a survey_only study, which has no feeds to engage with.
 * @param {string} app - "fb"/"ig"/"amz", forwarded to simulateFeedEngagement
 *   to pick the right platform-specific engagement shape.
 * @returns {Array<{session_id, participant_id, submitted_at_iso, experiment_group_id, responses, feed_engagement}>}
 */
export function simulateSurveyResponseRows({
  survey,
  participantsPerGroup = 30,
  totalParticipants = 100,
  groupEffectSize = 0.45,
  includeLowEffort = true,
  seed = "",
  postsByFeed = {},
  app = "fb",
} = {}) {
  const normalized = normalizeSurvey(survey || {});
  const groups = normalizeExperimentGroups(normalized.experiment_groups);
  const hasGroups = groups.length > 0;

  const feedIds = (normalized.feed_sequence_ids?.length
    ? normalized.feed_sequence_ids
    : normalized.linked_feed_ids) || [];

  const seedBase = `${seed || "sim"}::${normalized.survey_id || normalized.name || "survey"}`;

  const plan = hasGroups
    ? groups.flatMap((g, groupIndex) =>
        Array.from({ length: Math.max(0, Math.round(Number(participantsPerGroup) || 0)) }, () => ({
          groupId: g.id,
          groupIndex,
        }))
      )
    : Array.from({ length: Math.max(0, Math.round(Number(totalParticipants) || 0)) }, () => ({
        groupId: "",
        groupIndex: 0,
      }));

  const baseNow = Date.now();
  const rows = [];

  plan.forEach((p, i) => {
    const participantSeed = `${seedBase}::${p.groupId || "nogroup"}::${i}`;
    const rng = mulberry32(hashStr(participantSeed));
    const theta = randNormal(rng);
    const isLowEffort = !!includeLowEffort && rng() < 0.05;
    const feedId = feedIds.length ? feedIds[i % feedIds.length] : "";

    const groupNorm = groups.length > 1 ? p.groupIndex / (groups.length - 1) : 0;
    const compositeThetaCache = new Map();

    const pages = materializePagesFromBlocks(normalized, normalized.page_blocks, {
      participantSeed,
      randomize: true,
      assignedGroupId: p.groupId,
    });

    const responses = {};

    pages.forEach((page) => {
      (page.questions || []).forEach((q) => {
        if (!q?.id) return;
        if (q.type === SURVEY_QUESTION_TYPES.INFO) {
          return;
        }
        if (!isQuestionVisible(q, responses, { feedId, assignedGroupId: p.groupId })) return;

        // Per-question group shift: direction/magnitude stable per question
        // id (so some measures trend up with condition, others down or not
        // at all — mixed effects across many DVs, like a real study), scaled
        // by how far this participant's group sits along the group order.
        const groupShift = groupEffectSize * stableEffectMultiplier(q.id) * (groupNorm - 0.5) * 2;

        responses[q.id] = generateAnswer(q, {
          rng,
          theta,
          groupShift,
          isLowEffort,
          compositeThetaCache,
        });
      });
    });

    const enteredTs = baseNow - (3600 * 1000 + Math.floor(rng() * 21 * 24 * 3600 * 1000));
    const durationMs = 90_000 + Math.floor(rng() * 9 * 60_000);

    // Same shape as a per-question groupShift (stable direction/magnitude,
    // scaled by group position) — a fixed pseudo-question-id so groupEffectSize
    // can also produce a plausible, condition-specific difference in overall
    // feed engagement, not just in survey answers.
    const feedGroupShift =
      groupEffectSize * stableEffectMultiplier("feed_engagement") * (groupNorm - 0.5) * 2;
    const feedPosts = feedId ? postsByFeed?.[feedId] : null;
    const feedEngagement =
      feedPosts && feedPosts.length
        ? simulateFeedEngagement(feedPosts, {
            rng,
            theta,
            groupShift: feedGroupShift,
            isLowEffort,
            app,
          })
        : {};

    rows.push({
      session_id: `sim_session_${String(i + 1).padStart(5, "0")}`,
      participant_id: `SIM_${String(i + 1).padStart(4, "0")}`,
      prolific_pid: "",
      entered_at_iso: new Date(enteredTs).toISOString(),
      submitted_at_iso: new Date(enteredTs + durationMs).toISOString(),
      duration_ms: durationMs,
      feed_id: feedId || "",
      survey_id: normalized.survey_id || "",
      experiment_group_id: p.groupId || "",
      responses,
      feed_engagement: feedEngagement,
    });
  });

  return rows;
}
