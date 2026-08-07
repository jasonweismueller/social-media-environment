// components-ui-posts.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  REACTION_META,
  sumSelectedReactions,
  topReactions,
  fakeNamesFor,
  displayTimeForPost,
  getAvatarPool,
  pickDeterministic,
  pickUniqueDeterministic,
  getImagePool,
  buildDeterministicAssignmentMap,
  randomizeBioStats,
  fallbackEngagementStats,
} from "../utils";

import { FB_FEMALE_NAMES, FB_MALE_NAMES, FB_COMPANY_NAMES } from "./names";
import { InterventionBlock } from "./components-ui-interventions";
import { FacebookBioHoverCard } from "./ui-posts-bio-facebook";
import { FacebookMobileBioSheet } from "./ui-posts-bio-mobile-facebook";



import {
  FacebookCommentModalDesktop,
  FacebookShareModalDesktop,
} from "./ui-post-desktop-facebook";

import {
  FacebookMenuSheet,
  FacebookCommentSheetMobile,
  FacebookShareSheetMobile,
} from "./ui-post-mobile-facebook";

import {
  IconBadge,
  IconDots,
  IconGlobe,
  IconThumb,
  IconComment,
  IconShare,
  ActionBtn,
  PostText,
  NamesPeek,
  IconVolume,
  IconVolumeMute,
} from "../ui-core";

const DISPLAYED_POST_SNAPSHOT_PREFIX = "studyfeed:displayed_post_snapshot";
const DISPLAYED_POST_SNAPSHOT_LATEST_PREFIX = "studyfeed:displayed_post_snapshot_latest";

// Left rail decorative chrome — generic, fixed, identical for every
// participant/condition (nothing here is randomized or content-dependent,
// so there's nothing for it to confound). Real Facebook's own nav; no
// personalization attempted since we have no real identity to reflect.
// Per a real Facebook screenshot the user provided: the left rail is
// dominated by fixed nav destinations (often 10+, enough to fill the whole
// viewport with none of "Your shortcuts" visible without scrolling) — the
// original 6-item list read as having too many shortcuts relative to nav by
// comparison. Expanded to match; shortcuts are capped lower for the same
// reason (see `pickShortcutsForHeight`'s callers).
export const LEFT_RAIL_NAV_ITEMS = [
  "Friends", "Memories", "Saved", "Groups", "Reels", "Marketplace",
  "Feeds", "Ads Manager", "Birthdays", "Events", "Gaming Video", "Crisis response",
];
// A larger pool than any single feed needs — callers pick a height-filling
// prefix (see `pickShortcutsForHeight`) rather than always showing all of
// them, so a short viewport doesn't get a comically long list forced in.
export const LEFT_RAIL_SHORTCUT_POOL = [
  "Photography Club", "Local Marketplace", "Book Swap", "Hiking Buddies",
  "Weekend Board Games", "Home Baking Tips", "City Cyclists", "Language Exchange",
  "Vintage Cameras", "Community Garden", "Running Club", "Film Discussion Group",
];
export function pickShortcutsForHeight(count) {
  return LEFT_RAIL_SHORTCUT_POOL.slice(0, Math.max(1, Math.min(count, LEFT_RAIL_SHORTCUT_POOL.length)));
}

