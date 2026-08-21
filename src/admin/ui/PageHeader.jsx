import React from "react";

export function PageHeader({ title, subtitle, actions = null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 18,
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--admin-text-2xl)",
            lineHeight: 1.25,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--admin-text)",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: "var(--admin-text-sm)", color: "var(--admin-muted)", marginTop: 5 }}>
            {subtitle}
          </div>
        )}
      </div>

      {!!actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}
