import React from "react";
import { neutralAvatarDataUrl } from "../ui-core";

/* -------------------------------------------------------------------------- */
/* 🧭 Swipe-to-close Hook (with fade + safe scroll lock)                       */
/* -------------------------------------------------------------------------- */
export function useSwipeToClose(onClose, threshold = 80) {
  const startY = React.useRef(0);
  const [translateY, setTranslateY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  // ✅ Prevent background scroll + pull-to-refresh only while dragging
  React.useEffect(() => {
    const preventScroll = (e) => e.preventDefault();

    if (dragging) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
      window.addEventListener("touchmove", preventScroll, {
        passive: false,
        capture: true,
      });
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
      window.removeEventListener("touchmove", preventScroll, {
        capture: true,
      });
    }

    return () =>
      window.removeEventListener("touchmove", preventScroll, {
        capture: true,
      });
  }, [dragging]);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    setDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!dragging) return;
    const diff = e.touches[0].clientY - startY.current;

    // ✅ block pull-to-refresh
    if (diff > 0) e.preventDefault();
    if (diff > 0) setTranslateY(diff * 0.85);
  };

  const handleTouchEnd = () => {
    if (!dragging) return;
    if (translateY > threshold) {
      setTranslateY(window.innerHeight * 0.9);
      setDragging(false);
      setTimeout(() => {
        setTranslateY(0);
        onClose?.();
      }, 180);
    } else {
      setTranslateY(0);
      setDragging(false);
    }
  };

  return {
    translateY,
    dragging,
    bind: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 🎨 Icons                                                                   */
/* -------------------------------------------------------------------------- */
function SaveIcon(props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      <path d="M3 3h18v14H5l-2 4V3z" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 📱 MobileSheet (Instagram-style menu with swipe-to-close)                  */
/* -------------------------------------------------------------------------- */
export function MobileSheet({ open, onClose, onAction, postId }) {
  if (!open) return null;

  const { translateY, dragging, bind } = useSwipeToClose(onClose);
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
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: `rgba(0,0,0,${0.45 - Math.min(translateY / 800, 0.35)})`,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 9999,
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
          color: "#111",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          paddingBottom: 12,
          maxHeight: "75vh",
          overflowY: "auto",
          boxShadow: "0 -8px 24px rgba(0,0,0,.25)",
          animation: "igSheetSlideUp 0.45s cubic-bezier(0.25,1,0.5,1)",
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
              color: item.danger
                ? "#ef4444"
                : item.disabled
                ? "#9ca3af"
                : "#111",
              fontSize: 15,
              fontWeight: item.danger ? 600 : 500,
              padding: "14px 16px",
              textAlign: "left",
              borderTop: i === 0 ? "none" : "1px solid #e5e7eb",
              cursor: item.disabled ? "default" : "pointer",
              opacity: item.disabled ? 0.8 : 1,
            }}
            onClick={() => {
  if (item.disabled) return;

  if (item.label === "Report") {
    onAction?.("report", { post_id: postId });
  }

  onClose?.();
}}
          >
            <item.icon {...iconStyle} />
            <span>{item.label}</span>
          </button>
        ))}

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

      <style>{`
        @keyframes igSheetSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 📤 ShareSheet (friends + message + swipe-to-close)                         */
/* -------------------------------------------------------------------------- */
export function ShareSheet({ open, onClose, onShare }) {
  const [selectedFriends, setSelectedFriends] = React.useState([]);
  const [message, setMessage] = React.useState("");
  const [showMessageSection, setShowMessageSection] = React.useState(false);
  const { translateY, dragging, bind } = useSwipeToClose(onClose);

  React.useEffect(() => {
    if (selectedFriends.length > 0) setShowMessageSection(true);
    else {
      const t = setTimeout(() => setShowMessageSection(false), 300);
      return () => clearTimeout(t);
    }
  }, [selectedFriends.length]);

  if (!open) return null;

  const friends = Array.from({ length: 6 }).map((_, i) => ({
    name: `Friend ${i + 1}`,
    avatar: neutralAvatarDataUrl(60),
  }));

  const toggleSelect = (name) =>
    setSelectedFriends((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name]
    );

  const handleSend = () => {
    if (!selectedFriends.length) return;
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
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: `rgba(0,0,0,${0.45 - Math.min(translateY / 800, 0.35)})`,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 9999,
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
        <div
          style={{
            width: 38,
            height: 4,
            background: "rgba(0,0,0,.15)",
            borderRadius: 999,
            margin: "8px auto 14px",
          }}
        />
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

        {/* Smooth message input section */}
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
              disabled={!selectedFriends.length}
              style={{
                background:
                  selectedFriends.length > 0 ? "#0095f6" : "#d1d5db",
                color: "#fff",
                fontWeight: 600,
                border: "none",
                borderRadius: 10,
                padding: "12px 0",
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
    </div>
  );
}