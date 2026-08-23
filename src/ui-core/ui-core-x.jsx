// ui-core-x.jsx
// X (Twitter) counterpart to ui-core-facebook.jsx/ui-core-instagram.jsx —
// the small shared UI primitives every app's PostCard/App-*.jsx build on
// (icons, PostText clamp/expand, Modal, NamesPeek hover tooltip, neutral
// avatar placeholder, overlays, the route-aware top bar). Dispatched via
// ui-core/index.js's per-app `UI` object, same pattern as the other three.
//
// Deliberately does NOT carry over ui-core-facebook.jsx's own local
// SurveyQuestion/SurveyScreen/SurveyScreenMobile/SurveyPrefaceFlow/
// PageScaffold — those are dead code there (never included in
// ui-core/index.js's destructured re-export list; the real, shared survey
// engine participants actually see comes from ui-survey.jsx/
// ui-survey-mobile.jsx via `export *`), so there's nothing to clone.
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { uid } from "../utils";

/* ------------------------------- Tiny helpers ------------------------------ */
function useIsMobile(breakpointPx = 700) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width:${breakpointPx}px)`).matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener?.("change", onChange);
    mq.addListener && mq.addListener(onChange);
    return () => {
      mq.removeEventListener?.("change", onChange);
      mq.removeListener && mq.removeListener(onChange);
    };
  }, [breakpointPx]);

  return isMobile;
}

function tryEnterFullscreenLocal(el) {
  if (!el || typeof document === "undefined") return;
  if (document.fullscreenElement) return;
  try {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (fn) fn.call(el);
  } catch (_) {}
}

/* ------------------------------- Icons -------------------------------------
   IconLike is a heart — on X this *is* the primary Like glyph (unlike
   Facebook, where the heart is only the "Love" reaction and IconThumb is
   the primary Like). IconBadge (blue checkmark) already happened to be
   Twitter-blue (#1d9bf0) in every existing app's copy, reused as-is. */
export const IconLike = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path fill="currentColor" d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z"/>
  </svg>
);
export const IconReply = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ display: "block" }} {...p}>
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
// Kept as `IconComment` too (same shape) — several shared call sites
// (survey post-reminder chrome, PostText) import a generic "IconComment"
// name from ui-core's per-app dispatch; X just has no separate concept.
export const IconComment = IconReply;
export const IconRepost = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M7 7h10a2 2 0 0 1 2 2v3M17 17H7a2 2 0 0 1-2-2V9M10 4 7 7l3 3M14 20l3-3-3-3"/>
  </svg>
);
export const IconShare = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <circle cx="6" cy="12" r="2" fill="currentColor" />
    <circle cx="18" cy="6" r="2" fill="currentColor" />
    <circle cx="18" cy="18" r="2" fill="currentColor" />
    <path d="M8 11l8-4M8 13l8 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
export const IconBookmark = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 4h12a1 1 0 0 1 1 1v15l-7-4.5L5 20V5a1 1 0 0 1 1-1z"/>
  </svg>
);
export const IconViews = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
    <path fill="none" stroke="currentColor" strokeWidth="2" d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12Z"/>
    <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="2"/>
  </svg>
);
export const IconDots = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
    <circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>
  </svg>
);
// The real X logo mark, not a re-drawing of the bird — the current brand
// is literally a geometric "X", easy to reproduce without touching
// anything closer to protected illustration work.
export const IconLogo = (p) => (
  <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" {...p}>
    <rect width="32" height="32" rx="6" fill="#000"/>
    <path fill="#fff" d="M9 9h3.6l4 5.4L21 9h2.4l-5.9 6.8L23.6 23H20l-4.4-5.9L10.4 23H8l6.3-7.3L9 9z"/>
  </svg>
);
export const IconInfo = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M12 17v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="7" r="1.5" fill="currentColor"/>
  </svg>
);
export const IconUsers = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path fill="currentColor" d="M16 11a4 4 0 1 0-3.2-6.5A4 4 0 0 0 16 11zM8 12a4 4 0 1 0-3.2-6.5A4 4 0 0 0 8 12z"/>
    <path fill="currentColor" d="M2 19a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1H2v-1zm10 0a6.99 6.99 0 0 1 3.3-6h.7a6 6 0 0 1 6 6v1h-10v-1z"/>
  </svg>
);
export const IconBadge = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...p}>
    <path fill="#1d9bf0" d="M12 2l2.2 2.2 3.1-.3 1.2 2.9 2.9 1.2-.3 3.1L24 12l-2.2 2.2.3 3.1-2.9 1.2-1.2 2.9-3.1-.3L12 24l-2.2-2.2-3.1.3-1.2-2.9-2.9-1.2.3-3.1L0 12l2.2-2.2-.3-3.1 2.9-1.2L6 2.2l3.1.3L12 2z"/>
    <path fill="#fff" d="M10.7 15.3l-2.5-2.5 1.1-1.1 1.4 1.4 4-4 1.1 1.1-5.1 5.1z"/>
  </svg>
);
export const IconGlobe = (p) => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" {...p}>
    <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 18c-1.7 0-3.3-.5-4.6-1.4.5-.8 1-1.8 1.3-2.9h6.6c.3 1.1.8 2.1 1.3 2.9-1.3.9-2.9 1.4-4.6 1.4zm-3.8-6c-.2-.9-.2-1.9-.2-3s.1-2.1.2-3h7.6c.1 .9 .2 1.9 .2 3s-.1 2.1-.2 3H8.2zm.5-7c.3-1.1.8-2.1 1.3-2.9C10.7 3.5 11.3 3.3 12 3.3s1.3.2 2 .8c.6.8 1.1 1.8 1.3 2.9H8.7z"/>
  </svg>
);
export const IconVolume = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
    <path d="M4 10v4h4l5 4V6l-5 4H4z" fill="currentColor"/>
    <path d="M16 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M18.5 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
export const IconVolumeMute = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
    <path d="M4 10v4h4l5 4V6l-5 4H4z" fill="currentColor"/>
    <path d="M15 11l5 5M20 12l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
export const IconSettings = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path
      d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z
         M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3
         1.7 1.7 0 0 0-1 1.6v.3a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1h-.3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.3a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.3a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.3a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"
      fill="currentColor"
    />
  </svg>
);

/* ----------------------------- Small UI bits ------------------------------- */
export function ActionBtn({ label, onClick, Icon, active, disabled, ...rest }) {
  return (
    <button
      {...rest}
      onClick={onClick}
      disabled={disabled}
      className={`action ${active ? "active" : ""}`}
      aria-pressed={!!active}
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <Icon />
      <span style={{ fontSize: ".85rem", fontWeight: 400, lineHeight: 1 }}>{label}</span>
    </button>
  );
}

export function SkeletonFeed() {
  return (
    <div className="page">
      <aside className="rail rail-left" aria-hidden="true" tabIndex={-1}>
        <div className="ghost-list">
          {["Home", "Explore", "Notifications", "Follow", "Chat", "Grok", "History", "Creator Studio", "Premium", "Profile", "More"].map((t, i) => (
            <div key={i} className="ghost-item icon">
              <div className="ghost-icon" />
              <div className="ghost-line w-70" />
            </div>
          ))}
        </div>
      </aside>

      <main className="container feed">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: "1rem" }}>
            <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
              <div className="ghost-avatar" />
              <div className="ghost-lines" style={{ flex: 1 }}>
                <div className="ghost-line w-50" />
                <div className="ghost-line w-30" />
              </div>
            </div>
            <div className="ghost-lines" style={{ marginTop: ".75rem" }}>
              <div className="ghost-line w-90" />
              <div className="ghost-line w-95" />
              <div className="ghost-line w-70" />
            </div>
            <div className="ghost-card banner" style={{ marginTop: ".75rem", height: 160 }} />
          </div>
        ))}
        <div className="submit-wrap">
          <button className="btn primary btn-wide" disabled>Submit</button>
        </div>
      </main>

      <aside className="rail rail-right" aria-hidden="true" tabIndex={-1}>
        <div className="ghost-card box">
          <div className="ghost-line w-40" style={{ marginBottom: 8 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ghost-row">
              <div className="ghost-lines">
                <div className="ghost-line w-70" />
                <div className="ghost-line w-45" />
              </div>
            </div>
          ))}
        </div>
        <div className="ghost-card box">
          <div className="ghost-line w-35" style={{ marginBottom: 8 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="ghost-row">
              <div className="ghost-avatar sm" />
              <div className="ghost-line w-60" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function PostText({ text, expanded, onExpand, onCollapse, onClamp, onAction, prefix, postId }) {
  const pRef = React.useRef(null);
  const [needsClamp, setNeedsClamp] = React.useState(false);
  const [wasClamped, setWasClamped] = React.useState(false);
  const sentClampRef = React.useRef(false);

  React.useEffect(() => {
    const el = pRef.current;
    if (!el) return;

    const check = () => {
      const clamped = el.scrollHeight > el.clientHeight + 1;
      setNeedsClamp(clamped);
      if (clamped && !sentClampRef.current) {
        sentClampRef.current = true;
        setWasClamped(true);
        onClamp?.();
        onAction?.(prefix ? `${prefix}_text_clamped` : "text_clamped", { post_id: postId });
      }
    };

    requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    if (document.fonts?.ready) document.fonts.ready.then(check).catch(() => {});
    return () => { ro.disconnect(); window.removeEventListener("resize", check); };
  }, [text, expanded, onClamp]);

  return (
    <div className="text-wrap">
      <p ref={pRef} className={`text ${!expanded ? "clamp" : ""}`}>{text}</p>
      {!expanded && needsClamp && (
        <div className="fade-more">
          <span className="dots" aria-hidden="true">…</span>
          <button
            type="button"
            className="see-more"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExpand(); }}
          >
            Show more
          </button>
        </div>
      )}
      {expanded && wasClamped && (
        <button
          type="button"
          className="see-more see-less"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCollapse?.(); }}
        >
          Show less
        </button>
      )}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false, footer = null }) {
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`modal ${wide ? "modal-wide" : ""}`}>
        <div className="modal-head">
          <h3 style={{ margin: 0, fontWeight: 700 }}>{title}</h3>
          <button className="dots" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------- Hover peek for names ---------------------------- */
export function NamesPeek({ post, count = 0, kind, label, hideInlineLabel = false, includeSelf = false }) {
  const [open, setOpen] = React.useState(false);
  const fn = typeof window !== "undefined" ? window.fakeNamesFor : null;
  const { names, remaining } = fn
    ? fn(post.id, count, kind, 4, includeSelf)
    : { names: [], remaining: 0 };

  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ position: "relative", cursor: count ? "pointer" : "default" }}
      aria-haspopup="true"
      aria-expanded={open}
      className="hoverable-metric"
    >
      {count}{!hideInlineLabel && ` ${label}`}
      {open && !!count && (
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
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {(label || "").slice(0, 1).toUpperCase() + (label || "").slice(1)}
          </div>
          {names.length ? (
            <>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {names.map((n) => (<li key={n} style={{ margin: "2px 0" }}>{n}</li>))}
              </ul>
              {remaining > 0 && (<div style={{ opacity: 0.8, marginTop: 4 }}>and {remaining} more</div>)}
            </>
          ) : (
            <div style={{ opacity: 0.8 }}>No {label} yet</div>
          )}
        </div>
      )}
    </span>
  );
}

/* -------- neutral, gender-agnostic tiny avatar for real reply rows -------- */
export function neutralAvatarDataUrl(size = 28) {
  const s = size;
  const isDark =
    typeof document !== "undefined" &&
    document.body?.classList.contains("dark-mode");
  const bgFill = isDark ? "#202327" : "#e5e7eb";
  const personFill = isDark ? "#71767b" : "#9ca3af";
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
  <defs>
    <clipPath id="r"><rect x="0" y="0" width="32" height="32" rx="16" ry="16"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="32" height="32" fill="${bgFill}"/>
    <circle cx="16" cy="12.5" r="6" fill="${personFill}"/>
    <rect x="5" y="20" width="22" height="10" rx="5" fill="${personFill}"/>
  </g>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ----------------- Overlays ------------- */
export function ParticipantOverlay({ initialValue = "", onSubmit }) {
  const [tempId, setTempId] = useState(initialValue || "");

  useEffect(() => {
    if (initialValue && !tempId) setTempId(initialValue);
  }, [initialValue, tempId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanId = tempId.trim();
    if (!cleanId) return;

    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 700px)").matches;

    if (isMobile) {
      tryEnterFullscreenLocal(document.documentElement);
      setTimeout(() => {
        tryEnterFullscreenLocal(document.querySelector(".app") || document.body);
        window.scrollTo(0, 1);
      }, 120);
    }

    onSubmit(cleanId);
  };

  return (
    <div className="modal-backdrop" style={{ background: "rgba(0,0,0,0.6)", zIndex: 100 }}>
      <div className="modal" style={{ maxWidth: 400, width: "100%" }}>
        <div className="modal-head"><h3 style={{ margin: 0 }}>Enter Participant ID</h3></div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <input
              className="input"
              value={tempId}
              onChange={(e) => setTempId(e.target.value)}
              placeholder={initialValue ? "" : "Your ID"}
              required
            />
            <button type="submit" className="btn primary">Continue</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function LoadingOverlay({
  status = "loading",
  title = "Loading your feed…",
  subtitle = "This will only take a moment.",
  errorTitle = "Couldn't load your feed",
  errorSubtitle = "We hit a network error. Please try again.",
  onRetry,
  quiet = false,
}) {
  const isError = status === "error";

  if (quiet && !isError) {
    return (
      <div className="quiet-transition-backdrop" aria-hidden="true">
        <div className="spinner-ring" />
      </div>
    );
  }

  return (
    <div className="modal-backdrop modal-backdrop-dim">
      <div className="modal modal-compact" style={{ textAlign: "center", paddingTop: 24 }}>
        {!isError ? (
          <>
            <div className="spinner-ring" aria-hidden="true" />
            <h3 style={{ margin: "0 0 6px" }}>{title}</h3>
            <div style={{ color: "var(--muted)", fontSize: ".95rem" }}>{subtitle}</div>
          </>
        ) : (
          <>
            <h3 style={{ margin: "0 0 6px" }}>{errorTitle}</h3>
            <div style={{ color: "var(--muted)", fontSize: ".95rem", marginBottom: 12 }}>{errorSubtitle}</div>
            <div className="modal-footer" style={{ justifyContent: "center" }}>
              <button className="btn primary" onClick={onRetry}>Retry</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ThankYouOverlay({ sessionId, title, messageHtml, completionCode, hideSessionId }) {
  const fallbackId = useMemo(() => sessionId || uid(), [sessionId]);
  const code = completionCode || (hideSessionId ? "" : fallbackId);

  return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="modal" style={{ maxWidth: 480, textAlign: "center" }}>
        <div className="modal-body">
          <h2 style={{ marginTop: 0 }}>{title || "Thank you for your response"}</h2>
          {messageHtml ? (
            <div dangerouslySetInnerHTML={{ __html: String(messageHtml) }} />
          ) : (
            <p>Please go back to the survey and enter the following code:</p>
          )}
          {code && (
            <p style={{ fontSize: "1.25rem", fontWeight: "bold", marginTop: "0.5rem", fontFamily: "monospace", letterSpacing: "0.5px" }}>
              {code}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Route-aware top bar -----------------------------
   Real X (desktop) has no page-wide top bar the way Facebook does — the
   logo/search/nav all live inside the left/right rails themselves (see
   PageWithRails in App-x.jsx). So unlike TopRailPlaceholder/TopRailReal in
   ui-core-facebook.jsx, there's nothing to render here visually either way
   — this only keeps the admin-mode side effect and the admin "back to
   feed" FAB, which are genuinely needed regardless of rail content. */
export function TopRailPlaceholder() {
  return null;
}

export function RouteAwareTopbar() {
  const location = useLocation();

  let onAdmin = location.pathname.startsWith("/admin");
  if (!onAdmin && typeof window !== "undefined") {
    onAdmin = window.location.hash.startsWith("#/admin"); // legacy hash-bookmark fallback
  }

  useEffect(() => {
    if (onAdmin) document.body.classList.add("admin-mode");
    else document.body.classList.remove("admin-mode");
  }, [onAdmin]);

  if (!onAdmin) return null;

  // Real participants must never be shown a link into the admin login
  // (removed per direct request, matching Facebook/Amazon) — an already-
  // authenticated admin browsing their own /admin session still gets a
  // quick way back to the feed.
  return (
    <div className="admin-fab-wrap">
      <Link to="/" className="btn admin-fab" aria-label="Back to feed">↩</Link>
    </div>
  );
}
