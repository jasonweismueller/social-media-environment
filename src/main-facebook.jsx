import React from "react";
import { createRoot } from "react-dom/client";
import { Sentry, initSentry } from "./utils/utils-sentry";
import App from "./App-facebook.jsx";
import { ParticipantErrorFallback } from "./ui-core/ui-error-fallback.jsx";
import "./styles-facebook.css";

initSentry();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={ParticipantErrorFallback}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
