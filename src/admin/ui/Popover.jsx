import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Generic anchored popover: renders `trigger`, and when open, portals
 * `children` into a floating panel fixed-positioned under it. Closes on
 * outside-click or Escape. Purely a positioning/visibility primitive —
 * callers own their own content and state transitions (e.g. the
 * Randomization panel, the "..." overflow menu).
 *
 * The panel is rendered via a portal (not as a normal absolutely-positioned
 * child) because callers commonly sit inside ancestors with `overflow:
 * hidden`/`auto` (Card, Table's horizontal-scroll wrapper) — an in-tree
 * absolute panel gets visually clipped by those ancestors instead of
 * floating above the page. It portals into the nearest `.admin-shell`
 * ancestor rather than `document.body` because the admin design tokens
 * (`--admin-surface`, `--admin-accent`, etc., see ui/tokens.css) are CSS
 * variables scoped to `.admin-shell` — a panel portaled past that boundary
 * renders with no background/border/shadow and a colorless toggle track.
 */
const POPOVER_MOBILE_BP = 880;
// Kept in sync with tokens.css's `--admin-*` breakpoint comment — Popover
// can't read a CSS custom property from JS, so this is the one place that
// value is duplicated as a number (matches ADMIN_MOBILE_BREAKPOINT in
// useIsMobile.js).
const PANEL_MIN_WIDTH = 220;
const VIEWPORT_MARGIN = 12;

export function Popover({ trigger, children, align = "start", open, onOpenChange }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? open : internalOpen;
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const [portalTarget, setPortalTarget] = useState(null);
  const [isMobileSheet, setIsMobileSheet] = useState(false);

  function setOpen(next) {
    if (onOpenChange) onOpenChange(next);
    if (!isControlled) setInternalOpen(next);
  }

  useLayoutEffect(() => {
    if (!isOpen) return;
    setPortalTarget(triggerRef.current?.closest(".admin-shell") || document.body);

    function updatePosition() {
      const el = triggerRef.current;
      if (!el) return;

      const mobile = window.innerWidth <= POPOVER_MOBILE_BP;
      setIsMobileSheet(mobile);
      if (mobile) {
        // A bottom sheet is always full-width/pinned-to-bottom via CSS
        // (`.admin-popover-panel--sheet` in tokens.css) — no coordinate math
        // needed, and none of it would be meaningful against a phone-width
        // viewport anyway.
        setCoords({});
        return;
      }

      const rect = el.getBoundingClientRect();
      // Clamp so the panel can never render partially off-screen — the
      // un-clamped version (`rect.left`/`window.innerWidth - rect.right`)
      // overflows whenever the trigger sits close to a viewport edge,
      // which a narrow admin sidebar/toolbar makes common even on desktop.
      const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_MIN_WIDTH - VIEWPORT_MARGIN);
      if (align === "end") {
        const right = Math.min(
          Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right),
          window.innerWidth - PANEL_MIN_WIDTH - VIEWPORT_MARGIN
        );
        setCoords({ top: rect.bottom + 6, right: Math.max(VIEWPORT_MARGIN, right) });
      } else {
        setCoords({ top: rect.bottom + 6, left: Math.min(Math.max(VIEWPORT_MARGIN, rect.left), maxLeft) });
      }
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, align]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e) {
      if (
        (!triggerRef.current || !triggerRef.current.contains(e.target)) &&
        (!panelRef.current || !panelRef.current.contains(e.target))
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <>
      <span ref={triggerRef} style={{ display: "inline-block" }} onClick={() => setOpen(!isOpen)}>
        {trigger}
      </span>

      {isOpen &&
        coords &&
        portalTarget &&
        createPortal(
          <>
            {isMobileSheet && (
              <div className="admin-popover-backdrop" onClick={() => setOpen(false)} />
            )}
            <div
              ref={panelRef}
              className={isMobileSheet ? "admin-popover-panel--sheet" : undefined}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                right: coords.right,
                zIndex: 1000,
                minWidth: PANEL_MIN_WIDTH,
                background: "var(--admin-surface)",
                border: "1px solid var(--admin-border-subtle)",
                borderRadius: "var(--admin-radius-md)",
                boxShadow: "var(--admin-shadow-lg)",
                padding: 10,
                animation: `admin-pop-in var(--admin-duration-fast) var(--admin-ease) both`,
                transformOrigin: "top",
              }}
            >
              {children}
            </div>
          </>,
          portalTarget
        )}
    </>
  );
}
