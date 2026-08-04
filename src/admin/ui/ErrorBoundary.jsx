import React from "react";
import { Button } from "./Button";
import { IconWarning } from "./icons";
import { Sentry } from "../../utils/utils-sentry";

/**
 * Catches render/lifecycle errors in its subtree and shows a recoverable
 * fallback instead of leaving the whole admin shell white-screened. Must be
 * a class component — React has no hook-based error boundary API.
 *
 * "Try again" just clears the caught error and re-renders the same
 * children — enough for transient issues (e.g. a null value before data
 * finishes loading). For anything that reliably re-throws, "Reload page"
 * is the harder reset. `resetKey` (optional) lets a parent force-clear the
 * boundary when its own state changes (e.g. switching to a different feed)
 * without waiting for the user to click anything.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Admin panel crashed:", error, info?.componentStack);
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info?.componentStack } },
      tags: { boundary: this.props.label || "admin" },
    });
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          padding: 24,
          borderRadius: "var(--admin-radius-lg)",
          border: "1px solid var(--admin-danger-border)",
          background: "var(--admin-danger-soft)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, color: "var(--admin-danger-ink)" }}>
          <IconWarning size={28} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--admin-danger-ink)" }}>
          {this.props.label || "Something went wrong"}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--admin-muted)",
            marginTop: 6,
            maxWidth: 480,
            marginInline: "auto",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
          }}
        >
          {String(error?.message || error)}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <Button size="sm" variant="secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}
