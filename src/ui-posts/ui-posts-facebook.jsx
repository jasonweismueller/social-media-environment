// components-ui-posts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  REACTION_META, sumSelectedReactions, topReactions, fakeNamesFor,
  displayTimeForPost, getAvatarPool, pickDeterministic,
  AVATAR_POOLS_ENDPOINTS,
  getImagePool,            
} from "../utils";

import { FEMALE_NAMES, MALE_NAMES, COMPANY_NAMES } from "./names";

import { BottomSheet } from "../ui-core/ui-mobile-facebook";
import { createPortal } from "react-dom";

import {
  IconBadge, IconDots, IconGlobe, IconInfo, IconUsers,
  IconThumb, IconComment, IconShare,
  ActionBtn, PostText, Modal, NamesPeek, neutralAvatarDataUrl, IconVolume, IconVolumeMute,
} from "../ui-core";

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

function ReadersContextPopover({ typeValue, sizeValue }) {
  const [open, setOpen] = React.useState(false);

  const helpText =
    "We have many types of readers that help us add context to social media posts if they feel the post is false or misleading. Here, we clarify what type of readers added context and how many of them.";

  return (
    <div
      className="note-title-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="note-title-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        Readers added context <span className="note-title-caret">▾</span>
      </button>

      {open && (
        <div className="note-popover" role="dialog" aria-label="Readers context">
          <div className="note-popover-row">
            <span className="note-popover-label">Type:</span>
            <span className="note-popover-value">{String(typeValue)}</span>
          </div>
          <div className="note-popover-row">
            <span className="note-popover-label">Size:</span>
            <span className="note-popover-value">{String(sizeValue)}</span>
          </div>

          <div className="note-popover-divider" />

          <div className="note-popover-help">{helpText}</div>
        </div>
      )}
    </div>
  );
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

// put this near the top of the file (after imports)
function MenuPortal({ anchorRef, open, onClose, children }) {
  const [coords, setCoords] = React.useState({ top: 0, left: 0, ready: false });

  // compute position in a layout effect (safe ref read)
  React.useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef?.current;
    if (!anchor || typeof window === "undefined" || !document?.body) return;

    const update = () => {
      const r = anchor.getBoundingClientRect();
      setCoords({
        top: r.bottom + window.scrollY + 4,
        left: r.left + window.scrollX,
        ready: true,
      });
    };

    update();
    window.addEventListener("scroll", update, true);  // capture to catch scrollable parents
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  // close on outside click / Esc
  React.useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      const menuEl = document.querySelector("#post-menu-portal");
      const inMenu = menuEl && menuEl.contains(e.target);
      const inBtn  = anchorRef?.current && anchorRef.current.contains(e.target);
      if (!inMenu && !inBtn) onClose?.();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
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
        position: "fixed",             // fixed is simpler once we compute viewport coords
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
export function PostCard({ post, onAction, disabled, registerViewRef, respectShowReactions = false, flags = { randomize_times:false }, app, projectId, feedId, runSeed }) {
  const [reportAck, setReportAck] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  // right before the meta markup, derive once:

  const NAME_POOLS = {
  female: FEMALE_NAMES,
  male: MALE_NAMES,
  company: COMPANY_NAMES,
};

const randNamesOn  = !!(flags?.randomize_names);
const randAvatarOn = !!(flags?.randomize_avatars ?? flags?.randomize_avatar); // 👈 accept both
const randImagesOn = !!(flags?.randomize_images);
const [randImageUrl, setRandImageUrl] = React.useState(null);


 const shouldShowTime = post?.showTime === false ? false : true; // default to true if missing

 // allow manual override via ?forcerand=1
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

const isMobile = useIsMobile();  // ⟵ add this

  // FB-like video settings UI
  const [playbackRate, setPlaybackRate] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const [volume, setVolume] = useState(0); // start muted visually & logically
  // Volume popover state (hover-in open, hover-out delayed close with fade)
  const [volOpen, setVolOpen] = useState(false);
  const [volFading, setVolFading] = useState(false);
  const volHideTimer = useRef(null);

  // cleanup
  useEffect(() => () => clearTimeout(volHideTimer.current), []);

  // when closing, briefly apply the fade class
  useEffect(() => {
    if (volOpen) {
      setVolFading(false);
      return;
    }
    setVolFading(true);
    const t = setTimeout(() => setVolFading(false), 180); // match your CSS transition
    return () => clearTimeout(t);
  }, [volOpen]);

  // Participant comment (this session)
  const [mySubmittedComment, setMySubmittedComment] = useState(post._localMyCommentText || "");
  const [participantComments, setParticipantComments] = useState(mySubmittedComment ? 1 : 0);

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
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 4h12v16l-6-4-6 4V4z" fill="currentColor"/></svg>
          </span>
          <span className="mi-text"><span className="mi-title">Save post</span><span className="mi-sub">Add this to your saved items.</span></span>
        </button>

        <div className="menu-divider" />

        <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
          <span className="mi-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M18 8a6 6 0 10-12 0v5l-2 2h16l-2-2V8zM9 19a3 3 0 006 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="mi-text"><span className="mi-title">Turn on notifications for this post</span></span>
        </button>

        <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
          <span className="mi-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5L3 12l5 7M16 5l5 7-5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="mi-text"><span className="mi-title">Embed</span></span>
        </button>

        <div className="menu-divider" />

        <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
          <span className="mi-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="5" width="16" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span className="mi-text"><span className="mi-title">Hide post</span><span className="mi-sub">See fewer posts like this.</span></span>
        </button>

        <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
          <span className="mi-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="mi-text"><span className="mi-title">Snooze {post.author} for 30 days</span><span className="mi-sub">Temporarily stop seeing posts.</span></span>
        </button>

        <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
          <span className="mi-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
          </span>
          <span className="mi-text"><span className="mi-title">Hide all from {post.author}</span><span className="mi-sub">Stop seeing posts from this Page.</span></span>
        </button>

        <div className="menu-divider" />

        <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
          <span className="mi-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span className="mi-text"><span className="mi-title">Dismiss</span></span>
        </button>
      </div>
  );

  const ALL_REACTIONS = { like:"👍", love:"❤️", care:"🤗", haha:"😆", wow:"😮", sad:"😢", angry:"😡" };
  const [myReaction, setMyReaction] = useState(null);

  const OPEN_DELAY = 400;
  const CLOSE_DELAY = 250;
  const SUPPRESS_MS = 300;
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const openTimer  = useRef(null);
  const closeTimer = useRef(null);
  const suppressHoverUntil = useRef(0);

  // NEW: touch + scroll lock helpers
  const isTouchDevice =
    typeof window !== "undefined" &&
    ((window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches) || navigator.maxTouchPoints > 0);
  const touchActiveRef = useRef(false);
  const lockStateRef = useRef({ y: 0 });

  useEffect(() => {
    return () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, []);

  // in-view detector for media
  const { wrapRef, inView } = useInViewAutoplay(0.6);

  // Touch-aware schedule open/close (ignore hover logic during a touch flow)
  const scheduleOpen = () => {
    if (touchActiveRef.current) return;
    if (Date.now() < suppressHoverUntil.current) return; // suppress hover reopen
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => {
      if (Date.now() < suppressHoverUntil.current) return;
      setFlyoutOpen(true);
    }, OPEN_DELAY);
  };
  const scheduleClose = () => {
    if (touchActiveRef.current) return;
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFlyoutOpen(false), CLOSE_DELAY);
  };

  // close NOW + suppress hover for a bit
  const closeNowAndSuppress = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setFlyoutOpen(false);
    suppressHoverUntil.current = Date.now() + SUPPRESS_MS;
  };

  // Lock/unlock scroll when flyout is open on touch devices
  useEffect(() => {
    if (!isTouchDevice) return;

    if (flyoutOpen) {
      lockStateRef.current.y = window.scrollY || 0;
      const b = document.body;
      b.style.position = "fixed";
      b.style.top = `-${lockStateRef.current.y}px`;
      b.style.left = "0";
      b.style.right = "0";
      b.style.width = "100%";
      b.style.overscrollBehavior = "contain";
      b.style.touchAction = "none";
    } else {
      const b = document.body;
      const y = lockStateRef.current.y || 0;
      b.style.position = "";
      b.style.top = "";
      b.style.left = "";
      b.style.right = "";
      b.style.width = "";
      b.style.overscrollBehavior = "";
      b.style.touchAction = "";
      window.scrollTo(0, y);
    }

    return () => {
      if (document.body.style.position === "fixed") {
        const y = lockStateRef.current.y || 0;
        const b = document.body;
        b.style.position = "";
        b.style.top = "";
        b.style.left = "";
        b.style.right = "";
        b.style.width = "";
        b.style.overscrollBehavior = "";
        b.style.touchAction = "";
        window.scrollTo(0, y);
      }
    };
  }, [flyoutOpen, isTouchDevice]);

  // Close flyout on outside tap (touch only)
  useEffect(() => {
    if (!isTouchDevice || !flyoutOpen) return;

    const onDocPointerDown = (e) => {
      const inFlyout = e.target.closest?.(".react-flyout");
      const inLikeWrap = e.target.closest?.(".like-wrap");
      if (!inFlyout && !inLikeWrap) setFlyoutOpen(false);
    };

    document.addEventListener("pointerdown", onDocPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDocPointerDown, { capture: true });
  }, [flyoutOpen, isTouchDevice]);

  const showReactions = post.showReactions ?? false;
  const ALL_RX_KEYS = useMemo(() => Object.keys(REACTION_META), []);

  const baseReactions = useMemo(() => ({
    like: 0, love: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0,
    ...(post.reactions || {}),
  }), [post.reactions]);

  const liveReactions = useMemo(() => {
    const obj = { ...baseReactions };
    if (myReaction) obj[myReaction] = (obj[myReaction] || 0) + 1;
    return obj;
  }, [baseReactions, myReaction]);

  // --- COMMENTS/SHARES
  const baseCommentCount = Number(post.metrics?.comments) || 0;
  const displayedCommentCount = baseCommentCount + participantComments;

  const baseShareCount = Number(post.metrics?.shares) || 0;
  const [hasShared, setHasShared] = useState(false);
  const displayedShareCount = baseShareCount + (hasShared ? 1 : 0);

  const totalReactions = useMemo(
    () => sumSelectedReactions(liveReactions, ALL_RX_KEYS),
    [liveReactions, ALL_RX_KEYS]
  );
  const top3 = useMemo(
    () => topReactions(liveReactions, ALL_RX_KEYS, 3),
    [liveReactions, ALL_RX_KEYS]
  );

  const hasRx = respectShowReactions ? (showReactions && totalReactions > 0) : (totalReactions > 0);

  const click = (action, meta = {}) => { if (!disabled) onAction(action, { post_id: post.id, ...meta }); };

  // 👇 Provide NamesPeek with a version of the post that always:
  // - has showReactions=true (unblocks internal gates),
  // - contains the *displayed* counts so names match what the user sees.
  const postForCounts = useMemo(() => ({
    ...post,
    showReactions: true,
    metrics: {
      ...post.metrics,
      comments: displayedCommentCount,
      shares: displayedShareCount,
      reactions: totalReactions,
    },
  }), [post, displayedCommentCount, displayedShareCount, totalReactions]);

  const onLike = () => {
    closeNowAndSuppress();           // also suppress when toggling like
    setMyReaction(prev => {
      if (prev == null) { click("react_pick", { type: "like", prev: null }); return "like"; }
      click("react_clear", { type: prev, prev }); return null;
    });
  };
  const onPickReaction = (key) => {
    setMyReaction(prev => {
      if (prev === key) { click("react_clear", { type: key, prev }); return null; }
      click("react_pick", { type: key, prev }); return key;
    });
    // close AFTER the state update has been queued
    closeNowAndSuppress();
  };

  const onShare = () => {
    if (hasShared) return; // only once
    click("share");
    setHasShared(true);
  };
  const onExpand = () => { setExpanded(true); click("expand_text"); };
  const onOpenComment = () => { setShowComment(true); click("comment_open"); };

  // comment submit
  const onSubmitComment = () => {
    const txt = commentText.trim();
    if (!txt) return;
    click("comment_submit", { text: txt, length: txt.length });
    setMySubmittedComment(txt);
    setParticipantComments((c) => c + 1);
    setCommentText("");
  };

  // media (image/video)
  const onImageOpen = () => { if (post.image) click("image_open", { alt: post.image.alt || "" }); };

  // --- VIDEO SUPPORT (FB-like UI) -----------------------------------------
  const videoRef = useRef(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // start muted (reliable autoplay)
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);

  // Determine kind from post (default "female" if unset/unknown)
