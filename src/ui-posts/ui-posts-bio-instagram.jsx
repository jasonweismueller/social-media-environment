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

/* ---------------- Instagram Link Icon (real IG path) ---------------- */
const LinkIcon = ({ size = 14 }) => (
  <svg aria-label="Link" fill="currentColor" height={size} width={size} viewBox="0 0 24 24">
    <path d="M14.828 9.172a4 4 0 015.657 5.656l-3.536 3.536a4 4 0 01-5.657-5.657l.707-.707"/>
    <path d="M9.172 14.828a4 4 0 01-5.656-5.657l3.536-3.536a4 4 0 015.657 5.657l-.707.707"/>
  </svg>
);

/* ---------------- Click logging ---------------- */
function logBioUrlClick(postId, url) {
  try {
    window.__smeLogEvent?.("bio_url_click", { postId, url });
  } catch (err) {
    console.warn("Bio URL click logging failed:", err);
  }
}

/* ---------------- Helper: make URLs clickable inside text ---------------- */
function linkifyText(text = "") {
  return text.replace(
    /(https?:\/\/[^\s]+)/g,
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

  return ReactDOM.createPortal(
    <div
      ref={ref}
      onMouseEnter={() => clearTimeout(hideDelayRef.current)} // keep open
      onMouseLeave={hideHover} // close on exit
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
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

            {verified && (
              <svg width="15" height="15" viewBox="0 0 512 512">
                <path fill="#1DA1F2" d="M512 256l-63.3 36.5..."/>
                <path fill="#fff" d="M227.3 342.6L134 249.3..."/>
              </svg>
            )}
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
                  onClick={() => logBioUrlClick(bio.id, bio.bio_url)}
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
                  <LinkIcon size={14} />
                  {prettyUrl(bio.bio_url)}
                </a>
              )}
            </>
          ) : hasBioUrl ? (
            // URL only, no text
            <a
              href={bio.bio_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logBioUrlClick(bio.id, bio.bio_url)}
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
              <LinkIcon size={14} />
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