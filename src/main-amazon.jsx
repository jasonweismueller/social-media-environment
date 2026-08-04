import React from "react";
import { createRoot } from "react-dom/client";
import { Sentry, initSentry } from "./utils/utils-sentry";
import { ParticipantErrorFallback } from "./ui-core/ui-error-fallback.jsx";
import "./styles-amazon.css";

window.APP = "amz";

initSentry();

import("./App-amazon.jsx").then(({ default: App }) => {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <Sentry.ErrorBoundary fallback={ParticipantErrorFallback}>
        <App />
      </Sentry.ErrorBoundary>
    </React.StrictMode>
  );
});
