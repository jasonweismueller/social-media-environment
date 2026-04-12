// components-admin-parts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  loadParticipantsRoster,
  loadMergedParticipantSurveyRoster,
  summarizeRoster,
  nfCompact,
  extractPerPostFromRosterRow,
  APP,
  getProjectId as getProjectIdUtil,
  setProjectId as setProjectIdUtil,
  readPostNames,
} from "../utils";

/* ----------------------------- helpers ----------------------------- */
const ms = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const s = Math.round(Number(n) / 1000);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
};

const IG_ONLY = ["_saved"];

const FB_ONLY = [
  "_note_opened",
  "_note_view_details",
  "_note_link_clicked",
  "_note_helpful_rated",
  "_note_helpful_value",
];

const sShort = (n) => (Number.isFinite(Number(n)) ? `${Math.round(Number(n))}s` : "—");

function selectAllOnFocus(e) {
  try {
    e.target.select();
  } catch {}
}

const isIGApp = () => String(APP || "").toLowerCase() === "ig";

function labelForKey(key, nameMap) {
  if (String(key).startsWith("survey_")) return key;

  const m = /^(.+?)_([a-z_]+)$/.exec(key);
  if (!m) return key;
  const [, base, suf] = m;
  const pretty = nameMap?.[base]?.trim?.() || base;
  return `${pretty}_${suf}`;
}

function makeCsvWithPrettyHeaders(rows, keys, labels) {
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = (labels?.length === keys.length ? labels : keys).map(esc).join(",");
  const body = rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n");
  return head + "\n" + body;
}

