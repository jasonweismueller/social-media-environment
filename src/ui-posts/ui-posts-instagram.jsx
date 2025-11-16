// components-ui-posts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Modal, neutralAvatarDataUrl, PostText } from "../ui-core";
import { IGCarousel } from "../ui-core/ui-ig-carousel";
import { useInViewAutoplay, displayTimeForPost, getAvatarPool, getImagePool, pickDeterministic, fakeNamesFor } from "../utils";
import { FEMALE_NAMES, MALE_NAMES, COMPANY_NAMES } from "./names";
import { MobileSheet, ShareSheet, useSwipeToClose} from "./ui-post-mobile-instagram";
import { ShareSheetDesktop } from "./ui-post-desktop-instagram";
import { BioHoverCard } from "./ui-posts-bio-instagram";



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


/* ---------------- Desktop menu ---------------- */
function DesktopMenu({ open, onClose, onPick, id, onAction }) {
  if (!open) return null;

  const items = [
    { label: "Report", action: "report", danger: true, disabled: false },
    { label: "Unfollow", action: "unfollow", disabled: true },
    { label: "Go to post", action: "goto", disabled: true },
    { label: "Copy link", action: "copy", disabled: true },
    { label: "Cancel", action: "cancel", bold: true, disabled: false },
  ];

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10050,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
          overflow: "hidden",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          animation: "popIn 0.25s cubic-bezier(0.25,1,0.5,1)",
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

                // 🔥 REGISTER REPORT ACTION
                if (item.action === "report") {
                  onAction?.("report_misinformation_click", { post_id: id });
                }

                onClose?.();
                if (item.action !== "cancel") {
                  onPick?.("report_misinformation_click", { id });
                }
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "14px",
                border: "none",
                background: "transparent",
                fontSize: 15,
                cursor: isDisabled ? "default" : "pointer",
                color: isDisabled
                  ? "#9ca3af"
                  : item.danger
                  ? "#ef4444"
                  : "#111827",
                fontWeight: item.bold ? 600 : 400,
                borderTop: idx === 0 ? "none" : "1px solid #e5e7eb",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) =>
                !isDisabled &&
                (e.currentTarget.style.background = "rgba(0,0,0,0.05)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
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
const likeButtonRef = useRef(null);

const [shareSheetOpen, setShareSheetOpen] = useState(false);

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

  // Hover triggers on both
const avatarRef = useRef(null);
const authorRef = useRef(null);
const [hoverTargetEl, setHoverTargetEl] = useState(null);
const attachBioHover = (ref) => ({
  ref,
  onMouseEnter: () => showHover(ref.current),
  onMouseLeave: hideHover,
});

const hideDelayRef = useRef(null);

const showHover = (el) => {
  if (!isMobile && post.showBio) {
    clearTimeout(hideDelayRef.current);
    setHoverTargetEl(el);
  }
};

const hideHover = () => {
  hideDelayRef.current = setTimeout(() => {
    setHoverTargetEl(null);
  }, 150);
};

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
    onAction(next ? "react_pick" : "react_clear", { post_id: id, type: "like" });
    return next;
  });
};
  const openCommentsPanel = () => {
    if (disabled) return;
    setOpenComments(true);
    onAction("comment_open", {post_id: id });
  };
