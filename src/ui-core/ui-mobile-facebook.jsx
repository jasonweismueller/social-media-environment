import React, { useEffect } from "react";
import { createPortal } from "react-dom";

// Bottom sheet for mobile dialogs/menus
export function BottomSheet({
  open,
  onClose,
  title = "",
  children,
  height = "75vh",
}) {
  if (!open) return null;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="bs-backdrop"
      onClick={(e) => {
        if (e.target.classList.contains("bs-backdrop")) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end",
        animation: "bs-fade .15s ease-out",
      }}
    >
      <div
        className="bs-panel"
        style={{
          width: "100%",
          maxWidth: "640px",
          margin: "0 auto",
          background: "var(--card, #fff)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "0 -8px 24px rgba(0,0,0,.15)",
          height,
          maxHeight: "95vh",
          display: "flex",
          flexDirection: "column",
          animation: "bs-up .18s ease-out",
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
          {title ? <div style={{ fontWeight: 600 }}>{title}</div> : null}
        </div>
        <div style={{ overflow: "auto", padding: 8 }}>{children}</div>
      </div>

      <style>{`
        @keyframes bs-up { from { transform: translateY(8%); opacity:.9 } to { transform: translateY(0); opacity:1 } }
        @keyframes bs-fade { from { opacity:0 } to { opacity:1 } }
      `}</style>
    </div>,
    document.body
  );
}