function normalizeRowsForCsv(rows = []) {
  const BOOL_SUFFIX =
    /(_reacted|_expandable|_expanded|_commented|_saved|_shared|_reported_misinfo|_cta_clicked|_bio_opened|_bio_url_clicked|_mention_clicked|_note_opened|_note_view_details|_note_link_clicked|_note_helpful_rated)$/;

  return rows.map((raw) => {
    const out = { ...raw };

    for (const k of Object.keys(out)) {
      if (k.endsWith("_dwell_ms")) {
        const base = k.replace("_dwell_ms", "");
        const msVal = Number(out[k] || 0);
        const sKey = `${base}_dwell_s`;
        if (out[sKey] == null) out[sKey] = Math.round(msVal / 1000);
        delete out[k];
        continue;
      }

      if (BOOL_SUFFIX.test(k)) {
        const v = Number(out[k]);
        out[k] = Number.isFinite(v) && v > 0 ? 1 : 0;
      }
    }

    return out;
  });
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(str = "") {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function clampPct(n) {
  return Math.max(0, Math.min(100, Number(n) || 0));
}

function chance(rng, p) {
  return rng() < clamp01(p);
}

function randomInt(rng, min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function looksExpandable(post) {
  if (!post) return false;
  if (post.expandable === true) return true;
  const txt = String(post.text || "");
  return txt.length > 140;
}

function hasNote(post) {
  if (!post) return false;
  return !!(
    post.note ||
    post.noteText ||
    post.note_text ||
    post.communityNote ||
    post.community_note ||
    post.interventionType === "note" ||
    post.intervention_type === "note" ||
    post.showNote === true
  );
}

function hasBio(post) {
  if (!post) return false;
  return !!(
    post.showBio ||
    post.bio_text ||
    post.bio_url ||
    post.bio_followers ||
    post.bio_posts ||
    post.bio_following
  );
}

function hasMention(post) {
  const txt = String(post?.text || "");
  return /(^|\s)@\w+/.test(txt);
}

function hasCta(post) {
  if (!post) return false;
  return !!(
    post.adType === "ad" ||
    post.adButtonText ||
    post.cta ||
    post.ctaLabel ||
    post.adUrl
  );
}

function hasShareableSurface(post) {
  return !!post;
}

function buildSimulatedParticipantId(index) {
  return `SIM_${String(index + 1).padStart(4, "0")}`;
}

function weightedChoice(rng, weightsObj = {}, fallback = "") {
  const entries = Object.entries(weightsObj)
    .map(([k, v]) => [k, Math.max(0, Number(v) || 0)])
    .filter(([, v]) => v > 0);

  if (!entries.length) return fallback;

  const total = entries.reduce((a, [, v]) => a + v, 0);
  let roll = rng() * total;

  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }

  return entries[entries.length - 1][0] || fallback;
}

function capabilitySummary(posts = [], isIG = false) {
  return {
    hasExpandable: posts.some((p) => looksExpandable(p)),
    hasNote: posts.some((p) => hasNote(p)),
    hasBio: posts.some((p) => hasBio(p)),
    hasMention: posts.some((p) => hasMention(p)),
    hasCta: posts.some((p) => hasCta(p)),
    hasShare: posts.some((p) => hasShareableSurface(p)),
    hasSaved: !!isIG,
  };
}

function deterministicShuffle(arr, seedStr) {
  const out = [...arr];
  const rng = mulberry32(hashStr(seedStr));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function makeIndexList(total) {
  return Array.from({ length: Math.max(0, total) }, (_, i) => i);
}

function selectExactIndices(indices = [], count = 0, seedStr = "") {
  const clean = Array.isArray(indices) ? [...indices] : [];
  const n = Math.max(0, Math.min(clean.length, Math.round(Number(count) || 0)));
  if (n <= 0) return [];
  return deterministicShuffle(clean, seedStr).slice(0, n);
}

function roundToTarget(valuesByKey = {}, target = 100) {
  const entries = Object.entries(valuesByKey).map(([k, v]) => [k, Math.max(0, Number(v) || 0)]);
  if (!entries.length) return {};

  const floors = {};
  const fracs = [];
  let sumFloor = 0;

  for (const [k, v] of entries) {
    const fl = Math.floor(v);
    floors[k] = fl;
    sumFloor += fl;
    fracs.push({ key: k, frac: v - fl });
  }

  let remainder = Math.max(0, Math.round(target - sumFloor));
  fracs.sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < fracs.length && remainder > 0; i++, remainder--) {
    floors[fracs[i].key] += 1;
  }

  return floors;
}

function normalizeMixToPercentages(mix = {}, allowedKeys = []) {
  const keys = allowedKeys.length ? allowedKeys : Object.keys(mix || {});
  const clean = {};
  let total = 0;

  keys.forEach((k) => {
    const v = Math.max(0, Number(mix?.[k]) || 0);
    clean[k] = v;
    total += v;
  });

  if (total <= 0) {
    const even = 100 / Math.max(1, keys.length);
    return roundToTarget(
      Object.fromEntries(keys.map((k) => [k, even])),
      100
    );
  }

  const asPct = {};
  keys.forEach((k) => {
    asPct[k] = (clean[k] / total) * 100;
  });

  return roundToTarget(asPct, 100);
}

function rebalancePercentageMix(prevMix = {}, changedKey, nextValue) {
  const keys = Object.keys(prevMix || {});
  if (!keys.length) return prevMix || {};

  const nextClamped = clampPct(nextValue);
  const otherKeys = keys.filter((k) => k !== changedKey);
  const remaining = Math.max(0, 100 - nextClamped);

  const baseOthers = {};
  let totalOthers = 0;
  otherKeys.forEach((k) => {
    const v = Math.max(0, Number(prevMix[k]) || 0);
    baseOthers[k] = v;
    totalOthers += v;
  });

  let redistributed = {};
  if (!otherKeys.length) {
    redistributed = {};
  } else if (totalOthers <= 0) {
    const even = remaining / otherKeys.length;
    redistributed = roundToTarget(
      Object.fromEntries(otherKeys.map((k) => [k, even])),
      remaining
    );
  } else {
    const floats = {};
    otherKeys.forEach((k) => {
      floats[k] = (baseOthers[k] / totalOthers) * remaining;
    });
    redistributed = roundToTarget(floats, remaining);
  }

  return {
    ...redistributed,
    [changedKey]: Math.round(nextClamped),
  };
}

function allocateCountsFromPercentages(total, mix = {}, allowedKeys = []) {
  const cleanPct = normalizeMixToPercentages(mix, allowedKeys);
  const floats = {};
  Object.keys(cleanPct).forEach((k) => {
    floats[k] = (Math.max(0, total) * cleanPct[k]) / 100;
  });
  return roundToTarget(floats, Math.max(0, total));
}

function pctInputValue(prob) {
  return Math.round(clamp01(prob) * 100);
}

const REACTION_KEYS = ["like", "love", "care", "haha", "wow", "sad", "angry"];
const NOTE_HELPFUL_KEYS = ["yes", "somewhat", "no"];

const DEFAULT_SIM_CONFIG = {
  random: {
    reactedBase: 0.22,
    reactedInterestWeight: 0.35,
    expandedBase: 0.12,
    expandedInterestWeight: 0.35,
    commentedBase: 0.03,
    commentedInterestWeight: 0.1,
    sharedBase: 0.03,
    sharedInterestWeight: 0.08,
    reportedBase: 0.05,
    reportedNoteBase: 0.03,
    ctaBase: 0.04,
    ctaInterestWeight: 0.12,
    bioOpenBase: 0.08,
    bioOpenInterestWeight: 0.18,
    bioUrlGivenOpen: 0.08,
    mentionClickedBase: 0.05,
    noteOpenBase: 0.18,
    noteOpenInterestWeight: 0.25,
    noteViewDetailsGivenOpen: 0.35,
    noteLinkGivenOpen: 0.08,
    noteHelpfulGivenOpen: 0.22,
    savedBase: 0.04,
    savedInterestWeight: 0.1,
  },
  controlled: {
    reactedRate: 0.22,
    reactionMix: {
      like: 55,
      love: 18,
      care: 8,
      haha: 6,
      wow: 5,
      sad: 4,
      angry: 4,
    },
    expandedRate: 0.18,
    commentedRate: 0.06,
    sharedRate: 0.05,
    reportedRate: 0.05,
    ctaClickedRate: 0.08,
    bioOpenedRate: 0.12,
    bioUrlClickedRate: 0.04,
    mentionClickedRate: 0.05,
    noteOpenedRate: 0.3,
    noteViewDetailsRate: 0.12,
    noteLinkClickedRate: 0.04,
    noteHelpfulRatedRate: 0.1,
    noteHelpfulMix: {
      yes: 50,
      somewhat: 30,
      no: 20,
    },
    savedRate: 0.08,
  },
};

function buildControlledAssignments({
  posts = [],
  participantCount = 0,
  feedId = "",
  projectId = "",
  app = "",
  simConfig = DEFAULT_SIM_CONFIG,
  isIG = false,
}) {
  const assignments = {};
  const allIdx = makeIndexList(participantCount);
  const controlledCfg = {
    ...DEFAULT_SIM_CONFIG.controlled,
    ...(simConfig?.controlled || {}),
    reactionMix: normalizeMixToPercentages(
      {
        ...DEFAULT_SIM_CONFIG.controlled.reactionMix,
        ...(simConfig?.controlled?.reactionMix || {}),
      },
      REACTION_KEYS
    ),
    noteHelpfulMix: normalizeMixToPercentages(
      {
        ...DEFAULT_SIM_CONFIG.controlled.noteHelpfulMix,
        ...(simConfig?.controlled?.noteHelpfulMix || {}),
      },
      NOTE_HELPFUL_KEYS
    ),
  };

  posts.forEach((post) => {
    const postId = post?.id || "unknown";
    const baseSeed = `${app}::${projectId}::${feedId}::${postId}`;

    const expandableAvailable = looksExpandable(post);
    const noteAvailable = hasNote(post);
    const bioAvailable = hasBio(post);
    const mentionAvailable = hasMention(post);
    const ctaAvailable = hasCta(post);
    const shareAvailable = hasShareableSurface(post);
    const savedAvailable = !!isIG;

    const reactedCount = Math.round(participantCount * clamp01(controlledCfg.reactedRate));
    const reactedIdx = selectExactIndices(allIdx, reactedCount, `${baseSeed}::reacted`);
    const reactedSet = new Set(reactedIdx);

    const reactionTypeByIdx = {};
    const reactionAlloc = allocateCountsFromPercentages(
      reactedIdx.length,
      controlledCfg.reactionMix,
      REACTION_KEYS
    );
    const reactedShuffled = deterministicShuffle(reactedIdx, `${baseSeed}::reaction_mix`);
    let rxCursor = 0;
    REACTION_KEYS.forEach((key) => {
      const n = Math.max(0, Math.round(reactionAlloc[key] || 0));
      for (let i = 0; i < n && rxCursor < reactedShuffled.length; i++, rxCursor++) {
        reactionTypeByIdx[reactedShuffled[rxCursor]] = key;
      }
    });

    const expandedIdx = expandableAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.expandedRate)), `${baseSeed}::expanded`)
      : [];
    const commentedIdx = selectExactIndices(
      allIdx,
      Math.round(participantCount * clamp01(controlledCfg.commentedRate)),
      `${baseSeed}::commented`
    );
    const sharedIdx = shareAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.sharedRate)), `${baseSeed}::shared`)
      : [];
    const reportedIdx = selectExactIndices(
      allIdx,
      Math.round(participantCount * clamp01(controlledCfg.reportedRate)),
      `${baseSeed}::reported`
    );
    const ctaIdx = ctaAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.ctaClickedRate)), `${baseSeed}::cta`)
      : [];
    const bioOpenedIdx = bioAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.bioOpenedRate)), `${baseSeed}::bio_opened`)
      : [];
    const bioUrlIdx = bioAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.bioUrlClickedRate)), `${baseSeed}::bio_url`)
      : [];
    const mentionIdx = mentionAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.mentionClickedRate)), `${baseSeed}::mention`)
      : [];
    const noteOpenedIdx = noteAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.noteOpenedRate)), `${baseSeed}::note_opened`)
      : [];
    const noteDetailsIdx = noteAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.noteViewDetailsRate)), `${baseSeed}::note_details`)
      : [];
    const noteLinkIdx = noteAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.noteLinkClickedRate)), `${baseSeed}::note_link`)
      : [];
    const noteHelpfulIdx = noteAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.noteHelpfulRatedRate)), `${baseSeed}::note_helpful`)
      : [];
    const savedIdx = savedAvailable
      ? selectExactIndices(allIdx, Math.round(participantCount * clamp01(controlledCfg.savedRate)), `${baseSeed}::saved`)
      : [];

    const bioOpenedSet = new Set(bioOpenedIdx);
    bioUrlIdx.forEach((idx) => bioOpenedSet.add(idx));

    const noteOpenedSet = new Set(noteOpenedIdx);
    noteDetailsIdx.forEach((idx) => noteOpenedSet.add(idx));
    noteLinkIdx.forEach((idx) => noteOpenedSet.add(idx));
    noteHelpfulIdx.forEach((idx) => noteOpenedSet.add(idx));

    const noteHelpfulByIdx = {};
    const noteHelpfulOpenIdx = Array.from(new Set(noteHelpfulIdx));
    const noteHelpfulAlloc = allocateCountsFromPercentages(
      noteHelpfulOpenIdx.length,
      controlledCfg.noteHelpfulMix,
      NOTE_HELPFUL_KEYS
    );
    const helpfulShuffled = deterministicShuffle(noteHelpfulOpenIdx, `${baseSeed}::note_helpful_mix`);
    let helpfulCursor = 0;
    NOTE_HELPFUL_KEYS.forEach((key) => {
      const n = Math.max(0, Math.round(noteHelpfulAlloc[key] || 0));
      for (let i = 0; i < n && helpfulCursor < helpfulShuffled.length; i++, helpfulCursor++) {
        noteHelpfulByIdx[helpfulShuffled[helpfulCursor]] = key;
      }
    });

    const shareTargetByIdx = {};
    const shareTextByIdx = {};
    const shareTargets = ["Friend 1", "Friend 2", "Friend 3", "Friend 4"];
    deterministicShuffle(sharedIdx, `${baseSeed}::share_targets`).forEach((idx, pos) => {
      shareTargetByIdx[idx] = shareTargets[pos % shareTargets.length];
      shareTextByIdx[idx] = pos % 2 === 0 ? "Check this out" : "";
    });

    assignments[postId] = {
      reactedSet,
      reactionTypeByIdx,
      expandedSet: new Set(expandedIdx),
      commentedSet: new Set(commentedIdx),
      sharedSet: new Set(sharedIdx),
      shareTargetByIdx,
      shareTextByIdx,
      reportedSet: new Set(reportedIdx),
      ctaSet: new Set(ctaIdx),
      bioOpenedSet,
      bioUrlSet: new Set(bioUrlIdx),
      mentionSet: new Set(mentionIdx),
      noteOpenedSet,
      noteDetailsSet: new Set(noteDetailsIdx),
      noteLinkSet: new Set(noteLinkIdx),
      noteHelpfulSet: new Set(noteHelpfulIdx),
      noteHelpfulByIdx,
      savedSet: new Set(savedIdx),
    };
  });

  return assignments;
}

