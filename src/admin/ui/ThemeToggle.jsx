import React from "react";
import { useAdminTheme } from "./useAdminTheme";
import { IconSun, IconMoon } from "./icons";

// Self-contained light/dark switch — reads/writes the same shared
// localStorage-backed preference (useAdminTheme) no matter which page
// renders it, so dropping <ThemeToggle /> into any of the several
// independent `.admin-shell` mount points (AdminShell, AdminProjectPicker,
// AdminPlatformPicker, AdminUsersPage) keeps them all in sync with zero
// prop threading.
export function ThemeToggle({ size = 34 }) {
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="admin-btn"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        border: "1px solid var(--admin-border)",
        borderRadius: "var(--admin-radius-sm)",
        background: "var(--admin-surface)",
        color: "var(--admin-text)",
        cursor: "pointer",
      }}
    >
      {isDark ? <IconMoon size={16} /> : <IconSun size={16} />}
    </button>
  );
}
