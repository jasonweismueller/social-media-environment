// components-ui-core.jsx
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fakeNamesFor as utilsFakeNamesFor } from "./utils";

/* ------------------------------- Icons ------------------------------------- */
export const IconLike = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path fill="currentColor" d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z"/>
  </svg>
);
export const IconThumb = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path d="M10.5 21H7a3 3 0 0 1-3-3v-6a3 3 0  0 1 3-3h3.5l2.7-4.9a2 2 0  0 1 3.6 1.8L16.5 9H19a3 3 0  0 1 3 3c0 .5-.1 1-.3 1.5l-2 5A3 3 0  0 1 17 21h-6.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
export const IconComment = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ display: "block", transform: "translateY(1px)" }} {...p}>
    <path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v14l4-4h14a2 2 0  0 0 2-2V4a2 2 0  0 0-2-2z"/>
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
export const IconDots = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
    <circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>
  </svg>
);
export const IconLogo = (p) => (
  <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" {...p}>
    <rect width="32" height="32" rx="6" fill="#1877F2"/>
    <path d="M20 9h-2.2c-2.2 0-3.8 1.7-3.8 3.9V16H12v3h2v6h3v-6h2.5l.5-3H17v-2c0-.6.4-1 1-1h2V9z" fill="#fff"/>
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
    {/* speaker body */}
    <path d="M4 10v4h4l5 4V6l-5 4H4z" fill="currentColor"/>
    {/* cross (shifted down 1, left 2) */}
    <path
      d="M15 11l5 5M20 12l-5 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
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
      <span style={{ fontSize: ".9rem", fontWeight: 600, lineHeight: 1 }}>{label}</span>
    </button>
  );
}

export function SkeletonFeed() {
  return (
    <div className="page">
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
            <div className="ghost-lines" style={{ marginTop: ".75rem" }}>
              <div className="ghost-line w-40" />
            </div>
          </div>
        ))}
        <div className="submit-wrap">
          <button className="btn primary btn-wide" disabled>Submit</button>
        </div>
      </main>

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

export function PostText({ text, expanded, onExpand, onClamp }) {
  const pRef = React.useRef(null);
  const [needsClamp, setNeedsClamp] = React.useState(false);
  const sentClampRef = React.useRef(false);

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
    window.addEventListener('resize', check);
    if (document.fonts?.ready) document.fonts.ready.then(check).catch(() => {});
    return () => { ro.disconnect(); window.removeEventListener('resize', check); };
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
            See more
          </button>
        </div>
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

  // Prefer the real util; fall back to a global shim only if someone injected it.
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
  const handleSubmit = (e) => { e.preventDefault(); if (tempId.trim()) onSubmit(tempId.trim()); };
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
  return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="modal" style={{ maxWidth: 480, textAlign: "center" }}>
        <div className="modal-body">
          <h2 style={{ marginTop: 0 }}>Thank you for your response</h2>
          <p>You may now close this window.</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Route-aware top bar ----------------------------- */
export function TopRailPlaceholder() {
  return (
    <div className="top-rail-placeholder">
      <div className="trp-inner">
        <div className="trp-left">
          <div className="trp-logo"></div>
          <div className="trp-search"></div>
        </div>

        <div className="trp-center">
          <div className="trp-tab"></div>
          <div className="trp-tab"></div>
          <div className="trp-tab"></div>
        </div>

        <div className="trp-right">
          <div className="trp-btn"></div>
          <div className="trp-btn"></div>
          <div className="trp-avatar"></div>
        </div>
      </div>
    </div>
  );
}

export function RouteAwareTopbar() {
  const location = useLocation();
  let onAdmin = location.pathname === "/admin";
  if (!onAdmin && typeof window !== "undefined") {
    onAdmin = window.location.hash.startsWith("#/admin");
  }

  useEffect(() => {
    if (onAdmin) document.body.classList.add("admin-mode");
    else document.body.classList.remove("admin-mode");
  }, [onAdmin]);

  return (
    <>
      <TopRailPlaceholder />
      <div className="admin-fab-wrap">
        {onAdmin ? (
          <Link to="/" className="btn admin-fab" aria-label="Back to feed">↩</Link>
        ) : (
          <Link to="/admin" className="btn admin-fab" aria-label="Admin">⚙</Link>
        )}
      </div>
    </>
  );
}