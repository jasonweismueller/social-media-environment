import React from "react";

/**
 * Mobile-only bottom tab bar — the primary navigation surface below the
 * admin's `useIsAdminMobile` breakpoint, replacing the desktop sidebar tree.
 * Deliberately structured the way a native iOS `TabView`/`UITabBarController`
 * is: a fixed row of equal-width tab buttons, safe-area-aware, each either
 * navigating (Feeds/Surveys) or opening a sheet (More) — so wrapping this in
 * a real native shell later needs no rethinking of the navigation model,
 * just a native re-skin of this same shape.
 */
export function BottomTabBar({ children }) {
  return (
    <nav
      role="tablist"
      aria-label="Admin sections"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        borderTop: "1px solid var(--admin-border-subtle)",
        background: "var(--admin-surface)",
        boxShadow: "var(--admin-shadow-lg)",
        zIndex: 900,
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {children}
    </nav>
  );
}

export function BottomTabBarItem({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="admin-tap-44"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        minHeight: 52,
        padding: "8px 4px 6px",
        border: "none",
        background: "transparent",
        color: active ? "var(--admin-accent)" : "var(--admin-muted)",
        fontSize: "var(--admin-text-2xs)",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true" style={{ display: "flex", transform: active ? "scale(1.05)" : "none" }}>
        {icon}
      </span>
      {label}
    </button>
  );
}