// Real-looking (still purely decorative) colored icon badges for the left
// rail's nav row — same fixed, content-independent chrome as the labels
// themselves, just no longer a flat placeholder square. One glyph per
// LEFT_RAIL_NAV_ITEMS entry, roughly matching real Facebook's own icon
// colors so the row reads as genuine nav, not a generic list. Also reused
// for LEFT_RAIL_SHORTCUT_ICONS below — same visual language, different
// glyph/color per shortcut so the shortcuts list doesn't read as one entry
// copy-pasted N times.
function RailNavIconGlyph({ bg, children }) {
  return (
    <span
      className="rail-real-icon"
      style={{ background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

export const LEFT_RAIL_ICONS = {
  Friends: (
    <RailNavIconGlyph bg="#1877f2">
      <circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.4" /><path d="M15 20a4.2 4.2 0 0 1 7.5-2.6" />
    </RailNavIconGlyph>
  ),
  Memories: (
    <RailNavIconGlyph bg="#31a3f2">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
    </RailNavIconGlyph>
  ),
  Saved: (
    <RailNavIconGlyph bg="#8b5cf6">
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1Z" />
    </RailNavIconGlyph>
  ),
  Groups: (
    <RailNavIconGlyph bg="#06b6ae">
      <circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" />
      <path d="M2.8 19.5a5.3 5.3 0 0 1 10.4 0M10.8 19.5a5.3 5.3 0 0 1 10.4 0" />
    </RailNavIconGlyph>
  ),
  Reels: (
    <RailNavIconGlyph bg="#f33f6e">
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      <path d="M16 10.5 21 7.5v9L16 13.5Z" fill="#fff" stroke="none" />
    </RailNavIconGlyph>
  ),
  Marketplace: (
    <RailNavIconGlyph bg="#0ea5e9">
      <path d="M4 9h16l-1.4 10.2a1.5 1.5 0 0 1-1.5 1.3H6.9a1.5 1.5 0 0 1-1.5-1.3L4 9Z" />
      <path d="M8 9V6.5a4 4 0 0 1 8 0V9" />
    </RailNavIconGlyph>
  ),
  Feeds: (
    <RailNavIconGlyph bg="#64748b">
      <path d="M5 6h14M5 12h14M5 18h9" />
    </RailNavIconGlyph>
  ),
  "Ads Manager": (
    <RailNavIconGlyph bg="#2563eb">
      <path d="M5 20V11M12 20V4M19 20v-7" />
      <path d="M3 20h18" />
    </RailNavIconGlyph>
  ),
  Birthdays: (
    <RailNavIconGlyph bg="#f0384a">
      <path d="M12 3c-1.3 0-1.9 2.2-.8 3.4.5.6 1.3.6 1.8 0C14.1 5.2 13.3 3 12 3Z" />
      <rect x="4" y="10" width="16" height="10" rx="1.5" />
      <path d="M4 14h16M12 10v10" />
    </RailNavIconGlyph>
  ),
  Events: (
    <RailNavIconGlyph bg="#f0384a">
      <path d="M12 3.5l2.1 4.4 4.9.7-3.5 3.4.8 4.9-4.3-2.3-4.3 2.3.8-4.9-3.5-3.4 4.9-.7Z" />
    </RailNavIconGlyph>
  ),
  "Gaming Video": (
    <RailNavIconGlyph bg="#1877f2">
      <rect x="3" y="8" width="18" height="9" rx="4.2" />
      <path d="M8 10.5v4M6 12.5h4" />
      <circle cx="16" cy="11" r="1" fill="#fff" stroke="none" />
      <circle cx="18.3" cy="13.3" r="1" fill="#fff" stroke="none" />
    </RailNavIconGlyph>
  ),
  "Crisis response": (
    <RailNavIconGlyph bg="#0ea5e9">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.3" /><circle cx="12" cy="12" r="1" fill="#fff" stroke="none" />
    </RailNavIconGlyph>
  ),
};

// One distinct glyph per LEFT_RAIL_SHORTCUT_POOL entry — per direct
// feedback, these are different Facebook groups, so they shouldn't all
// share one generic "people" icon the way a single flat placeholder would.
// `LEFT_RAIL_SHORTCUT_ICON_DEFAULT` is the fallback for any pool entry that
// somehow isn't in this map (kept from the original single-icon design).
export const LEFT_RAIL_SHORTCUT_ICON_DEFAULT = (
  <RailNavIconGlyph bg="#8a8d91">
    <circle cx="9" cy="9" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <circle cx="17" cy="10" r="2.3" /><path d="M15 20a4.1 4.1 0 0 1 7.3-2.5" />
  </RailNavIconGlyph>
);
// Deprecated alias, kept for compatibility with any other caller that
// hasn't switched to LEFT_RAIL_SHORTCUT_ICONS yet.
export const RAIL_SHORTCUT_ICON = LEFT_RAIL_SHORTCUT_ICON_DEFAULT;

export const LEFT_RAIL_SHORTCUT_ICONS = {
  "Photography Club": (
    <RailNavIconGlyph bg="#0ea5a4">
      <rect x="3" y="7" width="18" height="12" rx="2.5" />
      <path d="M9 7l1.2-2h3.6L15 7" />
      <circle cx="12" cy="13" r="3.2" />
    </RailNavIconGlyph>
  ),
  "Local Marketplace": (
    <RailNavIconGlyph bg="#0891b2">
      <path d="M4 10 5 4h14l1 6" />
      <path d="M4 10v9a1 1 0 0 0 1 1h3v-6h8v6h3a1 1 0 0 0 1-1v-9" />
    </RailNavIconGlyph>
  ),
  "Book Swap": (
    <RailNavIconGlyph bg="#d97706">
      <path d="M12 6c-2-1.5-5-2-8-1.3V17c3-.7 6-.2 8 1.3 2-1.5 5-2 8-1.3V4.7c-3-.7-6-.2-8 1.3Z" />
      <path d="M12 6v12.3" />
    </RailNavIconGlyph>
  ),
  "Hiking Buddies": (
    <RailNavIconGlyph bg="#16a34a">
      <path d="M3 19 9.5 8l3.5 5.5L15 10l6 9Z" />
      <circle cx="8.3" cy="6" r="1.3" fill="#fff" stroke="none" />
    </RailNavIconGlyph>
  ),
  "Weekend Board Games": (
    <RailNavIconGlyph bg="#dc2626">
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <circle cx="9" cy="9" r="1" fill="#fff" stroke="none" />
      <circle cx="15" cy="9" r="1" fill="#fff" stroke="none" />
      <circle cx="9" cy="15" r="1" fill="#fff" stroke="none" />
      <circle cx="15" cy="15" r="1" fill="#fff" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="#fff" stroke="none" />
    </RailNavIconGlyph>
  ),
  "Home Baking Tips": (
    <RailNavIconGlyph bg="#f59e0b">
      <path d="M12 3c-1 0-1.8.8-1.8 1.8 0 .6.3 1.1.7 1.5-1.9.5-3.4 2-3.8 3.9h10a5 5 0 0 0-3.8-3.9c.4-.4.7-.9.7-1.5C13.8 3.8 13 3 12 3Z" />
      <path d="M6 10h12l-1.3 8.5a2 2 0 0 1-2 1.7H9.3a2 2 0 0 1-2-1.7L6 10Z" />
    </RailNavIconGlyph>
  ),
  "City Cyclists": (
    <RailNavIconGlyph bg="#2563eb">
      <circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" />
      <path d="M6 17l4.5-9h3L17 14M9.5 8h3" />
    </RailNavIconGlyph>
  ),
  "Language Exchange": (
    <RailNavIconGlyph bg="#7c3aed">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.5 2.3 2.5 15 0 17M12 3.5c-2.5 2.3-2.5 15 0 17" />
    </RailNavIconGlyph>
  ),
  "Vintage Cameras": (
    <RailNavIconGlyph bg="#78716c">
      <circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3.2" />
      <path d="M12 4.5v2.3M12 17.2v2.3M4.5 12h2.3M17.2 12h2.3" />
    </RailNavIconGlyph>
  ),
  "Community Garden": (
    <RailNavIconGlyph bg="#22c55e">
      <path d="M12 21V10" />
      <path d="M12 10c0-4 3-6 7-6 0 4-3 7-7 6Z" />
      <path d="M12 13c0-3-2.5-5-6-5 0 3 2.5 6 6 5Z" />
    </RailNavIconGlyph>
  ),
  "Running Club": (
    <RailNavIconGlyph bg="#ef4444">
      <circle cx="14.5" cy="5" r="1.6" fill="#fff" stroke="none" />
      <path d="M9 20l2.5-4 3-1.5-1-4-3 1-2-3M12.5 14.5l3 1 2.5 4" />
    </RailNavIconGlyph>
  ),
  "Film Discussion Group": (
    <RailNavIconGlyph bg="#4b5563">
      <path d="M3.5 10.5 4.5 19a1.5 1.5 0 0 0 1.5 1.3h12a1.5 1.5 0 0 0 1.5-1.3l1-8.5Z" />
      <path d="M3.5 10.5 5 5.5l3 2.2 1.6-3.4 3 2.2 1.6-3.2 3 2.2 1.8-2 1.5 3.5-16.5 3.5Z" />
    </RailNavIconGlyph>
  ),
};

// Decorative "Contacts" rail generator — real-looking, but purely cosmetic:
// reuses the exact same avatar/name pools as real post authors, seeded
// distinctly ("rail-contacts" vs "female-avatars"/"female-names" etc.) so it
// never mirrors any specific post's assigned author. Confound-safe for the
// same reason author-name/avatar randomization already is: identical
// mechanism, same pool, seeded by run+participant — never by condition or
// content. Exported so `App-facebook.jsx`'s own separate `PageWithRails`
// (the one actually wrapping the live participant feed — this file's own
// `Feed.rail-right` is only reachable when `Feed` is mounted standalone,
// e.g. the admin's Feed Preview) can build an identical contacts list
// instead of hand-rolling a second copy of this logic. `femalePool`/
// `malePool` are passed empty by a caller that wants contacts shown without
// avatar photos (the separate "surrounding avatars" toggle) — `avatarUrl`
// then comes back falsy for every contact and the caller's own blank-circle
// fallback renders instead.
export function buildRailContacts({ femalePool, malePool, runSeed, app, projectId, feedId, count = 14 }) {
  const contactSeedBase = [runSeed || "run", app || "app", projectId || "proj", feedId || "feed"];
  // Gender is picked once per contact, then BOTH the name and the avatar are
  // drawn from that same gender's pool — a real post's avatar/name pairing
  // is likewise driven by one shared `authorType`, just admin-chosen there
  // instead of auto-picked here. Picking name and avatar independently (the
  // original approach) could pair a female name with a male photo or vice
  // versa, since each was drawn from a pool merging both genders together.
  // Separate running per-gender indices (not the shared `i`) keep
  // `pickUniqueDeterministic`'s no-repeats guarantee working correctly
  // within each gender's own pool.
  let femaleIdx = 0;
  let maleIdx = 0;
  return Array.from({ length: count }, (_, i) => {
    const isFemale =
      pickDeterministic(["female", "male"], [...contactSeedBase, "rail-contacts-gender", i]) === "female";
    const genderIdx = isFemale ? femaleIdx++ : maleIdx++;
    const namePool = isFemale ? FB_FEMALE_NAMES : FB_MALE_NAMES;
    const genderAvatarPool = isFemale ? (femalePool || []) : (malePool || []);
    return {
      id: `rail-contact-${i}`,
      name:
        pickUniqueDeterministic(namePool, genderIdx, [...contactSeedBase, "rail-contacts-name", isFemale ? "f" : "m"]) ||
        `Contact ${i + 1}`,
      avatarUrl: pickUniqueDeterministic(genderAvatarPool, genderIdx, [...contactSeedBase, "rail-contacts-avatar", isFemale ? "f" : "m"]),
      // ~30% online, deterministic per contact — matches the light sprinkling
      // of green dots on a real contacts list rather than an implausible
      // "everyone's online" look.
      online: pickDeterministic([true, false, false, false], [...contactSeedBase, "rail-contacts-online", i]) === true,
    };
  });
}

function snapshotKeyPart_(value) {
  return encodeURIComponent(String(value == null ? "" : value));
}

function displayedPostSnapshotKey({ projectId = "", feedId = "", postId = "", participantSeed = "" } = {}) {
  return [
    DISPLAYED_POST_SNAPSHOT_PREFIX,
    snapshotKeyPart_(projectId),
    snapshotKeyPart_(participantSeed),
    snapshotKeyPart_(feedId),
    snapshotKeyPart_(postId),
  ].join("::");
}

function displayedPostSnapshotLatestKey({ projectId = "", feedId = "", postId = "" } = {}) {
  return [
    DISPLAYED_POST_SNAPSHOT_LATEST_PREFIX,
    snapshotKeyPart_(projectId),
    snapshotKeyPart_(feedId),
    snapshotKeyPart_(postId),
  ].join("::");
}

function safeLocalStorageSet_(key, value) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function saveDisplayedPostSnapshot(snapshot, {
  projectId = "",
  feedId = "",
  postId = "",
  participantSeed = "",
} = {}) {
  const cleanPostId = String(postId || snapshot?.id || snapshot?.__snapshot_post_id || "").trim();
  const cleanFeedId = String(feedId || snapshot?.__snapshot_feed_id || "").trim();
  if (!snapshot || !cleanPostId || !cleanFeedId) return false;

  const payload = JSON.stringify(snapshot);
  const scopedKey = displayedPostSnapshotKey({
    projectId,
    feedId: cleanFeedId,
    postId: cleanPostId,
    participantSeed,
  });
  const latestKey = displayedPostSnapshotLatestKey({
    projectId,
    feedId: cleanFeedId,
    postId: cleanPostId,
  });

  const okScoped = participantSeed ? safeLocalStorageSet_(scopedKey, payload) : true;
  const okLatest = safeLocalStorageSet_(latestKey, payload);
  return !!(okScoped && okLatest);
}



/* --- In-view autoplay hook --- */
function useInViewAutoplay(threshold = 0.6) {
  const wrapRef = React.useRef(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const obs = new IntersectionObserver(
      ([e]) => setInView(!!(e?.isIntersecting && e.intersectionRatio >= threshold)),
      { root: null, threshold: [0, threshold, 1] }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { wrapRef, inView };
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function MenuPortal({ anchorRef, open, onClose, children }) {
  const [coords, setCoords] = React.useState({ top: 0, left: 0, ready: false });

  React.useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef?.current;
    if (!anchor || typeof window === "undefined" || !document?.body) return;

    const update = () => {
      const r = anchor.getBoundingClientRect();
      setCoords({
        top: r.bottom + 4,
        left: r.left,
        ready: true,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  React.useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e) => {
      const menuEl = document.querySelector("#post-menu-portal");
      const inMenu = menuEl && menuEl.contains(e.target);
      const inBtn = anchorRef?.current && anchorRef.current.contains(e.target);
      if (!inMenu && !inBtn) onClose?.();
    };

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !coords.ready || typeof document === "undefined") return null;

  return createPortal(
    <div
      id="post-menu-portal"
      className="menu"
      role="menu"
      style={{
        position: "fixed",
        zIndex: 20000,
        top: coords.top,
        left: coords.left,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/* ----------------------------- Post Card ---------------------------------- */
export function PostCard({
  post,
  onAction,
  disabled,
  registerViewRef,
  respectShowReactions = false,
  flags = { randomize_times: false },
  app,
  projectId,
  feedId,
  runSeed,
  assignedAuthor,
  assignedAvatarUrl,
  participantSeed,
  onDisplayedPostSnapshot,
  // Forces the caption to always render in full, with no "See more"/"See
  // less" at all — used for non-interactive (static) post_reminder survey
  // questions, which show a frozen snapshot of the post rather than a live
  // interactive card. Leaves the real feed and interactive reminders (which
  // should behave exactly like the real feed) untouched, since neither
  // passes this prop.
  alwaysExpandText = false,
  // Purely cosmetic entrance stagger (see the `post-reveal-in` CSS
  // animation below) — which batch-position this card is in among the
  // posts revealed together, so a batch cascades in instead of popping in
  // all at once. Not passed by reminder call sites (post_reminder questions
  // show one frozen post, nothing to cascade), so they render with no
  // stagger — instant, exactly as before.
  revealIndex = null,
  // The "displayed post snapshot" localStorage mechanism below assumes
  // exactly one PostCard renders for a given (projectId, feedId, post.id,
  // participantSeed) tuple at a time — true for the real feed and for a
  // plain single-post reminder, but not for a "recall" reminder's 3-option
  // picker, which renders 3 PostCard instances (the real post plus 2
  // decoys) that all share that same tuple, since they're clones of one
  // post differing only in text. Without this, all 3 would race to write
  // the same localStorage key, and whichever wrote last would silently
  // become "what this participant saw" for every future read — including
  // the recall picker's own next render, corrupting all 3 options to show
  // identical (wrong) content. Set by RecallOptionCard/RecallOptionCardMobile
  // only; every other call site leaves this false, unchanged behavior.
  suppressDisplayedSnapshot = false,
}) {
  const [reportAck, setReportAck] = useState(false);
  const [linkAck, setLinkAck] = useState(false);
  const [expandedState, setExpanded] = useState(false);
  const expanded = alwaysExpandText || expandedState;
  const [showComment, setShowComment] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentFocusTick, setCommentFocusTick] = useState(0);

  const [bioOpen, setBioOpen] = useState(false);
  const [bioHoverTargetEl, setBioHoverTargetEl] = useState(null);
  const bioHideDelayRef = useRef(null);
  const bioShownRef = useRef(false);
  const avatarRef = useRef(null);
  const authorRef = useRef(null);

  const randNamesOn = !!flags?.randomize_names;
  const randAvatarOn = !!(flags?.randomize_avatars ?? flags?.randomize_avatar);
  const randImagesOn = !!flags?.randomize_images;
  const [randImageUrl, setRandImageUrl] = React.useState(null);

  const shouldShowTime = post?.showTime === false ? false : true;

  const forcedRand =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("forcerand") === "1";

  const randomizeOn = forcedRand || (flags?.randomize_times ?? flags?.random_time) === true;

  const timeLabel = shouldShowTime
    ? (displayTimeForPost(post, {
        randomize: randomizeOn,
        seedParts: [runSeed || "run", app || "fb", projectId || "global", feedId || ""],
      }) || "")
    : "";

  const isMobile = useIsMobile();

  const [playbackRate, setPlaybackRate] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const [volume, setVolume] = useState(0);
  const [volOpen, setVolOpen] = useState(false);
  const [volFading, setVolFading] = useState(false);
  const volHideTimer = useRef(null);

  useEffect(() => () => clearTimeout(volHideTimer.current), []);

  useEffect(() => {
    if (volOpen) {
      setVolFading(false);
      return;
    }
    setVolFading(true);
    const t = setTimeout(() => setVolFading(false), 180);
    return () => clearTimeout(t);
  }, [volOpen]);

  const [mySubmittedComment, setMySubmittedComment] = useState(
    post._localMyCommentText || ""
  );
  const [participantComments, setParticipantComments] = useState(
    mySubmittedComment ? 1 : 0
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const dotsRef = useRef(null);

  const menuItems = (
    <div ref={menuRef}>
      <button
        className="menu-item disabled"
        role="menuitem"
        aria-disabled="true"
        tabIndex={-1}
        title="Unavailable in this study"
      >
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12" />
            <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Interested</span>
          <span className="mi-sub">More of your posts will be like this.</span>
        </span>
      </button>

      <button
        className="menu-item disabled"
        role="menuitem"
        aria-disabled="true"
        tabIndex={-1}
        title="Unavailable in this study"
      >
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12" />
            <path d="M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Not interested</span>
          <span className="mi-sub">Less of your posts will be like this.</span>
        </span>
      </button>

      <div className="menu-divider" />

      <button
        className="menu-item"
        role="menuitem"
        tabIndex={0}
        onClick={() => {
          setMenuOpen(false);
          onAction("report_misinformation_click", { post_id: post.id });
          setReportAck(true);
        }}
      >
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <line x1="7" y1="3" x2="7" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M7 4h10l-2 4 2 4H7z" fill="currentColor" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Report post</span>
          <span className="mi-sub">Tell us if it is misinformation.</span>
        </span>
      </button>

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M6 4h12v16l-6-4-6 4V4z" fill="currentColor" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Save post</span>
          <span className="mi-sub">Add this to your saved items.</span>
        </span>
      </button>

      <div className="menu-divider" />

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M18 8a6 6 0 10-12 0v5l-2 2h16l-2-2V8zM9 19a3 3 0 006 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Turn on notifications for this post</span>
        </span>
      </button>

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M8 5L3 12l5 7M16 5l5 7-5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Embed</span>
        </span>
      </button>

      <div className="menu-divider" />

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <rect x="4" y="5" width="16" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Hide post</span>
          <span className="mi-sub">See fewer posts like this.</span>
        </span>
      </button>

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Snooze {post.author} for 30 days</span>
          <span className="mi-sub">Temporarily stop seeing posts.</span>
        </span>
      </button>

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Hide all from {post.author}</span>
          <span className="mi-sub">Stop seeing posts from this Page.</span>
        </span>
      </button>

      <div className="menu-divider" />

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Dismiss</span>
        </span>
      </button>
    </div>
  );

  const ALL_REACTIONS = {
    like: "👍",
    love: "❤️",
    care: "🤗",
    haha: "😆",
    wow: "😮",
    sad: "😢",
    angry: "😡",
  };

  const [myReaction, setMyReaction] = useState(null);

  const OPEN_DELAY = 400;
  const CLOSE_DELAY = 250;
  const SUPPRESS_MS = 300;
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const suppressHoverUntil = useRef(0);

  useEffect(() => {
    return () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, []);

  const { wrapRef, inView } = useInViewAutoplay(0.6);

  const scheduleOpen = () => {
    if (disabled) return;
    if (Date.now() < suppressHoverUntil.current) return;
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => {
      if (Date.now() < suppressHoverUntil.current) return;
      setFlyoutOpen(true);
    }, OPEN_DELAY);
  };

  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFlyoutOpen(false), CLOSE_DELAY);
  };

  const closeNowAndSuppress = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setFlyoutOpen(false);
    suppressHoverUntil.current = Date.now() + SUPPRESS_MS;
  };

  useEffect(() => {
    if (!flyoutOpen) return;

    const onDocPointerDown = (e) => {
      const inFlyout = e.target.closest?.(".react-flyout");
      const inLikeWrap = e.target.closest?.(".like-wrap");
      if (!inFlyout && !inLikeWrap) setFlyoutOpen(false);
    };

    document.addEventListener("pointerdown", onDocPointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, {
        capture: true,
      });
    };
  }, [flyoutOpen]);

  const showReactions = post.showReactions ?? false;
  const ALL_RX_KEYS = useMemo(() => Object.keys(REACTION_META), []);

  // Opt-in per feed ("Realistic engagement counts" toggle, Feeds → Settings
  // → Behavior) — fills in plausible reaction/comment/share numbers only
  // where the admin left a post's own counts blank, never overriding an
  // explicitly-authored value. See fallbackEngagementStats (utils-core.js)
  // for why this can't introduce a between-condition confound.
  const realisticEngagementOn = !!flags?.realistic_engagement;
  const engagementFallback = useMemo(
    () => (realisticEngagementOn ? fallbackEngagementStats(post.id) : null),
    [realisticEngagementOn, post.id]
  );

  const baseReactions = useMemo(() => {
    const explicit = post.reactions || {};
    const hasExplicit = Object.values(explicit).some((v) => Number(v) > 0);
    // Reaction *numbers* only ever fill in when reactions are already meant
    // to be visible for this post (`showReactions`) — that toggle stays the
    // real on/off switch; this only stops it from displaying a bare "0".
    const source =
      !hasExplicit && showReactions && engagementFallback
        ? engagementFallback.reactions
        : explicit;
    return {
      like: 0,
      love: 0,
      care: 0,
      haha: 0,
      wow: 0,
      sad: 0,
      angry: 0,
      ...source,
    };
  }, [post.reactions, showReactions, engagementFallback]);

  const liveReactions = useMemo(() => {
    const obj = { ...baseReactions };
    if (myReaction) obj[myReaction] = (obj[myReaction] || 0) + 1;
    return obj;
  }, [baseReactions, myReaction]);

  const explicitCommentCount = Number(post.metrics?.comments) || 0;
  // Comments/shares have no dedicated show/hide toggle of their own — they
  // already display whenever nonzero regardless of `showReactions` — so the
  // fallback applies independently of it too, matching that existing rule.
  const baseCommentCount =
    explicitCommentCount > 0
      ? explicitCommentCount
      : engagementFallback
        ? engagementFallback.comments
        : 0;
  const displayedCommentCount = baseCommentCount + participantComments;

  const explicitShareCount = Number(post.metrics?.shares) || 0;
  const baseShareCount =
    explicitShareCount > 0
      ? explicitShareCount
      : engagementFallback
        ? engagementFallback.shares
        : 0;
  const [shareCountLocal, setShareCountLocal] = useState(0);
  const displayedShareCount = baseShareCount + shareCountLocal;

  const totalReactions = useMemo(
    () => sumSelectedReactions(liveReactions, ALL_RX_KEYS),
    [liveReactions, ALL_RX_KEYS]
  );

  const top3 = useMemo(
    () => topReactions(liveReactions, ALL_RX_KEYS, 3),
    [liveReactions, ALL_RX_KEYS]
  );

  const hasRx = respectShowReactions
    ? showReactions && totalReactions > 0
    : totalReactions > 0;

  const click = (action, meta = {}) => {
    if (!disabled) onAction(action, { post_id: post.id, ...meta });
  };

  const isNewsPost = String(post?.adType || "none") === "news";
  const newsDomain = String(post?.newsDomain || post?.adDomain || "").trim();
  const newsHeadline = String(post?.newsHeadline || post?.adHeadline || "").trim();
  const newsDescription = String(post?.newsDescription || post?.adSubheadline || "").trim();
  const newsUrl = String(post?.newsUrl || post?.adUrl || "").trim();

  const onNewsLinkClick = React.useCallback((surface = "preview") => {
    if (disabled) return;
    click("news_link_click", {
      surface,
      href: newsUrl,
      domain: newsDomain,
      headline: newsHeadline,
    });
    setLinkAck(true);
  }, [disabled, newsUrl, newsDomain, newsHeadline]);

  const postForCounts = useMemo(
    () => ({
      ...post,
      showReactions: true,
      metrics: {
        ...post.metrics,
        comments: displayedCommentCount,
        shares: displayedShareCount,
        reactions: totalReactions,
      },
    }),
    [post, displayedCommentCount, displayedShareCount, totalReactions]
  );

  const onLike = () => {
    if (isMobile) {
      setFlyoutOpen((v) => !v);
      return;
    }

    closeNowAndSuppress();
    setMyReaction((prev) => {
      if (prev == null) {
        click("react_pick", { type: "like", prev: null });
        return "like";
      }
      click("react_clear", { type: prev, prev });
      return null;
    });
  };

  const onPickReaction = (key) => {
    setMyReaction((prev) => {
      if (prev === key) {
        click("react_clear", { type: key, prev });
        return null;
      }
      click("react_pick", { type: key, prev });
      return key;
    });
    closeNowAndSuppress();
  };

  const onShare = () => {
    setFlyoutOpen(false);
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setShowShare(true);
    click("share_open");
  };

  const onConfirmShare = (data = {}) => {
  setShareCountLocal((n) => n + 1);

  click("share_target", {
    friend: data.friend || data.friends || "",
    friends: data.friends || data.friend || "",
    message: data.message || "",
  });

  setShowShare(false);
};

  const onExpand = () => {
    setExpanded(true);
    click("expand_text");
  };

  const onCollapse = () => {
    setExpanded(false);
    click("collapse_text");
  };

  const onOpenComment = () => {
    setFlyoutOpen(false);
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setShowComment(true);
    setCommentFocusTick((n) => n + 1);
    click("comment_open");
  };

  const onSubmitComment = () => {
    const txt = commentText.trim();
    if (!txt) return;

    click("comment_submit", { text: txt, length: txt.length });
    setMySubmittedComment(txt);
    setParticipantComments((c) => c + 1);
    setCommentText("");

    if (isMobile) {
      setShowComment(false);
    }
  };

  const onImageOpen = () => {
    if (post.image) click("image_open", { alt: post.image.alt || "" });
  };

  const videoRef = useRef(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);

  const authorType =
    post.authorType === "male" || post.authorType === "company"
      ? post.authorType
      : "female";

  const seedParts = [
    runSeed || "run",
    app || "app",
    projectId || "proj",
    feedId || "feed",
    String(post.id ?? ""),
  ];

  const displayAuthor = React.useMemo(() => {
    if (!randNamesOn && post.author) return post.author;
    return assignedAuthor || post.author || (authorType === "company" ? "Sponsored" : "User");
  }, [randNamesOn, assignedAuthor, post.author, authorType]);

  const displayAvatar = randAvatarOn
    ? assignedAvatarUrl || post.avatarUrl || null
    : post.avatarUrl || null;

  React.useEffect(() => {
    let cancelled = false;
    const hasImage = !!(post?.image && post?.imageMode !== "none");
    if (!randImagesOn || !hasImage) {
      setRandImageUrl(null);
      return;
    }

    const topic = String(post?.topic || post?.imageTopic || "").trim();
    if (!topic) {
      setRandImageUrl(null);
      return;
    }

    (async () => {
      try {
        const list = await getImagePool(topic);
        if (cancelled) return;
        const pick = pickDeterministic(list, [...seedParts, "image"]);
        setRandImageUrl(pick || null);
      } catch {
        if (!cancelled) setRandImageUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    randImagesOn,
    post?.image,
    post?.imageMode,
    post?.topic,
    post?.imageTopic,
    runSeed,
    app,
    projectId,
    feedId,
    post?.id,
  ]);

  const displayImage = React.useMemo(() => {
    const hasImage = !!(post?.image && post?.imageMode !== "none");
    if (!hasImage) return null;
    if (randImagesOn && randImageUrl) {
      return { url: randImageUrl, alt: post.image?.alt || "" };
    }
    return post.image || null;
  }, [post?.image, post?.imageMode, randImagesOn, randImageUrl]);

  const randBiosOn = forcedRand || !!flags?.randomize_bios;

  const displayBio = React.useMemo(() => {
    const rawBio = {
      id: post.id,
      author: displayAuthor,
      avatarUrl: displayAvatar,
      badge: post.badge,
      authorType,
      adType: post.adType,
      bio_posts: post.bio_posts,
      bio_followers: post.bio_followers,
      bio_following: post.bio_following,
      bio_text: post.bio_text,
      bio_url: post.bio_url,
    };

    return randBiosOn
      ? randomizeBioStats(rawBio, { randomize: true, seedParts })
      : rawBio;
  }, [
    randBiosOn,
    post.id,
    post.badge,
    post.bio_posts,
    post.bio_followers,
    post.bio_following,
    post.bio_text,
    post.bio_url,
    post.authorType,
    post.adType,
    displayAuthor,
    displayAvatar,
    authorType,
    runSeed,
    app,
    projectId,
    feedId,
  ]);

  const hasFacebookBio = !!post?.showBio;

  const showBioHover = React.useCallback((el) => {
    if (disabled || isMobile || !hasFacebookBio || !el) return;
    clearTimeout(bioHideDelayRef.current);
    setBioHoverTargetEl(el);

    if (!bioShownRef.current) {
      bioShownRef.current = true;
      onAction?.("bio_open", { post_id: post.id, surface: "desktop" });
    }
  }, [disabled, isMobile, hasFacebookBio, onAction, post?.id]);

  const hideBioHover = React.useCallback(() => {
    clearTimeout(bioHideDelayRef.current);
    bioHideDelayRef.current = setTimeout(() => {
      setBioHoverTargetEl(null);
      bioShownRef.current = false;
    }, 180);
  }, []);

  const attachFacebookBio = React.useCallback((ref) => ({
    ref,
    onClick: (e) => {
      if (disabled || !hasFacebookBio) return;
      if (isMobile) {
        e.preventDefault();
        e.stopPropagation();
        setBioOpen(true);
        onAction?.("bio_open", { post_id: post.id, surface: "mobile" });
      }
    },
    onMouseEnter: !isMobile
      ? () => showBioHover(ref.current)
      : undefined,
    onMouseLeave: !isMobile ? hideBioHover : undefined,
    onFocus: !isMobile
      ? () => showBioHover(ref.current)
      : undefined,
    onBlur: !isMobile ? hideBioHover : undefined,
    tabIndex: hasFacebookBio ? 0 : undefined,
    role: hasFacebookBio ? "button" : undefined,
    "aria-label": hasFacebookBio ? `Open profile for ${displayAuthor || post.author || "this profile"}` : undefined,
  }), [disabled, hasFacebookBio, isMobile, onAction, post?.id, post?.author, displayAuthor, showBioHover, hideBioHover]);

  React.useEffect(() => {
    return () => clearTimeout(bioHideDelayRef.current);
  }, []);


  const displayedSnapshot = React.useMemo(() => {
    if (!post?.id) return null;

    let snapshot;
    try {
      snapshot = JSON.parse(JSON.stringify(post));
    } catch {
      snapshot = { ...post };
    }

    snapshot.author = displayAuthor || snapshot.author || "";

    if (displayAvatar) {
      snapshot.avatarUrl = displayAvatar;
      snapshot.avatarMode = "url";
    }

    if (shouldShowTime && timeLabel) {
      snapshot.time = timeLabel;
      snapshot.showTime = true;
    }

    if (displayImage && displayImage.url) {
      snapshot.image = {
        ...(snapshot.image && typeof snapshot.image === "object" ? snapshot.image : {}),
        ...displayImage,
        url: displayImage.url,
        alt: displayImage.alt || snapshot.image?.alt || snapshot.text || "Post image",
      };
      snapshot.images = null;
      // Store the fully resolved, rendered single image. This is important when
      // the feed uses topic-based image randomization, because the base post may
      // only contain a placeholder/random image mode.
      snapshot.imageMode = "single";
    }

    snapshot.__studyfeed_displayed_snapshot = true;
    snapshot.__snapshot_saved_at_iso = new Date().toISOString();
    snapshot.__snapshot_project_id = String(projectId || "");
    snapshot.__snapshot_feed_id = String(feedId || "");
    snapshot.__snapshot_post_id = String(post.id || "");
    snapshot.__snapshot_participant_seed = String(participantSeed || "");

    return snapshot;
  }, [
    post,
    displayAuthor,
    displayAvatar,
    displayImage,
    shouldShowTime,
    timeLabel,
    projectId,
    feedId,
    participantSeed,
  ]);

  React.useEffect(() => {
    if (suppressDisplayedSnapshot || !displayedSnapshot || !post?.id || !feedId) return;

    saveDisplayedPostSnapshot(displayedSnapshot, {
      projectId,
      feedId,
      postId: post.id,
      participantSeed,
    });

    if (typeof onDisplayedPostSnapshot === "function") {
      onDisplayedPostSnapshot(displayedSnapshot);
    }
  }, [
    suppressDisplayedSnapshot,
    displayedSnapshot,
    post?.id,
    projectId,
    feedId,
    participantSeed,
    onDisplayedPostSnapshot,
  ]);

  const handleDisplayedImageLoad = React.useCallback((event) => {
    if (suppressDisplayedSnapshot || !displayedSnapshot || !post?.id || !feedId) return;

    const imgEl = event?.currentTarget;
    const finalUrl = String(imgEl?.currentSrc || imgEl?.src || displayImage?.url || "").trim();
    if (!finalUrl) return;

    const finalSnapshot = {
      ...displayedSnapshot,
      image: {
        ...(displayedSnapshot.image && typeof displayedSnapshot.image === "object"
          ? displayedSnapshot.image
          : {}),
        ...(displayImage && typeof displayImage === "object" ? displayImage : {}),
        url: finalUrl,
        alt:
          displayImage?.alt ||
          displayedSnapshot.image?.alt ||
          displayedSnapshot.text ||
          "Post image",
      },
      images: null,
      imageMode: "single",
      __snapshot_image_finalized: true,
      __snapshot_image_finalized_at_iso: new Date().toISOString(),
    };

    saveDisplayedPostSnapshot(finalSnapshot, {
      projectId,
      feedId,
      postId: post.id,
      participantSeed,
    });

    if (typeof onDisplayedPostSnapshot === "function") {
      onDisplayedPostSnapshot(finalSnapshot);
    }
  }, [
    suppressDisplayedSnapshot,
    displayedSnapshot,
    post?.id,
    projectId,
    feedId,
    participantSeed,
    displayImage,
    onDisplayedPostSnapshot,
  ]);

  const fmtTime = (s) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, "0");
    return `${m}:${sec}`;
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.muted = true;
    v.volume = 0;

    const onLoadedMeta = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    const onTime = () => setCurrent(v.currentTime || 0);
    const onProg = () => {
      try {
        const b = v.buffered;
        if (b.length) setBufferedEnd(b.end(b.length - 1));
      } catch {}
    };
    const onPlay = () => setIsVideoPlaying(true);
    const onPause = () => setIsVideoPlaying(false);
    const onVol = () => {
      setVolume(v.volume);
      setIsMuted(v.muted);
    };

    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("progress", onProg);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVol);

    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("progress", onProg);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVol);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    const shouldMute = volume === 0;
    if (v.muted !== shouldMute) v.muted = shouldMute;
    setIsMuted(v.muted);
  }, [volume]);

  const onVideoTogglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.paused) {
        await v.play();
        click("video_play");
      } else {
        v.pause();
        click("video_pause");
      }
    } catch {}
  };

  const onVideoEnded = () => {
    setIsVideoPlaying(false);
    click("video_ended");
  };

  const setRate = (r) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = r;
    setPlaybackRate(r);
    setSettingsOpen(false);
    click("video_rate_change", { rate: r });
  };

  const toggleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    const doc = document;
    const isFull =
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement;

    if (isFull) {
      (doc.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.mozCancelFullScreen ||
        doc.msExitFullscreen)?.call(doc);
      click("video_fullscreen_exit");
    } else {
      (el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen)?.call(el);
      click("video_fullscreen_enter");
    }
  };

  const seekTo = (time) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(time)) return;
    v.currentTime = Math.max(0, Math.min(time, v.duration || time));
  };

  const handleBarClick = (e) => {
    const bar = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
    seekTo(pct * (duration || 0));
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const onDocClick = (e) => {
      if (!settingsRef.current) return;
      if (!settingsRef.current.contains(e.target)) setSettingsOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!reportAck) return;
    const t = setTimeout(() => setReportAck(false), 2800);
    return () => clearTimeout(t);
  }, [reportAck]);

  useEffect(() => {
    if (!linkAck) return;
    const t = setTimeout(() => setLinkAck(false), 2200);
    return () => clearTimeout(t);
  }, [linkAck]);

  useEffect(() => {
    if (!menuOpen || isMobile) return;
    const onDocClick = (e) => {
      const insideMenu = menuRef.current && menuRef.current.contains(e.target);
      const insideBtn = dotsRef.current && dotsRef.current.contains(e.target);
      if (!insideMenu && !insideBtn) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, isMobile]);

  const LikeIcon = (p) =>
    myReaction ? (
      <span style={{ fontSize: 18, lineHeight: 1 }} {...p}>
        {ALL_REACTIONS[myReaction]}
      </span>
    ) : (
      <IconThumb {...p} />
    );

  const likeLabel = myReaction
    ? REACTION_META[myReaction]?.label || "Like"
    : "Like";

  const myParticipantId =
    ((typeof window !== "undefined" &&
      (window.SESSION?.participant_id || window.PARTICIPANT_ID)) ||
      null) ||
    "Participant";

  function ReactionIconWithNames({ rxKey, count, z, post, idx = 0 }) {
    const [open, setOpen] = React.useState(false);
    const label = REACTION_META[rxKey]?.label || rxKey;
    const { names, remaining } = fakeNamesFor(post.id, count, rxKey, 4);

    return (
      <span
        className="rx"
        style={{
          zIndex: z,
          position: "relative",
          width: 22,
          height: 22,
          fontSize: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "999px",
          marginLeft: idx === 0 ? 0 : -2,
          cursor: count > 0 ? "pointer" : "default",
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onPointerDown={closeNowAndSuppress}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
      >
        {REACTION_META[rxKey].emoji}
        {open && count > 0 && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              bottom: "130%",
              right: 0,
              background: "#111827",
              color: "white",
              padding: "8px 10px",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.25,
              boxShadow: "0 6px 24px rgba(0,0,0,.2)",
              whiteSpace: "nowrap",
              zIndex: 50,
              maxWidth: 260,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
            {names.length ? (
              <>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {names.map((n) => (
                    <li key={n} style={{ margin: "2px 0" }}>
                      {n}
                    </li>
                  ))}
                </ul>
                {remaining > 0 && (
                  <div style={{ opacity: 0.8, marginTop: 4 }}>and {remaining} more</div>
                )}
              </>
            ) : (
              <div style={{ opacity: 0.8 }}>No {label.toLowerCase()} yet</div>
            )}
          </div>
        )}
      </span>
    );
  }

  const shouldShowGhosts = showReactions && baseCommentCount > 0;

  const fb = {
    wrap: { position: "relative" },
    bottom: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: "8px 10px",
      color: "#fff",
      zIndex: 2,
      pointerEvents: "none",
      display: "grid",
      gap: 6,
      background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.45) 100%)",
    },
    progress: {
      position: "relative",
      height: 6,
      borderRadius: 999,
      background: "rgba(255,255,255,.25)",
      cursor: "pointer",
      overflow: "hidden",
      pointerEvents: "auto",
    },
    progBuffered: (pct) => ({
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: `${pct}%`,
      background: "rgba(255,255,255,.35)",
    }),
    progPlayed: (pct) => ({
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: `${pct}%`,
      background: "#fff",
    }),
    row: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    time: { fontSize: 12, fontWeight: 600, textShadow: "0 1px 2px rgba(0,0,0,.5)" },
    settingsWrap: { position: "relative", pointerEvents: "auto" },
    menu: {
      position: "absolute",
      bottom: "110%",
      right: 0,
      background: "#111827",
      color: "#fff",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: 8,
      boxShadow: "0 10px 24px rgba(0,0,0,.35)",
      padding: 6,
      minWidth: 120,
      zIndex: 3,
    },
    menuBtn: (active) => ({
      display: "block",
      width: "100%",
      textAlign: "left",
      border: 0,
      background: active ? "rgba(255,255,255,.08)" : "transparent",
      color: "#fff",
      padding: "6px 8px",
      borderRadius: 6,
      cursor: "pointer",
      fontSize: 13,
    }),
  };

  const postContent = (
    <>
      <header className="card-head">
        <div
          className="avatar"
          {...attachFacebookBio(avatarRef)}
          style={{ cursor: hasFacebookBio ? "pointer" : "default" }}
        >
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt=""
              className="avatar-img"
              loading="lazy"
              decoding="async"
              onLoad={() => click("avatar_load")}
              onError={() => click("avatar_error")}
            />
          ) : null}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name-row">
            <div
              className="name"
              {...attachFacebookBio(authorRef)}
              style={{ cursor: hasFacebookBio ? "pointer" : "default" }}
            >
              {displayAuthor}
            </div>
            {post.badge && (
              <span className="badge">
                <IconBadge />
              </span>
            )}
          </div>

          <div className="meta" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {post.adType === "ad" ? (
              <>
                <span className="subtle">Sponsored</span>
                <span className="sep" aria-hidden="true">·</span>
                <IconGlobe
                  style={{ color: "var(--muted)", width: 14, height: 14, flexShrink: 0 }}
                />
              </>
            ) : timeLabel ? (
              <>
                <span className="subtle">{timeLabel}</span>
                <span className="sep" aria-hidden="true">·</span>
                <IconGlobe
                  style={{ color: "var(--muted)", width: 14, height: 14, flexShrink: 0 }}
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="menu-wrap">
          <button
            ref={dotsRef}
            className="dots"
            onClick={() => {
              if (!disabled) {
                setFlyoutOpen(false);
                clearTimeout(openTimer.current);
                clearTimeout(closeTimer.current);
                setMenuOpen((v) => !v);
                onAction("post_menu_toggle", { post_id: post.id });
              }
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Post menu"
            disabled={disabled}
          >
            <IconDots />
          </button>

          {isMobile
            ? createPortal(
                <FacebookMenuSheet
                  open={menuOpen}
                  onClose={() => setMenuOpen(false)}
                  menuItems={menuItems}
                />,
                document.body
              )
            : (
              <MenuPortal anchorRef={dotsRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
                {menuItems}
              </MenuPortal>
            )}
        </div>
      </header>

      <div className="card-body">
        <PostText
          text={post.text || ""}
          expanded={expanded}
          onExpand={onExpand}
          onCollapse={onCollapse}
          onClamp={() => click("text_clamped")}
        />
        {expanded && post.links?.length ? (
          <div className="link-row">
            {post.links.map((lnk, i) => (
              <a
                key={i}
                href={lnk.href}
                onClick={(e) => {
                  e.preventDefault();
                  click("link_click", { label: lnk.label, href: lnk.href });
                }}
                className="link"
              >
                {lnk.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {post.video && post.videoMode !== "none" ? (
        (() => {
          const u = post.video?.url || "";
          const isDrive =
            /(?:^|\/\/)(?:drive\.google\.com|drive\.usercontent\.google\.com)/i.test(u);

          let driveId = null;
          {
            const qMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(u);
            const dMatch = /\/d\/([a-zA-Z0-9_-]+)/.exec(u);
            if (qMatch) driveId = qMatch[1];
            else if (dMatch) driveId = dMatch[1];
          }

          if (isDrive && driveId) {
            return (
              <div className="video-wrap drive-embed" ref={wrapRef}>
                <iframe
                  src={`https://drive.google.com/file/d/${driveId}/preview`}
                  title="Drive video"
                  loading="lazy"
                  allow="autoplay; fullscreen"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    border: 0,
                    display: "block",
                    background: "#000",
                  }}
                />
              </div>
            );
          }

          const playedPct = duration ? Math.min(current / duration, 1) * 100 : 0;
          const bufferedPct = duration ? Math.min(bufferedEnd / duration, 1) * 100 : 0;

          return (
            <div
              className="video-wrap"
              ref={wrapRef}
              onMouseEnter={() => setSettingsOpen(false)}
              style={fb.wrap}
            >
              <video
                ref={videoRef}
                className="video-el"
                src={u}
                poster={post.videoPosterUrl || undefined}
                playsInline
                muted={isMuted}
                autoPlay={inView}
                preload="auto"
                loop={!!post.videoLoop}
                onPlay={() => setIsVideoPlaying(true)}
                onPause={() => setIsVideoPlaying(false)}
                onEnded={onVideoEnded}
                controls={!!post.videoShowControls}
                disablePictureInPicture
                controlsList="nodownload noremoteplayback"
                style={{
                  display: "block",
                  width: "auto",
                  height: "auto",
                  maxWidth: "100%",
                  maxHeight: "min(78vh, 600px)",
                  objectFit: "contain",
                  background: "#000",
                  margin: "0 auto",
                  cursor: "pointer",
                }}
                onClick={onVideoTogglePlay}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    onVideoTogglePlay();
                  }
                }}
              />

              {!post.videoShowControls && (
                <div style={fb.bottom}>
                  <div className="fb-ctrls">
                    <div className="fb-ctrl-left">
                      <button
                        type="button"
                        className="fb-btn"
                        onClick={onVideoTogglePlay}
                        aria-label={isVideoPlaying ? "Pause" : "Play"}
                        title={isVideoPlaying ? "Pause" : "Play"}
                        disabled={disabled}
                      >
                        {isVideoPlaying ? "❚❚" : "▶"}
                      </button>

                      <div
                        style={fb.time}
                        aria-label={`Time ${fmtTime(current)} of ${fmtTime(duration)}`}
                      >
                        {fmtTime(current)} / {fmtTime(duration)}
                      </div>
                    </div>

                    <div
                      className="fb-progress-inline"
                      role="slider"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(duration || 0)}
                      aria-valuenow={Math.round(current || 0)}
                      aria-label="Video progress"
                      tabIndex={0}
                      onClick={handleBarClick}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          seekTo(current - 5);
                          e.preventDefault();
                        }
                        if (e.key === "ArrowRight") {
                          seekTo(current + 5);
                          e.preventDefault();
                        }
                      }}
                      title="Seek"
                    >
                      <div style={fb.progBuffered(bufferedPct)} />
                      <div style={fb.progPlayed(playedPct)} />
                    </div>

                    <div className="fb-ctrl-right">
                      <div
                        className="fb-vol"
                        onMouseEnter={() => {
                          clearTimeout(volHideTimer.current);
                          setVolOpen(true);
                        }}
                        onMouseLeave={() => {
                          clearTimeout(volHideTimer.current);
                          volHideTimer.current = setTimeout(() => setVolOpen(false), 600);
                        }}
                      >
                        <button
                          type="button"
                          className="fb-btn"
                          onClick={() => {
                            const v = videoRef.current;
                            if (!v) return;
                            const next = !v.muted;
                            v.muted = next;
                            setIsMuted(next);
                            if (!next && v.volume === 0) {
                              v.volume = 0.25;
                              setVolume(0.25);
                            }
                            click(next ? "video_mute" : "video_unmute");
                            setVolOpen(true);
                          }}
                          aria-label={isMuted ? "Unmute" : "Mute"}
                          title={isMuted ? "Unmute" : "Mute"}
                          disabled={disabled}
                        >
                          {isMuted || volume === 0 ? <IconVolumeMute /> : <IconVolume />}
                        </button>

                        {volOpen && (
                          <div className={`fb-vol-pop${volFading ? " hide" : ""}`}>
                            <div className="fb-vol-box">
                              <div
                                className="fb-vol-visual"
                                aria-hidden="true"
                                style={{
                                  ["--vol-val"]: Math.round(volume * 100),
                                  ["--vol-fill"]:
                                    isMuted || volume === 0
                                      ? "rgba(255,255,255,.25)"
                                      : "#fff",
                                }}
                              />
                              <input
                                className="fb-vol-slider"
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={Math.round(volume * 100)}
                                aria-label="Volume"
                                aria-orientation="vertical"
                                onInput={(e) => {
                                  const v = videoRef.current;
                                  const pct = Math.max(
                                    0,
                                    Math.min(100, Number(e.target.value) || 0)
                                  );
                                  const vol = pct / 100;
                                  setVolume(vol);
                                  if (v) v.volume = vol;
                                  const shouldMute = vol === 0;
                                  if (v && v.muted !== shouldMute) v.muted = shouldMute;
                                  setIsMuted(shouldMute);
                                  const vis = e.currentTarget.previousElementSibling;
                                  vis?.style.setProperty("--vol-val", String(pct));
                                  vis?.style.setProperty(
                                    "--vol-fill",
                                    shouldMute ? "rgba(255,255,255,.25)" : "#fff"
                                  );
                                }}
                                onChange={() => {}}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={fb.settingsWrap} ref={settingsRef}>
                        <button
                          type="button"
                          className="fb-btn"
                          aria-haspopup="menu"
                          aria-expanded={settingsOpen}
                          onClick={() => setSettingsOpen((o) => !o)}
                          title="Settings"
                          disabled={disabled}
                        >
                          ⚙
                        </button>
                        {settingsOpen && (
                          <div style={fb.menu} role="menu">
                            {[0.5, 1, 1.25, 1.5, 2].map((r) => (
                              <button
                                key={r}
                                type="button"
                                role="menuitem"
                                style={fb.menuBtn(r === playbackRate)}
                                onClick={() => setRate(r)}
                                title={`${r}×`}
                                disabled={disabled}
                              >
                                {r}× {r === playbackRate ? "✓" : ""}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="fb-btn"
                        onClick={toggleFullscreen}
                        aria-label="Fullscreen"
                        title="Fullscreen"
                        disabled={disabled}
                      >
                        ⛶
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : displayImage ? (
        <button
  className={`image-btn ${isNewsPost ? "fb-news-clickable" : ""}`}
  onClick={isNewsPost ? () => onNewsLinkClick("image") : onImageOpen}
  disabled={disabled}
  aria-label={isNewsPost ? "Open linked news story" : "Open image"}
>
          {displayImage.svg ? (
            <div
              dangerouslySetInnerHTML={{
                __html: post.image.svg.replace(
                  "<svg ",
                  "<svg preserveAspectRatio='xMidYMid slice' style='display:block;width:100%;height:auto;max-height:min(60vh,520px)' "
                ),
              }}
            />
          ) : displayImage.url ? (
            <img
              src={displayImage.url}
              alt={displayImage.alt || ""}
              onLoad={handleDisplayedImageLoad}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                maxHeight: "min(60vh, 520px)",
                objectFit: "cover",
              }}
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </button>
      ) : null}

      <InViewVideoController
        inView={inView}
        videoRef={videoRef}
        setIsVideoPlaying={setIsVideoPlaying}
        muted={isMuted}
      />


      {isNewsPost && (
        <button
          type="button"
          className="news-preview-block"
          onClick={() => onNewsLinkClick("preview")}
          disabled={disabled}
          aria-label="Open linked news story"
          style={{
            width: "100%",
            textAlign: "left",
            border: 0,
            borderTop: "1px solid var(--line)",
            background: "#f0f2f5",
            padding: "10px 12px 12px",
            cursor: disabled ? "default" : "pointer",
            display: "block",
          }}
        >
          {newsDomain && (
            <div
              className="news-preview-domain"
              style={{
                color: "#65676b",
                fontSize: 12,
                lineHeight: 1.25,
                textTransform: "uppercase",
                marginBottom: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {newsDomain}
            </div>
          )}
          <div
            className="news-preview-headline"
            style={{
              color: "#050505",
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.25,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {newsHeadline || "News headline"}
          </div>
          {newsDescription && (
            <div
              className="news-preview-description"
              style={{
                color: "#65676b",
                fontSize: 13,
                lineHeight: 1.3,
                marginTop: 4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {newsDescription}
            </div>
          )}
        </button>
      )}

      {post.adType === "ad" && (
        <div
          className="ad-block"
          style={{
            marginTop: 0,
            padding: ".75rem",
            background: "var(--bg, #f3f4f6)",
            borderRadius: 0,
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {post.adDomain && (
              <div
                className="subtle"
                style={{
                  fontSize: ".85rem",
                  marginBottom: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {String(post.adDomain).toUpperCase()}
              </div>
            )}
            <div
              style={{
                fontWeight: 700,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {post.adHeadline || "Free Shipping"}
            </div>
            <div
              className="subtle"
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {post.adSubheadline || "Premium Crystal Glass 🥃"}
            </div>
          </div>

          <button
            className="btn primary"
            style={{ borderRadius: 999, padding: ".5rem 1rem", flexShrink: 0 }}
            onClick={() => onAction?.("cta_click", { post_id: post.id, surface: "ad_cta", href: post.adUrl || "" })}
            disabled={disabled}
          >
            {post.adButtonText || "Shop now"}
          </button>
        </div>
      )}

      <InterventionBlock
        post={post}
        onAction={onAction}
        view={{
          author: displayAuthor,
          avatarUrl: displayAvatar,
          timeLabel,
          image: displayImage,
        }}
      />

      {reportAck && (
        <div className="ack-overlay" role="status" aria-live="polite">
          <div className="ack-overlay-box">
            <span className="ack-check" aria-hidden="true">
              ✓
            </span>
            <div className="ack-text">
              <strong>Thanks</strong>
              <br />
              Your report was recorded for this study.
            </div>
          </div>
        </div>
      )}

      {linkAck && (
        <div className="ack-overlay" role="status" aria-live="polite">
          <div className="ack-overlay-box">
            <span className="ack-check" aria-hidden="true">
              ✓
            </span>
            <div className="ack-text">
              <strong>Action noted</strong>
              <br />
              Your click was recorded for this study.
            </div>
          </div>
        </div>
      )}

      {(() => {
        const hasComments = displayedCommentCount > 0;
        const hasShares = displayedShareCount > 0;
        const showStatsBar = hasRx || hasComments || hasShares;

        return showStatsBar ? (
          <div className="bar-stats">
            {hasRx ? (
              <div className="left">
                <div className="rx-stack">
                  {top3.map((r, i) => (
                    <ReactionIconWithNames
                      key={r.key}
                      rxKey={r.key}
                      count={liveReactions[r.key] || 0}
                      z={10 - i}
                      post={post}
                      idx={i}
                    />
                  ))}
                  <span className="muted rx-count" style={{ marginLeft: 8 }}>
                    <NamesPeek
                      post={postForCounts}
                      count={totalReactions}
                      kind="reactions"
                      label="reactions"
                      hideInlineLabel
                    />
                  </span>
                </div>
              </div>
            ) : (
              <div />
            )}

            {(hasComments || hasShares) && (
              <div
                className="right muted"
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                {hasComments && (
                  <NamesPeek
                    post={postForCounts}
                    count={displayedCommentCount}
                    kind="comments"
                    label={displayedCommentCount === 1 ? "comment" : "comments"}
                  />
                )}
                {hasShares && (
                  <NamesPeek
                    post={postForCounts}
                    count={displayedShareCount}
                    kind="shares"
                    label={displayedShareCount === 1 ? "share" : "shares"}
                  />
                )}
              </div>
            )}
          </div>
        ) : null;
      })()}

      <footer className="footer">
        <div className="actions">
          <div
            className="like-wrap"
            onMouseEnter={!isMobile ? scheduleOpen : undefined}
            onMouseLeave={
              !isMobile
                ? () => {
                    scheduleClose();
                    suppressHoverUntil.current = 0;
                  }
                : undefined
            }
          >
            <ActionBtn
              label={likeLabel}
              active={!!myReaction}
              onClick={onLike}
              Icon={LikeIcon}
              disabled={disabled}
              aria-haspopup="menu"
              aria-expanded={flyoutOpen}
            />

            {flyoutOpen && (
              <div
                className="react-flyout"
                role="menu"
                aria-label="Pick a reaction"
                onMouseEnter={!isMobile ? scheduleOpen : undefined}
                onMouseLeave={!isMobile ? scheduleClose : undefined}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {Object.entries(ALL_REACTIONS).map(([key, emoji]) => (
                  <button
                    type="button"
                    key={key}
                    aria-label={key}
                    disabled={disabled}
                    onClick={() => onPickReaction(key)}
                    title={key}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ActionBtn
            label="Comment"
            onClick={onOpenComment}
            Icon={IconComment}
            disabled={disabled}
          />

          <ActionBtn
            label="Share"
            onClick={onShare}
            Icon={IconShare}
            active={false}
            disabled={disabled}
          />
        </div>
      </footer>
    </>
  );

  return (
    <article
      ref={registerViewRef(post.id)}
      data-post-id={post.id}
      data-has-image={displayImage ? "1" : undefined}
      className={revealIndex != null ? "card post-card post-reveal-in" : "card post-card"}
      style={revealIndex != null ? { animationDelay: `${(revealIndex % 6) * 70}ms` } : undefined}
    >
      {postContent}

      {isMobile
        ? createPortal(
            <FacebookCommentSheetMobile
              open={showComment}
              onClose={() => {
                onAction("comment_cancel", { post_id: post.id });
                setShowComment(false);
              }}
              onSubmit={onSubmitComment}
              commentText={commentText}
              setCommentText={setCommentText}
              mySubmittedComment={mySubmittedComment}
              shouldShowGhosts={shouldShowGhosts}
              baseCommentCount={baseCommentCount}
              participantId={String(myParticipantId)}
            />,
            document.body
          )
        : (
          <FacebookCommentModalDesktop
            open={showComment}
            onClose={() => {
              onAction("comment_cancel", { post_id: post.id });
              setShowComment(false);
            }}
            onSubmit={onSubmitComment}
            commentText={commentText}
            setCommentText={setCommentText}
            mySubmittedComment={mySubmittedComment}
            shouldShowGhosts={shouldShowGhosts}
            baseCommentCount={baseCommentCount}
            participantId={String(myParticipantId)}
            postContent={
              <div className="fb-modal-post-shell">
                {postContent}
              </div>
            }
            focusTick={commentFocusTick}
          />
        )}

      {isMobile
        ? createPortal(
            <FacebookShareSheetMobile
              open={showShare}
              onClose={() => setShowShare(false)}
              onShare={onConfirmShare}
            />,
            document.body
          )
        : (
          <FacebookShareModalDesktop
            open={showShare}
            onClose={() => setShowShare(false)}
            onShare={onConfirmShare}
          />
        )}

      {bioHoverTargetEl && !isMobile && hasFacebookBio && (
        <FacebookBioHoverCard
          anchorEl={bioHoverTargetEl}
          post={displayBio}
          author={displayAuthor}
          avatarUrl={displayAvatar}
          verified={!!post.badge}
          hideHover={hideBioHover}
          hideDelayRef={bioHideDelayRef}
          onAction={onAction}
        />
      )}

      {isMobile && bioOpen && hasFacebookBio && (
        <FacebookMobileBioSheet
          open={bioOpen}
          onClose={() => setBioOpen(false)}
          post={displayBio}
          author={displayAuthor}
          avatarUrl={displayAvatar}
          verified={!!post.badge}
          onAction={onAction}
        />
      )}
    </article>
  );
}

/* Programmatic in-view play/pause for native <video> */
function InViewVideoController({ inView, videoRef, setIsVideoPlaying, muted }) {
  useEffect(() => {
    const v = videoRef?.current;
    if (!v) return;
    try {
      if (inView) {
        v.muted = muted !== false;
        v.play().then(() => setIsVideoPlaying(true)).catch(() => {});
      } else {
        v.pause();
        setIsVideoPlaying(false);
      }
    } catch {}
  }, [inView, videoRef, setIsVideoPlaying, muted]);

  return null;
}

/* ------------------------------- Feed ------------------------------------- */
export function Feed({
  posts,
  registerViewRef,
  disabled,
  log,
  onSubmit,
  flags,
  app,
  projectId,
  feedId,
  runSeed,
  participantSeed,
  onDisplayedPostSnapshot,
  // Default true so every existing standalone mount (the admin's Feed
  // Preview is the only real one) keeps rendering its own rails exactly as
  // before. The real per-participant page (App-facebook.jsx) nests this
  // component inside its own separate `PageWithRails`, which already
  // renders the real rails — that call site passes `showRails={false}` so
  // this component's own copy doesn't also render, invisibly-but-still-
  // painting-content, squeezed into the narrow feed column next to it. That
  // double-render (not a CSS sizing detail) is what actually needs
  // preventing — no amount of width/overflow tuning on a duplicate DOM tree
  // fully hides it, since content can still paint outside a zero-width box.
  showRails = true,
}) {
  const STEP = 6;
  const FIRST_PAINT = Math.min(8, posts.length || 0);
  const [visibleCount, setVisibleCount] = useState(FIRST_PAINT);

  useEffect(() => {
    if (!posts?.length) return;
    const ric =
      window.requestIdleCallback ||
      ((fn) => setTimeout(() => fn({ didTimeout: false }), 200));
    const handle = ric(() => setVisibleCount((c) => Math.min(c + STEP, posts.length)));
    return () =>
      window.cancelIdleCallback ? window.cancelIdleCallback(handle) : clearTimeout(handle);
  }, [posts]);

  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisibleCount((c) => Math.min(c + STEP, posts.length));
          }
        }
      },
      { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.unobserve(el);
  }, [posts.length]);

  const renderPosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);

  const femalePosts = useMemo(
    () => posts.filter((p) => (p.authorType || "female") === "female"),
    [posts]
  );

  const malePosts = useMemo(
    () => posts.filter((p) => p.authorType === "male"),
    [posts]
  );

  const companyPosts = useMemo(
    () => posts.filter((p) => p.authorType === "company"),
    [posts]
  );

  const femaleNameMap = useMemo(
    () =>
      buildDeterministicAssignmentMap(
        femalePosts,
        FB_FEMALE_NAMES,
        [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "female-names"],
        (p) => p.id
      ),
    [femalePosts, runSeed, app, projectId, feedId]
  );

  const maleNameMap = useMemo(
    () =>
      buildDeterministicAssignmentMap(
        malePosts,
        FB_MALE_NAMES,
        [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "male-names"],
        (p) => p.id
      ),
    [malePosts, runSeed, app, projectId, feedId]
  );

  const companyNameMap = useMemo(
    () =>
      buildDeterministicAssignmentMap(
        companyPosts,
        FB_COMPANY_NAMES,
        [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "company-names"],
        (p) => p.id
      ),
    [companyPosts, runSeed, app, projectId, feedId]
  );

  const [avatarMaps, setAvatarMaps] = useState({
    female: new Map(),
    male: new Map(),
    company: new Map(),
  });

  // Decorative "Contacts" rail — real-looking, but purely cosmetic: reuses
  // the exact same avatar/name pools as real post authors (already loaded
  // for the fetch below, no extra network cost), seeded distinctly ("rail-
  // contacts" vs "female-avatars"/"female-names" etc.) so it never mirrors
  // any specific post's assigned author. Confound-safe for the same reason
  // author-name/avatar randomization already is: identical mechanism, same
  // pool, seeded by run+participant — never by condition or content — so it
  // can't correlate with which arm a participant is in. Stays fully inert
  // (`.rail`'s own `pointer-events:none`/`aria-hidden`, unchanged below) —
  // this only ever changes what it looks like, never what it does.
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [femalePool, malePool, companyPool] = await Promise.all([
        getAvatarPool("female"),
        getAvatarPool("male"),
        getAvatarPool("company"),
      ]);

      if (cancelled) return;

      setAvatarMaps({
        female: buildDeterministicAssignmentMap(
          femalePosts,
          femalePool,
          [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "female-avatars"],
          (p) => p.id
        ),
        male: buildDeterministicAssignmentMap(
          malePosts,
          malePool,
          [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "male-avatars"],
          (p) => p.id
        ),
        company: buildDeterministicAssignmentMap(
          companyPosts,
          companyPool,
          [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "company-avatars"],
          (p) => p.id
        ),
      });

      // "Realistic surroundings avatars" is a separate opt-in sub-toggle
      // from "Realistic surroundings" itself — the contacts' avatarUrl is
      // only populated when it's on; off, buildRailContacts gets empty
      // pools and every contact falls back to a blank circle.
      const showAvatars = !!flags?.realistic_surroundings_avatars;
      setContacts(
        buildRailContacts({
          femalePool: showAvatars ? femalePool : [],
          malePool: showAvatars ? malePool : [],
          runSeed, app, projectId, feedId, count: 22,
        })
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [femalePosts, malePosts, companyPosts, runSeed, app, projectId, feedId, flags?.realistic_surroundings_avatars]);

  // Opt-in per feed ("Realistic surroundings", Feeds → Settings →
  // Behavior) — off by default, same as every other realism toggle in this
  // codebase. Off renders the original generic blurred/desaturated ghost
  // skeleton exactly as before this feature existed; on swaps in the real-
  // looking (still fully inert) nav/contacts content below. Never a mix of
  // the two, so a study's surroundings stay whatever the researcher chose,
  // never silently upgraded.
  const realisticSurroundingsOn = !!flags?.realistic_surroundings;

  return (
    <div className="page">
      {showRails && (realisticSurroundingsOn ? (
        /* Decorative surroundings only — `.rail`'s own pointer-events:none
           (styles-facebook.css) plus aria-hidden/tabIndex=-1 here keep this
           entirely inert. Real names/dates/content are never shown here (we
           have no real identity to show), just the same generic, seeded-
           random contact pool the right rail uses — see the `contacts`
           effect above for the confound-safety rationale. */
        <aside className="rail rail-left rail--content" aria-hidden="true" tabIndex={-1}>
          <div className="rail-real-list">
            {LEFT_RAIL_NAV_ITEMS.map((label) => (
              <div key={label} className="rail-real-item">
                {LEFT_RAIL_ICONS[label]}
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="rail-real-title">Your shortcuts</div>
          <div className="rail-real-list">
            {pickShortcutsForHeight(4).map((label) => (
              <div key={label} className="rail-real-item">
                {LEFT_RAIL_SHORTCUT_ICONS[label] || LEFT_RAIL_SHORTCUT_ICON_DEFAULT}
                <span>{label}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : (
        <aside className="rail rail-left" aria-hidden="true" tabIndex={-1}>
          <div className="ghost-card ghost-profile">
            <div className="ghost-avatar xl" />
            <div className="ghost-lines">
              <div className="ghost-line w-60" />
              <div className="ghost-line w-35" />
            </div>
          </div>
          <div className="ghost-list">
            {["Home", "AI", "Friends", "Events", "Memories", "Saved", "Groups", "Marketplace", "Feeds", "Video"].map((t, i) => (
              <div key={i} className="ghost-item icon">
                <div className="ghost-icon" />
                <div className="ghost-line w-70" />
              </div>
            ))}
          </div>
          <div className="ghost-title" />
          <div className="ghost-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="ghost-item">
                <div className="ghost-avatar sm" />
                <div className="ghost-line w-60" />
              </div>
            ))}
          </div>
        </aside>
      ))}

      <main className="container feed">
        {renderPosts.map((p, revealIndex) => {
          const assignedAuthor =
            p.authorType === "male"
              ? maleNameMap.get(p.id)
              : p.authorType === "company"
              ? companyNameMap.get(p.id)
              : femaleNameMap.get(p.id);

          const assignedAvatarUrl =
            p.authorType === "male"
              ? avatarMaps.male.get(p.id)
              : p.authorType === "company"
              ? avatarMaps.company.get(p.id)
              : avatarMaps.female.get(p.id);

          return (
            <PostCard
              key={p.id}
              post={p}
              onAction={log}
              disabled={disabled}
              registerViewRef={registerViewRef}
              flags={flags}
              runSeed={runSeed}
              app={app}
              projectId={projectId}
              feedId={feedId}
              assignedAuthor={assignedAuthor || null}
              assignedAvatarUrl={assignedAvatarUrl || null}
              participantSeed={participantSeed}
              onDisplayedPostSnapshot={onDisplayedPostSnapshot}
              revealIndex={flags?.realistic_pacing ? revealIndex : null}
            />
          );
        })}

        <div ref={sentinelRef} aria-hidden="true" />
        {visibleCount >= posts.length && <div className="end">End of Feed</div>}
        <div className="submit-wrap">
          <button
            type="button"
            className="btn primary btn-wide"
            onClick={onSubmit}
            disabled={disabled === true}
          >
            Submit
          </button>
        </div>
      </main>

      {showRails && (realisticSurroundingsOn ? (
        <aside className="rail rail-right rail--content" aria-hidden="true" tabIndex={-1}>
          <div className="rail-real-title">Contacts</div>
          <div className="rail-real-list">
            {contacts.map((c) => (
              <div key={c.id} className="rail-real-item">
                <span className="rail-contact-avatar-wrap">
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" className="rail-contact-avatar" loading="lazy" decoding="async" />
                  ) : (
                    <span className="rail-contact-avatar rail-contact-avatar--blank" />
                  )}
                  {c.online && <span className="rail-contact-online-dot" />}
                </span>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : (
        <aside className="rail rail-right" aria-hidden="true" tabIndex={-1}>
          <div className="ghost-card banner" />
          <div className="ghost-card banner" />
          <div className="ghost-card box">
            <div className="ghost-line w-40" style={{ marginBottom: 8 }} />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="ghost-row">
                <div className="ghost-avatar sm" />
                <div className="ghost-lines">
                  <div className="ghost-line w-70" />
                  <div className="ghost-line w-45" />
                </div>
              </div>
            ))}
          </div>
          <div className="ghost-card box">
            <div className="ghost-line w-35" style={{ marginBottom: 8 }} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="ghost-row">
                <div className="ghost-avatar sm online" />
                <div className="ghost-line w-60" />
              </div>
            ))}
          </div>
        </aside>
      ))}
    </div>
  );
}