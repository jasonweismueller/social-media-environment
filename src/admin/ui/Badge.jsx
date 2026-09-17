import React from "react";

const TONES = {
  neutral: { background: "var(--admin-surface-alt)", color: "var(--admin-muted)", border: "var(--admin-border-subtle)" },
  accent: { background: "var(--admin-accent-soft)", color: "var(--admin-accent-ink)", border: "var(--admin-accent-border)" },
  danger: { background: "var(--admin-danger-soft)", color: "var(--admin-danger-ink)", border: "var(--admin-danger-border)" },
  success: { background: "var(--admin-success-soft)", color: "var(--admin-success-ink)", border: "var(--admin-success-border)" },
  warning: { background: "var(--admin-warning-soft)", color: "var(--admin-warning-ink)", border: "var(--admin-warning-border)" },
  info: { background: "var(--admin-info-soft)", color: "var(--admin-info-ink)", border: "var(--admin-info-border)" },
};

export function Badge({ children, tone = "neutral", style }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: "var(--admin-text-2xs)",
        fontWeight: 700,
        letterSpacing: "0.01em",
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
