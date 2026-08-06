import { useCallback, useEffect, useState } from "react";

// Participant-facing dark-mode preference. Mirrors the shape of the admin
// dashboard's own useAdminTheme.js, but is a fully separate implementation —
// participants and admins are different apps/sessions and must never share a
// storage key or a CSS variable namespace.
const STORAGE_KEY = "participant_theme_v1";

function readStoredPreference() {
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

export function getParticipantThemePreference() {
  return readStoredPreference();
}

export function setParticipantThemePreference(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme === "dark" ? "dark" : "light");
  } catch {
    // Non-fatal — preference just won't persist across reloads.
  }
}

// The stored *preference* is independent of `allowed` (a participant's
// choice survives moving between a stage that offers dark mode and one that
// doesn't, without being silently reset) — only the returned `isDark` is
// gated by whatever the current stage allows. This is what makes the choice
// carry over from a feed into a survey that also allows dark mode, while a
// survey that doesn't allow it always renders light regardless of what was
// picked earlier.
export function useParticipantTheme(allowed) {
  const [preference, setPreference] = useState(readStoredPreference);

  const toggle = useCallback(() => {
    setPreference((p) => {
      const next = p === "dark" ? "light" : "dark";
      setParticipantThemePreference(next);
      return next;
    });
  }, []);

  const isDark = !!allowed && preference === "dark";

  return { isDark, toggle };
}
