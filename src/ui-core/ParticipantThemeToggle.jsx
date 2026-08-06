import React from "react";

// Small self-contained sun/moon glyphs, same visual language as the admin
// dashboard's own IconSun/IconMoon (src/admin/ui/icons.jsx) — duplicated
// rather than imported, since this file is genuinely participant-facing
// (shared across all three App-*.jsx bundles and both survey renderers) and
// shouldn't reach into admin-only internals for a two-icon dependency.
function SunGlyph({ size = 16 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

function MoonGlyph({ size = 16 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

// Presentation-only, fully controlled — owns no storage of its own. Real
// participant pages drive it with useParticipantTheme() (utils-participant-
// theme.js); admin Feed/Survey previews drive it with local state seeded
// from the admin dashboard's own theme, so opening a preview never touches
// (or is affected by) a real participant's stored preference.
//
// `position="fixed"` anchors to the real browser viewport (real participant
// pages). `position="absolute"` anchors to the nearest positioned ancestor
// instead, for embedding inside a preview modal's own relatively-positioned
// wrapper — a fixed toggle there would escape the modal onto the admin's
// real browser viewport.
// Colors deliberately come from the `.pt-theme-toggle` CSS class (one rule
// per stylesheet, near each app's own `.dark-mode` block) rather than inline
// styles reading generic `--card`/`--text` variable names — Instagram's
// stylesheet never defines those (it uses `--ig-card`/`--ig-text` instead),
// so a generic inline `var(--card, #fff)` would silently always fall back to
// the hardcoded default there and never actually themed correctly.
export function ParticipantThemeToggle({ isDark, onToggle, position = "fixed" }) {
  return (
    <button
      type="button"
      className="pt-theme-toggle"
      onClick={onToggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      style={{
        position,
        right: 16,
        bottom: 16,
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: "50%",
        borderWidth: 1,
        borderStyle: "solid",
        boxShadow: "0 2px 8px rgba(0,0,0,.18)",
        cursor: "pointer",
      }}
    >
      {isDark ? <MoonGlyph /> : <SunGlyph />}
    </button>
  );
}
