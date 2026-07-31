import React from "react";
import { NavLink } from "react-router-dom";

// Absolute paths (not relative "feeds"/"posts") — relative NavLink targets
// resolve against the current URL segment-by-segment in react-router, so a
// relative link clicked from a non-index route appends onto the existing
// path instead of replacing it.
const NAV_ITEMS = [
  { to: "/admin/feeds", label: "Feeds", icon: "🗂️" },
  { to: "/admin/posts", label: "Posts", icon: "📝" },
  { to: "/admin/surveys", label: "Surveys", icon: "📋" },
  { to: "/admin/participants", label: "Participants", icon: "👥" },
  { to: "/admin/users", label: "Users", icon: "🔐", ownerOnly: true },
];

/**
 * Presentational layout only — owns no data. All project/feed/session state
 * stays in AdminDashboard and is threaded in as props/children so nothing
 * about the existing state machines needs to move.
 */
export function AdminShell({
  title,
  subtitle,
  onLogout,
  projectSwitcher,
  feedSwitcher,
  showUsersNav = true,
  children,
}) {
  // Note: the `.admin-shell` CSS-variable scope is applied by the wrapping
  // div in AdminDashboard (components-admin-dashboard.jsx), not here, so it
  // covers the overlays/modals that render as siblings of this layout too.
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px minmax(0,1fr)",
        minHeight: "100vh",
        alignItems: "start",
      }}
    >
      <aside
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--admin-border-subtle)",
          background: "var(--admin-surface)",
          padding: "16px 12px",
        }}
      >
        <div style={{ padding: "4px 8px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--admin-text)" }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 3 }}>
              {subtitle}
            </div>
          )}
        </div>

        {projectSwitcher && (
          <div
            style={{
              padding: "10px 8px",
              marginBottom: 8,
              borderRadius: "var(--admin-radius-md)",
              background: "var(--admin-surface-alt)",
              border: "1px solid var(--admin-border-subtle)",
            }}
          >
            {projectSwitcher}
          </div>
        )}

        {feedSwitcher && (
          <div
            style={{
              padding: "10px 8px",
              marginBottom: 12,
              borderRadius: "var(--admin-radius-md)",
              background: "var(--admin-surface-alt)",
              border: "1px solid var(--admin-border-subtle)",
            }}
          >
            {feedSwitcher}
          </div>
        )}

        <nav style={{ display: "grid", gap: 2, flex: 1 }}>
          {NAV_ITEMS.filter((item) => !item.ownerOnly || showUsersNav).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: "var(--admin-radius-sm)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                color: isActive ? "var(--admin-accent-ink)" : "var(--admin-text)",
                background: isActive ? "var(--admin-accent-soft)" : "transparent",
              })}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={onLogout}
          title="Sign out of the admin session"
          style={{
            marginTop: 12,
            padding: "9px 10px",
            borderRadius: "var(--admin-radius-sm)",
            border: "1px solid var(--admin-border-subtle)",
            background: "var(--admin-surface)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--admin-muted)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          Log out
        </button>
      </aside>

      <main style={{ padding: "24px 28px", minWidth: 0 }}>{children}</main>
    </div>
  );
}