const authorType =
  post.authorType === "male" || post.authorType === "company" ? post.authorType : "female";

// Deterministic seed parts: changes per hard refresh (runSeed), stable in-session
const seedParts = [
  runSeed || "run",
  app || "app",
  projectId || "proj",
  feedId || "feed",
  String(post.id ?? "")
];

// NAME
const poolNames =
  authorType === "female" ? FEMALE_NAMES :
  authorType === "male"   ? MALE_NAMES   :
                            COMPANY_NAMES;

const displayAuthor = React.useMemo(() => {
  if (!randNamesOn && post.author) return post.author;
  const picked = pickDeterministic(poolNames, [...seedParts, "name"]);
  return picked || post.author || (authorType === "company" ? "Sponsored" : "User");
  // deps intentionally include identifiers that change the seed
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [randNamesOn, authorType, post.author, runSeed, app, projectId, feedId, post.id]);

// AVATAR (async pool from S3 via utils)
const [randAvatarUrl, setRandAvatarUrl] = React.useState(null);

React.useEffect(() => {
  let cancelled = false;
 if (!randAvatarOn || post.avatarMode === "neutral") { setRandAvatarUrl(null); return; }
  (async () => {
    const list = await getAvatarPool(authorType); // returns ABSOLUTE URLs
    if (cancelled) return;
    const pick = pickDeterministic(list, [...seedParts, "avatar"]);
    console.debug("avatar pick", { authorType, pick, flags }); 
   setRandAvatarUrl(pick || null);
  })();
  return () => { cancelled = true; };
}, [randAvatarOn, post.avatarMode, authorType, runSeed, app, projectId, feedId, post.id]);

// Final avatar used in UI
const displayAvatar = randAvatarOn
  ? (randAvatarUrl || post.avatarUrl || null)
  : (post.avatarUrl || null);



// Topic-based image randomization (no aliases; deterministic pick happens here)
React.useEffect(() => {
  let cancelled = false;
  // must have flag on AND an image field intended for display
  const hasImage = !!(post?.image && post?.imageMode !== "none");
  if (!randImagesOn || !hasImage) { setRandImageUrl(null); return; }

  // topic determines folder; accept post.topic or post.imageTopic
  const topic = String(post?.topic || post?.imageTopic || "").trim();
  if (!topic) { setRandImageUrl(null); return; }

  (async () => {
    try {
      const list = await getImagePool(topic); // absolute URLs from /images/<topic>/index.json
      if (cancelled) return;
      const pick = pickDeterministic(list, [...seedParts, "image"]);
      setRandImageUrl(pick || null);
    } catch {
      if (!cancelled) setRandImageUrl(null);
    }
  })();

  return () => { cancelled = true; };
// seed parts ensure stability per (run/app/project/feed/post)
}, [randImagesOn, post?.image, post?.imageMode, post?.topic, post?.imageTopic, runSeed, app, projectId, feedId, post?.id]);

// Final image object used in UI
const displayImage = React.useMemo(() => {
  const hasImage = !!(post?.image && post?.imageMode !== "none");
  if (!hasImage) return null;
  // when flag is on and we have a picked URL, override the image URL only
  if (randImagesOn && randImageUrl) {
    return { url: randImageUrl, alt: post.image?.alt || "" };
  }
  return post.image || null;
}, [post?.image, post?.imageMode, randImagesOn, randImageUrl]);

  // time formatter
  const fmtTime = (s) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, "0");
    return `${m}:${sec}`;
  };

  // wire native video events (mount-only)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // start in a reliable autoplay state
    v.muted = true;
    v.volume = 0; // apply initial volume

    const onLoadedMeta = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    const onTime      = () => setCurrent(v.currentTime || 0);
    const onProg      = () => { try { const b = v.buffered; if (b.length) setBufferedEnd(b.end(b.length - 1)); } catch {} };
    const onPlay      = () => setIsVideoPlaying(true);
    const onPause     = () => setIsVideoPlaying(false);

    // keep React state in sync with element changes
    const onVol       = () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // keep element in sync with React state
    v.volume = volume;

    // slider at 0 ⇒ muted; >0 ⇒ unmuted
    const shouldMute = volume === 0;
    if (v.muted !== shouldMute) v.muted = shouldMute;

    // reflect any normalization back to UI
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
    } catch { /* ignore */ }
  };

  const onVideoToggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
    click(v.muted ? "video_mute" : "video_unmute");
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
      doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;
    if (isFull) {
      (doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen)?.call(doc);
      click("video_fullscreen_exit");
    } else {
      (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen)?.call(el);
      click("video_fullscreen_enter");
    }
  };

  // progress bar interactions
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

  // Close settings on outside click / Esc
  useEffect(() => {
    if (!settingsOpen) return;
    const onDocClick = (e) => {
      if (!settingsRef.current) return;
      if (!settingsRef.current.contains(e.target)) setSettingsOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setSettingsOpen(false); };
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
  if (!menuOpen || isMobile) return; // ⟵ only for desktop portal
  const onDocClick = (e) => {
    const insideMenu = menuRef.current && menuRef.current.contains(e.target);
    const insideBtn  = dotsRef.current && dotsRef.current.contains(e.target);
    if (!insideMenu && !insideBtn) setMenuOpen(false);
  };
  const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
  document.addEventListener("mousedown", onDocClick);
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKey);
  };
}, [menuOpen, isMobile]);

  const LikeIcon = (p) =>
    myReaction ? <span style={{ fontSize: 18, lineHeight: 1 }} {...p}>{ALL_REACTIONS[myReaction]}</span> : <IconThumb {...p}/>;
  const likeLabel = myReaction ? (REACTION_META[myReaction]?.label || "Like") : "Like";

  // Participant id
  const myParticipantId =
    ((typeof window !== "undefined" && (window.SESSION?.participant_id || window.PARTICIPANT_ID)) || null) ||
    "Participant";

  /* Reaction chip with tooltip */
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
          cursor: count > 0 ? "pointer" : "default"
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
                  {names.map((n) => (<li key={n} style={{ margin: "2px 0" }}>{n}</li>))}
                </ul>
                {remaining > 0 && (<div style={{ opacity: 0.8, marginTop: 4 }}>and {remaining} more</div>)}
              </>
            ) : (
              <div style={{ opacity: 0.8 }}>No {label.toLowerCase()} yet</div>
            )}
          </div>
        )}
      </span>
    );
  }

  // --- GHOST SHOW/HIDE RULES ---
  const shouldShowGhosts = showReactions && baseCommentCount > 0;

  // Inline styles for FB-like controls (minus button box/background)
  const fb = {
    wrap: { position: "relative" },
    bottom: {
      position: "absolute", left: 0, right: 0, bottom: 0,
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
      pointerEvents: "auto"
    },
    progBuffered: (pct) => ({
      position: "absolute", top: 0, left: 0, bottom: 0,
      width: `${pct}%`,
      background: "rgba(255,255,255,.35)"
    }),
    progPlayed: (pct) => ({
      position: "absolute", top: 0, left: 0, bottom: 0,
      width: `${pct}%`,
      background: "#fff"
    }),
    row: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    time: { fontSize: 12, fontWeight: 600, textShadow: "0 1px 2px rgba(0,0,0,.5)" },
    // NOTE: removed fb.btn — we now use className="fb-btn" so CSS controls the look
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
      zIndex: 3
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
      fontSize: 13
    }),
  };

  return (
    <article
      ref={registerViewRef(post.id)}
      data-post-id={post.id}
      data-has-image={displayImage ? "1" : undefined}
      className="card post-card"
    >
      <header className="card-head">
  <div className="avatar">
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

  <div style={{ flex: 1, minWidth:0 }}>
    <div className="name-row">
      <div className="name">{displayAuthor}</div>
      {post.badge && (
        <span className="badge">
          <IconBadge />
        </span>
      )}
    </div>

   {/* Sponsored for ads; otherwise time + globe (both hidden if showTime is false) */}
<div className="meta" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
{post.adType === "ad" ? (
  <>
    <span className="subtle">Sponsored</span>
    <span className="sep" aria-hidden="true">·</span>
    <IconGlobe style={{ color: "var(--muted)", width: 14, height: 14, flexShrink: 0 }} />
  </>
) : (
  timeLabel ? (
    <>
      <span className="subtle">{timeLabel}</span>
      <span className="sep" aria-hidden="true">·</span>
      <IconGlobe style={{ color: "var(--muted)", width: 14, height: 14, flexShrink: 0 }} />
    </>
  ) : null
)}
</div>
  </div>

  <div className="menu-wrap">
    <button
      ref={dotsRef}
      className="dots"
      onClick={() => {
        if (!disabled) {
          setMenuOpen(v => !v);
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
{isMobile ? (
  <BottomSheet
    open={menuOpen}
    onClose={() => setMenuOpen(false)}
    title="Post options"
    height="75vh"
  >
    {menuItems}
    <div style={{ height: 8 }} />
    <button className="btn ghost" onClick={() => setMenuOpen(false)} style={{ width: "100%" }}>
      Cancel
    </button>
  </BottomSheet>
) : (
  <MenuPortal anchorRef={dotsRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
    {menuItems}
  </MenuPortal>
)}
  </div>
</header>

      <div className="card-body">
        <PostText text={post.text || ""} expanded={expanded} onExpand={onExpand} onClamp={() => click("text_clamped")} />
        {expanded && post.links?.length ? (
          <div className="link-row">
            {post.links.map((lnk, i) => (
              <a
                key={i}
                href={lnk.href}
                onClick={(e) => { e.preventDefault(); click("link_click", { label: lnk.label, href: lnk.href }); }}
                className="link"
              >
                {lnk.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {/* Media: prefer video, else image */}
      {post.video && post.videoMode !== "none" ? (
        (() => {
          const u = post.video?.url || "";

          // Detect Drive URLs
          const isDrive =
            /(?:^|\/\/)(?:drive\.google\.com|drive\.usercontent\.google\.com)/i.test(u);

          /// Extract Drive file ID from ?id=... or /d/<id>/
          let driveId = null;
          {
            const qMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(u);
            const dMatch = /\/d\/([a-zA-Z0-9_-]+)/.exec(u);
            if (qMatch) driveId = qMatch[1];
            else if (dMatch) driveId = dMatch[1];
          }

          if (isDrive && driveId) {
            // Drive preview player (autoplay not guaranteed)
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

          // Non-Drive (e.g., S3/CloudFront) → native <video> w/ in-view autoplay
          const playedPct   = duration ? Math.min(current / duration, 1) * 100 : 0;
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
                // toggle play/pause like FB
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

              {/* FB-like bottom bar when using custom controls */}
              {!post.videoShowControls && (
                <div style={fb.bottom}>
                  <div className="fb-ctrls">
                    {/* LEFT: play + time */}
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

                      <div style={fb.time} aria-label={`Time ${fmtTime(current)} of ${fmtTime(duration)}`}>
                        {fmtTime(current)} / {fmtTime(duration)}
                      </div>
                    </div>

                    {/* CENTER: inline progress */}
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
                        if (e.key === "ArrowLeft") { seekTo(current - 5); e.preventDefault(); }
                        if (e.key === "ArrowRight") { seekTo(current + 5); e.preventDefault(); }
                      }}
                      title="Seek"
                    >
                      <div style={fb.progBuffered(bufferedPct)} />
                      <div style={fb.progPlayed(playedPct)} />
                    </div>

                    {/* RIGHT: volume popover, settings, fullscreen */}
                    <div className="fb-ctrl-right">
                      <div
                        className="fb-vol"
                        onMouseEnter={() => { clearTimeout(volHideTimer.current); setVolOpen(true); }}
                        onMouseLeave={() => {
                          clearTimeout(volHideTimer.current);
                          volHideTimer.current = setTimeout(() => setVolOpen(false), 600);
                        }}
                      >
                        <button
                          type="button"
                          className="fb-btn"
                          onClick={() => {
                            const v = videoRef.current; if (!v) return;
                            const next = !v.muted;
                            v.muted = next; setIsMuted(next);
                            if (!next && v.volume === 0) { v.volume = 0.25; setVolume(0.25); }
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
                                  ['--vol-val']: Math.round(volume * 100),
                                  ['--vol-fill']: isMuted || volume === 0 ? 'rgba(255,255,255,.25)' : '#fff'
                                }}
                              />
                              <input
                                className="fb-vol-slider"
                                type="range"
                                min="0" max="100" step="1"
                                value={Math.round(volume * 100)}
                                aria-label="Volume"
                                aria-orientation="vertical"
                                onInput={(e) => {
                                  const v = videoRef.current;
                                  const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                  const vol = pct / 100;
                                  setVolume(vol);
                                  if (v) v.volume = vol;
                                  const shouldMute = vol === 0;
                                  if (v && v.muted !== shouldMute) v.muted = shouldMute;
                                  setIsMuted(shouldMute);
                                  const vis = e.currentTarget.previousElementSibling;
                                  vis?.style.setProperty('--vol-val', String(pct));
                                  vis?.style.setProperty('--vol-fill', shouldMute ? 'rgba(255,255,255,.25)' : '#fff');
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
                          onClick={() => setSettingsOpen(o => !o)}
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
        <button className="image-btn" onClick={onImageOpen} disabled={disabled} aria-label="Open image">
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

      {/* Ensure programmatic in-view play/pause on inView change */}
      <InViewVideoController inView={inView} videoRef={videoRef} setIsVideoPlaying={setIsVideoPlaying} muted={isMuted} />

      {/* Ad card */}
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
            gap: "1rem"
          }}
        >
          <div style={{ minWidth: 0 }}>
            {post.adDomain && (
              <div className="subtle" style={{ fontSize: ".85rem", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {String(post.adDomain).toUpperCase()}
              </div>
            )}
            <div style={{ fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {post.adHeadline || "Free Shipping"}
            </div>
            <div className="subtle" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {post.adSubheadline || "Premium Crystal Glass 🥃"}
            </div>
          </div>

          <button
            className="btn primary"
            style={{ borderRadius: 999, padding: ".5rem 1rem", flexShrink: 0 }}
            onClick={() => onAction?.("ad_cta_click", { post_id: post.id })}
            disabled={disabled}
          >
            {post.adButtonText || "Shop now"}
          </button>
        </div>
      )}

      {/* intervention surfaces */}
      {post.interventionType === "label" && (
        <div className="info-bar info-clean">
          <div className="info-head">
            <div className="info-icon"><IconInfo /></div>
            <div className="info-title">False information</div>
          </div>
          <div className="info-sub">This is information that third-party fact-checkers say is false.</div>
          <div className="info-row">
            <div>Want to see why?</div>
            <button className="btn" onClick={() => onAction("intervention_learn_more", { post_id: post.id })}>Learn more</button>
          </div>
        </div>
      )}

{post.interventionType === "note" && (() => {
  const readerType =
    post.noteReaderType ?? post.noteType ?? post.readerType ?? "Not specified";
  const readerSize =
    post.noteReaderSize ?? post.noteSize ?? post.readerSize ?? "Not specified";

  return (
    <div className="note-bar">
      <div className="note-head">
        <div className="note-icon"><IconUsers /></div>
        <ReadersContextPopover typeValue={readerType} sizeValue={readerSize} />
      </div>

      <div className="note-sub">{post.noteText || ""}</div>

      <div className="note-row">
        <div>Do you find this helpful?</div>
        <button
          className="btn"
          onClick={() => onAction("note_rate_open", { post_id: post.id })}
        >
          Rate it
        </button>
      </div>
    </div>
  );
})()}

      {reportAck && (
        <div className="ack-overlay" role="status" aria-live="polite">
          <div className="ack-overlay-box">
            <span className="ack-check" aria-hidden="true">✓</span>
            <div className="ack-text">
              <strong>Thanks</strong><br />
              Your report was recorded for this study.
            </div>
          </div>
        </div>
      )}

      {/* stats bar */}
      {(() => {
        const hasComments = displayedCommentCount > 0;
        const hasShares   = displayedShareCount > 0;
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
                    <NamesPeek post={postForCounts} count={totalReactions} kind="reactions" label="reactions" hideInlineLabel />
                  </span>
                </div>
              </div>
            ) : <div />}

            {(hasComments || hasShares) && (
              <div className="right muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
            onMouseEnter={scheduleOpen}
            onMouseLeave={() => {
              scheduleClose();
              suppressHoverUntil.current = 0;
            }}
            // Touch-first behavior: open immediately and mark touch flow
            onPointerDown={(e) => {
              if (e.pointerType === "touch") {
                touchActiveRef.current = true;
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(openTimer.current);
                clearTimeout(closeTimer.current);
                setFlyoutOpen(true);
              }
            }}
            onPointerUp={(e) => {
              if (e.pointerType === "touch") {
                // keep open; allow outside tap to close
                touchActiveRef.current = false;
              }
            }}
            onPointerCancel={(e) => {
              if (e.pointerType === "touch") {
                touchActiveRef.current = false;
              }
            }}
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
                onMouseEnter={scheduleOpen}
                onMouseLeave={scheduleClose}
                onPointerDown={(e) => {
                  // keep taps inside the flyout from bubbling up to the outside-closer
                  e.stopPropagation();
                }}
              >
                {Object.entries(ALL_REACTIONS).map(([key, emoji]) => (
                  <button
                    key={key}
                    aria-label={key}
                    onClick={() => onPickReaction(key)}
                    title={key}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ActionBtn label="Comment" onClick={onOpenComment} Icon={IconComment} disabled={disabled} />
          <ActionBtn label="Share" onClick={onShare} Icon={IconShare} active={hasShared} disabled={disabled || hasShared} />
        </div>
      </footer>

      {showComment && (
        <Modal onClose={() => setShowComment(false)} title="Write a comment">
          {(shouldShowGhosts || !!mySubmittedComment) && (
            <div className="ghost-comments" style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
              {shouldShowGhosts && Array.from({ length: Math.min(3, baseCommentCount) }).map((_, i) => (
                <div key={`ghost-${i}`} className="ghost-row" style={{ alignItems: "flex-start", gap: ".6rem", marginTop: i === 0 ? 2 : 10 }}>
                  <div className="ghost-avatar sm" />
                  <div className="ghost-lines" style={{ flex: 1, minWidth:0 }}>
                    <div className="ghost-line w-80" />
                    <div className="ghost-line w-50" />
                  </div>
                </div>
              ))}

              {!!mySubmittedComment && (
                <div className="ghost-row" style={{ alignItems: "flex-start", gap: ".6rem", marginTop: shouldShowGhosts ? 10 : 2 }}>
                  <img
                    src={neutralAvatarDataUrl(28)}
                    alt=""
                    width={28}
                    height={28}
                    style={{ display: "block", borderRadius: "999px", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: ".9rem", fontWeight: 600, lineHeight: 1.2 }}>
                      {String(myParticipantId)}
                    </div>
                    <div style={{ marginTop: 2, color: "#111827", fontSize: ".95rem", lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
                      {mySubmittedComment}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <textarea
            className="textarea"
            rows={4}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write your comment..."
          />
          <div className="row-end">
            <button className="btn" onClick={() => { onAction("comment_cancel", { post_id: post.id }); setShowComment(false); }}>
              Close
            </button>
            <button className="btn primary" onClick={onSubmitComment} disabled={!commentText.trim()}>
              Post
            </button>
          </div>
        </Modal>
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
        v.muted = muted !== false; // keep muted true unless explicitly false
        v.play().then(() => setIsVideoPlaying(true)).catch(() => {});
      } else {
        v.pause();
        setIsVideoPlaying(false);
      }
    } catch { /* ignore */ }
  }, [inView, videoRef, setIsVideoPlaying, muted]);

  return null;
}

/* ------------------------------- Feed ------------------------------------- */
export function Feed({ posts, registerViewRef, disabled, log, onSubmit, flags, app, projectId, feedId, runSeed }) {
  const STEP = 6;
  const FIRST_PAINT = Math.min(8, posts.length || 0);
  const [visibleCount, setVisibleCount] = useState(FIRST_PAINT);

  useEffect(() => {
    if (!posts?.length) return;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ didTimeout:false }), 200));
    const handle = ric(() => setVisibleCount((c) => Math.min(c + STEP, posts.length)));
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(handle) : clearTimeout(handle));
  }, [posts]);

  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setVisibleCount((c) => Math.min(c + STEP, posts.length));
    }, { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0.01 });
    io.observe(el);
    return () => io.unobserve(el);
  }, [posts.length]);

  const renderPosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);

  return (
    <div className="page">
      {/* left rail skeletons, same as before */}
      <aside className="rail rail-left" aria-hidden="true" tabIndex={-1}>
        <div className="ghost-card ghost-profile">
          <div className="ghost-avatar xl" />
          <div className="ghost-lines">
            <div className="ghost-line w-60" />
            <div className="ghost-line w-35" />
          </div>
        </div>
        <div className="ghost-list">
          {["Home","AI","Friends","Events","Memories","Saved","Groups","Marketplace","Feeds","Video"].map((t,i)=>(
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

      <main className="container feed">
        {renderPosts.map((p) => (
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
          />
        ))}

  
        <div ref={sentinelRef} aria-hidden="true" />
        {visibleCount >= posts.length && <div className="end">End of Feed</div>}
        <div className="submit-wrap">
          <button type="button" className="btn primary btn-wide" onClick={onSubmit} disabled={disabled === true}>
            Submit
          </button>
        </div>
      </main>

      {/* right rail skeletons, same as before */}
      <aside className="rail rail-right" aria-hidden="true" tabIndex={-1}>
        <div className="ghost-card banner" />
        <div className="ghost-card banner" />
        <div className="ghost-card box">
          <div className="ghost-line w-40" style={{marginBottom:8}} />
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
          <div className="ghost-line w-35" style={{marginBottom:8}} />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="ghost-row">
              <div className="ghost-avatar sm online" />
              <div className="ghost-line w-60" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}