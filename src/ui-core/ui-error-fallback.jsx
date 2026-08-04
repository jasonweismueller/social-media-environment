import React from "react";

// Shown when a live participant's session hits an uncaught render error.
// Deliberately plain and reassuring — no stack trace or technical detail,
// unlike the admin ErrorBoundary (src/admin/ui/ErrorBoundary.jsx), which is
// for trusted researchers and shows the error message plus a retry option.
// A participant can't "try again" their way out of a broken render the way
// an admin re-opening a panel can, so this only offers a full refresh.
//
// Shared by all three main-*.jsx entry points so it's written once instead
// of drifting into three near-identical copies — see CLAUDE.md's
// near-duplicate-App-*.jsx footgun note.
export function ParticipantErrorFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
        Something went wrong.
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#6b7280",
          marginBottom: 20,
          maxWidth: 360,
        }}
      >
        Please refresh the page to continue. If this keeps happening, let the
        study team know.
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: "10px 20px",
          borderRadius: 8,
          border: "none",
          background: "#111827",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Refresh page
      </button>
    </div>
  );
}
