import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { neutralAvatarDataUrl } from "../ui-core";

/* ---------------- Number formatting ---------------- */
function formatNumber(n) {
  n = Number(n || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0) + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "K";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

/* ---------------- Insta-style Link Icon ---------------- */
const LinkIcon = ({ size = 18, style = {} }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    style={{
      flexShrink: 0,
      display: "block",   // ensures no baseline weirdness
      ...style,
    }}
  >
    <path
      fill="currentColor"
      d="M10.59 13.41a1.978 1.978 0 0 1 0-2.82l2.83-2.83a1.978 1.978 0 0 1 2.82 0c.78.78.78 2.05 0 2.83l-1.18 1.18 1.41 1.41 1.18-1.18a3.972 3.972 0 0 0 0-5.65 3.972 3.972 0 0 0-5.65 0l-2.83 2.83a3.972 3.972 0 0 0 0 5.65c1.55 1.55 4.09 1.55 5.64 0l.71-.71-1.41-1.41-.71.71a1.978 1.978 0 0 1-2.82 0z"
    />
  </svg>
);

/* ---------------- Verified Icon ---------------- */
export const VerifiedBadge = (
  <svg width="15" height="15" viewBox="0 0 512 512" style={{ marginLeft: 3, flexShrink: 0 }}>
    <path fill="#1DA1F2" d="M512 256l-63.3 36.5 7.6 72.7-68.3 39.5-27.2 67.3-72.7-7.6L256 512l-36.5-63.3-72.7 7.6-39.5-68.3-67.3-27.2 7.6-72.7L0 256l63.3-36.5-7.6-72.7 68.3-39.5 27.2-67.3 72.7 7.6L256 0l36.5 63.3 72.7-7.6 39.5 68.3 67.3 27.2-7.6 72.7L512 256z"/>
    <path fill="#fff" d="M227.3 342.6L134 249.3l36.4-36.4 56.9 56.9 114.3-114.3 36.4 36.4-150.7 150.7z"/>
  </svg>
);

/* ---------------- Logging ---------------- */
function logBioUrlClick(postId, url) {
  try {
    window.__smeLogEvent?.("bio_url_click", { postId, url });
  } catch {}
}

/* ---------------- Capture hover open event ---------------- */
function logBioHoverOpen(postId) {
  try {
    window.__smeLogEvent?.("bio_hover_open", { postId });
  } catch {}
}

/* ---------------- Linkify that doesn't include punctuation ---------------- */
function linkifyText(text = "") {
  return text.replace(
    /(https?:\/\/[^\s<>()]+[^\s<>().,!?])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

/* ---------------- Helper: format URL for display ---------------- */
const prettyUrl = (u) => u?.replace(/^https?:\/\//, "").replace(/\/$/, "");

/* ------------------------------------------------------------------------ */

export function BioHoverCard({
  author,
  avatarUrl,
  bio,
  verified,
  anchorEl,
  hideHover,
  hideDelayRef,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  // Capture hover open logging
  useEffect(() => {
    if (anchorEl && bio?.id) {
      logBioHoverOpen(bio.id);
    }
  }, [anchorEl, bio?.id]);

  // Position the card
  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 8;
    const left = rect.left + window.scrollX - 20;
    setPos({ top, left });
  }, [anchorEl]);

  if (!pos) return null;

  const hasBioText = !!bio.bio_text?.trim();
  const hasBioUrl = !!bio.bio_url?.trim();
  const postId = bio.id ?? bio.post_id ?? null;

  return ReactDOM.createPortal(
    <div
      ref={ref}
      onMouseEnter={() => clearTimeout(hideDelayRef.current)}
      onMouseLeave={hideHover}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        pointerEvents: "auto", // ensures clicks still work even in overlays
        padding: 18,
        background: "#fff",
        borderRadius: 18,
        boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
        width: 360,
        maxWidth: "95vw",
        maxHeight: 340,
        overflowY: "auto",
        zIndex: 100000,
        fontSize: 14,
        animation: "fadeIn .15s ease",
        cursor: "default",
      }}
    >
      {/* ------------ Avatar + name ------------ */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <img
          src={avatarUrl || neutralAvatarDataUrl(60)}
          width={60}
          height={60}
          style={{ borderRadius: "999px", objectFit: "cover" }}
        />

        <div style={{ maxWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{author}</span>
            {verified && VerifiedBadge}
          </div>

          {/* ------------ Text & URL Behaviour ------------ */}
          {hasBioText ? (
            <>
              <div
                style={{ fontSize: 13, color: "#4b5563", marginTop: 6, lineHeight: 1.35 }}
                dangerouslySetInnerHTML={{ __html: linkifyText(bio.bio_text) }}
              />

              {hasBioUrl && (
  <a
    href={bio.bio_url}
    target="_blank"
    rel="noopener noreferrer"
    onClick={() => logBioUrlClick(postId, bio.bio_url)}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      marginTop: 6,
      fontSize: 13,
      color: "#2563eb",
      textDecoration: "none",
      fontWeight: 500,
      lineHeight: 1.35,          // keeps alignment tight
    }}
  >
    <LinkIcon size={18} style={{ marginTop: -1 }} />  {/* ✔️ bigger + aligned */}
    <span style={{ position: "relative", top: "-0.3px" }}>{prettyUrl(bio.bio_url)}</span>
  </a>
)}
            </>
          ) : hasBioUrl ? (
            // URL only, no text
            <a
              href={bio.bio_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logBioUrlClick(postId, bio.bio_url)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
                fontSize: 13,
                color: "#2563eb",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              <LinkIcon size={18} />
              {prettyUrl(bio.bio_url)}
            </a>
          ) : null}
        </div>
      </div>

      {/* ------------ Stats ------------ */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 14,
          textAlign: "center",
          paddingTop: 12,
          borderTop: "1px solid #e5e7eb",
        }}
      >
        <div>
          <strong>{formatNumber(bio.bio_posts)}</strong>
          <br /><span style={{ fontSize: 12 }}>posts</span>
        </div>
        <div>
          <strong>{formatNumber(bio.bio_followers)}</strong>
          <br /><span style={{ fontSize: 12 }}>followers</span>
        </div>
        <div>
          <strong>{formatNumber(bio.bio_following)}</strong>
          <br /><span style={{ fontSize: 12 }}>following</span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}