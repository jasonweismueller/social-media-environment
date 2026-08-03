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
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#f9fafb",
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
            style={{
              minWidth: 148,
              flex: "1 0 auto",
              padding: "10px 12px",
              borderRadius: 9,
              border: isActive ? "1px solid #c7d2fe" : "1px solid transparent",
              background: isActive ? "#fff" : "transparent",
              color: isActive ? "#3730a3" : "#4b5563",
              cursor: "pointer",
              textAlign: "left",
              boxShadow: isActive ? "0 1px 3px rgba(15,23,42,0.08)" : "none",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{tab.label}</div>
            {tab.summary != null && (
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: isActive ? "#6366f1" : "#9ca3af",
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