function simulateParticipantRows({
  posts = [],
  participantCount = 50,
  feedId = "",
  projectId = "",
  app = "",
  nameStore = {},
  simMode = "random",
  simConfig = DEFAULT_SIM_CONFIG,
}) {
  const out = [];
  const baseNow = Date.now();
  const totalN = Math.max(1, Number(participantCount) || 1);
  const isIG = String(app || "").toLowerCase() === "ig";

  const randomCfg = {
    ...DEFAULT_SIM_CONFIG.random,
    ...(simConfig?.random || {}),
  };

  const controlledCfg = {
    ...DEFAULT_SIM_CONFIG.controlled,
    ...(simConfig?.controlled || {}),
    reactionMix: normalizeMixToPercentages(
      {
        ...DEFAULT_SIM_CONFIG.controlled.reactionMix,
        ...(simConfig?.controlled?.reactionMix || {}),
      },
      REACTION_KEYS
    ),
    noteHelpfulMix: normalizeMixToPercentages(
      {
        ...DEFAULT_SIM_CONFIG.controlled.noteHelpfulMix,
        ...(simConfig?.controlled?.noteHelpfulMix || {}),
      },
      NOTE_HELPFUL_KEYS
    ),
  };

  const controlledAssignments =
    simMode === "controlled"
      ? buildControlledAssignments({
          posts,
          participantCount: totalN,
          feedId,
          projectId,
          app,
          simConfig: {
            ...simConfig,
            controlled: controlledCfg,
          },
          isIG,
        })
      : null;

  for (let i = 0; i < totalN; i++) {
    const participant_id = buildSimulatedParticipantId(i);
    const seed = hashStr(`${app}::${projectId}::${feedId}::${participant_id}::${i}`);
    const rng = mulberry32(seed);

    const enteredTs = baseNow - randomInt(rng, 2 * 3600 * 1000, 14 * 24 * 3600 * 1000);
    let runningMs = 0;

    const row = {
      session_id: `sim_session_${String(i + 1).padStart(5, "0")}`,
      participant_id,
      prolific_pid: "",
      session_id_ext: "",
      study_id: "",
      entered_at_iso: new Date(enteredTs).toISOString(),
      submitted_at_iso: "",
      ms_enter_to_submit: 0,
      ms_enter_to_last_interaction: 0,
      feed_id: feedId || null,
      feed_checksum: "",
    };

    const feedLevelSpeedFactor = 0.8 + rng() * 0.8;

    for (const post of posts) {
      const id = post?.id || "unknown";
      const txt = String(post?.text || "");
      const expandableAvailable = looksExpandable(post);
      const noteAvailable = hasNote(post);
      const bioAvailable = hasBio(post);
      const mentionAvailable = hasMention(post);
      const ctaAvailable = hasCta(post);
      const shareAvailable = hasShareableSurface(post);
      const savedAvailable = isIG;

      const baseInterest =
        post?.adType === "ad"
          ? 0.42
          : post?.adType === "influencer"
            ? 0.52
            : 0.48;

      const noteInterestBoost = noteAvailable ? 0.08 : 0;
      const bioInterestBoost = bioAvailable ? 0.03 : 0;
      const textBoost = txt.length > 80 ? 0.04 : 0;

      const interest = clamp01(
        baseInterest + noteInterestBoost + bioInterestBoost + textBoost + (rng() - 0.5) * 0.18
      );

      const dwell_s = Math.max(
        1,
        Math.round((2 + rng() * 12 + interest * 10) * feedLevelSpeedFactor + (noteAvailable ? 2 : 0))
      );

      let reacted = 0;
      let reaction_type = "";
      let expanded = 0;
      let commented = 0;
      let comment_texts = "";
      let saved = 0;
      let sharedFlag = 0;
      let share_target = "";
      let share_text = "";
      let reported_misinfo = 0;
      let cta_clicked = 0;
      let bio_opened = 0;
      let bio_url_clicked = 0;
      let mention_clicked = 0;
      let note_opened = 0;
      let note_view_details = 0;
      let note_link_clicked = 0;
      let note_helpful_rated = 0;
      let note_helpful_value = "";

      if (simMode === "controlled") {
        const a = controlledAssignments?.[id] || {};

        reacted = a.reactedSet?.has(i) ? 1 : 0;
        reaction_type = reacted ? (a.reactionTypeByIdx?.[i] || "like") : "";

        expanded = expandableAvailable && a.expandedSet?.has(i) ? 1 : 0;

        commented = a.commentedSet?.has(i) ? 1 : 0;
        comment_texts = commented ? `Simulated comment ${i + 1} on ${nameStore[id] || id}` : "";

        saved = savedAvailable && a.savedSet?.has(i) ? 1 : 0;

        sharedFlag = shareAvailable && a.sharedSet?.has(i) ? 1 : 0;
        share_target = sharedFlag ? a.shareTargetByIdx?.[i] || "Friend 1" : "";
        share_text = sharedFlag ? a.shareTextByIdx?.[i] || "" : "";

        reported_misinfo = a.reportedSet?.has(i) && post?.adType !== "ad" ? 1 : 0;

        cta_clicked = ctaAvailable && a.ctaSet?.has(i) ? 1 : 0;

        bio_opened = bioAvailable && a.bioOpenedSet?.has(i) ? 1 : 0;
        bio_url_clicked = bioAvailable && a.bioUrlSet?.has(i) ? 1 : 0;

        mention_clicked = mentionAvailable && a.mentionSet?.has(i) ? 1 : 0;

        note_opened = noteAvailable && a.noteOpenedSet?.has(i) ? 1 : 0;
        note_view_details = noteAvailable && a.noteDetailsSet?.has(i) ? 1 : 0;
        note_link_clicked = noteAvailable && a.noteLinkSet?.has(i) ? 1 : 0;
        note_helpful_rated = noteAvailable && a.noteHelpfulSet?.has(i) ? 1 : 0;
        note_helpful_value = note_helpful_rated ? a.noteHelpfulByIdx?.[i] || "yes" : "";
      } else {
        reacted = chance(rng, randomCfg.reactedBase + interest * randomCfg.reactedInterestWeight) ? 1 : 0;
        reaction_type = reacted
          ? weightedChoice(rng, controlledCfg.reactionMix, "like")
          : "";

        expanded =
          expandableAvailable &&
          chance(rng, randomCfg.expandedBase + interest * randomCfg.expandedInterestWeight)
            ? 1
            : 0;

        commented = chance(rng, randomCfg.commentedBase + interest * randomCfg.commentedInterestWeight) ? 1 : 0;
        comment_texts = commented ? `Simulated comment ${i + 1} on ${nameStore[id] || id}` : "";

        saved = savedAvailable && chance(rng, randomCfg.savedBase + interest * randomCfg.savedInterestWeight) ? 1 : 0;

        sharedFlag = shareAvailable && chance(rng, randomCfg.sharedBase + interest * randomCfg.sharedInterestWeight) ? 1 : 0;
        share_target = sharedFlag
          ? weightedChoice(
              rng,
              { "Friend 1": 25, "Friend 2": 25, "Friend 3": 25, "Friend 4": 25 },
              "Friend 1"
            )
          : "";
        share_text = sharedFlag && chance(rng, 0.45) ? "Check this out" : "";

        reported_misinfo =
          chance(rng, noteAvailable ? randomCfg.reportedNoteBase : randomCfg.reportedBase) &&
          post?.adType !== "ad"
            ? 1
            : 0;

        cta_clicked =
          ctaAvailable &&
          chance(rng, randomCfg.ctaBase + interest * randomCfg.ctaInterestWeight)
            ? 1
            : 0;

        bio_opened =
          bioAvailable &&
          chance(rng, randomCfg.bioOpenBase + interest * randomCfg.bioOpenInterestWeight)
            ? 1
            : 0;
        bio_url_clicked = bio_opened && chance(rng, randomCfg.bioUrlGivenOpen) ? 1 : 0;

        mention_clicked = mentionAvailable && chance(rng, randomCfg.mentionClickedBase) ? 1 : 0;

        note_opened =
          noteAvailable &&
          chance(rng, randomCfg.noteOpenBase + interest * randomCfg.noteOpenInterestWeight)
            ? 1
            : 0;
        note_view_details = note_opened && chance(rng, randomCfg.noteViewDetailsGivenOpen) ? 1 : 0;
        note_link_clicked = note_opened && chance(rng, randomCfg.noteLinkGivenOpen) ? 1 : 0;
        note_helpful_rated = note_opened && chance(rng, randomCfg.noteHelpfulGivenOpen) ? 1 : 0;
        note_helpful_value = note_helpful_rated
          ? weightedChoice(rng, controlledCfg.noteHelpfulMix, "yes")
          : "";
      }

      row[`${id}_reacted`] = reacted;
      row[`${id}_reaction_type`] = reaction_type;
      row[`${id}_expandable`] = expandableAvailable ? 1 : 0;
      row[`${id}_expanded`] = expanded;
      row[`${id}_commented`] = commented;
      row[`${id}_comment_texts`] = comment_texts;
      row[`${id}_reported_misinfo`] = reported_misinfo;
      row[`${id}_dwell_s`] = dwell_s;

      if (savedAvailable) {
        row[`${id}_saved`] = saved;
      }

      row[`${id}_shared`] = sharedFlag;
      row[`${id}_share_target`] = share_target;
      row[`${id}_share_text`] = share_text;
      row[`${id}_cta_clicked`] = cta_clicked;
      row[`${id}_bio_opened`] = bio_opened;
      row[`${id}_bio_url_clicked`] = bio_url_clicked;
      row[`${id}_mention_clicked`] = mention_clicked;
      row[`${id}_note_opened`] = note_opened;
      row[`${id}_note_view_details`] = note_view_details;
      row[`${id}_note_link_clicked`] = note_link_clicked;
      row[`${id}_note_helpful_rated`] = note_helpful_rated;
      row[`${id}_note_helpful_value`] = note_helpful_value;

      runningMs += dwell_s * 1000 + randomInt(rng, 250, 2200);
    }

    const submitMs = Math.max(runningMs, randomInt(rng, 30000, 240000));
    const submittedTs = enteredTs + submitMs;

    row.submitted_at_iso = new Date(submittedTs).toISOString();
    row.ms_enter_to_submit = submitMs;
    row.ms_enter_to_last_interaction = Math.max(0, submitMs - randomInt(rng, 0, 4000));

    out.push(row);
  }

  return out;
}

