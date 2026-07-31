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
 * floating above the page.
 */
export function Popover({ trigger, children, align = "start", open, onOpenChange }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? open : internalOpen;
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [coords, setCoords] = useState(null);

  function setOpen(next) {
    if (onOpenChange) onOpenChange(next);
    if (!isControlled) setInternalOpen(next);
  }

  useLayoutEffect(() => {
    if (!isOpen) return;

    function updatePosition() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCoords(
        align === "end"
          ? { top: rect.bottom + 6, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 6, left: rect.left }
      );
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
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              right: coords.right,
              zIndex: 1000,
              minWidth: 220,
              background: "var(--admin-surface)",
              border: "1px solid var(--admin-border-subtle)",
              borderRadius: "var(--admin-radius-md)",
              boxShadow: "var(--admin-shadow-md)",
              padding: 10,
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
