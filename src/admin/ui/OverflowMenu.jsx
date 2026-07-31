import React, { useState } from "react";
import { Popover } from "./Popover";
import { IconButton } from "./IconButton";

/**
 * "..." overflow menu for secondary row actions. `items` is
 * [{ key, label, onClick, danger, disabled, hidden }]. Closes itself after
 * an item is clicked, same as a native menu.
 */
export function OverflowMenu({ items = [], title = "More actions" }) {
  const [open, setOpen] = useState(false);
  const visibleItems = items.filter((item) => !item.hidden);

  if (!visibleItems.length) return null;

  return (
    <Popover
      align="end"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <IconButton title={title} aria-label={title}>
          ⋯
        </IconButton>
      }
    >
      <div style={{ display: "grid", gap: 2, minWidth: 160 }}>
        {visibleItems.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              setOpen(false);
              item.onClick?.();
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              borderRadius: "var(--admin-radius-sm)",
              border: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 600,
              color: item.danger ? "var(--admin-danger-ink)" : "var(--admin-text)",
              cursor: item.disabled ? "not-allowed" : "pointer",
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = item.danger
                ? "var(--admin-danger-soft)"
                : "var(--admin-surface-alt)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}
