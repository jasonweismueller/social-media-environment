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

  _client = createClient(url, anonKey);
  return _client;
}
