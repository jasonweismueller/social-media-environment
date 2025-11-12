// components-ui-posts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Modal, neutralAvatarDataUrl, PostText } from "../ui-core";
import { IGCarousel } from "../ui-core/ui-ig-carousel";
import { useInViewAutoplay, displayTimeForPost, getAvatarPool, getImagePool, pickDeterministic, fakeNamesFor } from "../utils";

import { FEMALE_NAMES, MALE_NAMES, COMPANY_NAMES } from "./names";

/* ---------------- Small utils ---------------- */
function useIsMobile(breakpointPx = 640) {
  const isBrowser = typeof window !== "undefined";
  const [isMobile, setIsMobile] = useState(
    isBrowser ? window.matchMedia(`(max-width:${breakpointPx}px)`).matches : false
  );
  useEffect(() => {
    if (!isBrowser) return;
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    const h = (e) => setIsMobile(e.matches);
    mq.addEventListener?.("change", h);
    mq.addListener && mq.addListener(h);
    return () => {
      mq.removeEventListener?.("change", h);
      mq.removeListener && mq.removeListener(h);
    };
  }, [breakpointPx, isBrowser]);
  return isMobile;
}

/* ---------------- Icons ---------------- */
function HeartIcon({ filled = false, ...props }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...props}>
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-.99-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.77-8.84a5.5 5.5 0 0 0 0-7.78Z"
        fill={filled ? "#ef4444" : "none"}
        stroke={filled ? "#ef4444" : "currentColor"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function CommentIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...props}>
      <path
        d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SendIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...props}>
      <path d="M22 2 11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function SaveIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...props}>
      <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function SaveIconFilled(props) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" {...props}>
      <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" fill="currentColor" />
    </svg>
  );
}
function DotsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...props}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/* ---------------- Helpers ---------------- */
const sumReactions = (rx) => (rx ? Object.values(rx).reduce((a, b) => a + (Number(b) || 0), 0) : 0);

/* ---------------- Mobile “Stories” ghost bar (non-sticky, no scroll) ---- */
function useStoriesCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const calc = () => {
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const sidePad = 12;      // px horizontal padding of the bar
      const itemW   = 72;      // px card width
      const gapMin  = 10;      // px minimum gap between items
      const usable = vw - sidePad * 2;
      const per = itemW + gapMin;
      const n = Math.max(1, Math.floor((usable + gapMin) / per));
      setCount(n);
    };
    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("orientationchange", calc);
    };
  }, []);

  return count;
}

