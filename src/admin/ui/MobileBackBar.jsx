import React from "react";
import { IconChevronRight } from "./icons";

/**
 * Sticky "‹ Back to <list>" bar shown at the top of a detail view on mobile,
 * once something is selected in a list+detail panel (Feeds/Surveys/Users).
 * Desktop never renders this — those panels keep their existing permanent
 * side-by-side list+detail layout there, this is purely the mobile
 * drill-down affordance. Sticky (not fixed) so it scrolls with the detail
 * content's own container rather than needing global coordination with
 * AdminShell's mobile top bar.
 */
export function MobileBackBar({ title, subtitle, onBack }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="admin-btn admin-mobile-backbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        border: "none",
        borderBottom: "1px solid var(--admin-border-subtle)",
        background: "var(--admin-surface)",
        padding: "12px 4px",
        marginBottom: 16,
        cursor: "pointer",
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: "var(--admin-radius-md)",
          background: "var(--admin-surface-alt)",
          color: "var(--admin-text)",
          transform: "rotate(180deg)",
        }}
      >
        <IconChevronRight size={16} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: "var(--admin-text-md)",
            fontWeight: 700,
            color: "var(--admin-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: "var(--admin-text-2xs)",
              color: "var(--admin-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </div>
        )}
      </span>
    </button>
  );
}
