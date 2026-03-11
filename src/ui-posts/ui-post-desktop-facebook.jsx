import React, { useEffect, useRef } from "react";
import { neutralAvatarDataUrl } from "../ui-core";

/* -------------------------------------------------------------------------- */
/* Desktop Overlay Wrapper                                                    */
/* -------------------------------------------------------------------------- */

function DesktopOverlay({ children, onClose, topOffset = 76 }) {
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
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 9999,
        animation: "fadeIn 0.25s ease",
        padding: `${topOffset}px 16px 16px`,
        boxSizing: "border-box",
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
/* Desktop Comment Modal                                                      */
/* -------------------------------------------------------------------------- */

export function FacebookCommentModalDesktop({
  open,
  onClose,
  onSubmit,
  commentText,
  setCommentText,
  postContent,
  mySubmittedComment,
  shouldShowGhosts,
  baseCommentCount,
  participantId,
  focusTick
}) {
  const inputRef = useRef(null);

  useEffect(() => {
  if (!open) return;
  const t = setTimeout(() => {
    inputRef.current?.focus();
  }, 60);
  return () => clearTimeout(t);
}, [open, focusTick]);

  if (!open) return null;

  const ghostCount = shouldShowGhosts ? Math.min(5, baseCommentCount || 0) : 0;
  const hasParticipantComment = !!String(mySubmittedComment || "").trim();

  return (
    <DesktopOverlay onClose={onClose} topOffset={76}>
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 820,
          height: "min(calc(100vh - 92px), 980px)",
          maxHeight: "calc(100vh - 92px)",
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
          className="fb-modal-close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            fontSize: 24,
            lineHeight: 1,
            zIndex: 10,
          }}
        >
          ×
        </button>

       <div
  className="fb-comment-modal-body"
  style={{
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: 0,
  }}
>
  <div className="fb-comment-modal-inner" style={{ width: "100%", margin: 0, paddingTop: 6 }}>
            <div className="fb-comment-modal-post-wrap">
              {postContent}
            </div>

            <div className="fb-comment-thread">
              <div className="fb-comment-thread-title">
                Comments
              </div>

              {ghostCount === 0 && !hasParticipantComment ? (
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 14,
                    paddingBottom: 10,
                  }}
                >
                  No comments yet. Start the conversation.
                </div>
              ) : (
                <>
                  {Array.from({ length: ghostCount }).map((_, i) => (
                    <div
                      key={`ghost-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        marginBottom: 16,
                      }}
                    >
                      <img
                        src={neutralAvatarDataUrl(34)}
                        alt=""
                        width={34}
                        height={34}
                        style={{ borderRadius: "50%", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 5,
                            color: "#111827",
                          }}
                        >
                          User {i + 1}
                        </div>
                        <div
                          style={{
                            height: 10,
                            width: "78%",
                            background: "#e5e7eb",
                            borderRadius: 999,
                            marginBottom: 6,
                          }}
                        />
                        <div
                          style={{
                            height: 10,
                            width: "48%",
                            background: "#e5e7eb",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {hasParticipantComment && (
                    <div className="fb-comment-item">
                      <img
                        src={neutralAvatarDataUrl(34)}
                        alt=""
                        width={34}
                        height={34}
                        style={{ borderRadius: "50%", flexShrink: 0 }}
                      />
                      <div className="fb-comment-bubble" style={{ minWidth: 0 }}>
                        <div className="fb-comment-author">
                          {String(participantId || "Participant")}
                        </div>
                        <div className="fb-comment-text">
                          {mySubmittedComment}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
          }}
          className="fb-comment-composer"
          style={{
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
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
            ref={inputRef}
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
    <DesktopOverlay onClose={onClose} topOffset={72}>
     <div
  style={{
    background: "#fff",
    borderRadius: 18,
    width: "100%",
    maxWidth: 820,
    height: "min(calc(100vh - 92px), 980px)",
    maxHeight: "calc(100vh - 92px)",
    boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
    animation: "popIn 0.25s cubic-bezier(0.25,1,0.5,1)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  }}
>
  <div
    style={{
      height: 52,
      minHeight: 52,
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: "0 12px",
      borderBottom: "1px solid #e5e7eb",
      background: "#fff",
      flexShrink: 0,
    }}
  >
    <button
      onClick={onClose}
      aria-label="Close"
      className="fb-modal-close"
      style={{
        width: 34,
        height: 34,
        fontSize: 24,
        lineHeight: 1,
      }}
    >
      ×
    </button>
  </div>

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