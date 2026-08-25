import { useCallback, useEffect, useState } from "react";

// Shared, self-contained dark-mode preference for the whole /admin/* app.
// Several pages each mount their own top-level `.admin-shell` div (see the
// comment on ThemeToggle below) rather than sharing one long-lived root, so
// the source of truth lives outside React entirely: localStorage plus a
// `data-admin-theme` attribute on <html>, which every `.admin-shell`
// instance's dark CSS selector (`html[data-admin-theme="dark"] .admin-shell`
// in tokens.css) reads regardless of which page happens to be mounted.
const STORAGE_KEY = "admin_theme_v1";

function readStoredTheme() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through.
  }
  try {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch {
    // matchMedia unavailable — fall through.
  }
  return "light";
}

// Applied once, at module-evaluation time (not inside a React effect) — so
// this runs before the first `.admin-shell` paints, avoiding a flash of the
// wrong theme. But this module's import is NOT actually gated behind the
// admin route the way its own doc comment used to claim: `AdminEntry` is
// imported eagerly (a plain top-level `import`, not `React.lazy`) from every
// `App-*.jsx`, so this side effect runs on every page load of the app
// bundle — including a plain participant feed URL. Gate on the real URL
// pathname (mirrors `isAdminRoute` in index.html/App-*.jsx) so a participant
// page never gets `data-admin-theme` set at all, regardless of whatever an
// admin last chose in a different tab on the same browser/localStorage —
// this was a real bug: an admin who'd turned dark mode on for the dashboard
// would then see a stray dark `<body>` background on an otherwise fully
// light participant feed (see the `body:has(.admin-shell)` scoping fix on
// the one non-`.admin-shell`-scoped rule below for the defense-in-depth
// half of this same fix).
if (
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/admin")
) {
  document.documentElement.setAttribute("data-admin-theme", readStoredTheme());
}

export function useAdminTheme() {
  const [theme, setTheme] = useState(readStoredTheme);

  // Applied on every render where theme changes, from whichever admin page
  // happens to be mounted — safe because exactly one `.admin-shell` page is
  // ever mounted at a time (same invariant Modal.jsx's portal fallback
  // already relies on), so there's never a competing instance to race with.
  useEffect(() => {
    document.documentElement.setAttribute("data-admin-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Non-fatal — theme just won't persist across reloads.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme, setTheme };
}
