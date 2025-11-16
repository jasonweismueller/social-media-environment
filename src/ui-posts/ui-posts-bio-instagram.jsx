import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { neutralAvatarDataUrl } from "../ui-core";

// --- Number formatting helper ---
function formatNumber(n) {
  n = Number(n || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0) + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "K"; // 100K, 250K
  if (n >= 1000) return (n / 1000).toFixed(1) + "K"; // 1.2K, 3.6K
  return n.toLocaleString();
}

export function BioHoverCard({ author, avatarUrl, bio, anchorEl, verified}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 8;
    const left = rect.left + window.scrollX - 20; // slight left shift so it's centered
    setPos({ top, left });
  }, [anchorEl]);

  if (!pos) return null;

  return ReactDOM.createPortal(
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        padding: 16,
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
        width: 300,     // <-- bigger
        maxWidth: "90vw",
        zIndex: 100000,
        fontSize: 14,
        animation: "fadeIn .15s ease",
      }}
    >
      {/* Avatar + name */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <img
          src={avatarUrl || neutralAvatarDataUrl(60)}
          width={60}
          height={60}
          style={{ borderRadius: "999px", objectFit: "cover" }}
        />
        <div style={{ maxWidth: 210 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
  <span style={{ fontWeight: 600, fontSize: 15 }}>{author}</span>
  {verified && (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width="15"
      height="15"
      style={{ flexShrink: 0 }}
    >
      <path fill="#1DA1F2" d="M512 256l-63.3 36.5..."/>
      <path fill="#fff" d="M227.3 342.6L134 249.3..."/>
    </svg>
  )}
</div>
          <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>{bio.bio_text}</div>
        </div>
      </div>

      {/* Stats */}
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
          <br />
          <span style={{ fontSize: 12, color: "#4b5563" }}>posts</span>
        </div>
        <div>
          <strong>{formatNumber(bio.bio_followers)}</strong>
          <br />
          <span style={{ fontSize: 12, color: "#4b5563" }}>followers</span>
        </div>
        <div>
          <strong>{formatNumber(bio.bio_following)}</strong>
          <br />
          <span style={{ fontSize: 12, color: "#4b5563" }}>following</span>
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