function StoryBar() {
  const isMobile = useIsMobile(700);
  const n = isMobile ? useStoriesCount() : 0;
  const items = Array.from({ length: n || 0 });
  if (!isMobile || n === 0) return null;

  return (
    <div className="ig-stories-bar noscroll" aria-hidden="true">
      <div className="ig-stories-row">
        {items.map((_, i) => (
          <div className="ig-story-ghost" key={i}>
            <div className="ig-story-ring">
              <div className="ig-story-avatar" />
            </div>
            <div className="ig-story-name" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Mobile sheet ---------------- */
/* ---------------- Mobile sheet (Instagram-style with icons) ---------------- */
function MobileSheet({ open, onClose }) {
  if (!open) return null;

  const iconStyle = { width: 20, height: 20, flexShrink: 0 };

  const menuItems = [
    { label: "Save", icon: SaveIcon, disabled: true },
    { label: "QR code", icon: QrIcon, disabled: true },
    { label: "Add to Favourites", icon: StarIcon, disabled: true },
    { label: "Unfollow", icon: UserMinusIcon, disabled: true },
    { label: "About this account", icon: UserCircleIcon, disabled: true },
    { label: "Why you're seeing this post", icon: InfoIcon, disabled: true },
    { label: "Hide", icon: HideIcon, disabled: true },
    { label: "Report", icon: ReportIcon, danger: true },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          color: "#111",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          paddingBottom: 12,
          maxHeight: "75vh",
          overflowY: "auto",
          boxShadow: "0 -8px 24px rgba(0,0,0,.25)",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            background: "rgba(0,0,0,.2)",
            borderRadius: 999,
            margin: "8px auto 14px",
          }}
        />

        {menuItems.map((item, i) => (
          <button
            key={i}
            disabled={item.disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              border: "none",
              background: "#fff",
              color: item.danger ? "#ef4444" : item.disabled ? "#9ca3af" : "#111",
              fontSize: 15,
              fontWeight: item.danger ? 600 : 500,
              padding: "14px 16px",
              textAlign: "left",
              borderTop: i === 0 ? "none" : "1px solid #e5e7eb",
              cursor: item.disabled ? "default" : "pointer",
              opacity: item.disabled ? 0.8 : 1,
            }}
            onClick={() => {
              if (!item.disabled && item.label === "Report") alert("Reported!");
            }}
          >
            <item.icon {...iconStyle} />
            <span>{item.label}</span>
          </button>
        ))}

        {/* Cancel button */}
        <button
          onClick={onClose}
          style={{
            display: "block",
            width: "100%",
            marginTop: 10,
            padding: "14px 0",
            textAlign: "center",
            borderTop: "1px solid #e5e7eb",
            fontSize: 16,
            fontWeight: 600,
            background: "#fff",
            color: "#111",
            border: "none",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* --- Simple SVG icon set (lightweight, inline) --- */
function QrIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect x="3" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="15" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="3" y="15" width="6" height="6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M15 15h2v2h2v2h-4v-4Z" fill="currentColor" />
    </svg>
  );
}

function StarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M12 17.3l6.2 3.7-1.7-7.2L22 9.3l-7.4-.6L12 2 9.4 8.7 2 9.3l5.5 4.5-1.7 7.2L12 17.3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function UserMinusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M16 11h6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function UserCircleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function InfoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M12 8h.01M11 12h1v4h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HideIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ReportIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M3 3h18v14H5l-2 4V3z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <path
        d="M12 8v4M12 16h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function sheetBtn({ danger = false, disabled = false } = {}) {
  return {
    width: "100%",
    background: disabled ? "#374151" : (danger ? "#ef4444" : "#4b5563"),
    color: "#fff",
    border: 0,
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 15,
    opacity: disabled ? 0.75 : 1
  };
}

/* ---------------- Desktop menu ---------------- */
function DesktopMenu({ anchorEl, open, onClose, onPick, id }) {
  const [pos, setPos] = useState({ top: 0, left: 0, w: 180 });

  useEffect(() => {
    if (!open || !anchorEl) return;
    const place = () => {
      const r = anchorEl.getBoundingClientRect();
      const w = 180;
      const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
      const top = r.bottom + 6;
      setPos({ top, left, w });
    };
    place();

    const onEsc = (e) => e.key === "Escape" && onClose?.();
    const onDoc = (e) => {
      const menu = document.getElementById(`ig-menu-${id}`);
      if (!menu) return;
      const insideMenu = menu.contains(e.target);
      const insideBtn = anchorEl.contains(e.target);
      if (!insideMenu && !insideBtn) onClose?.();
    };

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onEsc);
    document.addEventListener("mousedown", onDoc);

    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onEsc);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, anchorEl, id, onClose]);

  if (!open) return null;

  const items = [
    { label: "Report", action: "report", danger: true, disabled: false },
    { label: "Unfollow", action: "unfollow", disabled: true },
    { label: "Go to post", action: "goto", disabled: true },
    { label: "Copy link", action: "copy", disabled: true },
    { label: "Cancel", action: "cancel", bold: true, disabled: false },
  ];

  const ui = (
    <div
      id={`ig-menu-${id}`}
      role="menu"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        minWidth: pos.w,
        zIndex: 10050,
        background: "#fff",
        border: "1px solid var(--line)",
        borderRadius: 8,
        boxShadow: "0 12px 32px rgba(0,0,0,.15)",
        overflow: "hidden"
      }}
    >
      {items.map((item, idx) => {
        const isDisabled = !!item.disabled;
        return (
          <button
            key={idx}
            role="menuitem"
            aria-disabled={isDisabled}
            disabled={isDisabled}
            tabIndex={isDisabled ? -1 : 0}
            onClick={() => {
              if (isDisabled) return;
              onClose?.();
              if (item.action !== "cancel") onPick?.(item.action, { id });
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "center",
              padding: "10px",
              border: "none",
              background: "transparent",
              fontSize: 14,
              cursor: isDisabled ? "default" : "pointer",
              color: isDisabled ? "#9ca3af" : (item.danger ? "#ef4444" : "#111827"),
              fontWeight: item.bold ? 600 : 400,
              opacity: isDisabled ? 0.6 : 1,
              pointerEvents: isDisabled ? "none" : "auto"
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return ReactDOM.createPortal(ui, document.body);
}

/* ---------------- PostCard (IG) ---------------- */
export function PostCard({
  post,
  onAction = () => {},
  disabled = false,
  registerViewRef,
  app,
  projectId,
  feedId,
  runSeed,
  flags
}) {
  const {
  id, author = "", avatarUrl = "", text = "", image, imageMode, images,
  video, videoMode, videoPosterUrl, reactions, metrics, time,
  authorType, showTime, flags: postFlags = {}
} = post || {};

// ✅ Add this line directly after:
const effectiveFlags = postFlags && Object.keys(postFlags).length > 0 ? postFlags : (flags || {});

const isSponsored = post.adType === "ad" || post.adType === "influencer";
const effectiveRandFlags = isSponsored
  ? { randomize_names: false, randomize_avatars: false, randomize_images: false, randomize_times: effectiveFlags.randomize_times }
  : effectiveFlags;

  // Deterministic seed for consistent randomization across sessions
  const seedParts = [
    runSeed || "run",
    (app || "ig"),
    (projectId || "global"),
    (feedId || ""),
    String(id ?? "")
  ];

  // ---- Randomization flags (per-post) ----
  const forcedRand =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("forcerand") === "1";

 const randNamesOn  = forcedRand || !!effectiveRandFlags.randomize_names;
 const randAvatarOn = forcedRand || !!(effectiveRandFlags.randomize_avatars || effectiveRandFlags.randomize_avatar);
 const randImagesOn = forcedRand || !!effectiveRandFlags.randomize_images;
 const randTimesOn  = forcedRand || !!effectiveRandFlags.randomize_times;

  // ---- IG username randomizer (deterministic) ----
  function pickIGUsername(postId, parts, fallback = "username") {
    try {
      // Use reaction-name generator as a stable pool source, then sanitize to IG-style handle
      const pool = fakeNamesFor(postId, 16, "like", 16).names || [];
      const picked = pickDeterministic(pool, [...parts, "author"]) || fallback;
      const handle = String(picked).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      return handle || fallback;
    } catch {
      return fallback;
    }
  }

// NAME
const poolNames =
  authorType === "female" ? FEMALE_NAMES :
  authorType === "male"   ? MALE_NAMES   :
                            COMPANY_NAMES;

  // ---- Author name & avatar (deterministic) ----
 const displayAuthor = React.useMemo(() => {
   if (!randNamesOn && post.author) return post.author;
   const picked = pickDeterministic(poolNames, [...seedParts, "name"]);
   return picked || post.author || (authorType === "company" ? "Sponsored" : "User");
   // deps intentionally include identifiers that change the seed
   // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [randNamesOn, authorType, post.author, runSeed, app, projectId, feedId, post.id]);
 

  const [randAvatarUrl, setRandAvatarUrl] = useState(null);
  const inferredAuthorType =
    authorType === "male" || authorType === "company" ? authorType : "female";

  useEffect(() => {
    let cancelled = false;
    if (!randAvatarOn) { setRandAvatarUrl(null); return; }
    (async () => {
      try {
        const list = await getAvatarPool(inferredAuthorType); // absolute URLs
        if (cancelled) return;
        const pick = pickDeterministic(list, [...seedParts, "avatar"]);
        setRandAvatarUrl(pick || null);
      } catch {
        if (!cancelled) setRandAvatarUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [randAvatarOn, inferredAuthorType, runSeed, app, projectId, feedId, id]);

  const effectiveAvatarUrl = randAvatarOn ? (randAvatarUrl || avatarUrl || "") : (avatarUrl || "");

  // ---- Image randomization (topic-based; when available) ----
  const [randImageUrl, setRandImageUrl] = useState(null);
  const topic = String(post?.topic || post?.imageTopic || "").trim();

  useEffect(() => {
    let cancelled = false;
    const hasSingleImage = !!(image && imageMode !== "none");
    const shouldTry = randImagesOn && !!topic && hasSingleImage;
    if (!shouldTry) { setRandImageUrl(null); return; }

    (async () => {
      try {
        const list = await getImagePool(topic); // absolute URLs
        if (cancelled) return;
        const pick = pickDeterministic(list, [...seedParts, "image"]);
        setRandImageUrl(pick || null);
      } catch {
        if (!cancelled) setRandImageUrl(null);
      }
    })();

    return () => { cancelled = true; };
  }, [randImagesOn, topic, image, imageMode, runSeed, app, projectId, feedId, id]);

  const displayImageObj = useMemo(() => {
    const hasImage = !!(image && imageMode && imageMode !== "none");
    if (!hasImage) return null;
    if (randImagesOn && randImageUrl) {
      return { url: randImageUrl, alt: image?.alt || "" };
    }
    return image || null;
  }, [image, imageMode, randImagesOn, randImageUrl]);

  const imgs = Array.isArray(images) ? images : [];
  const hasCarousel = imageMode === "multi" && imgs.length > 1;
  const isMobile = useIsMobile(700);

  // ---- Time randomization (label) ----
  const timeLabel = useMemo(() => {
    const shouldShow = showTime === false ? false : true; // default true
    if (!shouldShow) return "";

    // Prefer shared util if available
    try {
      const maybe = displayTimeForPost?.(post, {
        randomize: !!randTimesOn,
        seedParts,
      });
      if (typeof maybe === "string" && maybe.length) return maybe;
    } catch { /* fall through */ }

    // Fallback: use provided time, or a deterministic pseudo-label if flags demand randomization
    if (!time && randTimesOn) {
      // simple deterministic fallback windows: "2h", "6h", "12h", "1d"
      const opts = ["2h", "3h", "6h", "12h", "1d", "2d"];
      return pickDeterministic(opts, [...seedParts, "time"]) || "2h";
    }
    return time || "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, showTime, randTimesOn, id, runSeed, app, projectId, feedId]);

  // ---- Metrics and state ----
  const baseLikes = useMemo(() => sumReactions(reactions), [reactions]);
  const baseComments = Number(metrics?.comments || 0);
  const baseShares = Number(metrics?.shares || 0);
  const shouldShowGhosts = baseComments > 0;

  const [liked, setLiked] = useState(false);
  const [openComments, setOpenComments] = useState(false);
  const [shared, setShared] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // caption expand state
  const [expanded, setExpanded] = useState(false);

  const [menuOpenMobile, setMenuOpenMobile] = useState(false);
  const [menuOpenDesktop, setMenuOpenDesktop] = useState(false);
  const dotsBtnRef = useRef(null);

  const [commentText, setCommentText] = useState("");
  const [mySubmittedComment, setMySubmittedComment] = useState(post._localMyCommentText || "");
  const [participantComments, setParticipantComments] = useState(mySubmittedComment ? 1 : 0);

  const likes = baseLikes + (liked ? 1 : 0);
  const comments = baseComments + participantComments;
  const shares = baseShares + (shared ? 1 : 0);

  const myParticipantId =
    ((typeof window !== "undefined" && (window.SESSION?.participant_id || window.PARTICIPANT_ID)) || null) ||
    "Participant";

  const hasVideo = videoMode && videoMode !== "none" && !!video;
  const hasImage = imageMode && imageMode !== "none" && !!(displayImageObj || image);
  const refFromTracker = typeof registerViewRef === "function" ? registerViewRef(id) : undefined;

  // Autoplay in view (keeps native controls)
  const videoRef = useInViewAutoplay(0.6, { startMuted: true, unmuteOnFirstGesture: true });

  const toggleLike = () => {
    if (disabled) return;
    setLiked((v) => {
      const next = !v;
      onAction(next ? "react_pick" : "react_clear", { id, type: "like" });
      return next;
    });
  };
  const openCommentsPanel = () => {
    if (disabled) return;
    setOpenComments(true);
    onAction("comment_open", { id });
  };
  const doShare = () => {
    if (disabled || shared) return;
    setShared(true);
    onAction("share", { id });
  };
  const toggleSave = () => {
    if (disabled) return;
    setSaved((prev) => {
      const next = !prev;
      onAction(next ? "save" : "unsave", { id });
      if (next) {
        setSaveToast(true);
        window.clearTimeout(toggleSave._t);
        toggleSave._t = window.setTimeout(() => setSaveToast(false), 1600);
      } else {
        setSaveToast(false);
      }
      return next;
    });
  };

  const onSubmitComment = () => {
    const txt = commentText.trim();
    if (!txt) return;
    onAction("comment_submit", { id, text: txt, length: txt.length });
    setMySubmittedComment(txt);
    setParticipantComments((c) => c + 1);
    setCommentText("");
  };

  const onDotsClick = (e) => {
    if (disabled) return;
    e.stopPropagation();
    if (isMobile) setMenuOpenMobile(true);
    else setMenuOpenDesktop((v) => !v);
    onAction("menu_open", { id, surface: isMobile ? "mobile" : "desktop" });
  };
  const closeMobileMenu = () => setMenuOpenMobile(false);
  const closeDesktopMenu = () => setMenuOpenDesktop(false);

  useEffect(() => {
    const closeOnRouteChange = () => setMenuOpenDesktop(false);
    window.addEventListener("hashchange", closeOnRouteChange);
    return () => window.removeEventListener("hashchange", closeOnRouteChange);
  }, []);

  // Pause other playing videos when this one starts
  const handlePlay = () => {
    const current = videoRef.current;
    if (!current) return;
    document.querySelectorAll('video[data-ig-video="1"]').forEach(v => {
      if (v !== current && !v.paused) v.pause();
    });
    onAction("video_play", { id });
  };

  return (
    <article
      ref={refFromTracker}
      data-post-id={id}  
      className="insta-card"
      style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, overflow: "visible" }}
    >
      {/* Header */}
      <header className="insta-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {effectiveAvatarUrl ? (
            <img src={effectiveAvatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: "999px", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: "999px", background: "#e5e7eb" }} />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
    <span
  style={{
    fontWeight: 600,
    fontSize: 14,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: 4,
  }}
>
  {displayAuthor}
  {post.badge && (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    width="14"
    height="14"
    style={{ flexShrink: 0, marginLeft: 3 }}
  >
    <path
      fill="#1DA1F2"
      d="M512 256l-63.3 36.5 7.6 72.7-68.3 39.5-27.2 67.3-72.7-7.6L256 512l-36.5-63.3-72.7 7.6-39.5-68.3-67.3-27.2 7.6-72.7L0 256l63.3-36.5-7.6-72.7 68.3-39.5 27.2-67.3 72.7 7.6L256 0l36.5 63.3 72.7-7.6 39.5 68.3 67.3 27.2-7.6 72.7L512 256z"
    />
    <path
      fill="#fff"
      d="M227.3 342.6L134 249.3l36.4-36.4 56.9 56.9 114.3-114.3 36.4 36.4-150.7 150.7z"
    />
  </svg>
)}
</span>

{/* Sponsored Ad (CTA type) */}
{post.adType === "ad" && (
  <span
    style={{
      fontSize: 12,
      color: "#4b5563", // darker grey
      marginTop: 1,
      lineHeight: 1.1,
    }}
  >
    Sponsored
  </span>
)}

{/* Influencer Partnership Disclosure */}
{post.adType === "influencer" && post.adPartner && (
  <span
    style={{
      fontSize: 12,
      color: "#737373", // lighter IG-style grey
      marginTop: 1,
      lineHeight: 1.1,
    }}
  >
    Paid partnership with{" "}
    <strong style={{ color: "#111" }}>{post.adPartner}</strong>
  </span>
)}
</div>
        </div>

        <button
          ref={dotsBtnRef}
          className="dots"
          title="More"
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={isMobile ? menuOpenMobile : menuOpenDesktop}
          onClick={onDotsClick}
          style={{ border: "none", background: "transparent", color: "#6b7280", cursor: "pointer", padding: ".25rem .4rem", lineHeight: 1, display: "inline-flex" }}
          disabled={disabled}
        >
          <DotsIcon />
        </button>
      </header>

      {!isMobile && (
        <DesktopMenu
          anchorEl={dotsBtnRef.current}
          open={menuOpenDesktop}
          onClose={closeDesktopMenu}
          onPick={onAction}
          id={id}
        />
      )}

      {/* Media */}
      {(hasVideo || hasCarousel || hasImage) && (
        <div className="insta-media" style={{ position: "relative", background: "#000" }}>
          <div
            style={{
              width: "100%",
              aspectRatio: hasVideo ? "4 / 5" : "1 / 1",
              maxHeight: "80vh",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {hasVideo ? (
              <video
                ref={videoRef}
                data-ig-video="1"
                src={video?.url || video}
                poster={videoPosterUrl || undefined}
                controls
                playsInline
                muted
                autoPlay
                loop
                preload="auto"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                onPlay={handlePlay}
                onPause={() => onAction("video_pause", { id })}
                onEnded={() => onAction("video_ended", { id })}
              />
            ) : hasCarousel ? (
              <IGCarousel items={imgs} />
            ) : imageMode === "multi" && imgs.length === 1 ? (
              <img
                src={imgs[0].url}
                alt={imgs[0].alt || ""}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                loading="lazy"
                decoding="async"
              />
            ) : displayImageObj?.svg ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: displayImageObj.svg.replace(
                    "<svg ",
                    "<svg preserveAspectRatio='xMidYMid slice' style='position:absolute;inset:0;display:block;width:100%;height:100%' "
                  ),
                }}
              />
            ) : (displayImageObj?.url || image?.url) ? (
              <img
                src={displayImageObj?.url || image?.url}
                alt={(displayImageObj?.alt || image?.alt) || ""}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  objectPosition: `${
                    (image?.focalX ?? 50)
                  }% ${
                    (image?.focalY ?? 50)
                  }%`,
                }}
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </div>
        </div>
      )}

      {/* CTA bar for sponsored ads */}
{post.adType === "ad" && post.adButtonText && (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      background: "#0095f6",          // full blue bar
      borderTop: "1px solid #e5e7eb",
      marginTop: "-1px",              // attaches directly to image
      cursor: post.adUrl ? "pointer" : "default",
      color: "#fff",
      fontWeight: 600,
      fontSize: 14,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    }}
    onClick={() => {
      if (post.adUrl) window.open(post.adUrl, "_blank", "noopener,noreferrer");
    }}
  >
    <span
      style={{
        flex: 1,
        color: "#fff",
      }}
    >
      {post.adButtonText}
    </span>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      fill="none"
      stroke="#fff"          // white chevron
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <polyline points="6 3 14 9 6 15" />
    </svg>
  </div>
)}

      {/* Actions row */}
      <div
        className="insta-actions"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 10px 6px 10px", color: "#111827" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            aria-label="Like"
            onClick={toggleLike}
            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, color: "#111827" }}
            disabled={disabled}
          >
            <HeartIcon filled={liked} />
            {isMobile && likes > 0 && <span style={{ fontWeight: 600, fontSize: 14 }}>{likes.toLocaleString()}</span>}
          </button>

          <button
            aria-label="Comment"
            onClick={openCommentsPanel}
            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, color: "#111827" }}
            disabled={disabled}
          >
            <CommentIcon />
            {isMobile && comments > 0 && <span style={{ fontWeight: 600, fontSize: 14 }}>{comments.toLocaleString()}</span>}
          </button>

          <button
            aria-label="Share"
            onClick={doShare}
            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, color: "#111827" }}
            disabled={disabled}
          >
            <SendIcon />
            {isMobile && shares > 0 && <span style={{ fontWeight: 600, fontSize: 14 }}>{shares.toLocaleString()}</span>}
          </button>
        </div>

        <button
          aria-label="Save"
          onClick={toggleSave}
          style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", position: "relative", color: "#111827" }}
          disabled={disabled}
        >
          {saved ? <SaveIconFilled /> : <SaveIcon />}
          {saveToast && (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: "absolute",
                right: 0,
                top: "-34px",
                background: "rgba(0,0,0,0.85)",
                color: "#fff",
                padding: "4px 8px",
                borderRadius: 6,
                fontSize: 12,
                pointerEvents: "none",
                transform: "translateY(6px)",
                opacity: 0,
                animation: "igSavedToast 1.6s ease forwards",
                boxShadow: "0 6px 18px rgba(0,0,0,.25)",
                whiteSpace: "nowrap",
                zIndex: 10000
              }}
            >
              Saved
            </div>
          )}
        </button>
      </div>

      {/* Desktop-only likes label with the word “likes” */}
      {!isMobile && likes > 0 && (
        <div style={{ padding: "0 12px 6px 12px", fontWeight: 600 }}>
          {likes.toLocaleString()} likes
        </div>
      )}

      {/* Caption with IG PostText (username floats for first line) */}
      {text?.trim() && (
        <div className="ig-caption-row">
          <PostText
            prefix={<span className="ig-username">{displayAuthor}</span>}
            text={text}
            expanded={expanded}
            onExpand={() => setExpanded(true)}
            onClamp={() => onAction("text_clamped", { id })}
          />
        </div>
      )}

      {/* Time (randomized if flag on) */}
      {timeLabel && (
        <div style={{ padding: "6px 12px 12px 12px", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".02em" }}>
          {timeLabel}
        </div>
      )}

   {/* Comments */}
{openComments && (
  (isMobile ? (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) setOpenComments(false); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          animation: "igSheetSlideUp 0.42s cubic-bezier(0.25,1,0.5,1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "80vh",
          overflowY: "auto",
          position: "relative",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 38,
            height: 4,
            background: "rgba(0,0,0,.2)",
            borderRadius: 999,
            margin: "8px auto 14px",
          }}
        />

        {/* Header */}
        <div
          style={{
            fontWeight: 600,
            fontSize: 16,
            textAlign: "center",
            paddingBottom: 10,
            borderBottom: "1px solid #eee",
          }}
        >
          Comments
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "20px", textAlign: "center" }}>
          {baseComments + participantComments > 0 ? (
            <div>Comments will appear here</div>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                No comments yet
              </div>
              <div style={{ color: "#6b7280", fontSize: 14 }}>
                Start the conversation.
              </div>
            </>
          )}
        </div>

        {/* Comment input */}
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            padding: "8px 12px",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 8,
            position: "sticky",
            bottom: 0,
          }}
        >
          <img
            src={neutralAvatarDataUrl(32)}
            alt=""
            width={32}
            height={32}
            style={{ borderRadius: "999px" }}
          />
          <input
            type="text"
            placeholder="Start the conversation..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "#f9fafb",
              borderRadius: 20,
              padding: "8px 14px",
              fontSize: 14,
            }}
          />
          <button
            onClick={onSubmitComment}
            disabled={!commentText.trim()}
            style={{
              background: "transparent",
              border: "none",
              color: commentText.trim() ? "#0095f6" : "#9ca3af",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  ) : (
    <Modal
      title="Comments"
      onClose={() => { setOpenComments(false); onAction("comment_close", { id }); }}
      wide={false}
    >
      {(shouldShowGhosts
        ? Array.from({ length: Math.min(3, baseComments) })
        : [0]
      ).map((_, i) => (
        <div
          key={`ig-ghost-${i}`}
          className="ghost-row"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: ".6rem",
            marginTop: i === 0 ? 2 : 10,
          }}
        >
          <div className="ghost-avatar sm" />
          <div className="ghost-lines" style={{ flex: 1 }}>
            <div className="ghost-line w-80" />
            <div className="ghost-line w-50" />
          </div>
        </div>
      ))}

      {!!mySubmittedComment && (
        <div
          className="ghost-row"
          style={{
            alignItems: "flex-start",
            gap: ".6rem",
            marginTop: shouldShowGhosts ? 10 : 2,
          }}
        >
          <img
            src={neutralAvatarDataUrl(28)}
            alt=""
            width={28}
            height={28}
            style={{
              display: "block",
              borderRadius: "999px",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: ".9rem",
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {String(myParticipantId)}
            </div>
            <div
              style={{
                marginTop: 2,
                color: "#111827",
                fontSize: ".95rem",
                lineHeight: 1.35,
                whiteSpace: "pre-wrap",
              }}
            >
              {mySubmittedComment}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <textarea
          className="textarea"
          rows={4}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Write your comment..."
          disabled={disabled}
        />
      </div>

      <div
        className="row-end"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 8,
        }}
      >
        <button
          className="btn"
          onClick={() => {
            setOpenComments(false);
            onAction("comment_close", { id });
          }}
        >
          Close
        </button>
        <button
          className="btn primary"
          onClick={onSubmitComment}
          disabled={!commentText.trim() || disabled}
        >
          Post
        </button>
      </div>
    </Modal>
  ))
)}

      {isMobile && (
        <MobileSheet open={menuOpenMobile} onClose={closeMobileMenu}>
  
</MobileSheet>
      )}