const doShare = () => {
  if (disabled) return;
  setShareSheetOpen(true); // ✅ open the sheet for both desktop and mobile
  onAction("share_open", {post_id: id, surface: isMobile ? "mobile" : "desktop" });
};
  const toggleSave = () => {
    if (disabled) return;
    setSaved((prev) => {
      const next = !prev;
      onAction(next ? "save" : "unsave", {post_id : id });
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
    onAction("comment_submit", {post_id : id, text: txt, length: txt.length });
    setMySubmittedComment(txt);
    setParticipantComments((c) => c + 1);
    setCommentText("");
  };

  const onDotsClick = (e) => {
    if (disabled) return;
    e.stopPropagation();
    if (isMobile) setMenuOpenMobile(true);
    else setMenuOpenDesktop((v) => !v);
    onAction("menu_open", {post_id : id, surface: isMobile ? "mobile" : "desktop" });
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
    onAction("video_play", {post_id : id });
  };

const { translateY, dragging, bind } = useSwipeToClose(() => setOpenComments(false));


const VerifiedBadge = (
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
);

// ❤️ Double tap like state + animation
const [showHeartBurst, setShowHeartBurst] = useState(false);
const lastTapRef = useRef(0);

const handleMediaTap = () => {
  if (!isMobile) return;
  const now = Date.now();

  if (now - lastTapRef.current < 300) {
    if (!liked) toggleLike();

    const mediaEl = likeButtonRef.current?.closest(".insta-media");
    if (mediaEl) {
      const rect = likeButtonRef.current.getBoundingClientRect();
      const parentRect = mediaEl.getBoundingClientRect();
      const x = rect.left - parentRect.left + rect.width / 2;
      const y = rect.top - parentRect.top + rect.height / 2;

      // First show the heart
      setShowHeartBurst(true);

      // Then apply CSS vars *after* the element exists
      setTimeout(() => {
        const inner = mediaEl.querySelector(".ig-heart-inner");
        if (inner) {
          inner.style.setProperty("--like-x", `${x}px`);
          inner.style.setProperty("--like-y", `${y}px`);
        }
      }, 0);

      setTimeout(() => setShowHeartBurst(false), 1200);
    }
  }

  lastTapRef.current = now;
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
       <img
  {...attachBioHover(avatarRef)}
  src={effectiveAvatarUrl}
  alt=""
  style={{ width: 34, height: 34, borderRadius: "999px", objectFit: "cover" }}
/>
          ) : (
            <div style={{ width: 34, height: 34, borderRadius: "999px", background: "#e5e7eb" }} />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
   <span
  {...attachBioHover(authorRef)}
  style={{
    fontWeight: 600,
    fontSize: 14,
    cursor: post.showBio ? "pointer" : "default",
  }}
>
  {displayAuthor}
  {post.badge && VerifiedBadge}
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
          onAction={onAction}
        />
      )}

      {/* Media */}
      {(hasVideo || hasCarousel || hasImage) && (
        <div className="insta-media" style={{ position: "relative", background: "#000" }}>
        <div
  onClick={handleMediaTap}
  style={{
    position: "relative",
    width: "100%",
    aspectRatio: hasVideo ? "4 / 5" : "1 / 1",
    maxHeight: "80vh",
    overflow: "hidden",
  }}
>
  {showHeartBurst && (
    <div className="ig-heart-burst">
      <div className="ig-heart-inner">
      <svg viewBox="0 0 24 24" width="100" height="100">
        <path
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-.99-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.77-8.84a5.5 5.5 0 0 0 0-7.78Z"
          fill="#ed4956"
          stroke="#ed4956"
          strokeWidth="1"
        />
      </svg>
    </div>
    </div>
  )}

  {/* ORIGINAL IMAGE / VIDEO / CAROUSEL BLOCK HERE */}
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
                onPause={() => onAction("video_pause", {post_id : id })}
                onEnded={() => onAction("video_ended", {post_id : id })}
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
  // 🔥 Track CTA click (IG ad)
  onAction?.("cta_click", {
    post_id: id,
    label: post.adButtonText || "",
    url: post.adUrl || ""
  });

  // open external link
  if (post.adUrl) {
    window.open(post.adUrl, "_blank", "noopener,noreferrer");
  }
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
          ref={likeButtonRef}
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
  <div
    style={{
      padding: "0 12px 6px 12px",
      fontWeight: 600,
      fontSize: 14,              // ✅ match caption size
      lineHeight: 1.4,           // ✅ same rhythm
      color: "#111827",          // consistent neutral text
    }}
  >
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
            onClamp={() => onAction("text_clamped", {post_id : id })}
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
  className="comment-sheet"
  aria-modal="true"
  tabIndex="-1"
  onClick={(e) => {
    if (e.target === e.currentTarget) setOpenComments(false);
  }}
  style={{
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)", // backdrop stays fixed
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 9999,
  }}
>
  {/* 👇 Only this inner sheet gets the swipe transform */}
  <div
    {...bind}
    style={{
      width: "100%",
      maxWidth: 480,
      background: "#fff",
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      animation: "igSheetSlideUp 0.5s cubic-bezier(0.25,1,0.5,1)",
      display: "flex",
      flexDirection: "column",
      maxHeight: "85vh",
      minHeight: "55vh",
      overflowY: "auto",
      position: "relative",
      transform: `translateY(${translateY}px)`,   // ✅ apply swipe only here
      transition: dragging ? "none" : "transform 0.3s ease",
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

    {/* Comments area */}
<div
  style={{
    flex: 1,
    padding: "20px",
    textAlign: "center",
    overflowY: "auto",
  }}
>
  {baseComments + participantComments === 0 ? (
    <>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
        No comments yet
      </div>
      <div style={{ color: "#6b7280", fontSize: 14 }}>
        Start the conversation.
      </div>
    </>
  ) : (
    <>
      {/* Show up to 5 neutral users */}
      {Array.from({ length: Math.min(5, baseComments) }).map((_, i) => (
        <div
          key={`ghost-${i}`}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: ".6rem",
            marginBottom: 14,
            textAlign: "left",
          }}
        >
          {/* Neutral avatar */}
          <img
            src={neutralAvatarDataUrl(32)}
            alt=""
            width={32}
            height={32}
            style={{
              borderRadius: "999px",
              background: "#e5e7eb",
              flexShrink: 0,
            }}
          />

          {/* Comment text placeholder */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 4,
              }}
            >
              User {i + 1}
            </div>
            <div
              style={{
                background: "#e5e7eb",
                borderRadius: 6,
                height: 12,
                width: "80%",
              }}
            />
          </div>
        </div>
      ))}

      {!!mySubmittedComment && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: ".6rem",
            marginTop: 10,
            textAlign: "left",
          }}
        >
          <img
            src={neutralAvatarDataUrl(32)}
            alt=""
            width={32}
            height={32}
            style={{ borderRadius: "999px" }}
          />
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 2,
              }}
            >
              {String(myParticipantId)}
            </div>
            <div
              style={{
                color: "#111827",
                fontSize: 14,
                lineHeight: 1.35,
                whiteSpace: "pre-wrap",
              }}
            >
              {mySubmittedComment}
            </div>
          </div>
        </div>
      )}
    </>
  )}
