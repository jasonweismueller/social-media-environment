import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { neutralAvatarDataUrl } from "../ui-core";

function formatNumber(n) {
  n = Number(n || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0) + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "K";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function safeText(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function linkifyText(text = "") {
  return safeText(text).replace(
    /(https?:\/\/[^\s<>()]+[^\s<>().,!?])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

const prettyUrl = (u = "") => String(u).replace(/^https?:\/\//, "").replace(/\/$/, "");

const LinkIcon = ({ size = 15, style = {} }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: "block", flexShrink: 0, ...style }} fill="currentColor">
    <path d="M12.59 7.41a1 1 0 0 0-1.42 1.42l1.3 1.3a2 2 0 1 1-2.83 2.83l-2.88-2.88a2 2 0 0 1 2.83-2.83l.29.29a1 1 0 1 0 1.41-1.41l-.29-.29a4 4 0 1 0-5.66 5.66l2.88 2.88a4 4 0 0 0 5.66-5.66l-1.29-1.29z" />
  </svg>
);

export const FacebookVerifiedBadge = (
  <svg width="16" height="16" viewBox="0 0 512 512" style={{ marginLeft: 4, flexShrink: 0 }} aria-hidden="true">
    <path fill="#1877f2" d="M512 256l-63.3 36.5 7.6 72.7-68.3 39.5-27.2 67.3-72.7-7.6L256 512l-36.5-63.3-72.7 7.6-39.5-68.3-67.3-27.2 7.6-72.7L0 256l63.3-36.5-7.6-72.7 68.3-39.5 27.2-67.3 72.7 7.6L256 0l36.5 63.3 72.7-7.6 39.5 68.3 67.3 27.2-7.6 72.7L512 256z" />
    <path fill="#fff" d="M227.3 342.6L134 249.3l36.4-36.4 56.9 56.9 114.3-114.3 36.4 36.4-150.7 150.7z" />
  </svg>
);

function categoryFor(post = {}) {
  if (post.authorType === "company" || post.adType === "ad") return "Page";
  return "Public figure";
}

export function FacebookBioHoverCard({
  anchorEl,
  post,
  author,
  avatarUrl,
  verified,
  hideHover,
  hideDelayRef,
  onAction,
}) {
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!anchorEl) return;

    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const width = 380;
      const margin = 12;
      const left = Math.min(
        Math.max(rect.left + window.scrollX - 24, margin + window.scrollX),
        window.scrollX + window.innerWidth - width - margin
      );
      setPos({
        top: rect.bottom + window.scrollY + 10,
        left,
        width,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorEl]);

  if (!pos) return null;

  const bio = post || {};
  const postId = bio.id ?? bio.post_id ?? null;
  const finalAuthor = author || bio.author || "Profile";
  const finalAvatar = avatarUrl || bio.avatarUrl || neutralAvatarDataUrl(72);
  const hasBioText = !!String(bio.bio_text || "").trim();
  const hasBioUrl = !!String(bio.bio_url || "").trim();

  const handleBioUrlClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onAction?.("bio_url_click", { post_id: postId, url: bio.bio_url, surface: "desktop" });
    alert("We have noted your interest in exploring this profile. We will provide you with further information in the study debrief.");
  };

  return createPortal(
    <div
      ref={cardRef}
      onMouseEnter={() => clearTimeout(hideDelayRef?.current)}
      onMouseLeave={hideHover}
      role="dialog"
      aria-label={`Profile preview for ${finalAuthor}`}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxWidth: "calc(100vw - 24px)",
        background: "#fff",
        border: "1px solid #dadde1",
        borderRadius: 10,
        boxShadow: "0 12px 28px rgba(0,0,0,.22)",
        overflow: "hidden",
        zIndex: 100000,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#050505",
        animation: "fbBioFadeIn .14s ease-out",
      }}
    >
      <div style={{ height: 78, background: "linear-gradient(135deg, #dbe7ff 0%, #f0f2f5 100%)", position: "relative" }}>
        <img
          src={finalAvatar}
          alt=""
          width={86}
          height={86}
          style={{
            position: "absolute",
            left: 18,
            bottom: -34,
            borderRadius: "50%",
            objectFit: "cover",
            border: "4px solid #fff",
            background: "#f0f2f5",
          }}
        />
      </div>

      <div style={{ padding: "42px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis" }}>
            {finalAuthor}
          </div>
          {verified ? FacebookVerifiedBadge : null}
        </div>

        <div style={{ color: "#65676b", fontSize: 13, marginTop: 3 }}>{categoryFor(bio)}</div>

        {(hasBioText || hasBioUrl) && (
          <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.4, color: "#050505" }}>
            {hasBioText && <div dangerouslySetInnerHTML={{ __html: linkifyText(bio.bio_text) }} />}
            {hasBioUrl && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: hasBioText ? 6 : 0 }}>
                <LinkIcon size={15} style={{ color: "#1877f2" }} />
                <a href={bio.bio_url} target="_blank" rel="noopener noreferrer" onClick={handleBioUrlClick} style={{ color: "#1877f2", textDecoration: "none", fontWeight: 600 }}>
                  {prettyUrl(bio.bio_url)}
                </a>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid #e4e6eb" }}>
          <div><strong>{formatNumber(bio.bio_posts)}</strong><div style={{ color: "#65676b", fontSize: 12 }}>posts</div></div>
          <div><strong>{formatNumber(bio.bio_followers)}</strong><div style={{ color: "#65676b", fontSize: 12 }}>followers</div></div>
          <div><strong>{formatNumber(bio.bio_following)}</strong><div style={{ color: "#65676b", fontSize: 12 }}>following</div></div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" disabled style={{ flex: 1, border: 0, borderRadius: 6, padding: "9px 10px", background: "#e7f3ff", color: "#1877f2", fontWeight: 700 }}>Follow</button>
          <button type="button" disabled style={{ flex: 1, border: 0, borderRadius: 6, padding: "9px 10px", background: "#e4e6eb", color: "#050505", fontWeight: 700 }}>Message</button>
        </div>
      </div>

      <style>{`
        @keyframes fbBioFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
