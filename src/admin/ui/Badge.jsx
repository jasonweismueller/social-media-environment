import React from "react";

const TONES = {
  neutral: { background: "var(--admin-surface-alt)", color: "var(--admin-muted)", border: "var(--admin-border-subtle)" },
  accent: { background: "var(--admin-accent-soft)", color: "var(--admin-accent-ink)", border: "var(--admin-accent-border)" },
  danger: { background: "var(--admin-danger-soft)", color: "var(--admin-danger-ink)", border: "var(--admin-danger-border)" },
};

export function Badge({ children, tone = "neutral", style }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: t.background,
        color: t.color,
        border: `1px solid ${t.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
