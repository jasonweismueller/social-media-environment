import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Admin-themed modal dialog. Portals into the nearest `.admin-shell`
 * ancestor rather than `document.body` — same reasoning as
 * `src/admin/ui/Popover.jsx`: the `--admin-*` design tokens
 * (`src/admin/ui/tokens.css`) are scoped to `.admin-shell`, so a dialog
 * portaled past that boundary would render with no background/border/text
 * color at all.
 *
 * Falls back to `document.querySelector(".admin-shell")` (search the whole
 * page, not just ancestors) when there's no `.admin-shell` ancestor to find
 * — `useConfirm()`/`usePrompt()`/`useToast()` are provided once at the top
 * of the whole `/admin/*` tree (AdminEntry.jsx), above every individual
 * page's own `.admin-shell` div (AdminProjectPicker, AdminDashboard, etc.
 * each render their own), so `closest()` alone never finds one for a
 * dialog triggered through those hooks — it'd silently fall through to
 * `document.body` and render with no styling at all. Exactly one
 * `.admin-shell` is ever mounted at a time (the routes that render one are
 * mutually exclusive), so a document-wide query is safe here.
 *
 * Also traps Tab focus within the dialog and returns focus to whatever
 * triggered it on close — `ConfirmDialog`/`PromptDialog` get this for free
 * since they render through this component.
 *
 * `fullScreen` swaps the centered fixed-width card for an edge-to-edge
 * panel covering the whole viewport, everything else (portal target,
 * focus trap, Escape-to-close, header/body/footer structure) unchanged.
 * For content whose own layout depends on real viewport width — e.g. the
 * feed preview's `.page` rail grid, which uses `@media` breakpoints keyed
 * on `window.innerWidth`, not container width — a fixed-width boxed dialog
 * would either clip it or force a mismatched layout; full-screen sidesteps
 * that by giving it the real viewport to lay out against, same as the live
 * participant page.
 */
export function Modal({ title, subtitle, onClose, children, footer, width = 480, bodyRef, fullScreen = false }) {
  const anchorRef = useRef(null);
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const [portalTarget, setPortalTarget] = useState(null);

  useLayoutEffect(() => {
    setPortalTarget(
      anchorRef.current?.closest(".admin-shell") ||
        document.querySelector(".admin-shell") ||
        document.body
    );
  }, []);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    return () => {
      const toRestore = previouslyFocusedRef.current;
      if (toRestore && typeof toRestore.focus === "function" && document.contains(toRestore)) {
        toRestore.focus();
      }
    };
  }, []);

  // Separate from the capture-previous-focus effect above and keyed on
  // `portalTarget`, not `[]` — on first mount `portalTarget` is still null
  // (see the useLayoutEffect below), so the portal, and therefore
  // `dialogRef.current`, doesn't exist yet on the initial commit. Waiting
  // for `portalTarget` to flip to a real value guarantees the ref is
  // attached by the time this runs.
  useEffect(() => {
    if (!portalTarget || !dialogRef.current) return;
    // If a child already grabbed focus via its own `autoFocus` (e.g.
    // PromptDialog's input, ConfirmDialog's confirm button), respect it
    // instead of stealing focus back to whatever's first in DOM order.
    if (!dialogRef.current.contains(document.activeElement)) {
      const first = dialogRef.current.querySelector(FOCUSABLE_SELECTOR);
      (first || dialogRef.current).focus();
    }
  }, [portalTarget]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const node = (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: fullScreen ? "var(--admin-bg, #f4f5f7)" : "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: fullScreen ? "stretch" : "center",
        justifyContent: fullScreen ? "stretch" : "center",
        padding: fullScreen ? 0 : 20,
        zIndex: 2000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        style={{
          width: "100%",
          maxWidth: fullScreen ? "100%" : width,
          height: fullScreen ? "100%" : undefined,
          maxHeight: fullScreen ? "100%" : "min(88vh, 720px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--admin-surface)",
          borderRadius: fullScreen ? 0 : "var(--admin-radius-lg)",
          boxShadow: fullScreen ? "none" : "var(--admin-shadow-md)",
          overflow: "hidden",
          outline: "none",
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

        <div
          ref={bodyRef}
          style={
            fullScreen
              ? { flex: 1, minHeight: 0, overflowY: "auto" }
              : { padding: 20, overflowY: "auto" }
          }
        >
          {children}
        </div>

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
