import React from "react";
import { Spinner } from "./Button";

/**
 * Real switch control. checked/busy/disabled map 1:1 onto the existing
 * feed-flag semantics (value / in-flight-save / blocked-by-sibling-save)
 * used throughout the admin dashboard's randomize toggles.
 */
export function Toggle({
  label,
  checked = false,
  busy = false,
  disabled = false,
  onChange,
  hint,
}) {
  const isDisabled = disabled || busy;

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "7px 2px",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text)" }}>
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: 11, color: "var(--admin-muted)" }}>{hint}</span>
        )}
      </span>

      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {busy && <Spinner size={12} />}
        <span
          role="switch"
          aria-checked={checked}
          onClick={() => {
            if (!isDisabled) onChange?.(!checked);
          }}
          style={{
            position: "relative",
            width: 34,
            height: 20,
            borderRadius: 999,
            background: checked ? "var(--admin-accent)" : "var(--admin-border)",
            transition: "background 0.15s ease",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: checked ? 16 : 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 2px rgba(15,23,42,0.35)",
              transition: "left 0.15s ease",
            }}
          />
        </span>
      </span>
    </label>
  );
}
