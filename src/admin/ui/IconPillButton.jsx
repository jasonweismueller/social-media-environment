import React from "react";

// A round, icon-only bordered button — for a one-off toolbar action (e.g.
// "Reshuffle") that sits alongside `Toggle` switches and needs to match
// their compact height without the full-width chrome of `Button`/`IconButton`.
export function IconPillButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="admin-btn"
      style={{
        width: 34,
        height: 34,
        flexShrink: 0,
        borderRadius: 999,
        border: "1px solid var(--admin-border)",
        background: "var(--admin-surface)",
        color: "var(--admin-text)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
