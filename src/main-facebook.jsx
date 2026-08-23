import React from "react";
import { createRoot } from "react-dom/client";
import { Sentry, initSentry } from "./utils/utils-sentry";
import App from "./App-facebook.jsx";
import { ParticipantErrorFallback } from "./ui-core/ui-error-fallback.jsx";
import "./styles-facebook.css";

// Matches main-instagram.jsx/main-amazon.jsx's existing pattern — without
// this, getApp() (utils-backend.js) has no fallback once the URL's own
// `?app=` param is ever dropped by a client-side-only route change (e.g.
// AdminPlatformPicker's "already on this platform" branch does a bare
// `navigate("/admin/dashboard")`, which replaces the whole URL including
// the query string) — every subsequent backend call silently defaults to
// "fb" regardless of which bundle is actually running. Was previously
// missing here (and in main-x.jsx) even though Instagram/Amazon already
// had it — real bug, found via a live admin-dashboard report.
window.APP = "fb";

initSentry();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={ParticipantErrorFallback}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
