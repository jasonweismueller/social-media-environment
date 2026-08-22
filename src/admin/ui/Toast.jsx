import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ToastContext = createContext(null);

let toastIdSeq = 0;

const TYPE_STYLE = {
  success: {
    border: "var(--admin-success-border)",
    bar: "var(--admin-success)",
    icon: "✓",
  },
  error: {
    border: "var(--admin-danger-border)",
    bar: "var(--admin-danger)",
    icon: "!",
  },
  info: {
    border: "var(--admin-accent-border)",
    bar: "var(--admin-accent)",
    icon: "i",
  },
};

function ToastItem({ toast, onDismiss }) {
  const style = TYPE_STYLE[toast.type] || TYPE_STYLE.info;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--admin-surface)",
        border: `1px solid ${style.border}`,
        borderLeft: `4px solid ${style.bar}`,
        borderRadius: "var(--admin-radius-md)",
        boxShadow: "var(--admin-shadow-md)",
        padding: "10px 12px",
        pointerEvents: "auto",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: style.bar,
          color: "#fff",
          fontSize: 11,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        {style.icon}
      </span>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4, color: "var(--admin-text)", whiteSpace: "pre-wrap" }}>
        {toast.message}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        style={{
          flexShrink: 0,
          border: "none",
          background: "transparent",
          color: "var(--admin-muted)",
          fontSize: 16,
          lineHeight: 1,
          cursor: "pointer",
          padding: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Admin-themed toast notifications, replacing browser `alert()` calls.
 * Portals into the nearest `.admin-shell` ancestor for the same reason
 * Modal/Popover do — the `--admin-*` tokens are scoped there.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, { type = "info", duration } = {}) => {
      const id = ++toastIdSeq;
      const ms = duration ?? (type === "error" ? 7000 : 4500);
      setToasts((prev) => [...prev, { id, message, type }]);
      if (ms > 0) {
        const timer = setTimeout(() => dismiss(id), ms);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const apiRef = useRef(null);
  if (!apiRef.current) {
    apiRef.current = {
      success: (message, opts) => push(message, { ...opts, type: "success" }),
      error: (message, opts) => push(message, { ...opts, type: "error" }),
      info: (message, opts) => push(message, { ...opts, type: "info" }),
      dismiss,
    };
  }

  const stack = (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        // Kept above Modal.jsx's own zIndex (now 20000, raised for the
        // same reason documented there) so a toast fired from inside an
        // open modal — e.g. a save-failed error — still surfaces instead
        // of rendering hidden behind it. Same relative gap (+1000) as
        // before that change.
        zIndex: 21000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );

  // Resolved fresh at render time rather than cached in state — this
  // provider is mounted once at the top of the whole `/admin/*` tree and
  // never unmounts across navigation, but each page (AdminProjectPicker,
  // AdminDashboard, etc.) renders its own separate `.admin-shell` div, so a
  // target resolved once on mount would go stale (pointing at an already
  // -unmounted node) the moment the user navigates anywhere. Only matters
  // when there's actually a toast to show, which is also the only time
  // this component re-renders (its parent essentially never does), so this
  // is cheap. Document-wide, not ancestor-based, since this provider isn't
  // nested inside any page's `.admin-shell` — see Modal.jsx for the same
  // reasoning.
  const portalTarget = toasts.length > 0 ? document.querySelector(".admin-shell") || document.body : null;

  return (
    <ToastContext.Provider value={apiRef.current}>
      {children}
      {portalTarget && createPortal(stack, portalTarget)}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
