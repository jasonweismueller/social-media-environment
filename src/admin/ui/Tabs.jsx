import React from "react";

/**
 * Extracted verbatim from the tab bar that used to be hand-rolled inline in
 * components-admin-surveys.jsx — same markup/styling, now shared so a second
 * detail-with-tabs view (Feeds) doesn't reinvent it a second time.
 */
export function Tabs({ tabs = [], activeId, onChange, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        overflowX: "auto",
        padding: 6,
        marginBottom: 18,
        border: "1px solid var(--admin-border-subtle)",
        borderRadius: 12,
        background: "var(--admin-surface-alt)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={isActive ? "admin-btn" : "admin-btn admin-row-hover"}
            style={{
              minWidth: 148,
              flex: "1 0 auto",
              padding: "10px 12px",
              borderRadius: 9,
              border: isActive ? "1px solid var(--admin-accent-border)" : "1px solid transparent",
              background: isActive ? "var(--admin-surface)" : "transparent",
              color: isActive ? "var(--admin-accent-ink)" : "var(--admin-muted)",
              cursor: "pointer",
              textAlign: "left",
              boxShadow: isActive ? "var(--admin-shadow-sm)" : "none",
              transition:
                "background var(--admin-duration-fast) var(--admin-ease), color var(--admin-duration-fast) var(--admin-ease), border-color var(--admin-duration-fast) var(--admin-ease), box-shadow var(--admin-duration-fast) var(--admin-ease)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{tab.label}</div>
            {tab.summary != null && (
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: isActive ? "var(--admin-accent)" : "var(--admin-muted-2)",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.summary}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