<style>{`
  /* --- Keyframes for sheet animation --- */
  @keyframes igSheetSlideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes igBackdropFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* --- Sheet (bottom modal) --- */
  .ig-sheet {
    animation: igSheetSlideUp 0.35s cubic-bezier(0.25, 1, 0.5, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }

  [role="dialog"] {
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: igBackdropFadeIn 0.33s ease-out;
  }

  /* Hide scrollbars for clean iOS/Android look */
  .ig-sheet::-webkit-scrollbar {
    display: none;
  }

  /* Subtle bounce feedback when pressing menu buttons */
  .ig-sheet button:active {
    transform: scale(0.98);
    transition: transform 0.1s ease;
  }
`}</style>

    </article>
  );
}

/* ---------------- Feed (IG) ---------------- */
export function Feed({ posts, registerViewRef, disabled, log, onSubmit, flags, app, projectId, feedId, runSeed }) {
  const STEP = 6;
  const FIRST = Math.min(8, posts.length || 0);
  const [visibleCount, setVisibleCount] = useState(FIRST);
  const isMobile = useIsMobile(700);

  useEffect(() => {
    if (!posts?.length) return;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ didTimeout: false }), 200));
    const handle = ric(() => setVisibleCount((c) => Math.min(c + STEP, posts.length)));
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(handle) : clearTimeout(handle));
  }, [posts]);

  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisibleCount((c) => Math.min(c + STEP, posts.length))),
      { root: null, rootMargin: "600px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.unobserve(el);
  }, [posts.length]);

  const renderPosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);

  return (
    <div className="feed-wrap">
      {isMobile && <StoryBar />}

      <main className="insta-feed">
        {renderPosts.map((p) => (
         <PostCard
  key={p.id}
  post={p}
  onAction={log}
  disabled={disabled}
  registerViewRef={registerViewRef}
  flags={flags}            // ✅ keep this
  runSeed={runSeed}
  app={app}
  projectId={projectId}
  feedId={feedId}
/>
        ))}
        <div ref={sentinelRef} aria-hidden="true" />

        {visibleCount >= posts.length && (
          <div
            className="feed-end"
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              margin: "1.2rem 0",
              fontSize: 14,
              color: "#6b7280"
            }}
          >
            End of Feed
          </div>
        )}

        <div
          className="feed-submit"
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            justifyContent: "center",
            margin: "1.5rem 0"
          }}
        >
          <button type="button" className="btn primary" onClick={onSubmit} disabled={disabled === true}>
            Submit
          </button>
        </div>
      </main>
    </div>
  );
}

export default {};