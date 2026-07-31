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
            fontSize: 20,
            fontWeight: 800,
            color: "var(--admin-text)",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 13, color: "var(--admin-muted)", marginTop: 4 }}>
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
