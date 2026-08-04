import React from "react";
import { IconInbox } from "./icons";

/**
 * Shared "nothing here yet" placeholder for admin list panels, replacing
 * bare grey one-line text. `compact` is for narrow contexts (the Feeds/
 * Surveys tree-sidebar lists) — smaller, no icon, text-only. `icon` takes an
 * icon component (see ./icons), not an emoji.
 */
export function EmptyState({ icon: Icon = IconInbox, title, message, action, compact = false }) {
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
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "var(--admin-muted-2)" }}>
        <Icon size={30} />
      </div>
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
