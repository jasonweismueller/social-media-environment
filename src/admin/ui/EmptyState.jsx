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
    <div style={{ textAlign: "center", padding: "56px 24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          margin: "0 auto 14px",
          borderRadius: "50%",
          background: "var(--admin-surface-alt)",
          color: "var(--admin-muted-2)",
        }}
      >
        <Icon size={26} />
      </div>
      <div style={{ fontSize: "var(--admin-text-md)", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--admin-text)" }}>
        {title}
      </div>
      {message && (
        <div style={{ fontSize: "var(--admin-text-sm)", color: "var(--admin-muted)", marginTop: 5, maxWidth: 360, marginInline: "auto", lineHeight: 1.5 }}>
          {message}
        </div>
      )}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}
