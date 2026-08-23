import React from "react";
import { createRoot } from "react-dom/client";
import { Sentry, initSentry } from "./utils/utils-sentry";
import App from "./App-x.jsx";
import { ParticipantErrorFallback } from "./ui-core/ui-error-fallback.jsx";
import "./styles-x.css";

// Matches main-instagram.jsx/main-amazon.jsx's existing pattern — without
// this, getApp() (utils-backend.js) has no fallback once the URL's own
// `?app=` param is ever dropped by a client-side-only route change (e.g.
// AdminPlatformPicker's "already on this platform" branch does a bare
// `navigate("/admin/dashboard")`, which replaces the whole URL including
// the query string) — every subsequent backend call silently defaults to
// "fb" regardless of which bundle is actually running. This is exactly why
// FB feeds were showing up under the X dashboard: the feeds list and every
// flag-toggle call read `getApp()` live off the URL, which had silently
// reverted to "fb", while the already-mounted X bundle kept rendering with
// its own (correct, frozen-at-import-time) UI chrome.
window.APP = "x";

initSentry();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={ParticipantErrorFallback}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
