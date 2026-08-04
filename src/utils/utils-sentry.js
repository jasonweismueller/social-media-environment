import * as Sentry from "@sentry/react";

let initialized = false;

// Called once from each of the three main-*.jsx entry points and from the
// admin bundle, before the first render — mirrors how AdminEntry is mounted
// identically in all three App-*.jsx files (see CLAUDE.md's near-duplicate
// footgun note) so there's exactly one place this logic is defined, even
// though it's called from several. A missing VITE_SENTRY_DSN (e.g. a local
// clone that hasn't set one) makes this a no-op rather than throwing —
// same "unset env var disables the feature" convention already used for
// VITE_BACKEND/VITE_SUPABASE_URL.
export function initSentry() {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Error tracking only — no performance tracing or session replay, both
    // add real bundle weight and weren't asked for here.
    tracesSampleRate: 0,
    // This app is a human-subjects research tool; participant sessions can
    // carry survey responses and other sensitive fields in nearby state.
    // Leaving PII collection off (the SDK default, made explicit here) so a
    // crash report never bundles more than the error itself.
    sendDefaultPii: false,
  });
}

export { Sentry };
