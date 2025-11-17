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

/* ---------------- Insta-style Link Icon (horizontal) ---------------- */
const LinkIcon = ({ size = 14, style = {} }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    width={size}
    height={size}
    style={{ display: "block", flexShrink: 0, ...style }}
    fill="currentColor"
  >
    <path d="M12.59 7.41a1 1 0 0 0-1.42 1.42l1.3 1.3a2 2 0 1 1-2.83 2.83l-2.88-2.88a2 2 0 0 1 2.83-2.83l.29.29a1 1 0 1 0 1.41-1.41l-.29-.29a4 4 0 1 0-5.66 5.66l2.88 2.88a4 4 0 0 0 5.66-5.66l-1.29-1.29z"/>
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
  try { window.__smeLogEvent?.("bio_url_click", { postId, url }); } catch {}
}
function logBioHoverOpen(postId) {
  try { window.__smeLogEvent?.("bio_hover_open", { postId }); } catch {}
}

/* ---------------- Utilities ---------------- */
function linkifyText(text = "") {
  return text.replace(
    /(https?:\/\/[^\s<>()]+[^\s<>().,!?])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}
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
  onAction
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  // Log hover open
  useEffect(() => {
    if (anchorEl && bio?.id) logBioHoverOpen(bio.id);
  }, [anchorEl, bio?.id]);

  // Position popup
  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX - 20,
    });
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
        pointerEvents: "auto",
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

          {/* ------------ Text & URL Logic ------------ */}
          {hasBioText ? (
            <>
              <div
                style={{ fontSize: 13, color: "#4b5563", marginTop: 6, lineHeight: 1.35 }}
                dangerouslySetInnerHTML={{ __html: linkifyText(bio.bio_text) }}
              />

              {hasBioUrl && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    marginTop: 2,
                    fontSize: 13,
                    lineHeight: "1.35",
                  }}
                >
                 <LinkIcon size={14} style={{ color: "#2563eb", marginTop: 1 }} />
<a
  href={bio.bio_url}
  target="_blank"
  rel="noopener noreferrer"
  onClick={(e) => {
  e.preventDefault();
  onAction?.("bio_url_click", { post_id: postId, url: bio.bio_url });

  alert(
    "For the purpose of this study, we have noted your interest in following this bio link. We will provide you with further information in the study debrief."
  );
}}
  style={{
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 500,
  }}
>
  {prettyUrl(bio.bio_url)}
</a>
                </div>
              )}
            </>
          ) : hasBioUrl ? (
            // URL only, no bio text
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
                fontSize: 13,
                lineHeight: "1.35",
              }}
            >
              <LinkIcon size={14} style={{ color: "#2563eb", marginTop: 1 }} />
              <a
                href={bio.bio_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logBioUrlClick(postId, bio.bio_url)}
                style={{
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                {prettyUrl(bio.bio_url)}
              </a>
            </div>
          ) : null}
        </div>
      </div>

      {/* ------------ Stats ------------ */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 14,
          textAlign: "left",
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