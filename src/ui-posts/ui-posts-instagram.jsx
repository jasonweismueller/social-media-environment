// components-ui-posts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Modal, neutralAvatarDataUrl, PostText } from "../ui-core";
import { IGCarousel } from "../ui-core/ui-ig-carousel";
import { useInViewAutoplay, displayTimeForPost, getAvatarPool, getImagePool, pickDeterministic, fakeNamesFor } from "../utils";

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
function MobileSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end"
      }}
    >
      <div
        style={{
          width: "100%",
          background: "#1f2937",
          color: "#fff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 8,
          maxHeight: "75vh",
          overflowY: "auto",
          boxShadow: "0 -12px 32px rgba(0,0,0,.35)"
        }}
      >
        <div style={{ width: 42, height: 4, background: "rgba(255,255,255,.25)", borderRadius: 999, margin: "8px auto 10px" }} />
        {children}
        <button className="btn" style={{ width: "100%", marginTop: 8, background: "#374151", color: "#fff" }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
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
  runSeed
}) {
  const {
  id, author = "", avatarUrl = "", text = "", image, imageMode, images,
  video, videoMode, videoPosterUrl, reactions, metrics, time,
  authorType, showTime, flags: postFlags = {}
} = post || {};

// ✅ Add this fallback immediately after destructuring:
const mergedFlags = postFlags || flags || {};

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

  const randNamesOn  = forcedRand || !!postFlags.randomize_names;
  const randAvatarOn = forcedRand || !!(postFlags.randomize_avatars || postFlags.randomize_avatar);
  const randImagesOn = forcedRand || !!postFlags.randomize_images;
  const randTimesOn  = forcedRand || !!postFlags.randomize_times;

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

  // ---- Author name & avatar (deterministic) ----
  const displayAuthor = useMemo(() => {
    if (!randNamesOn) return author || "username";
    return pickIGUsername(id, seedParts, author || "username");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [randNamesOn, author, id, runSeed, app, projectId, feedId]);

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
          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayAuthor}
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

      {openComments && (
        <Modal
          title="Comments"
          onClose={() => { setOpenComments(false); onAction("comment_close", { id }); }}
          wide={false}
        >
          {(shouldShowGhosts ? Array.from({ length: Math.min(3, baseComments) }) : [0]).map((_, i) => (
            <div key={`ig-ghost-${i}`} className="ghost-row" style={{ display: "flex", alignItems: "flex-start", gap: ".6rem", marginTop: i === 0 ? 2 : 10 }}>
              <div className="ghost-avatar sm" />
              <div className="ghost-lines" style={{ flex: 1 }}>
                <div className="ghost-line w-80" />
                <div className="ghost-line w-50" />
              </div>
            </div>
          ))}

          {!!mySubmittedComment && (
            <div className="ghost-row" style={{ alignItems: "flex-start", gap: ".6rem", marginTop: shouldShowGhosts ? 10 : 2 }}>
              <img src={neutralAvatarDataUrl(28)} alt="" width={28} height={28} style={{ display: "block", borderRadius: "999px", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".9rem", fontWeight: 600, lineHeight: 1.2 }}>{String(myParticipantId)}</div>
                <div style={{ marginTop: 2, color: "#111827", fontSize: ".95rem", lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
                  {mySubmittedComment}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <textarea className="textarea" rows={4} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write your comment..." disabled={disabled} />
          </div>

          <div className="row-end" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={() => { setOpenComments(false); onAction("comment_close", { id }); }}>Close</button>
            <button className="btn primary" onClick={onSubmitComment} disabled={!commentText.trim() || disabled}>Post</button>
          </div>
        </Modal>
      )}

      {isMobile && (
        <MobileSheet open={menuOpenMobile} onClose={closeMobileMenu}>
          <div style={{ display: "grid", gap: 8 }}>
            <button className="btn" style={sheetBtn({ danger: true })} onClick={() => { onAction("menu_report", { id, surface: "mobile" }); closeMobileMenu(); }}>
              Report
            </button>
            <button className="btn" style={sheetBtn({ disabled: true })} disabled>Unfollow</button>
            <button className="btn" style={sheetBtn({ disabled: true })} disabled>Go to post</button>
            <button className="btn" style={sheetBtn({ disabled: true })} disabled>Copy link</button>
            <button className="btn" style={sheetBtn({ disabled: true })} disabled>About this account</button>
          </div>
        </MobileSheet>
      )}

      <style>{`
        @keyframes igSavedToast {
          0%   { opacity: 0; transform: translateY(6px); }
          12%  { opacity: 1; transform: translateY(0); }
          85%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(6px); }
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