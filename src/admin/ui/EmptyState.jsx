import React from "react";

/**
 * Shared "nothing here yet" placeholder for admin list panels, replacing
 * bare grey one-line text. `compact` is for narrow contexts (the Feeds/
 * Surveys tree-sidebar lists) — smaller, no icon, text-only.
 */
export function EmptyState({ icon = "📭", title, message, action, compact = false }) {
  if (compact) {
    return (
      <div style={{ fontSize: 12, color: "var(--admin-muted)", padding: "10px 4px", textAlign: "center" }}>
        <div>{title}</div>
        {message && <div style={{ marginTop: 2 }}>{message}</div>}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 32, marginBottom: 10, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--admin-text)" }}>{title}</div>
      {message && (
        <div style={{ fontSize: 13, color: "var(--admin-muted)", marginTop: 4, maxWidth: 360, marginInline: "auto" }}>
          {message}
        </div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
