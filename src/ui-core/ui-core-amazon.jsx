// ui-core-amazon.jsx
// Amazon reviews-only version of shared UI core components.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fakeNamesFor as utilsFakeNamesFor,uid } from "../utils";

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

function htmlMarkup(value) {
  return { __html: String(value || "") };
}

function getQuestionId(q, index) {
  return q?.id || q?.question_id || q?.name || `q_${index + 1}`;
}

function getQuestionText(q) {
  return q?.text || q?.question || q?.label || q?.title || "Question";
}

function getQuestionType(q) {
  return String(q?.type || q?.question_type || q?.input_type || "text").toLowerCase();
}

function getOptions(q) {
  const raw = q?.options || q?.choices || q?.scale_points || q?.answers || [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    return raw.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function optionValue(opt) {
  return typeof opt === "object" ? (opt.value ?? opt.id ?? opt.label ?? opt.text ?? "") : opt;
}

function optionLabel(opt) {
  return typeof opt === "object" ? (opt.label ?? opt.text ?? opt.value ?? opt.id ?? "") : opt;
}

function flattenSurveyPages(survey) {
  if (Array.isArray(survey?.pages) && survey.pages.length) return survey.pages;
  if (Array.isArray(survey?.questions)) return [{ id: "page_1", questions: survey.questions }];
  return [{ id: "page_1", questions: [] }];
}


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
  <svg viewBox="0 0 96 32" width="72" height="24" aria-hidden="true" {...p}>
    <text x="0" y="21" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="18" fill="#0f1111">amazon</text>
    <path d="M54 25c8 4 20 3 28-3" fill="none" stroke="#ff9900" strokeWidth="3" strokeLinecap="round"/>
    <path d="M79 21l5 1-3 4" fill="none" stroke="#ff9900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

export function PostText({ text, expanded, onExpand, onClamp, onAction, prefix, postId }) {
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
        onAction?.(prefix ? `${prefix}_text_clamped` : "text_clamped", { post_id: postId });
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
  errorTitle = "Couldn’t load your feed",
  errorSubtitle = "We hit a network error. Please try again.",
  onRetry,
}) {
  const isError = status === "error";

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

export function ThankYouOverlay({ sessionId }) {
  const fallbackId = useMemo(() => sessionId || uid(), [sessionId]);
  return (
    <div className="modal-backdrop" style={{ zIndex: 100 }}>
      <div className="modal" style={{ maxWidth: 480, textAlign: "center" }}>
        <div className="modal-body">
          <h2 style={{ marginTop: 0 }}>Thank you for your response</h2>
          <p>Please go back to the survey and enter the following code:</p>
          <p style={{ fontSize: "1.25rem", fontWeight: "bold", marginTop: "0.5rem", fontFamily: "monospace", letterSpacing: "0.5px" }}>
            {fallbackId}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Survey preface and screens ---------------------- */
export function SurveyPrefaceFlow({ survey, participantDisplayId, onComplete }) {
  const preface = survey?.preface || survey || {};
  const steps = [
    {
      key: "participant_information",
      title: preface.participant_information_title || preface.participantInfoTitle || "Participant Information",
      html: preface.participant_information_html || preface.participant_information || preface.participantInfoHtml,
    },
    {
      key: "consent",
      title: preface.consent_title || "Consent",
      html: preface.consent_text_html || preface.consent_html || preface.consent || preface.consentTextHtml,
    },
    {
      key: "instructions",
      title: preface.instructions_title || "Instructions",
      html: preface.instructions_html || preface.instructions || preface.instructionsHtml,
    },
  ].filter((step) => step.html || step.key === "instructions");

  const [index, setIndex] = useState(0);
  const [consented, setConsented] = useState(false);
  const step = steps[index] || steps[0];
  const isConsent = step?.key === "consent";
  const isLast = index >= steps.length - 1;
  const html = String(step?.html || "Please read the information carefully before continuing.")
    .replaceAll("${e://Field/PROLIFIC_PID}", participantDisplayId || "")
    .replaceAll("{{PARTICIPANT_ID}}", participantDisplayId || "")
    .replaceAll("[[PARTICIPANT_ID]]", participantDisplayId || "");

  const nextLabel = isLast
    ? (preface.pre_feed_button_label || preface.start_button_label || "Continue")
    : "Next";

  const handleNext = () => {
    if (isConsent && !consented) return;
    if (isLast) onComplete?.();
    else setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  return (
    <div className="survey-shell survey-preface-shell">
      <div className="survey-card">
        <div className="survey-card-head">
          <h2>{step?.title}</h2>
          {participantDisplayId && <div className="survey-muted">Participant ID: {participantDisplayId}</div>}
        </div>
        <div className="survey-card-body survey-rich-text" dangerouslySetInnerHTML={htmlMarkup(html)} />
        {isConsent && (
          <label className="survey-consent-row">
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} />
            <span>I have read the information above and consent to participate.</span>
          </label>
        )}
        <div className="survey-actions">
          <button className="btn" type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>Back</button>
          <button className="btn primary" type="button" disabled={isConsent && !consented} onClick={handleNext}>{nextLabel}</button>
        </div>
      </div>
    </div>
  );
}

function SurveyQuestion({ question, index, value, error, onChange }) {
  const qid = getQuestionId(question, index);
  const type = getQuestionType(question);
  const text = getQuestionText(question);
  const options = getOptions(question);
  const required = !!(question?.required || question?.is_required);

  const setValue = (v) => onChange?.(qid, v, question);

  const renderInput = () => {
    if (["textarea", "long_text", "open_text", "paragraph"].includes(type)) {
      return <textarea className="input survey-textarea" value={value || ""} onChange={(e) => setValue(e.target.value)} />;
    }
    if (["radio", "single", "single_choice", "multiple_choice", "likert", "scale"].includes(type) && options.length) {
      return (
        <div className="survey-options">
          {options.map((opt, i) => {
            const val = optionValue(opt);
            return (
              <label key={`${qid}_${i}`} className="survey-option">
                <input type="radio" name={qid} checked={String(value ?? "") === String(val)} onChange={() => setValue(val)} />
                <span>{optionLabel(opt)}</span>
              </label>
            );
          })}
        </div>
      );
    }
    if (["checkbox", "multi", "multi_choice", "multiple"].includes(type) && options.length) {
      const current = Array.isArray(value) ? value : [];
      return (
        <div className="survey-options">
          {options.map((opt, i) => {
            const val = optionValue(opt);
            const checked = current.map(String).includes(String(val));
            return (
              <label key={`${qid}_${i}`} className="survey-option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked ? [...current, val] : current.filter((x) => String(x) !== String(val));
                    setValue(next);
                  }}
                />
                <span>{optionLabel(opt)}</span>
              </label>
            );
          })}
        </div>
      );
    }
    if (["number", "numeric"].includes(type)) {
      return <input className="input" type="number" value={value || ""} onChange={(e) => setValue(e.target.value)} />;
    }
    if (["post_reminder", "reminder"].includes(type)) {
      const body = question?.post_snapshot?.text || question?.post_text || question?.description || "Please refer to the post shown earlier.";
      return <div className="survey-post-reminder"><div className="survey-muted">Post reminder</div><p>{body}</p></div>;
    }
    if (question?.html || type === "html" || type === "display") {
      return <div className="survey-rich-text" dangerouslySetInnerHTML={htmlMarkup(question.html || question.description || question.text)} />;
    }
    return <input className="input" value={value || ""} onChange={(e) => setValue(e.target.value)} />;
  };

  return (
    <div className={`survey-question ${error ? "has-error" : ""}`}>
      <div className="survey-question-title">
        <span>{text}</span>{required && <span aria-label="required"> *</span>}
      </div>
      {question?.description && <div className="survey-muted">{question.description}</div>}
      {renderInput()}
      {error && <div className="survey-error">{error === true ? "Please answer this question." : error}</div>}
    </div>
  );
}

export function SurveyScreen({
  survey,
  responses = {},
  errors = {},
  errorMsg,
  onChange,
  onSubmit,
  onClearBanner,
  submitting = false,
}) {
  const pages = flattenSurveyPages(survey);
  const [pageIndex, setPageIndex] = useState(0);
  const page = pages[pageIndex] || pages[0] || { questions: [] };
  const questions = page.questions || [];
  const isLast = pageIndex >= pages.length - 1;
  const formRef = useRef(null);

  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: "start" });
  }, [pageIndex]);

  const handleNext = () => {
    onClearBanner?.();
    if (isLast) onSubmit?.();
    else setPageIndex((i) => Math.min(i + 1, pages.length - 1));
  };

  return (
    <div className="survey-shell" ref={formRef}>
      <div className="survey-card">
        <div className="survey-card-head">
          <h2>{page.title || survey?.title || survey?.name || "Survey"}</h2>
          {pages.length > 1 && <div className="survey-muted">Page {pageIndex + 1} of {pages.length}</div>}
        </div>
        {errorMsg && <div className="survey-banner-error">{errorMsg}</div>}
        <div className="survey-card-body">
          {questions.map((q, i) => {
            const qid = getQuestionId(q, i);
            return <SurveyQuestion key={qid} question={q} index={i} value={responses[qid]} error={errors[qid]} onChange={onChange} />;
          })}
        </div>
        <div className="survey-actions">
          <button className="btn" type="button" disabled={pageIndex === 0 || submitting} onClick={() => setPageIndex((i) => Math.max(0, i - 1))}>Back</button>
          <button className="btn primary" type="button" disabled={submitting} onClick={handleNext}>{submitting ? "Submitting…" : isLast ? "Submit" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}

export function SurveyScreenMobile(props) {
  return <SurveyScreen {...props} />;
}

/* ------------------------- Route-aware top bar ----------------------------- */
export function TopRailPlaceholder() {
  return (
    <div className="amz-topbar-placeholder" aria-hidden="true">
      <div className="amz-topbar-inner">
        <div className="amz-brand">
          <IconLogo />
        </div>
        <div className="amz-search-placeholder"></div>
        <div className="amz-topbar-copy">Customer reviews</div>
      </div>
    </div>
  );
}

export function RouteAwareTopbar() {
  const location = useLocation();
  const isMobile = useIsMobile(700);

  let onAdmin = location.pathname === "/admin";
  if (!onAdmin && typeof window !== "undefined") {
    onAdmin = window.location.hash.startsWith("#/admin");
  }

  const onSurvey =
    typeof document !== "undefined" &&
    document.body.classList.contains("survey-mode");

  useEffect(() => {
    if (onAdmin) document.body.classList.add("admin-mode");
    else document.body.classList.remove("admin-mode");
  }, [onAdmin]);

  if (onSurvey || isMobile) return null;

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

/* ------------------------- Page scaffold (rails + center) ------------------ */
function LeftRailPlaceholder() {
  return (
    <aside className="rail rail-left" aria-hidden="true">
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
    </aside>
  );
}

function RightRailPlaceholder() {
  return (
    <aside className="rail rail-right" aria-hidden="true">
      <div className="ghost-card banner" />
      <div className="ghost-card banner" />
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
  );
}

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
