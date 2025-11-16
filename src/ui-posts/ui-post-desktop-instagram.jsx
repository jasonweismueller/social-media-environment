import React, { useState, useRef } from "react";
import ReactDOM from "react-dom";
import { neutralAvatarDataUrl } from "../ui-core";

export function BioHoverCard({ author, avatarUrl, bio, anchorEl }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  // Compute position on first render
  React.useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 8;
    const left = rect.left + window.scrollX;
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
          <div style={{ fontSize: 13, color: "#4b5563" }}>{bio.bioText}</div>
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
        <div><strong>{bio.bioPosts}</strong><br/><span style={{ fontSize: 12 }}>posts</span></div>
        <div><strong>{bio.bioFollowers}</strong><br/><span style={{ fontSize: 12 }}>followers</span></div>
        <div><strong>{bio.bioFollowing}</strong><br/><span style={{ fontSize: 12 }}>following</span></div>
      </div>
    </div>,
    document.body
  );
}

export function ShareSheetDesktop({ open, onClose, onShare }) {
  const [selectedFriends, setSelectedFriends] = React.useState([]);
  const [message, setMessage] = React.useState("");
  const [showMessageSection, setShowMessageSection] = React.useState(false);

  React.useEffect(() => {
    if (selectedFriends.length > 0) {
      setShowMessageSection(true);
    } else {
      const t = setTimeout(() => setShowMessageSection(false), 250);
      return () => clearTimeout(t);
    }
  }, [selectedFriends.length]);

  if (!open) return null;

  const friends = Array.from({ length: 8 }).map((_, i) => ({
    name: `Friend ${i + 1}`,
    avatar: neutralAvatarDataUrl(64),
  }));

  const toggleSelect = (name) => {
    setSelectedFriends((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name]
    );
  };

  const handleSend = () => {
    if (!selectedFriends.length) return;
    onShare({
      friends: selectedFriends.join(", "),
      message,
    });
    setSelectedFriends([]);
    setMessage("");
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        animation: "fadeIn 0.25s ease",
      }}
    >
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 520,
          maxHeight: "85vh",
          padding: "28px 24px 24px",
          boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          animation: "popIn 0.25s cubic-bezier(0.25,1,0.5,1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            border: "none",
            background: "transparent",
            fontSize: 22,
            cursor: "pointer",
            color: "#737373",
            lineHeight: 1,
          }}
        >
          ×
        </button>

        {/* Header */}
        <div
          style={{
            fontWeight: 600,
            fontSize: 20,
            textAlign: "center",
            marginBottom: 22,
          }}
        >
          Share
        </div>

        {/* Friend grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 20,
            justifyItems: "center",
            marginBottom: 10,
            overflowY: "auto",
            padding: "4px 2px",
          }}
        >
          {friends.map((f) => {
            const selected = selectedFriends.includes(f.name);
            return (
              <button
                key={f.name}
                onClick={() => toggleSelect(f.name)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  position: "relative",
                }}
              >
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img
                    src={f.avatar}
                    alt=""
                    width={68}
                    height={68}
                    style={{
                      borderRadius: "50%",
                      border: selected
                        ? "2px solid #0095f6"
                        : "2px solid transparent",
                      transition: "border 0.2s ease",
                    }}
                  />
                  {selected && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: -3,
                        right: -3,
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "#0095f6",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        boxShadow: "0 0 0 3px #fff",
                      }}
                    >
                      ✓
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 13,
                    color: "#111",
                    textAlign: "center",
                    marginTop: 6,
                    maxWidth: 80,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Smooth message input + send button */}
        <div
          style={{
            overflow: "hidden",
            transition: "max-height 0.3s ease, opacity 0.3s ease",
            maxHeight: showMessageSection ? "200px" : "0px",
            opacity: showMessageSection ? 1 : 0,
          }}
        >
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              padding: "12px 16px 16px",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              transform: showMessageSection
                ? "translateY(0)"
                : "translateY(20px)",
              transition: "transform 0.35s cubic-bezier(0.25,1,0.5,1)",
            }}
          >
            <input
              type="text"
              placeholder="Write a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{
                border: "1px solid #e5e7eb",
                outline: "none",
                background: "#f9fafb",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 15,
                color: "#111",
              }}
            />

            <button
              onClick={handleSend}
              disabled={!selectedFriends.length}
              style={{
                background:
                  selectedFriends.length > 0 ? "#0095f6" : "#d1d5db",
                color: "#fff",
                fontWeight: 600,
                border: "none",
                borderRadius: 10,
                padding: "13px 0",
                fontSize: 16,
                cursor: selectedFriends.length ? "pointer" : "default",
                transition: "background 0.2s ease",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}