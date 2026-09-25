// utils-supabase-client.js
// Phase 4 scaffolding (see CLAUDE.md "Backend migration: Apps Script/Sheets
// -> Supabase"). Inert by default: getBackendMode() only returns
// "supabase" when VITE_BACKEND is explicitly set to it, so nothing here
// runs unless a future session (or a local .env) deliberately flips it.
import { createClient } from "@supabase/supabase-js";

export function getBackendMode() {
  const mode = (import.meta.env.VITE_BACKEND || "gas").toLowerCase();
  return mode === "supabase" ? "supabase" : "gas";
}

export function isSupabaseBackend() {
  return getBackendMode() === "supabase";
}

let _client = null;

export function getSupabaseClient() {
  if (_client) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase backend selected (VITE_BACKEND=supabase) but VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY are not set."
    );
  }

  // Investigated (2026-09-25) whether passing `{ auth: { lock: navigatorLock } }`
  // here would help the "ghost session"/"missing Authorization bearer token"
  // saga (CLAUDE.md): it would not. The installed @supabase/auth-js's own
  // lib/locks.js header comment states the auth client no longer invokes any
  // lock primitive at all — it dedupes concurrent refresh calls onto a
  // shared in-flight promise within one client instance, and relies on the
  // GoTrue server to resolve cross-tab/cross-instance races. `navigatorLock`
  // is kept only for direct callers that want their own Web-Locks-backed
  // mutex; passing it to `createClient` is explicitly documented as having
  // no effect. Not added.
  _client = createClient(url, anonKey);
  return _client;
}
