import React from "react";
import { neutralAvatarDataUrl } from "../ui-core";

/* -------------------------------------------------------------------------- */
/* Swipe to close hook                                                        */
/* -------------------------------------------------------------------------- */

function useSwipeToClose(onClose, threshold = 80) {
  const startY = React.useRef(0);
  const [translateY, setTranslateY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

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
/* Base mobile sheet                                                          */
/* -------------------------------------------------------------------------- */

function MobileSheetBase({ open, onClose, children, maxHeight = "85vh" }) {
  const { translateY, dragging, bind } = useSwipeToClose(onClose);

  if (!open) return null;

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
        zIndex: 30000,
        transition: dragging ? "none" : "background 0.25s ease",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        {...bind}
       style={{
  transform: `translateY(${translateY}px)`,
  transition: dragging ? "none" : "transform 0.3s ease",
  width: "100%",
  maxWidth: "100vw",
  background: "#fff",
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  maxHeight,
  overflowY: "auto",
  boxShadow: "0 -8px 24px rgba(0,0,0,.25)",
  animation: "fbSheetSlideUp 0.45s cubic-bezier(0.25,1,0.5,1)",
  position: "relative",
  zIndex: 30001,
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
        {children}
      </div>

      <style>{`
        @keyframes fbSheetSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Facebook Mobile Menu Sheet                                                 */
/* -------------------------------------------------------------------------- */

export function FacebookMenuSheet({ open, onClose, menuItems }) {
  if (!open) return null;

  return (
    <MobileSheetBase open={open} onClose={onClose} maxHeight="75vh">
      {menuItems}

      <button
        onClick={onClose}
        style={{
          width: "100%",
          border: "none",
          padding: "14px",
          background: "#fff",
          borderTop: "1px solid #e5e7eb",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </MobileSheetBase>
  );
}

/* -------------------------------------------------------------------------- */
/* Facebook Comment Sheet Mobile                                              */
/* -------------------------------------------------------------------------- */

export function FacebookCommentSheetMobile({
  open,
  onClose,
  onSubmit,
  commentText,
  setCommentText,
  mySubmittedComment,
  shouldShowGhosts,
  baseCommentCount,
  participantId,
}) {
  if (!open) return null;

  const totalVisibleComments =
    (shouldShowGhosts ? Math.min(5, baseCommentCount) : 0) +
    (mySubmittedComment ? 1 : 0);

  const hasAnyComments = totalVisibleComments > 0;

  return (
    <MobileSheetBase
      open={open}
      onClose={onClose}
      maxHeight={hasAnyComments ? "72vh" : "40vh"}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: hasAnyComments ? "52vh" : "auto",
          maxHeight: hasAnyComments ? "72vh" : "40vh",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 17,
            textAlign: "center",
            paddingBottom: 12,
            borderBottom: "1px solid #e5e7eb",
            margin: "0 16px",
            flexShrink: 0,
          }}
        >
          Comments
        </div>

        <div
          style={{
            flex: hasAnyComments ? 1 : "0 1 auto",
            overflowY: hasAnyComments ? "auto" : "visible",
            padding: "16px",
            minHeight: 0,
          }}
        >
          {totalVisibleComments === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "#6b7280",
                fontSize: 14,
                marginTop: 20,
                marginBottom: 12,
              }}
            >
              No comments yet. Start the conversation.
            </div>
          ) : (
            <>
              {shouldShowGhosts &&
                Array.from({ length: Math.min(5, baseCommentCount) }).map((_, i) => (
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
                      src={neutralAvatarDataUrl(32)}
                      alt=""
                      width={32}
                      height={32}
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
                          background: "#e5e7eb",
                          width: "78%",
                          marginBottom: 6,
                          borderRadius: 999,
                        }}
                      />
                      <div
                        style={{
                          height: 10,
                          background: "#e5e7eb",
                          width: "48%",
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </div>
                ))}

              {!!mySubmittedComment && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    marginTop: 4,
                  }}
                >
                  <img
                    src={neutralAvatarDataUrl(32)}
                    alt=""
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%", flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        marginBottom: 3,
                        color: "#111827",
                      }}
                    >
                      {String(participantId)}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#111827",
                        lineHeight: 1.4,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {mySubmittedComment}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
          }}
          style={{
            borderTop: "1px solid #e5e7eb",
            padding: "10px 12px",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: "auto",
            flexShrink: 0,
          }}
        >
          <img
            src={neutralAvatarDataUrl(32)}
            alt=""
            width={32}
            height={32}
            style={{ borderRadius: "50%" }}
          />

          <input
            type="text"
            placeholder={
              totalVisibleComments === 0
                ? "Start the conversation..."
                : "Write a comment..."
            }
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            inputMode="text"
            enterKeyHint="send"
            autoCorrect="off"
            autoCapitalize="sentences"
            autoComplete="off"
            spellCheck="false"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "#f3f4f6",
              borderRadius: 20,
              padding: "10px 14px",
              fontSize: 16,
              lineHeight: 1.3,
            }}
          />

          <button
            type="submit"
            disabled={!commentText.trim()}
            style={{
              background: "transparent",
              border: "none",
              color: commentText.trim() ? "#1877f2" : "#9ca3af",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            Post
          </button>
        </form>
      </div>
    </MobileSheetBase>
  );
}

/* -------------------------------------------------------------------------- */
/* Facebook Share Sheet Mobile                                                */
/* -------------------------------------------------------------------------- */

export function FacebookShareSheetMobile({ open, onClose, onShare }) {
  const [selectedFriends, setSelectedFriends] = React.useState([]);
  const [message, setMessage] = React.useState("");
  const [showMessageSection, setShowMessageSection] = React.useState(false);

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
    onShare?.({ friends: selectedFriends.join(", "), message });
    setSelectedFriends([]);
    setMessage("");
    onClose?.();
  };

  return (
    <MobileSheetBase open={open} onClose={onClose} maxHeight="85vh">
      <div
        style={{
          color: "#111",
          display: "flex",
          flexDirection: "column",
          maxHeight: "85vh",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            textAlign: "center",
            paddingBottom: 10,
            borderBottom: "1px solid #e5e7eb",
            margin: "0 16px",
          }}
        >
          Share post
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
            maxHeight: showMessageSection ? "220px" : "0px",
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
                fontSize: 16,
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
    </MobileSheetBase>
  );
}