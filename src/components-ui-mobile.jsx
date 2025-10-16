import React, { useEffect, useId } from "react";
import { createPortal } from "react-dom";

export function BottomSheet({
  open,
  onClose,
  title = "",
  children,
  height = "75vh",
  blurApp = false,        // optional: blur the app-shell while open
}) {
  const titleId = useId();
  if (!open) return null;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);

    // lock background scroll
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    // optional app blur hook-up
    const shell = document.querySelector(".app-shell");
    if (blurApp && shell) shell.classList.add("blurred");

    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow || "";
      if (blurApp && shell) shell.classList.remove("blurred");
    };
  }, [onClose, blurApp]);

  return createPortal(
    <div
      className="bs-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        zIndex: 11000,                   // ↑ match your modal z-index
        display: "flex",
        alignItems: "flex-end",
        animation: "bs-fade .15s ease-out",
        overscrollBehavior: "contain",   // stop page rubber-banding behind
      }}
    >
      <div
        className="bs-panel"
        style={{
          width: "100%",
          maxWidth: "640px",
          margin: "0 auto",
          background: "var(--card, #fff)",
          borderTopLeftRadius: "var(--bs-radius, 16px)",
          borderTopRightRadius: "var(--bs-radius, 16px)",
          boxShadow: "0 -8px 24px rgba(0,0,0,.15)",
          height,
          maxHeight: "95vh",
          display: "flex",
          flexDirection: "column",
          animation: "bs-up .18s ease-out",
          paddingBottom: "env(safe-area-inset-bottom, 0)", // safe area
        }}
      >
        <div
          style={{
            padding: "10px 16px 6px",
            borderBottom: "1px solid var(--line, #e5e7eb)",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              margin: "0 auto 8px",
              background: "var(--line, #e5e7eb)",
            }}
          />
          {title ? (
            <div id={titleId} style={{ fontWeight: 600 }}>
              {title}
            </div>
          ) : null}
        </div>

        <div style={{ overflow: "auto", padding: 8, WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes bs-up { from { transform: translateY(8%); opacity:.9 } to { transform: translateY(0); opacity:1 } }
        @keyframes bs-fade { from { opacity:0 } to { opacity:1 } }
        @media (prefers-reduced-motion: reduce) {
          .bs-backdrop, .bs-panel { animation: none !important; }
        }
      `}</style>
    </div>,
    document.body
  );
}