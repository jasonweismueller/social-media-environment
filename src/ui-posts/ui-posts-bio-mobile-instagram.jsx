import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { neutralAvatarDataUrl } from "../ui-core";
import { useSwipeToClose } from "./ui-post-mobile-instagram"; // <-- same hook you're already using

/* ---------------- Number formatting ---------------- */
function formatNumber(n) {
  n = Number(n || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0) + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "K";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

/* ---------------- Insta-style Link Icon ---------------- */
const LinkIcon = ({ size = 15, style = {} }) => (
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

/* ---------------- Utilities ---------------- */
const prettyUrl = (u) => u?.replace(/^https?:\/\//, "").replace(/\/$/, "");
function linkifyText(text = "") {
  return text.replace(
    /(https?:\/\/[^\s<>()]+[^\s<>().,!?])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

/* ---------------- Logging ---------------- */
function logBioUrlClick(postId, url) {
  try { window.__smeLogEvent?.("bio_url_click", { postId, url }); } catch {}
}

export function MobileBioSheet({ open, onClose, post }) {
  if (!open) return null;

  const bio = post;
  const { translateY, dragging, bind } = useSwipeToClose(onClose);
  const postId = bio.id ?? bio.post_id ?? null;

  const hasBioText = !!bio.bio_text?.trim();
  const hasBioUrl = !!bio.bio_url?.trim();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: `rgba(0,0,0,${0.45 - Math.min(translateY / 800, 0.35)})`,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 100000,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        transition: dragging ? "none" : "background 0.25s ease",
      }}
    >
      <div
        {...bind}
        style={{
          transform: `translateY(${translateY}px)`,
          transition: dragging ? "none" : "transform 0.3s ease",
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          padding: 18,
          paddingBottom: 26,
          maxHeight: "85vh",
          overflowY: "auto",
          animation: "igSheetSlideUp 0.45s cubic-bezier(0.25,1,0.5,1)",
          fontSize: 14,
        }}
      >
        {/* drag handle */}
        <div
          style={{
            width: 40,
            height: 4,
            background: "rgba(0,0,0,.2)",
            borderRadius: 999,
            margin: "0 auto 14px",
          }}
        />

        {/* Avatar + name */}
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <img
            src={bio.avatarUrl || neutralAvatarDataUrl(60)}
            width={60}
            height={60}
            style={{ borderRadius: "999px", objectFit: "cover" }}
          />

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{bio.author}</span>
              {bio.badge && VerifiedBadge}
            </div>

            {/* Text + URL (same logic as desktop) */}
            {hasBioText && (
              <div
                style={{ fontSize: 13, color: "#4b5563", marginTop: 6, lineHeight: 1.4 }}
                dangerouslySetInnerHTML={{ __html: linkifyText(bio.bio_text) }}
              />
            )}

            {hasBioUrl && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  marginTop: hasBioText ? 2 : 6,
                  fontSize: 13,
                  lineHeight: "1.4",
                }}
              >
                <LinkIcon size={15} style={{ color: "#2563eb", marginTop: 1 }} />
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
            )}
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 18,
            textAlign: "center",
            paddingTop: 14,
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
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes igSheetSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
}