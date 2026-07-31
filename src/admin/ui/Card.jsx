import React from "react";

/**
 * Replaces the per-file duplicated Section/SectionCard components. Same DOM
 * shape as the dashboard's old `Section` (section.card.admin-section >
 * header/body) so existing .admin-section* CSS keeps applying wherever it's
 * still referenced.
 */
export function Card({ title, subtitle, actions = null, children, style, bodyStyle }) {
  return (
    <section
      className="card admin-section"
      style={{
        border: "1px solid var(--admin-border-subtle)",
        borderRadius: "var(--admin-radius-lg)",
        background: "var(--admin-surface)",
        boxShadow: "var(--admin-shadow-sm)",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || actions) && (
        <div
          className="admin-section-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--admin-border-subtle)",
            flexWrap: "wrap",
          }}
        >
          <div className="admin-section-title-wrap">
            {title && (
              <h3
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--admin-text)",
                }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <div
                className="subtle admin-section-subtitle"
                style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 2 }}
              >
                {subtitle}
              </div>
            )}
          </div>

          {!!actions && (
            <div
              className="admin-section-actions"
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
            >
              {actions}
            </div>
          )}
        </div>
      )}

      <div className="admin-section-body" style={{ padding: 18, ...bodyStyle }}>
        {children}
      </div>
    </section>
  );
}
