import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Admin-themed modal dialog. Portals into the nearest `.admin-shell`
 * ancestor rather than `document.body` — same reasoning as
 * `src/admin/ui/Popover.jsx`: the `--admin-*` design tokens
 * (`src/admin/ui/tokens.css`) are scoped to `.admin-shell`, so a dialog
 * portaled past that boundary would render with no background/border/text
 * color at all.
 */
export function Modal({ title, subtitle, onClose, children, footer, width = 480 }) {
  const anchorRef = useRef(null);
  const [portalTarget, setPortalTarget] = useState(null);

  useLayoutEffect(() => {
    setPortalTarget(anchorRef.current?.closest(".admin-shell") || document.body);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 2000,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "min(88vh, 720px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--admin-surface)",
          borderRadius: "var(--admin-radius-lg)",
          boxShadow: "var(--admin-shadow-md)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--admin-border-subtle)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--admin-text)" }}>
              {title}
            </h3>
            {subtitle && (
              <div style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 3 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer",
              color: "var(--admin-muted)",
              padding: 2,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>{children}</div>

        {footer && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--admin-border-subtle)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <span ref={anchorRef} style={{ display: "none" }} />
      {portalTarget && createPortal(node, portalTarget)}
    </>
  );
}
