import React from "react";
import { neutralAvatarDataUrl, IconGlobe, IconBadge } from "../ui-core";

/* -------------------------------------------------------------------------- */
/* Desktop Overlay Wrapper                                                    */
/* -------------------------------------------------------------------------- */

function DesktopOverlay({ children, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        animation: "fadeIn 0.25s ease",
        padding: 16,
      }}
    >
      {children}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { transform: scale(.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Facebook Post Preview                                                      */
/* -------------------------------------------------------------------------- */

function FacebookPostPreview({ postPreview }) {
  if (!postPreview) return null;

  const {
    author,
    avatarUrl,
    badge,
    timeLabel,
    text,
    image,
  } = postPreview;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={avatarUrl || neutralAvatarDataUrl(40)}
            alt=""
            width={40}
            height={40}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
              background: "#e5e7eb",
            }}
          />

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontWeight: 700,
                fontSize: 14,
                color: "#111827",
              }}
            >
              <span
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {author || "User"}
              </span>
              {badge ? (
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <IconBadge />
                </span>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "#6b7280",
                fontSize: 12,
                marginTop: 2,
              }}
            >
              {timeLabel ? <span>{timeLabel}</span> : null}
              <span aria-hidden="true">·</span>
              <IconGlobe style={{ width: 12, height: 12, color: "#6b7280" }} />
            </div>
          </div>
        </div>

        {!!text && (
          <div
            style={{
              marginTop: 12,
              fontSize: 14,
              lineHeight: 1.45,
              color: "#111827",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {text}
          </div>
        )}
      </div>

      {image?.svg ? (
        <div
          dangerouslySetInnerHTML={{
            __html: image.svg.replace(
              "<svg ",
              "<svg preserveAspectRatio='xMidYMid slice' style='display:block;width:100%;height:auto;max-height:520px' "
            ),
          }}
        />
      ) : image?.url ? (
        <img
          src={image.url}
          alt={image.alt || ""}
          style={{
            display: "block",
            width: "100%",
            maxHeight: 520,
            objectFit: "cover",
            background: "#f3f4f6",
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop Comment Modal                                                      */
/* -------------------------------------------------------------------------- */

export function FacebookCommentModalDesktop({
  open,
  onClose,
  onSubmit,
  commentText,
  setCommentText,
  postPreview,
}) {
  if (!open) return null;

  return (
    <DesktopOverlay onClose={onClose}>
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 760,
          height: "min(92vh, 920px)",
          maxHeight: "92vh",
          boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
          animation: "popIn 0.25s cubic-bezier(0.25,1,0.5,1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            border: "none",
            background: "transparent",
            fontSize: 24,
            lineHeight: 1,
            cursor: "pointer",
            color: "#6b7280",
            zIndex: 5,
          }}
        >
          ×
        </button>

        {/* Original post area */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: 16,
            background: "#f9fafb",
            overflowY: "auto",
          }}
        >
          <FacebookPostPreview postPreview={postPreview} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
          }}
          style={{
            borderTop: "1px solid #e5e7eb",
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#fff",
            flexShrink: 0,
          }}
        >
          <img
            src={neutralAvatarDataUrl(34)}
            alt=""
            width={34}
            height={34}
            style={{ borderRadius: "50%", flexShrink: 0 }}
          />

          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write a comment..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "#f3f4f6",
              borderRadius: 999,
              padding: "11px 14px",
              fontSize: 14,
            }}
          />

          <button
            type="submit"
            disabled={!commentText.trim()}
            style={{
              border: "none",
              background: "transparent",
              color: commentText.trim() ? "#1877f2" : "#9ca3af",
              fontWeight: 700,
              fontSize: 14,
              cursor: commentText.trim() ? "pointer" : "default",
              padding: "0 4px",
            }}
          >
            Post
          </button>
        </form>
      </div>
    </DesktopOverlay>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop Share Modal                                                        */
/* -------------------------------------------------------------------------- */

export function FacebookShareModalDesktop({
  open,
  onClose,
  onShare,
}) {
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
    onShare?.({
      friends: selectedFriends.join(", "),
      message,
    });
    setSelectedFriends([]);
    setMessage("");
    onClose?.();
  };

  return (
    <DesktopOverlay onClose={onClose}>
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 560,
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

        <div
          style={{
            fontWeight: 700,
            fontSize: 20,
            textAlign: "center",
            marginBottom: 22,
          }}
        >
          Share post
        </div>

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
                        ? "2px solid #1877f2"
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
                        background: "#1877f2",
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
                  selectedFriends.length > 0 ? "#1877f2" : "#d1d5db",
                color: "#fff",
                fontWeight: 700,
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
    </DesktopOverlay>
  );
}