/* --------------------------- small input helpers --------------------------- */
function NumericTextInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  style,
  title,
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={String(value ?? "")}
      onFocus={selectAllOnFocus}
      onClick={selectAllOnFocus}
      onChange={(e) => {
        const raw = String(e.target.value || "").replace(/[^\d]/g, "");
        if (raw === "") {
          onChange("");
          return;
        }
        const num = Number(raw);
        if (!Number.isFinite(num)) return;
        let next = num;
        if (min != null) next = Math.max(min, next);
        if (max != null) next = Math.min(max, next);
        onChange(next);
      }}
      style={style}
      title={title}
    />
  );
}

function PercentField({ label, value, onChange, style }) {
  const display = pctInputValue(value);
  return (
    <label>
      <div className="subtle">{label}</div>
      <NumericTextInput
        min={0}
        max={100}
        step={1}
        value={display}
        onChange={(v) => onChange(Number(v || 0) / 100)}
        style={style}
      />
    </label>
  );
}

function MixField({ label, value, onChange, style }) {
  return (
    <label>
      <div className="subtle">{label}</div>
      <NumericTextInput
        min={0}
        max={100}
        step={1}
        value={Number(value || 0)}
        onChange={(v) => onChange(Number(v || 0))}
        style={style}
      />
    </label>
  );
}

