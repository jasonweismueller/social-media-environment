import React from "react";
import { neutralAvatarDataUrl } from "../ui-core";
import { IconThumb, IconComment, IconShare } from "../ui-core";

/* -------------------------------------------------------------------------- */
/* Swipe to close hook (for sheets)                                           */
/* -------------------------------------------------------------------------- */

function useSwipeToClose(onClose, threshold = 80) {
  const startY = React.useRef(0);
  const [translateY, setTranslateY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    setDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!dragging) return;
    const diff = e.touches[0].clientY - startY.current;
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
/* Facebook Mobile Menu Sheet                                                 */
/* -------------------------------------------------------------------------- */

export function FacebookMenuSheet({ open, onClose, menuItems }) {
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
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 9999,
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
          paddingBottom: 12,
          maxHeight: "75vh",
          overflowY: "auto",
          boxShadow: "0 -8px 24px rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            background: "rgba(0,0,0,.2)",
            borderRadius: 999,
            margin: "10px auto 16px",
          }}
        />

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
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Facebook Comment Sheet                                                     */
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
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 9999,
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
          padding: "16px",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            background: "rgba(0,0,0,.2)",
            borderRadius: 999,
            margin: "0 auto 16px",
          }}
        />

        <h3 style={{ marginBottom: 16 }}>Write a comment</h3>

        {shouldShowGhosts &&
          Array.from({ length: Math.min(3, baseCommentCount) }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#e5e7eb",
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    height: 8,
                    background: "#e5e7eb",
                    width: "70%",
                    marginBottom: 6,
                  }}
                />
                <div
                  style={{
                    height: 8,
                    background: "#e5e7eb",
                    width: "40%",
                  }}
                />
              </div>
            </div>
          ))}

        {mySubmittedComment && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <img
              src={neutralAvatarDataUrl(28)}
              width={28}
              height={28}
              style={{ borderRadius: "50%" }}
              alt=""
            />
            <div>
              <strong>{participantId}</strong>
              <div>{mySubmittedComment}</div>
            </div>
          </div>
        )}

        <textarea
          rows={4}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Write your comment..."
          style={{
            width: "100%",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} className="btn">
            Close
          </button>

          <button
            onClick={onSubmit}
            disabled={!commentText.trim()}
            className="btn primary"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Facebook Share Sheet                                                       */
/* -------------------------------------------------------------------------- */

export function FacebookShareSheetMobile({ open, onClose, onShare }) {
  const { translateY, dragging, bind } = useSwipeToClose(onClose);
  const [message, setMessage] = React.useState("");

  if (!open) return null;

  const handleShare = () => {
    onShare?.({ message });
    setMessage("");
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
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 9999,
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
          padding: "16px",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            background: "rgba(0,0,0,.2)",
            borderRadius: 999,
            margin: "0 auto 16px",
          }}
        />

        <h3 style={{ marginBottom: 12 }}>Share post</h3>

        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write something..."
          style={{
            width: "100%",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} className="btn">
            Cancel
          </button>

          <button onClick={handleShare} className="btn primary">
            Share
          </button>
        </div>
      </div>
    </div>
  );
}