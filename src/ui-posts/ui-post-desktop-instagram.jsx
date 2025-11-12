import React from "react";
import { neutralAvatarDataUrl } from "../ui-core";

export function ShareSheetDesktop({ open, onClose, onShare }) {
  const [selectedFriends, setSelectedFriends] = React.useState([]);
  const [message, setMessage] = React.useState("");

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
    onShare({ friends: selectedFriends, message });
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
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 520,            // ⬅️ wider
          maxHeight: "85vh",        // ⬅️ taller
          padding: "28px 24px 24px",
          boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          animation: "popIn 0.25s cubic-bezier(0.25,1,0.5,1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
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
            gridTemplateColumns: "repeat(4, 1fr)",  // ⬅️ four per row
            gap: 20,
            justifyItems: "center",
            marginBottom: 20,
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

        {/* Message + Send */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
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

      {/* Animations */}
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