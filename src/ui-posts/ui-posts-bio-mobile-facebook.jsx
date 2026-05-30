import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { neutralAvatarDataUrl } from "../ui-core";
import { FacebookVerifiedBadge } from "./ui-posts-bio-facebook";

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

function categoryFor(post = {}) {
  if (post.authorType === "company" || post.adType === "ad") return "Page";
  return "Public figure";
}

function useSwipeToClose(onClose) {
  const startY = useRef(null);
  const [translateY, setTranslateY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const bind = {
    onPointerDown: (e) => {
      startY.current = e.clientY;
      setDragging(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    },
    onPointerMove: (e) => {
      if (startY.current == null) return;
      setTranslateY(Math.max(0, e.clientY - startY.current));
    },
    onPointerUp: () => {
      if (translateY > 100) onClose?.();
      setTranslateY(0);
      setDragging(false);
      startY.current = null;
    },
    onPointerCancel: () => {
      setTranslateY(0);
      setDragging(false);
      startY.current = null;
    },
  };

  return { translateY, dragging, bind };
}

export function FacebookMobileBioSheet({ open, onClose, post, author, avatarUrl, verified, onAction }) {
  const { translateY, dragging, bind } = useSwipeToClose(onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const bio = post || {};
  const postId = bio.id ?? bio.post_id ?? null;
  const finalAuthor = author || bio.author || "Profile";
  const finalAvatar = avatarUrl || bio.avatarUrl || neutralAvatarDataUrl(72);
  const hasBioText = !!String(bio.bio_text || "").trim();
  const hasBioUrl = !!String(bio.bio_url || "").trim();

  const handleBioUrlClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onAction?.("bio_url_click", { post_id: postId, url: bio.bio_url, surface: "mobile" });
    alert("We have noted your interest in exploring this profile. We will provide you with further information in the study debrief.");
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Profile for ${finalAuthor}`}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: `rgba(0,0,0,${0.45 - Math.min(translateY / 900, 0.3)})`,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 100000,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        {...bind}
        style={{
          transform: `translateY(${translateY}px)`,
          transition: dragging ? "none" : "transform .25s ease",
          width: "100%",
          maxWidth: 560,
          maxHeight: "88vh",
          overflowY: "auto",
          background: "#fff",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
          color: "#050505",
          animation: "fbBioSheetUp .28s ease-out",
        }}
      >
        <div style={{ width: 42, height: 4, background: "#ccd0d5", borderRadius: 999, margin: "10px auto" }} />

        <div style={{ height: 94, background: "linear-gradient(135deg, #dbe7ff 0%, #f0f2f5 100%)", position: "relative" }}>
          <img
            src={finalAvatar}
            alt=""
            width={92}
            height={92}
            style={{
              position: "absolute",
              left: 18,
              bottom: -36,
              borderRadius: "50%",
              objectFit: "cover",
              border: "4px solid #fff",
              background: "#f0f2f5",
            }}
          />
        </div>

        <div style={{ padding: "44px 18px 22px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.15 }}>{finalAuthor}</div>
            {verified ? FacebookVerifiedBadge : null}
          </div>
          <div style={{ color: "#65676b", fontSize: 13, marginTop: 3 }}>{categoryFor(bio)}</div>

          {(hasBioText || hasBioUrl) && (
            <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.45 }}>
              {hasBioText && <div dangerouslySetInnerHTML={{ __html: linkifyText(bio.bio_text) }} />}
              {hasBioUrl && (
                <div style={{ marginTop: hasBioText ? 7 : 0 }}>
                  <a href={bio.bio_url} target="_blank" rel="noopener noreferrer" onClick={handleBioUrlClick} style={{ color: "#1877f2", textDecoration: "none", fontWeight: 700 }}>
                    {prettyUrl(bio.bio_url)}
                  </a>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 18, paddingTop: 16, borderTop: "1px solid #e4e6eb" }}>
            <div><strong>{formatNumber(bio.bio_posts)}</strong><div style={{ color: "#65676b", fontSize: 12 }}>posts</div></div>
            <div><strong>{formatNumber(bio.bio_followers)}</strong><div style={{ color: "#65676b", fontSize: 12 }}>followers</div></div>
            <div><strong>{formatNumber(bio.bio_following)}</strong><div style={{ color: "#65676b", fontSize: 12 }}>following</div></div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" disabled style={{ flex: 1, border: 0, borderRadius: 8, padding: "10px", background: "#e7f3ff", color: "#1877f2", fontWeight: 800 }}>Follow</button>
            <button type="button" disabled style={{ flex: 1, border: 0, borderRadius: 8, padding: "10px", background: "#e4e6eb", color: "#050505", fontWeight: 800 }}>Message</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fbBioSheetUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
}