function IntegerField({ value, onChange, style, title }) {
  return (
    <NumericTextInput
      min={1}
      step={1}
      value={value}
      onChange={(v) => onChange(Math.max(1, Number(v || 1)))}
      style={style}
      title={title}
    />
  );
}

/* --------------------------- stat card ----------------------------- */
export function StatCard({ title, value, sub, compact = false }) {
  return (
    <div className="card" style={{ padding: compact ? ".5rem .75rem" : ".75rem 1rem" }}>
      <div style={{ fontSize: compact ? ".75rem" : ".8rem", color: "#6b7280" }}>{title}</div>
      <div style={{ fontSize: compact ? "1.1rem" : "1.25rem", fontWeight: 700 }}>{value}</div>
      {sub ? (
        <div style={{ fontSize: compact ? ".75rem" : ".8rem", color: "#6b7280", marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------- detail modal ------------------------- */
export function ParticipantDetailModal({ open, onClose, submission }) {
  if (!open) return null;
  const perPost = submission?.perPost || [];
  const showSavedCol = isIGApp();

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
        <div className="modal-head">
          <h3 style={{ margin: 0, fontWeight: 600 }}>Submission Details</h3>
          <button className="dots" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="subtle" style={{ marginBottom: ".5rem" }}>
            <div><strong>Participant:</strong> {submission?.participant_id || "—"}</div>
            <div><strong>Session:</strong> <span style={{ fontFamily: "monospace" }}>{submission?.session_id || "—"}</span></div>
            <div><strong>Submitted At:</strong> {submission?.submitted_at_iso || "—"}</div>
            <div><strong>Time to submit:</strong> {ms(submission?.ms_enter_to_submit)}</div>
          </div>

          {perPost.length === 0 ? (
            <div className="card" style={{ padding: "1rem" }}>
              No per-post interaction fields found for this submission.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <th style={{ textAlign: "left", padding: ".4rem .25rem" }}>Post ID</th>
                    <th style={{ textAlign: "left", padding: ".4rem .25rem" }}>Name</th>
                    <th style={{ textAlign: "center", padding: ".4rem .25rem" }}>Reacted</th>
                    <th style={{ textAlign: "center", padding: ".4rem .25rem" }}>Expandable</th>
                    <th style={{ textAlign: "center", padding: ".4rem .25rem" }}>Expanded</th>
                    <th style={{ textAlign: "center", padding: ".4rem .25rem" }}>Commented</th>
                    {showSavedCol && <th style={{ textAlign: "center", padding: ".4rem .25rem" }}>Saved</th>}
                    <th style={{ textAlign: "center", padding: ".4rem .25rem" }}>Shared</th>
                    <th style={{ textAlign: "center", padding: ".4rem .25rem" }}>Reported</th>
                    <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Dwell (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {perPost.map((p) => {
                    const dwellSeconds = Number.isFinite(p?.dwell_s)
                      ? Number(p.dwell_s)
                      : Number.isFinite(p?.dwell_ms)
                        ? Number(p.dwell_ms) / 1000
                        : 0;

                    return (
                      <tr key={p.post_id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: ".35rem .25rem", fontFamily: "monospace" }}>{p.post_id}</td>
                        <td style={{ padding: ".35rem .25rem" }}>{p.name || "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.reacted ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.expandable ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.expanded ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.commented ? "✓" : "—"}</td>
                        {showSavedCol && (
                          <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.saved ? "✓" : "—"}</td>
                        )}
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.shared ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.reported ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{sShort(dwellSeconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* --------------------------- participants panel --------------------------- */
export function ParticipantsPanel({
  feedId,
  projectId: projectIdProp,
  posts = [],
  compact = false,
  limit,
  onCountChange,
  postNamesMap,
}) {
  const projectId = projectIdProp ?? getProjectIdUtil() ?? "global";
  const IG = isIGApp();

  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pageSize, setPageSize] = useState(25);
  const [showPerPost, setShowPerPost] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSubmission, setDetailSubmission] = useState(null);

  const [simCount, setSimCount] = useState(50);
  const [simRows, setSimRows] = useState([]);
  const [usingSimulated, setUsingSimulated] = useState(false);

  const [simMode, setSimMode] = useState("random");
  const [surveyHeaderMode, setSurveyHeaderMode] = useState("text"); // "text" | "name"

  const [simConfig, setSimConfig] = useState(() => ({
    ...DEFAULT_SIM_CONFIG,
    controlled: {
      ...DEFAULT_SIM_CONFIG.controlled,
      reactionMix: { ...DEFAULT_SIM_CONFIG.controlled.reactionMix },
      noteHelpfulMix: { ...DEFAULT_SIM_CONFIG.controlled.noteHelpfulMix },
    },
  }));

  const abortRef = useRef(null);
  const nameStore = postNamesMap || readPostNames(projectId, feedId) || {};
  const caps = useMemo(() => capabilitySummary(posts, IG), [posts, IG]);

  useEffect(() => {
    setProjectIdUtil(projectId, { persist: true, updateUrl: false });
  }, [projectId]);

  const mkCacheKey = (id, pid = projectId) =>
    `participants_cache_v13::${APP || "app"}::${pid || "no-project"}::${id || "noid"}`;

  const saveCache = (data, pid = projectId) => {
    try {
      localStorage.setItem(mkCacheKey(feedId, pid), JSON.stringify({ t: Date.now(), rows: data }));
    } catch {}
  };

  const readCache = (pid = projectId) => {
    try {
      const raw = localStorage.getItem(mkCacheKey(feedId, pid));
      const parsed = JSON.parse(raw || "{}");
      return Array.isArray(parsed?.rows) ? parsed : null;
    } catch {
      return null;
    }
  };

  const computeSummaryIdle = (data) => {
    const run = () => {
      try {
        setSummary(summarizeRoster(data || []));
      } catch {}
    };
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 0)))(run);
  };

  const refresh = async (silent = false, pidOverride) => {
    setError("");
    if (!silent) setLoading(true);

    abortRef.current?.abort?.();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const pid = pidOverride ?? projectId;
      const data = await loadParticipantsRoster(feedId, { signal: ctrl.signal, projectId: pid });
      if (!ctrl.signal.aborted && Array.isArray(data)) {
        setRows(data);
        if (!usingSimulated) computeSummaryIdle(data);
        saveCache(data, pid);
      }
    } catch (e) {
      if (e?.name !== "AbortError") setError("Failed to load participants");
    } finally {
      setLoading(false);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  useEffect(() => {
    const cached = readCache(projectId);
    if (cached?.rows?.length) {
      setRows(cached.rows);
      setLoading(false);
      if (!usingSimulated) computeSummaryIdle(cached.rows);
    }
    refresh(!!cached?.rows?.length);
    return () => abortRef.current?.abort?.();
  }, [feedId, projectId]);

  const effectiveRows = useMemo(
    () => (usingSimulated ? (simRows || []) : (rows || [])),
    [usingSimulated, simRows, rows]
  );

  useEffect(() => {
    computeSummaryIdle(effectiveRows);
  }, [effectiveRows]);

  useEffect(() => {
    onCountChange?.(effectiveRows?.length || 0);
  }, [effectiveRows, onCountChange]);

  const sorted = useMemo(() => {
    if (!effectiveRows?.length) return [];
    const a = [...effectiveRows];
    a.sort((x, y) => String(y.submitted_at_iso).localeCompare(String(x.submitted_at_iso)));
    return a;
  }, [effectiveRows]);

  const effectivePageSize =
    typeof limit === "number" && limit >= 0 ? Math.min(limit, sorted.length) : pageSize;

  const visible = useMemo(() => sorted.slice(0, effectivePageSize), [sorted, effectivePageSize]);

  const avgDwellSByPost = useMemo(() => {
    const acc = new Map();
    if (!effectiveRows?.length) return acc;

    for (const r of effectiveRows) {
      for (const k of Object.keys(r)) {
        let m = k.match(/^(.*)_dwell_s$/);
        if (m) {
          const id = m[1];
          const s = Number(r[k] || 0);
          if (!acc.has(id)) acc.set(id, { sum: 0, count: 0 });
          const a = acc.get(id);
          a.sum += s;
          a.count += 1;
          continue;
        }

        m = k.match(/^(.*)_dwell_ms$/);
        if (m) {
          const id = m[1];
          const s = Math.round(Number(r[k] || 0) / 1000);
          if (!acc.has(id)) acc.set(id, { sum: 0, count: 0 });
          const a = acc.get(id);
          a.sum += s;
          a.count += 1;
        }
      }
    }

    return acc;
  }, [effectiveRows]);

  const perPostList = useMemo(() => {
    if (!showPerPost || !summary?.perPost) return [];
    return Object.entries(summary.perPost).map(([id, agg]) => {
      const dwellAcc = avgDwellSByPost.get(id);
      const avgDwellS = dwellAcc && dwellAcc.count > 0 ? dwellAcc.sum / dwellAcc.count : null;
      return {
        id,
        name: nameStore[id] || "",
        reacted: agg.reacted ?? 0,
        expandable: agg.expandable ?? 0,
        expanded: agg.expanded ?? 0,
        commented: agg.commented ?? 0,
        saved: agg.saved ?? 0,
        shared: agg.shared ?? 0,
        reported: agg.reported ?? 0,
        avgDwellS,
      };
    });
  }, [showPerPost, summary, avgDwellSByPost, nameStore]);

  const padCell = compact ? ".3rem .25rem" : ".4rem .25rem";
  const fsTable = compact ? ".85rem" : ".9rem";
  const wrapperPad = compact ? ".75rem 1rem" : "1rem";
  const headerGap = compact ? ".35rem" : ".5rem";
  const statsGap = compact ? ".4rem" : ".5rem";
  const inputStyle = { width: "100%" };

  const updateControlled = (key, value) => {
    setSimConfig((prev) => ({
      ...prev,
      controlled: {
        ...prev.controlled,
        [key]: clamp01(value),
      },
    }));
  };

  const updateControlledMix = (group, key, value) => {
    setSimConfig((prev) => ({
      ...prev,
      controlled: {
        ...prev.controlled,
        [group]: rebalancePercentageMix(prev.controlled[group], key, value),
      },
    }));
  };

  const runSimulation = () => {
    if (!posts?.length) {
      alert("Simulation needs the current feed posts. Pass posts={posts} into ParticipantsPanel.");
      return;
    }

    const generated = simulateParticipantRows({
      posts,
      participantCount: simCount,
      feedId,
      projectId,
      app: APP || "app",
      nameStore,
      simMode,
      simConfig,
    });

    setSimRows(generated);
    setUsingSimulated(true);
  };


function getPostByIdMap(posts = []) {
  const map = new Map();
  (Array.isArray(posts) ? posts : []).forEach((p) => {
    const id = String(p?.id || "").trim();
    if (id) map.set(id, p);
  });
  return map;
}

function parsePostMetricKey(key = "") {
  const suffixes = [
    "_reacted",
    "_reaction_type",
    "_expandable",
    "_expanded",
    "_commented",
    "_comment_texts",
    "_reported_misinfo",
    "_dwell_s",
    "_dwell_ms",
    "_saved",
    "_shared",
    "_share_target",
    "_share_text",
    "_cta_clicked",
    "_bio_opened",
    "_bio_url_clicked",
    "_mention_clicked",
    "_note_opened",
    "_note_view_details",
    "_note_link_clicked",
    "_note_helpful_rated",
    "_note_helpful_value",
  ];

  for (const suffix of suffixes) {
    if (key.endsWith(suffix)) {
      return {
        postId: key.slice(0, -suffix.length),
        suffix,
      };
    }
  }

  return null;
}

function isRelevantPostMetricForExport(post, suffix, isIG) {
  if (!post || !suffix) return true;

  // ❌ Remove FB-only metrics from IG
  if (isIG && FB_ONLY.includes(suffix)) return false;

  // ❌ Remove IG-only metrics from FB
  if (!isIG && IG_ONLY.includes(suffix)) return false;

  // ✅ IG-only
  if (suffix === "_saved") return !!isIG;

  // ✅ Feature-based filters
  if (suffix === "_bio_opened" || suffix === "_bio_url_clicked") {
    return hasBio(post);
  }

  if (suffix === "_mention_clicked") {
    return hasMention(post);
  }

  if (suffix === "_cta_clicked") {
    return hasCta(post);
  }

  if (suffix === "_expandable" || suffix === "_expanded") {
    return looksExpandable(post);
  }

  return true;
}

function filterCsvKeysForCurrentFeed(keys = [], posts = [], isIG = false) {
  const postMap = getPostByIdMap(posts);

  return (Array.isArray(keys) ? keys : []).filter((key) => {
    if (!key) return false;

    // always keep survey export fields
    if (String(key).startsWith("survey_")) return true;

    // always keep non-post-level participant metadata
    const parsed = parsePostMetricKey(key);
    if (!parsed) return true;

    const post = postMap.get(parsed.postId);
    if (!post) return true;

    return isRelevantPostMetricForExport(post, parsed.suffix, isIG);
  });
}

  const clearSimulation = () => {
    setUsingSimulated(false);
    setSimRows([]);
  };


  

  const downloadCsv = async () => {
    if (!feedId) return;

    if (usingSimulated) {
      if (!effectiveRows?.length) return;

      const normalizedAll = normalizeRowsForCsv(effectiveRows);
      const keySet = new Set();
normalizedAll.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));

const allKeys = Array.from(keySet);
const keys = filterCsvKeysForCurrentFeed(allKeys, posts, IG);
const labels = keys.map((k) => labelForKey(k, nameStore));
      const csv = makeCsvWithPrettyHeaders(normalizedAll, keys, labels);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        `${APP}_participants` +
        `${projectId ? `_${projectId}` : ""}` +
        `${feedId ? `_${feedId}` : ""}` +
        `_SIMULATED.csv`;

      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    try {
      setError("");
      setLoading(true);

      const merged = await loadMergedParticipantSurveyRoster({
        feedId,
        projectId,
      });

      const mergedRows = Array.isArray(merged?.rows) ? merged.rows : [];
      if (!mergedRows.length) return;

      const normalizedAll = normalizeRowsForCsv(mergedRows);
      const keySet = new Set();
      normalizedAll.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));

      const allKeys = Array.from(keySet);
const keys = filterCsvKeysForCurrentFeed(allKeys, posts, IG);
      const surveyLabelMap = new Map(
        (merged?.surveyColumns || []).map((col) => {
          const label =
            surveyHeaderMode === "name"
              ? (col.header_name || col.column_key)
              : (col.header_text || col.header_name || col.column_key);
          return [col.column_key, label];
        })
      );

      const labels = keys.map((k) => surveyLabelMap.get(k) || labelForKey(k, nameStore));
      const csv = makeCsvWithPrettyHeaders(normalizedAll, keys, labels);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        `${APP}_participants` +
        `${projectId ? `_${projectId}` : ""}` +
        `${feedId ? `_${feedId}` : ""}` +
        `${merged?.hasMergedSurveyColumns ? "_with_survey" : ""}` +
        `${surveyHeaderMode === "name" ? "_varnames" : "_questiontext"}.csv`;

      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Merged CSV download failed:", e);
      setError("Failed to download CSV");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: wrapperPad }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: headerGap, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, fontSize: compact ? "1rem" : "1.05rem" }}>
          Participants{feedId ? <span className="subtle"> · {feedId}</span> : null}
          <span className="subtle"> · {APP} · {projectId || "global"}</span>
          {usingSimulated ? <span className="subtle"> · SIMULATED</span> : null}
        </h4>

        <div style={{ display: "flex", gap: headerGap, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="btn"
            onClick={() => refresh(false)}
            style={{ padding: compact ? ".25rem .6rem" : undefined }}
          >
            Refresh
          </button>

          <select
            value={simMode}
            onChange={(e) => setSimMode(e.target.value)}
            style={{
              padding: compact ? ".25rem .45rem" : ".35rem .55rem",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: compact ? ".85rem" : ".9rem",
              background: "var(--card, white)",
            }}
            title="Simulation mode"
          >
            <option value="random">Random</option>
            <option value="controlled">Controlled</option>
          </select>

          {!usingSimulated && (
            <select
              value={surveyHeaderMode}
              onChange={(e) => setSurveyHeaderMode(e.target.value)}
              style={{
                padding: compact ? ".25rem .45rem" : ".35rem .55rem",
                border: "1px solid var(--line)",
                borderRadius: 8,
                fontSize: compact ? ".85rem" : ".9rem",
                background: "var(--card, white)",
              }}
              title="Survey CSV column headers"
            >
              <option value="text">Survey headers: question text</option>
              <option value="name">Survey headers: question name</option>
            </select>
          )}

          <IntegerField
            value={simCount}
            onChange={setSimCount}
            style={{
              width: 86,
              padding: compact ? ".25rem .45rem" : ".35rem .55rem",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: compact ? ".85rem" : ".9rem",
            }}
            title="Number of simulated participants"
          />

          <button
            className="btn"
            onClick={runSimulation}
            style={{ padding: compact ? ".25rem .6rem" : undefined }}
          >
            Simulate
          </button>

          {usingSimulated && (
            <button
              className="btn ghost"
              onClick={clearSimulation}
              style={{ padding: compact ? ".25rem .6rem" : undefined }}
            >
              Clear simulation
            </button>
          )}

          <button
            className="btn"
            onClick={downloadCsv}
            disabled={!feedId || (!usingSimulated && !rows?.length) || (usingSimulated && !effectiveRows?.length)}
            style={{ padding: compact ? ".25rem .6rem" : undefined }}
          >
            Download CSV
          </button>
        </div>
      </div>

      {simMode === "controlled" && (
        <div
          className="card"
          style={{
            marginTop: ".6rem",
            padding: ".75rem",
            border: "1px solid var(--line)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: ".5rem" }}>Controlled simulation settings</div>
          <div className="subtle" style={{ marginBottom: ".6rem" }}>
            Controlled mode uses exact whole-person counts based on your sample size. Mixes are kept at 100%.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: ".5rem .75rem",
            }}
          >
            <PercentField label="Reacted %" value={simConfig.controlled.reactedRate} onChange={(v) => updateControlled("reactedRate", v)} style={inputStyle} />

            {caps.hasExpandable && (
              <PercentField label="Expanded %" value={simConfig.controlled.expandedRate} onChange={(v) => updateControlled("expandedRate", v)} style={inputStyle} />
            )}

            <PercentField label="Commented %" value={simConfig.controlled.commentedRate} onChange={(v) => updateControlled("commentedRate", v)} style={inputStyle} />

            {caps.hasSaved && (
              <PercentField label="Saved %" value={simConfig.controlled.savedRate} onChange={(v) => updateControlled("savedRate", v)} style={inputStyle} />
            )}

            {caps.hasShare && (
              <PercentField label="Shared %" value={simConfig.controlled.sharedRate} onChange={(v) => updateControlled("sharedRate", v)} style={inputStyle} />
            )}

            <PercentField label="Reported %" value={simConfig.controlled.reportedRate} onChange={(v) => updateControlled("reportedRate", v)} style={inputStyle} />

            {caps.hasCta && (
              <PercentField label="CTA clicked %" value={simConfig.controlled.ctaClickedRate} onChange={(v) => updateControlled("ctaClickedRate", v)} style={inputStyle} />
            )}

            {caps.hasBio && (
              <>
                <PercentField label="Bio opened %" value={simConfig.controlled.bioOpenedRate} onChange={(v) => updateControlled("bioOpenedRate", v)} style={inputStyle} />
                <PercentField label="Bio URL clicked %" value={simConfig.controlled.bioUrlClickedRate} onChange={(v) => updateControlled("bioUrlClickedRate", v)} style={inputStyle} />
              </>
            )}

            {caps.hasMention && (
              <PercentField label="Mention clicked %" value={simConfig.controlled.mentionClickedRate} onChange={(v) => updateControlled("mentionClickedRate", v)} style={inputStyle} />
            )}

            {caps.hasNote && (
              <>
                <PercentField label="Note opened %" value={simConfig.controlled.noteOpenedRate} onChange={(v) => updateControlled("noteOpenedRate", v)} style={inputStyle} />
                <PercentField label="Note details %" value={simConfig.controlled.noteViewDetailsRate} onChange={(v) => updateControlled("noteViewDetailsRate", v)} style={inputStyle} />
                <PercentField label="Note link clicked %" value={simConfig.controlled.noteLinkClickedRate} onChange={(v) => updateControlled("noteLinkClickedRate", v)} style={inputStyle} />
                <PercentField label="Note helpful rated %" value={simConfig.controlled.noteHelpfulRatedRate} onChange={(v) => updateControlled("noteHelpfulRatedRate", v)} style={inputStyle} />
              </>
            )}
          </div>

          <div style={{ marginTop: ".75rem", fontWeight: 600 }}>
            Reaction mix <span className="subtle">({Object.values(simConfig.controlled.reactionMix).reduce((a, b) => a + (Number(b) || 0), 0)} total)</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: ".5rem",
              marginTop: ".35rem",
            }}
          >
            {REACTION_KEYS.map((k) => (
              <MixField
                key={k}
                label={k}
                value={Number(simConfig.controlled.reactionMix[k] || 0)}
                onChange={(v) => updateControlledMix("reactionMix", k, v)}
                style={inputStyle}
              />
            ))}
          </div>

          {caps.hasNote && (
            <>
              <div style={{ marginTop: ".75rem", fontWeight: 600 }}>
                Note helpful mix <span className="subtle">({Object.values(simConfig.controlled.noteHelpfulMix).reduce((a, b) => a + (Number(b) || 0), 0)} total)</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: ".5rem",
                  marginTop: ".35rem",
                }}
              >
                {NOTE_HELPFUL_KEYS.map((k) => (
                  <MixField
                    key={k}
                    label={k}
                    value={Number(simConfig.controlled.noteHelpfulMix[k] || 0)}
                    onChange={(v) => updateControlledMix("noteHelpfulMix", k, v)}
                    style={inputStyle}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {usingSimulated && (
        <div className="subtle" style={{ marginTop: ".5rem", fontSize: compact ? ".78rem" : ".84rem" }}>
          Currently viewing {effectiveRows.length} simulated rows.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: statsGap,
          marginTop: compact ? ".5rem" : ".75rem",
        }}
      >
        <StatCard compact={compact} title="Total" value={nfCompact.format(summary?.counts?.total ?? (effectiveRows?.length || 0))} />
        <StatCard compact={compact} title="Completed" value={nfCompact.format(summary?.counts?.completed ?? 0)} sub={`${(((summary?.counts?.completionRate ?? 0) * 100).toFixed(1))}% completion`} />
        <StatCard compact={compact} title="Avg time to submit" value={ms(summary?.timing?.avgEnterToSubmit)} />
        <StatCard compact={compact} title="Median time to submit" value={ms(summary?.timing?.medEnterToSubmit)} />
        <StatCard compact={compact} title="Avg last interaction" value={ms(summary?.timing?.avgEnterToLastInteraction)} />
        <StatCard compact={compact} title="Median last interaction" value={ms(summary?.timing?.medEnterToLastInteraction)} />
      </div>

      <div style={{ marginTop: compact ? ".6rem" : "1rem" }}>
        <button
          className="btn ghost"
          onClick={() => setShowPerPost((v) => !v)}
          style={{ padding: compact ? ".25rem .6rem" : undefined }}
        >
          {showPerPost ? "Hide per-post interactions" : "Show per-post interactions"}
        </button>
      </div>

      {showPerPost && perPostList.length > 0 && (
        <div style={{ marginTop: ".5rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fsTable }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: padCell }}>Post ID</th>
                <th style={{ textAlign: "left", padding: padCell }}>Name</th>
                <th style={{ textAlign: "right", padding: padCell }}>Reacted</th>
                <th style={{ textAlign: "right", padding: padCell }}>Expandable</th>
                <th style={{ textAlign: "right", padding: padCell }}>Expanded</th>
                <th style={{ textAlign: "right", padding: padCell }}>Commented</th>
                {IG && <th style={{ textAlign: "right", padding: padCell }}>Saved</th>}
                <th style={{ textAlign: "right", padding: padCell }}>Shared</th>
                <th style={{ textAlign: "right", padding: padCell }}>Reported</th>
                <th style={{ textAlign: "right", padding: padCell }}>Avg dwell (s)</th>
              </tr>
            </thead>
            <tbody>
              {perPostList.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: padCell, fontFamily: "monospace" }}>{p.id}</td>
                  <td style={{ padding: padCell }}>{p.name || "—"}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.reacted)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.expandable)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.expanded)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.commented)}</td>
                  {IG && <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.saved)}</td>}
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.shared)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.reported)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{sShort(p.avgDwellS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h5 style={{ margin: compact ? ".75rem 0 .4rem" : "1rem 0 .5rem", fontSize: compact ? ".95rem" : "1rem" }}>
        Latest submissions
      </h5>

      {visible.length === 0 ? (
        <div className="subtle" style={{ padding: ".5rem 0", fontSize: compact ? ".85rem" : ".9rem" }}>
          No submissions yet.
        </div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: fsTable }}>
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: padCell }}>Participant</th>
                <th style={{ textAlign: "left", padding: padCell }}>Submitted At</th>
                <th style={{ textAlign: "right", padding: padCell }}>Time to Submit</th>
                <th style={{ textAlign: "right", padding: padCell }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.session_id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: padCell, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.participant_id || "—"}
                  </td>
                  <td style={{ padding: padCell, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.submitted_at_iso || "—"}
                  </td>
                  <td style={{ padding: padCell, textAlign: "right" }}>
                    {ms(r.ms_enter_to_submit)}
                  </td>
                  <td style={{ padding: padCell, textAlign: "right" }}>
                    <button
                      className="btn ghost"
                      style={{ padding: compact ? ".25rem .6rem" : undefined }}
                      onClick={() => {
                        try {
                          const perPostHash = extractPerPostFromRosterRow(r) || {};
                          const names = nameStore;

                          const perPost = Object.entries(perPostHash).map(([post_id, rawAgg]) => {
                            const agg = rawAgg || {};

                            const dwell_s = Number.isFinite(agg.dwell_s)
                              ? Number(agg.dwell_s)
                              : Number.isFinite(agg.dwell_ms)
                                ? Number(agg.dwell_ms) / 1000
                                : 0;

                            const rawComment = String(agg.comment_text || "").trim();
                            const hasRealComment = !!(rawComment && !/^[-—\s]+$/.test(rawComment));

                            return {
                              post_id,
                              name: names[post_id] || "",
                              reacted: Number(agg.reacted) === 1,
                              expandable: Number(agg.expandable) === 1,
                              expanded: Number(agg.expanded) === 1,
                              commented: Number(agg.commented) === 1 || hasRealComment,
                              saved: IG ? Number(agg.saved) === 1 : false,
                              shared: !!(
                                agg.shared ||
                                (
                                  agg.share_target &&
                                  String(agg.share_target).trim() &&
                                  !String(agg.share_target).trim().startsWith("[Ljava.lang.Object;@")
                                )
                              ),
                              reported: Number(agg.reported) === 1,
                              comment_text: rawComment,
                              dwell_s,
                            };
                          });

                          setDetailSubmission({
                            session_id: r.session_id,
                            participant_id: r.participant_id ?? null,
                            submitted_at_iso: r.submitted_at_iso ?? null,
                            ms_enter_to_submit: r.ms_enter_to_submit ?? null,
                            perPost,
                          });
                          setDetailOpen(true);
                        } catch (err) {
                          console.error("Participant Details build failed:", err, r);
                          alert("Failed to open details (see console).");
                        }
                      }}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {typeof limit !== "number" && visible.length < sorted.length && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: ".5rem" }}>
              <button
                className="btn"
                onClick={() => setPageSize((s) => Math.min(s + 25, sorted.length))}
                style={{ padding: compact ? ".3rem .75rem" : undefined }}
              >
                Show more
              </button>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: ".5rem" }}>
        {error ? <div style={{ color: "crimson", fontSize: ".85rem" }}>{error}</div> : <span />}
        {loading && !usingSimulated && <div className="subtle" style={{ fontSize: ".85rem" }}>Refreshing…</div>}
      </div>

      <ParticipantDetailModal
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailSubmission(null);
        }}
        submission={detailSubmission}
      />
    </div>
  );
}