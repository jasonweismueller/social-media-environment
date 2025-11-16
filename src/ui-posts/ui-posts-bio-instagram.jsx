import React from "react";
import ReactDOM from "react-dom";
import { neutralAvatarDataUrl } from "../ui-core";

export function BioHoverCard({ anchorEl, author, avatarUrl, bio }) {
  if (!anchorEl || !bio) return null;

  const rect = anchorEl.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 8;
  const left = rect.left + window.scrollX;

  return ReactDOM.createPortal(
    <div
      style={{
        position: "absolute",
        top,
        left,
        padding: 12,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        width: 240,
        zIndex: 100000,
        fontSize: 14,
        animation: "fadeIn .15s ease",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <img
          src={avatarUrl || neutralAvatarDataUrl(48)}
          width={48}
          height={48}
          style={{ borderRadius: "999px" }}
        />
        <div>
          <div style={{ fontWeight: 600 }}>{author}</div>
          <div style={{ fontSize: 13, color: "#4b5563" }}>{bio.bio_text}</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 12,
          textAlign: "center",
        }}
      >
        <div><strong>{bio.bio_posts}</strong><br/><span style={{ fontSize: 12 }}>posts</span></div>
        <div><strong>{bio.bio_followers}</strong><br/><span style={{ fontSize: 12 }}>followers</span></div>
        <div><strong>{bio.bio_following}</strong><br/><span style={{ fontSize: 12 }}>following</span></div>
      </div>
    </div>,
    document.body
  );
}