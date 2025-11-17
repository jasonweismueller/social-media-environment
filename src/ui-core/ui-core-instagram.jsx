// components-ui-core.jsx (Instagram variant - rails + top placeholder, no floating icons)
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fakeNamesFor as utilsFakeNamesFor,uid  } from "../utils";
import { tryEnterFullscreen, exitFullscreen } from "../utils";

/* ------------------------------- Tiny helper ------------------------------- */
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
    mq.addListener && mq.addListener(onChange); // older Safari
    return () => {
      mq.removeEventListener?.("change", onChange);
      mq.removeListener && mq.removeListener(onChange);
    };
  }, [breakpointPx]);
  return isMobile;
}

/* ------------------------------- Icons (IG) -------------------------------- */
export const IconHeart = (p) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...p}>
    <path fill="none" stroke="currentColor" strokeWidth="2" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);
export const IconHeartFill = (p) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...p}>
    <path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0  0 1 6.5 4c1.74 0 3.41.81 4.5 2.09A6.01 6.01 0  0 1 21 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
);
export const IconComment = (p) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...p}>
    <path d="M21 15a5 5 0 0 1-5 5H7l-4 3V7a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);
export const IconShare = (p) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...p}>
    <path d="M22 2 11 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M22 2 15 22l-4-9-9-4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);
export const IconSave = (p) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...p}>
    <path d="M20 21l-8-5-8 5V3h16v18z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);
export const IconDots = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
    <circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>
  </svg>
);
export const IconLogo = (p) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...p}>
    <rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2"/>
    <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>
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
    <path fill="currentColor" d="M16 11a4 4 0 1 0-3.2-6.5A4 4 0  0 0 16 11zM8 12a4 4 0  1 0-3.2-6.5A4 4 0  0 0 8 12z"/>
    <path fill="currentColor" d="M2 19a5 5 0  0 1 5-5h2a5 5 0  0 1 5 5v1H2v-1zm10 0a6.99 6.99 0  0 1 3.3-6h.7a6 6 0  0 1 6 6v1h-10v-1z"/>
  </svg>
);
export const IconBadge = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...p}>
    <path fill="#ff2d55" d="M12 2l2.2 2.2 3.1-.3 1.2 2.9 2.9 1.2-.3 3.1L24 12l-2.2 2.2.3 3.1-2.9 1.2-1.2 2.9-3.1-.3L12 24l-2.2-2.2-3.1.3-1.2-2.9-2.9-1.2.3-3.1L0 12l2.2-2.2-.3-3.1 2.9-1.2L6 2.2l3.1.3L12 2z"/>
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
    <path d="M16 9.5a3.5 3.5 0  0 1 0 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M18.5 7a7 7 0  0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
export const IconVolumeMute = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
    <path d="M4 10v4h4l5 4V6l-5 4H4z" fill="currentColor"/>
    <path d="M15 11l5 5M20 12l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
export const IconSettings = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
    <path
      d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0  0 0 0 7z
         M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3
         1.7 1.7 0  0 0-1 1.6v.3a2 2 0 0 1-4 0v-.1a1.7 1.7 0  0 0-1-1.6 1.7 1.7 0  0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0  0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1h-.3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0  0 0-.3-1.9l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0  0 0 1.9.3h.3a1.7 1.7 0  0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0  0 0 1 1.6h.3a1.7 1.7 0  0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0  0 0-.3 1.9v.3a1.7 1.7 0  0 0 1.6 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0  0 0-1.6 1z"
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
      <span style={{ fontSize: ".9rem", fontWeight: 600, lineHeight: 1 }}>{label}</span>
    </button>
  );
}

/* ------------------------- Instagram Skeleton Feed ------------------------ */
export function SkeletonFeed() {
  return (
    <div className="ig-page">
      <div className="ig-stories">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="ig-story">
            <div className="ghost-story-ring">
              <div className="ghost-story-avatar" />
            </div>
            <div className="ghost-line w-60" />
          </div>
        ))}
      </div>

      <main className="ig-feed">
        {Array.from({ length: 5 }).map((_, i) => (
          <article key={i} className="ig-card">
            <div className="ig-card-head">
              <div className="ghost-avatar sm ring" />
              <div className="ghost-lines" style={{ flex: 1 }}>
                <div className="ghost-line w-40" />
                <div className="ghost-line w-25" />
              </div>
              <div className="ghost-dot" />
            </div>
            <div className="ghost-media" />
            <div className="ig-actions">
              <div className="ghost-icon" />
              <div className="ghost-icon" />
              <div className="ghost-icon" />
              <div style={{ flex: 1 }} />
              <div className="ghost-icon" />
            </div>
            <div className="ghost-lines" style={{ marginTop: 6 }}>
              <div className="ghost-line w-70" />
              <div className="ghost-line w-55" />
            </div>
          </article>
        ))}
        <div className="submit-wrap">
          <button className="btn primary btn-wide" disabled>Submit</button>
        </div>
      </main>
    </div>
  );
}

