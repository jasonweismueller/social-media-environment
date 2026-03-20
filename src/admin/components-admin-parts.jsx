// components-admin-parts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  loadParticipantsRoster,
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

const sShort = (n) => (Number.isFinite(Number(n)) ? `${Math.round(Number(n))}s` : "—");

const isIGApp = () => String(APP || "").toLowerCase() === "ig";

function labelForKey(key, nameMap) {
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
      like: 0.55,
      love: 0.18,
      care: 0.08,
      haha: 0.06,
      wow: 0.05,
      sad: 0.04,
      angry: 0.04,
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
      helpful: 0.75,
      not_helpful: 0.25,
    },
    savedRate: 0.08,
  },
};

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
    reactionMix: {
      ...DEFAULT_SIM_CONFIG.controlled.reactionMix,
      ...(simConfig?.controlled?.reactionMix || {}),
    },
    noteHelpfulMix: {
      ...DEFAULT_SIM_CONFIG.controlled.noteHelpfulMix,
      ...(simConfig?.controlled?.noteHelpfulMix || {}),
    },
  };

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
        reacted = chance(rng, controlledCfg.reactedRate) ? 1 : 0;
        reaction_type = reacted ? weightedChoice(rng, controlledCfg.reactionMix, "like") : "";

        expanded = expandableAvailable && chance(rng, controlledCfg.expandedRate) ? 1 : 0;

        commented = chance(rng, controlledCfg.commentedRate) ? 1 : 0;
        comment_texts = commented ? `Simulated comment ${i + 1} on ${nameStore[id] || id}` : "";

        saved = savedAvailable && chance(rng, controlledCfg.savedRate) ? 1 : 0;

        sharedFlag = shareAvailable && chance(rng, controlledCfg.sharedRate) ? 1 : 0;
        share_target = sharedFlag
          ? weightedChoice(
              rng,
              { "Friend 1": 1, "Friend 2": 1, "Friend 3": 1, "Friend 4": 1 },
              "Friend 1"
            )
          : "";
        share_text = sharedFlag && chance(rng, 0.45) ? "Check this out" : "";

        reported_misinfo = chance(rng, controlledCfg.reportedRate) && post?.adType !== "ad" ? 1 : 0;

        cta_clicked = ctaAvailable && chance(rng, controlledCfg.ctaClickedRate) ? 1 : 0;

        bio_opened = bioAvailable && chance(rng, controlledCfg.bioOpenedRate) ? 1 : 0;
        bio_url_clicked = bioAvailable && chance(rng, controlledCfg.bioUrlClickedRate) ? 1 : 0;
        if (!bio_opened && bio_url_clicked) bio_opened = 1;

        mention_clicked = mentionAvailable && chance(rng, controlledCfg.mentionClickedRate) ? 1 : 0;

        note_opened = noteAvailable && chance(rng, controlledCfg.noteOpenedRate) ? 1 : 0;
        note_view_details = noteAvailable && chance(rng, controlledCfg.noteViewDetailsRate) ? 1 : 0;
        note_link_clicked = noteAvailable && chance(rng, controlledCfg.noteLinkClickedRate) ? 1 : 0;
        note_helpful_rated = noteAvailable && chance(rng, controlledCfg.noteHelpfulRatedRate) ? 1 : 0;
        note_helpful_value = note_helpful_rated
          ? weightedChoice(rng, controlledCfg.noteHelpfulMix, "helpful")
          : "";

        if (!note_opened && (note_view_details || note_link_clicked || note_helpful_rated)) {
          note_opened = 1;
        }
      } else {
        reacted = chance(rng, randomCfg.reactedBase + interest * randomCfg.reactedInterestWeight) ? 1 : 0;
        reaction_type = reacted
          ? weightedChoice(rng, DEFAULT_SIM_CONFIG.controlled.reactionMix, "like")
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
              { "Friend 1": 1, "Friend 2": 1, "Friend 3": 1, "Friend 4": 1 },
              "Friend 1"
            )
          : "";
        share_text = sharedFlag && chance(rng, 0.45) ? "Check this out" : "";

        reported_misinfo =
          chance(rng, noteAvailable ? randomCfg.reportedNoteBase : randomCfg.reportedBase) &&
          post?.adType !== "ad"
            ? 1
            : 0;

        cta_clicked = ctaAvailable && chance(rng, randomCfg.ctaBase + interest * randomCfg.ctaInterestWeight) ? 1 : 0;

        bio_opened = bioAvailable && chance(rng, randomCfg.bioOpenBase + interest * randomCfg.bioOpenInterestWeight) ? 1 : 0;
        bio_url_clicked = bio_opened && chance(rng, randomCfg.bioUrlGivenOpen) ? 1 : 0;

        mention_clicked = mentionAvailable && chance(rng, randomCfg.mentionClickedBase) ? 1 : 0;

        note_opened = noteAvailable && chance(rng, randomCfg.noteOpenBase + interest * randomCfg.noteOpenInterestWeight) ? 1 : 0;
        note_view_details = note_opened && chance(rng, randomCfg.noteViewDetailsGivenOpen) ? 1 : 0;
        note_link_clicked = note_opened && chance(rng, randomCfg.noteLinkGivenOpen) ? 1 : 0;
        note_helpful_rated = note_opened && chance(rng, randomCfg.noteHelpfulGivenOpen) ? 1 : 0;
        note_helpful_value = note_helpful_rated
          ? weightedChoice(rng, DEFAULT_SIM_CONFIG.controlled.noteHelpfulMix, "helpful")
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
  const [simConfig, setSimConfig] = useState(DEFAULT_SIM_CONFIG);

  const abortRef = useRef(null);
  const nameStore = postNamesMap || readPostNames(projectId, feedId) || {};

  const caps = useMemo(() => capabilitySummary(posts, IG), [posts, IG]);

  useEffect(() => {
    setProjectIdUtil(projectId, { persist: true, updateUrl: false });
  }, [projectId]);

  const mkCacheKey = (id, pid = projectId) =>
    `participants_cache_v12::${APP || "app"}::${pid || "no-project"}::${id || "noid"}`;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        [group]: {
          ...prev.controlled[group],
          [key]: Math.max(0, Number(value) || 0),
        },
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

  const clearSimulation = () => {
    setUsingSimulated(false);
    setSimRows([]);
  };

  const downloadCsv = () => {
    if (!effectiveRows?.length) return;

    const normalizedAll = normalizeRowsForCsv(effectiveRows);
    const keySet = new Set();
    normalizedAll.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
    const keys = Array.from(keySet);
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
      `${usingSimulated ? "_SIMULATED" : ""}.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const inputStyle = { width: "100%" };

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

          <input
            type="number"
            min="1"
            step="1"
            value={simCount}
            onChange={(e) => setSimCount(Math.max(1, Number(e.target.value) || 1))}
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
            disabled={!effectiveRows?.length}
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: ".5rem .75rem",
            }}
          >
            <label>
              <div className="subtle">Reacted %</div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round((simConfig.controlled.reactedRate || 0) * 100)}
                onChange={(e) => updateControlled("reactedRate", Number(e.target.value) / 100)}
                style={inputStyle}
              />
            </label>

            {caps.hasExpandable && (
              <label>
                <div className="subtle">Expanded %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round((simConfig.controlled.expandedRate || 0) * 100)}
                  onChange={(e) => updateControlled("expandedRate", Number(e.target.value) / 100)}
                  style={inputStyle}
                />
              </label>
            )}

            <label>
              <div className="subtle">Commented %</div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round((simConfig.controlled.commentedRate || 0) * 100)}
                onChange={(e) => updateControlled("commentedRate", Number(e.target.value) / 100)}
                style={inputStyle}
              />
            </label>

            {caps.hasSaved && (
              <label>
                <div className="subtle">Saved %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round((simConfig.controlled.savedRate || 0) * 100)}
                  onChange={(e) => updateControlled("savedRate", Number(e.target.value) / 100)}
                  style={inputStyle}
                />
              </label>
            )}

            {caps.hasShare && (
              <label>
                <div className="subtle">Shared %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round((simConfig.controlled.sharedRate || 0) * 100)}
                  onChange={(e) => updateControlled("sharedRate", Number(e.target.value) / 100)}
                  style={inputStyle}
                />
              </label>
            )}

            <label>
              <div className="subtle">Reported %</div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round((simConfig.controlled.reportedRate || 0) * 100)}
                onChange={(e) => updateControlled("reportedRate", Number(e.target.value) / 100)}
                style={inputStyle}
              />
            </label>

            {caps.hasCta && (
              <label>
                <div className="subtle">CTA clicked %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round((simConfig.controlled.ctaClickedRate || 0) * 100)}
                  onChange={(e) => updateControlled("ctaClickedRate", Number(e.target.value) / 100)}
                  style={inputStyle}
                />
              </label>
            )}

            {caps.hasBio && (
              <>
                <label>
                  <div className="subtle">Bio opened %</div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round((simConfig.controlled.bioOpenedRate || 0) * 100)}
                    onChange={(e) => updateControlled("bioOpenedRate", Number(e.target.value) / 100)}
                    style={inputStyle}
                  />
                </label>

                <label>
                  <div className="subtle">Bio URL clicked %</div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round((simConfig.controlled.bioUrlClickedRate || 0) * 100)}
                    onChange={(e) => updateControlled("bioUrlClickedRate", Number(e.target.value) / 100)}
                    style={inputStyle}
                  />
                </label>
              </>
            )}

            {caps.hasMention && (
              <label>
                <div className="subtle">Mention clicked %</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round((simConfig.controlled.mentionClickedRate || 0) * 100)}
                  onChange={(e) => updateControlled("mentionClickedRate", Number(e.target.value) / 100)}
                  style={inputStyle}
                />
              </label>
            )}

            {caps.hasNote && (
              <>
                <label>
                  <div className="subtle">Note opened %</div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round((simConfig.controlled.noteOpenedRate || 0) * 100)}
                    onChange={(e) => updateControlled("noteOpenedRate", Number(e.target.value) / 100)}
                    style={inputStyle}
                  />
                </label>

                <label>
                  <div className="subtle">Note details %</div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round((simConfig.controlled.noteViewDetailsRate || 0) * 100)}
                    onChange={(e) => updateControlled("noteViewDetailsRate", Number(e.target.value) / 100)}
                    style={inputStyle}
                  />
                </label>

                <label>
                  <div className="subtle">Note link clicked %</div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round((simConfig.controlled.noteLinkClickedRate || 0) * 100)}
                    onChange={(e) => updateControlled("noteLinkClickedRate", Number(e.target.value) / 100)}
                    style={inputStyle}
                  />
                </label>

                <label>
                  <div className="subtle">Note helpful rated %</div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round((simConfig.controlled.noteHelpfulRatedRate || 0) * 100)}
                    onChange={(e) => updateControlled("noteHelpfulRatedRate", Number(e.target.value) / 100)}
                    style={inputStyle}
                  />
                </label>
              </>
            )}
          </div>

          <div style={{ marginTop: ".75rem", fontWeight: 600 }}>Reaction mix</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: ".5rem",
              marginTop: ".35rem",
            }}
          >
            {Object.keys(simConfig.controlled.reactionMix).map((k) => (
              <label key={k}>
                <div className="subtle">{k}</div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={Number(simConfig.controlled.reactionMix[k] || 0)}
                  onChange={(e) => updateControlledMix("reactionMix", k, e.target.value)}
                  style={inputStyle}
                />
              </label>
            ))}
          </div>

          {caps.hasNote && (
            <>
              <div style={{ marginTop: ".75rem", fontWeight: 600 }}>Note helpful mix</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: ".5rem",
                  marginTop: ".35rem",
                }}
              >
                {Object.keys(simConfig.controlled.noteHelpfulMix).map((k) => (
                  <label key={k}>
                    <div className="subtle">{k}</div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={Number(simConfig.controlled.noteHelpfulMix[k] || 0)}
                      onChange={(e) => updateControlledMix("noteHelpfulMix", k, e.target.value)}
                      style={inputStyle}
                    />
                  </label>
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