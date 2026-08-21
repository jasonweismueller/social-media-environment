import React from "react";

/**
 * Small round "power" icon button used to log out of the admin. Extracted
 * from AdminShell.jsx (the only place this previously existed) so every
 * top-level admin page — the project picker, platform picker, and users
 * page all render outside AdminShell, each with their own .admin-shell
 * wrapper — can offer the same escape hatch. Without it, a user landing on
 * one of those pages with a broken/expired session (e.g. a stale Supabase
 * session surviving in localStorage) had no in-app way to log out and
 * re-authenticate; only AdminShell (reachable one step later, inside a
 * chosen project's dashboard) had this button.
 */
export function LogoutButton({ onLogout }) {
  return (
    <button
      type="button"
      onClick={onLogout}
      title="Log out"
      aria-label="Log out"
      className="admin-btn"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        border: "none",
        borderRadius: "var(--admin-radius-sm)",
        background: "var(--admin-danger-soft)",
        color: "var(--admin-danger-ink, #b91c1c)",
        cursor: "pointer",
        fontSize: 18,
      }}
    >
      ⏻
    </button>
  );
}

export default LogoutButton;