/* --------------------------- Caption clamping ------------------------------ */
export function PostText({ text, expanded, onExpand, onClamp, onAction, prefix, postId }) {
  const pRef = React.useRef(null);
  const [needsClamp, setNeedsClamp] = React.useState(false);
  const sentClampRef = React.useRef(false);

  function linkifyMentions(str = "") {
    return str.replace(/(^|\s)(@\w+)/g, (m, space, handle) => {
      return `${space}<span class="ig-mention" data-handle="${handle}" role="button" style="cursor:pointer">${handle}</span>`;
    });
  }

  React.useEffect(() => {
    const el = pRef.current;
    if (!el) return;

    const check = () => {
      const clamped = el.scrollHeight > el.clientHeight + 1;
      setNeedsClamp(clamped);
      if (clamped && !sentClampRef.current) {
        sentClampRef.current = true;
        onClamp?.();
      }
    };

    requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    if (document.fonts?.ready) document.fonts.ready.then(check).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [text, expanded, onClamp]);

  // --- CLICK HANDLER for mention ---
  const handleClick = (e) => {
  let node = e.target;
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;

  const target = node?.closest?.(".ig-mention");
  if (!target) return;

  const handle = target.getAttribute("data-handle");
  console.log("🔥 START handler", handle, postId);

  try {
    console.log("🔥 BEFORE onAction");
    onAction?.("mention_clicked", { post_id: postId, handle });
    console.log("🔥 AFTER onAction");
  } catch(err) {
    console.error("🔥 ERROR in onAction:", err);
  }

  alert("Clicked mention!");
  console.log("🔥 AFTER ALERT");
};



  return (
    <span className="text-wrap">
      <span
        ref={pRef}
        className={`text ${!expanded ? "clamp" : ""} ${needsClamp ? "needs" : ""}`}
        onClick={handleClick}
      >
        {prefix && (
          <span
            className="ig-username"
            style={{ fontWeight: 600, marginRight: "0.25ch" }}
          >
            {prefix}
          </span>
        )}

        <span
          dangerouslySetInnerHTML={{
            __html: linkifyMentions(text),
          }}
        />
      </span>

      {!expanded && needsClamp && (
        <span className="fade-more">
          <span className="dots" aria-hidden="true">…</span>
          <button
            type="button"
            className="see-more"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onExpand?.();
            }}
          >
            more
          </button>
        </span>
      )}
    </span>
  );
}
/* -------------------------------- Modal ----------------------------------- */
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
          <h3 style={{ margin: 0, fontWeight: 600 }}>{title}</h3>
          <button className="dots" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------- Hover peek for names ---------------------------- */
