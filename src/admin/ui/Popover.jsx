import React, { useEffect, useRef, useState } from "react";

/**
 * Generic anchored popover: renders `trigger`, and when open, renders
 * `children` in a floating panel below it. Closes on outside-click or
 * Escape. Purely a positioning/visibility primitive — callers own their own
 * content and state transitions (e.g. the Randomization panel, the "..."
 * overflow menu).
 */
export function Popover({ trigger, children, align = "start", open, onOpenChange }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? open : internalOpen;
  const rootRef = useRef(null);

  function setOpen(next) {
    if (onOpenChange) onOpenChange(next);
    if (!isControlled) setInternalOpen(next);
  }

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
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
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <span onClick={() => setOpen(!isOpen)}>{trigger}</span>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            [align === "end" ? "right" : "left"]: 0,
            zIndex: 40,
            minWidth: 220,
            background: "var(--admin-surface)",
            border: "1px solid var(--admin-border-subtle)",
            borderRadius: "var(--admin-radius-md)",
            boxShadow: "var(--admin-shadow-md)",
            padding: 10,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
