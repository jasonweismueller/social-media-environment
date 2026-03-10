import React from "react";
import { neutralAvatarDataUrl } from "../ui-core";

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
      }}
    >
      {children}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
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
  mySubmittedComment,
  shouldShowGhosts,
  baseCommentCount,
  participantId,
}) {
  if (!open) return null;

  return (
    <DesktopOverlay onClose={onClose}>
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          padding: "26px 26px 22px",
          boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
          animation: "popIn 0.25s cubic-bezier(0.25,1,0.5,1)",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 20,
            textAlign: "center",
            marginBottom: 18,
          }}
        >
          Write a comment
        </div>

        {/* Ghost comments */}
        {shouldShowGhosts &&
          Array.from({ length: Math.min(3, baseCommentCount) }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
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

        {/* Participant comment */}
        {mySubmittedComment && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <img
              src={neutralAvatarDataUrl(30)}
              width={30}
              height={30}
              style={{ borderRadius: "50%" }}
              alt=""
            />
            <div>
              <div style={{ fontWeight: 600 }}>{participantId}</div>
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
            borderRadius: 10,
            padding: 12,
            marginBottom: 14,
            fontSize: 14,
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>

          <button
            className="btn primary"
            onClick={onSubmit}
            disabled={!commentText.trim()}
          >
            Post
          </button>
        </div>

        <style>{`
          @keyframes popIn {
            from { transform: scale(.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
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
  const [message, setMessage] = React.useState("");

  if (!open) return null;

  const handleShare = () => {
    onShare?.({ message });
    setMessage("");
  };

  return (
    <DesktopOverlay onClose={onClose}>
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          padding: "26px 26px 22px",
          boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
          animation: "popIn 0.25s cubic-bezier(0.25,1,0.5,1)",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 20,
            textAlign: "center",
            marginBottom: 18,
          }}
        >
          Share post
        </div>

        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write something..."
          style={{
            width: "100%",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            marginBottom: 14,
            fontSize: 14,
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>

          <button className="btn primary" onClick={handleShare}>
            Share
          </button>
        </div>

        <style>{`
          @keyframes popIn {
            from { transform: scale(.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    </DesktopOverlay>
  );
}