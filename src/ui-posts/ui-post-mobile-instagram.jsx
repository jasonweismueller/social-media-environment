import React from "react";
import { neutralAvatarDataUrl } from "../ui-core";



/* --- Simple SVG icon set (lightweight, inline) --- */
function QrIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect x="3" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="15" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="3" y="15" width="6" height="6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M15 15h2v2h2v2h-4v-4Z" fill="currentColor" />
    </svg>
  );
}

function StarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M12 17.3l6.2 3.7-1.7-7.2L22 9.3l-7.4-.6L12 2 9.4 8.7 2 9.3l5.5 4.5-1.7 7.2L12 17.3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function UserMinusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M16 11h6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function UserCircleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M5 21v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function InfoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M12 8h.01M11 12h1v4h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HideIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ReportIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M3 3h18v14H5l-2 4V3z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <path
        d="M12 8v4M12 16h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function sheetBtn({ danger = false, disabled = false } = {}) {
  return {
    width: "100%",
    background: disabled ? "#374151" : (danger ? "#ef4444" : "#4b5563"),
    color: "#fff",
    border: 0,
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 15,
    opacity: disabled ? 0.75 : 1
  };
}

/* ---------------- Mobile sheet (Instagram-style with icons) ---------------- */
export function MobileSheet({ open, onClose }) {
  if (!open) return null;

  const iconStyle = { width: 20, height: 20, flexShrink: 0 };

  const menuItems = [
    { label: "Save", icon: SaveIcon, disabled: true },
    { label: "QR code", icon: QrIcon, disabled: true },
    { label: "Add to Favourites", icon: StarIcon, disabled: true },
    { label: "Unfollow", icon: UserMinusIcon, disabled: true },
    { label: "About this account", icon: UserCircleIcon, disabled: true },
    { label: "Why you're seeing this post", icon: InfoIcon, disabled: true },
    { label: "Hide", icon: HideIcon, disabled: true },
    { label: "Report", icon: ReportIcon, danger: true },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          color: "#111",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          paddingBottom: 12,
          maxHeight: "75vh",
          overflowY: "auto",
          boxShadow: "0 -8px 24px rgba(0,0,0,.25)",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            background: "rgba(0,0,0,.2)",
            borderRadius: 999,
            margin: "8px auto 14px",
          }}
        />

        {menuItems.map((item, i) => (
          <button
            key={i}
            disabled={item.disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              border: "none",
              background: "#fff",
              color: item.danger ? "#ef4444" : item.disabled ? "#9ca3af" : "#111",
              fontSize: 15,
              fontWeight: item.danger ? 600 : 500,
              padding: "14px 16px",
              textAlign: "left",
              borderTop: i === 0 ? "none" : "1px solid #e5e7eb",
              cursor: item.disabled ? "default" : "pointer",
              opacity: item.disabled ? 0.8 : 1,
            }}
            onClick={() => {
              if (!item.disabled && item.label === "Report") alert("Reported!");
            }}
          >
            <item.icon {...iconStyle} />
            <span>{item.label}</span>
          </button>
        ))}

        {/* Cancel button */}
        <button
          onClick={onClose}
          style={{
            display: "block",
            width: "100%",
            marginTop: 10,
            padding: "14px 0",
            textAlign: "center",
            borderTop: "1px solid #e5e7eb",
            fontSize: 16,
            fontWeight: 600,
            background: "#fff",
            color: "#111",
            border: "none",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
export function ShareSheet({ open, onClose, onShare }) {
  const [selectedFriends, setSelectedFriends] = React.useState([]);
  const [message, setMessage] = React.useState("");
  const [showMessageSection, setShowMessageSection] = React.useState(false);

  // Toggle visibility with animation timing
  React.useEffect(() => {
    if (selectedFriends.length > 0) {
      setShowMessageSection(true);
    } else {
      // small delay so the slide-out animation completes before unmount
      const timeout = setTimeout(() => setShowMessageSection(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [selectedFriends.length]);

  if (!open) return null;

  const friends = Array.from({ length: 6 }).map((_, i) => ({
    name: `Friend ${i + 1}`,
    avatar: neutralAvatarDataUrl(60),
  }));

  const toggleSelect = (name) => {
    setSelectedFriends((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name]
    );
  };

  const handleSend = () => {
    if (selectedFriends.length === 0) return;
    onShare({ friends: selectedFriends, message });
    setSelectedFriends([]);
    setMessage("");
    onClose();
  };

  return (
    <div
      className="share-sheet"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          animation: "igSheetSlideUp 0.45s cubic-bezier(0.25,1,0.5,1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "85vh",
          overflowY: "auto",
          paddingBottom: 12,
          color: "#111",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 38,
            height: 4,
            background: "rgba(0,0,0,.15)",
            borderRadius: 999,
            margin: "8px auto 14px",
          }}
        />

        {/* Header */}
        <div
          style={{
            fontWeight: 600,
            fontSize: 16,
            textAlign: "center",
            paddingBottom: 10,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          Share
        </div>

        {/* Friend grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            padding: "20px",
            justifyItems: "center",
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
                  }}
                >
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Smooth in/out message section */}
        <div
          className={`message-section-wrapper ${
            selectedFriends.length > 0 ? "visible" : "hidden"
          }`}
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
              gap: 8,
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
                border: "none",
                outline: "none",
                background: "#f3f4f6",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 15,
                color: "#111",
              }}
            />
            <button
              onClick={handleSend}
              disabled={selectedFriends.length === 0}
              style={{
                background:
                  selectedFriends.length > 0 ? "#0095f6" : "#d1d5db",
                color: "#fff",
                fontWeight: 600,
                border: "none",
                borderRadius: 10,
                padding: "12px 0",
                fontSize: 16,
                cursor:
                  selectedFriends.length > 0 ? "pointer" : "default",
                transition: "background 0.2s ease",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes igSheetSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}