export function NamesPeek({ post, count = 0, kind, label, hideInlineLabel = false }) {
  const [open, setOpen] = React.useState(false);
  const fn =
    utilsFakeNamesFor ||
    (typeof window !== "undefined" ? window.fakeNamesFor : null);

  const { names, remaining } = fn
    ? fn(post.id, count, kind, 4)
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
            {(label || "").slice(0,1).toUpperCase() + (label || "").slice(1)}
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

/* -------- neutral, gender-agnostic tiny avatar for real comment ----------- */
export function neutralAvatarDataUrl(size = 28) {
  const s = size;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
  <defs>
    <clipPath id="r"><rect x="0" y="0" width="32" height="32" rx="16" ry="16"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="32" height="32" fill="#e5e7eb"/>
    <circle cx="16" cy="12.5" r="6" fill="#9ca3af"/>
    <rect x="5" y="20" width="22" height="10" rx="5" fill="#9ca3af"/>
  </g>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ----------------- Overlays ------------- */
export function ParticipantOverlay({ onSubmit }) {
  const [tempId, setTempId] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanId = tempId.trim();
    if (!cleanId) return;

    // On mobile, request fullscreen right on the same gesture
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;
    if (isMobile) {
      // Try the root first
      tryEnterFullscreen(document.documentElement);
      // Retry shortly after the overlay begins closing (helps Safari timing)
      setTimeout(() => {
        tryEnterFullscreen(document.querySelector(".app") || document.body);
        // Android soft-hide bar nudge (no-op elsewhere)
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
            <input className="input" value={tempId} onChange={(e) => setTempId(e.target.value)} placeholder="Your ID" required />
            <button type="submit" className="btn primary">Continue</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function LoadingOverlay({ title = "Loading your feed…", subtitle = "This will only take a moment." }) {
  return (
    <div className="modal-backdrop modal-backdrop-dim">
      <div className="modal modal-compact" style={{ textAlign: "center", paddingTop: 24 }}>
        <div className="spinner-ring" aria-hidden="true" />
        <h3 style={{ margin: "0 0 6px" }}>{title}</h3>
        <div style={{ color: "var(--muted)", fontSize: ".95rem" }}>{subtitle}</div>
      </div>
    </div>
  );
}


export function ThankYouOverlay() {
  const [sessionId, setSessionId] = React.useState("");

  React.useEffect(() => {
    // Retrieve the UID stored earlier via localStorage or internal logic
    setSessionId(uid());
  }, []);

  return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="modal" style={{ maxWidth: 480, textAlign: "center" }}>
        <div className="modal-body">
          <h2 style={{ marginTop: 0 }}>Thank you for your response</h2>
          <p>Please go back to the survey and enter the following code:</p>
          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: "bold",
              marginTop: "0.5rem",
              fontFamily: "monospace",
              letterSpacing: "0.5px",
            }}
          >
            {sessionId}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Top rail placeholder (matches CSS) -------------- */
function TopRailPlaceholder() {
  return (
    <div className="top-rail-placeholder" aria-hidden="true">
      <div className="trp-inner">
        <div className="trp-left">
          <div className="trp-logo" />
          <div className="trp-search" />
        </div>
        <div className="trp-center">
          <div className="trp-tab" />
          <div className="trp-tab" />
          <div className="trp-tab" />
        </div>
        <div className="trp-right">
          <div className="trp-btn" />
          <div className="trp-btn" />
          <div className="trp-avatar" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Side rails (left + right) ----------------------- */
function LeftRailPlaceholder() {
  return (
    <aside className="rail rail-left" aria-hidden="true">
      <div className="ghost-card banner" />
      <div className="ghost-card box">
        <div className="ghost-profile">
          <div className="ghost-avatar online" />
          <div className="ghost-lines" style={{ width: "100%" }}>
            <div className="ghost-line w-60" />
            <div className="ghost-line w-35" />
          </div>
        </div>
        <div className="ghost-profile">
          <div className="ghost-avatar" />
          <div className="ghost-lines" style={{ width: "100%" }}>
            <div className="ghost-line w-70" />
            <div className="ghost-line w-40" />
          </div>
        </div>
        <div className="ghost-profile">
          <div className="ghost-avatar" />
          <div className="ghost-lines" style={{ width: "100%" }}>
            <div className="ghost-line w-45" />
            <div className="ghost-line w-35" />
          </div>
        </div>
      </div>
      <div className="ghost-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ghost-item icon">
            <div className="ghost-icon" />
            <div className="ghost-lines" style={{ width: "100%" }}>
              <div className="ghost-line w-70" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function RightRailPlaceholder() {
  return (
    <aside className="rail rail-right" aria-hidden="true">
      <div className="ghost-card box">
        <div className="ghost-profile">
          <div className="ghost-avatar xl online" />
          <div className="ghost-lines" style={{ width: "100%" }}>
            <div className="ghost-line w-60" />
            <div className="ghost-line w-40" />
          </div>
        </div>
        <div className="ghost-row">
          <div className="ghost-line w-45" />
        </div>
        <div className="ghost-row">
          <div className="ghost-line w-35" />
        </div>
      </div>

      <div className="ghost-list">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="ghost-item">
            <div className="ghost-avatar sm" />
            <div className="ghost-lines" style={{ width: "100%" }}>
              <div className="ghost-line w-70" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ------------------------- Route-aware top chrome toggle ------------------- */
export function RouteAwareTopbar() {
  const location = useLocation();
  const isMobile = useIsMobile(700);

  let onAdmin = location.pathname === "/admin";
  if (!onAdmin && typeof window !== "undefined") {
    onAdmin = window.location.hash.startsWith("#/admin");
  }

  useEffect(() => {
    if (onAdmin) document.body.classList.add("admin-mode");
    else document.body.classList.remove("admin-mode");
  }, [onAdmin]);

  if (onAdmin || isMobile) return null;
  return <TopRailPlaceholder />;
}

/* ------------------------- Page scaffold (rails + center) ------------------ */
export function PageScaffold({ children }) {
  const isMobile = useIsMobile(700);
  return (
    <div className="page">
      {!isMobile && <LeftRailPlaceholder />}
      <div className="container feed">{children}</div>
      {!isMobile && <RightRailPlaceholder />}
    </div>
  );
}