</div>

      
     {/* Comment input */}
<form
  onSubmit={(e) => {
    e.preventDefault();
    onSubmitComment();
  }}
  style={{
    borderTop: "1px solid #e5e7eb",
    padding: "8px 12px",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 8,
    position: "relative",
marginTop: "auto",
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
  placeholder={
    baseComments + participantComments === 0
      ? "Start the conversation..."
      : "Join the conversation..."
  }
  value={commentText}
  onChange={(e) => setCommentText(e.target.value)}
  inputMode="text"
  enterKeyHint="send"
  autoCorrect="off"
  autoCapitalize="sentences"
  autoComplete="off"
  spellCheck="false"
  style={{
    flex: 1,
    border: "none",
    outline: "none",
    background: "#f9fafb",
    borderRadius: 20,
    padding: "10px 14px",
    fontSize: 16,
    lineHeight: 1.3,
  }}
/>

  <button
    type="submit"
    disabled={!commentText.trim()}
    style={{
      background: "transparent",
      border: "none",
      color: commentText.trim() ? "#0095f6" : "#9ca3af",
      fontWeight: 600,
      fontSize: 15,
    }}
  >
    Post
  </button>
</form>
      </div>
    </div>
   ) : (
    <div className="ig-comment-modal">
      <Modal
        onClose={() => {
          setOpenComments(false);
          onAction("comment_close", { post_id: id });
        }}
        wide={true}
        title={null}
      >
        <div className="ig-comment-inner">
          {/* Close button on top-right of the whole card */}
         <button
  onClick={() => {
    setOpenComments(false);
    onAction("comment_close", { post_id: id });
  }}
  aria-label="Close"
  style={{
    position: "absolute",
    top: 12,
    right: 12,
    border: "none",
    background: "transparent",
    fontSize: 22,           // same as ShareSheet
    cursor: "pointer",
    color: "#737373",       // same as ShareSheet
    lineHeight: 1,
    zIndex: 10,
  }}
>
  ×
</button>

          {/* LEFT: media */}
          <div className="ig-comment-media">
            {(displayImageObj?.url || image?.url) ? (
              <img
                src={displayImageObj?.url || image?.url}
                alt={(displayImageObj?.alt || image?.alt) || ""}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: `${
                    image?.focalX != null ? image.focalX : 50
                  }% ${
                    image?.focalY != null ? image.focalY : 50
                  }%`,
                }}
              />
            ) : (
              <div
                style={{
                  color: "#fff",
                  fontSize: 18,
                  textAlign: "center",
                  padding: "40px 0",
                }}
              >
                No image
              </div>
            )}
          </div>

          {/* RIGHT: caption + comments */}
          <div className="comment-pane">
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderBottom: "1px solid #eee",
              }}
            >
              {effectiveAvatarUrl ? (
                <img
                  src={effectiveAvatarUrl}
                  alt={displayAuthor}
                  width={32}
                  height={32}
                  style={{ borderRadius: "999px", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "999px",
                    background: "#e5e7eb",
                  }}
                />
              )}
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                {displayAuthor}
                {post.badge && VerifiedBadge}
              </span>
            </div>

            {/* Caption */}
            {text?.trim() && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "14px 16px 8px 16px",
                }}
              >
                <img
                  src={effectiveAvatarUrl || neutralAvatarDataUrl(32)}
                  alt={displayAuthor}
                  width={32}
                  height={32}
                  style={{ borderRadius: "999px", objectFit: "cover" }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {displayAuthor}
                    </span>
                    {post.badge && VerifiedBadge}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "#111827",
                      lineHeight: 1.4,
                      marginTop: 2,
                    }}
                  >
                    {text}
                  </div>
                </div>
              </div>
            )}

            {/* Comments */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "14px 16px",
                background: "#fff",
              }}
            >
              {baseComments + participantComments === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    marginTop: "40%",
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  No comments yet.
                </div>
              ) : (
                <>
                  {Array.from({ length: Math.min(5, baseComments) }).map(
                    (_, i) => (
                      <div
                        key={`ghost-${i}`}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: ".6rem",
                          marginBottom: 14,
                        }}
                      >
                        <img
                          src={neutralAvatarDataUrl(32)}
                          alt=""
                          width={32}
                          height={32}
                          style={{ borderRadius: "999px", flexShrink: 0 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              marginBottom: 4,
                            }}
                          >
                            User {i + 1}
                          </div>
                          <div
                            style={{
                              background: "#e5e7eb",
                              borderRadius: 6,
                              height: 12,
                              width: "80%",
                            }}
                          />
                        </div>
                      </div>
                    )
                  )}

                  {!!mySubmittedComment && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: ".6rem",
                        marginTop: 10,
                      }}
                    >
                      <img
                        src={neutralAvatarDataUrl(32)}
                        alt=""
                        width={32}
                        height={32}
                        style={{ borderRadius: "999px" }}
                      />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            marginBottom: 2,
                          }}
                        >
                          {String(myParticipantId)}
                        </div>
                        <div
                          style={{
                            color: "#111827",
                            fontSize: 14,
                            lineHeight: 1.35,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {mySubmittedComment}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Add comment input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSubmitComment();
              }}
              style={{
                borderTop: "1px solid #e5e7eb",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#fff",
              }}
            >
              <input
                type="text"
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  background: "transparent",
                }}
              />
              <button
                type="submit"
                disabled={!commentText.trim()}
                style={{
                  border: "none",
                  background: "transparent",
                  color: commentText.trim() ? "#0095f6" : "#9ca3af",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: commentText.trim() ? "pointer" : "default",
                }}
              >
                Post
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  ))
)}

      {isMobile && (
  <MobileSheet
    open={menuOpenMobile}
    onClose={closeMobileMenu}
    onAction={onAction}
    postId={id}
  />
)}

    {/* --- Share Sheet (mobile vs desktop) --- */}
{isMobile ? (
  <ShareSheet
    open={shareSheetOpen}
    onClose={() => setShareSheetOpen(false)}
    onShare={(data) => {
      setShared(true);
      onAction("share_target", { post_id: id, friend: data.friend || data.friends, message: data.message });
      setShareSheetOpen(false);
    }}
  />
) : (
  <ShareSheetDesktop
    open={shareSheetOpen}
    onClose={() => setShareSheetOpen(false)}
    onShare={(data) => {
      setShared(true);
      onAction("share_target", { post_id: id, friends: data.friends, message: data.message });
      setShareSheetOpen(false);
    }}
  />
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

{hoverTargetEl && !isMobile && post.showBio && (
  <BioHoverCard
    anchorEl={hoverTargetEl}
    author={displayAuthor}
    avatarUrl={effectiveAvatarUrl}
    bio={post}
    verified={!!post.badge}
    hideHover={hideHover}          // 👈 REQUIRED
    hideDelayRef={hideDelayRef}    // 👈 REQUIRED
  />
)}

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
)}
      </main>
    </div>
  );
}

export default {};