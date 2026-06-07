import React, { useEffect } from "react";
import { createPortal } from "react-dom";

// ui-mobile-amazon.jsx
// Bottom sheet used by Amazon review mobile dialogs/menus.

export function BottomSheet({
  open,
  onClose,
  title = "",
  children,
  height = "75vh",
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="amz-bs-backdrop bs-backdrop"
      onClick={(e) => {
        if (e.target.classList.contains("bs-backdrop")) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,17,17,.42)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end",
        animation: "bs-fade .15s ease-out",
      }}
    >
      <div
        className="amz-bs-panel bs-panel"
        style={{
          width: "100%",
          maxWidth: "640px",
          margin: "0 auto",
          maxHeight: "92vh",
          height,
          background: "#fff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "0 -10px 28px rgba(15,17,17,.18)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="amz-bs-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #d5d9d9",
          }}
        >
          <strong style={{ fontSize: 16, color: "#0f1111" }}>{title}</strong>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            aria-label="Close"
            style={{ borderRadius: 999, width: 34, height: 34, padding: 0 }}
          >
            ×
          </button>
        </div>
        <div
          className="amz-bs-body"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: 16,
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
