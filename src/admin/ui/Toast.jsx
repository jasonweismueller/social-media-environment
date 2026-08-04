import React, { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
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
  const anchorRef = useRef(null);
  const [portalTarget, setPortalTarget] = useState(null);
  const timersRef = useRef(new Map());

  useLayoutEffect(() => {
    setPortalTarget(anchorRef.current?.closest(".admin-shell") || document.body);
  }, []);

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
        zIndex: 3000,
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

  return (
    <ToastContext.Provider value={apiRef.current}>
      <span ref={anchorRef} style={{ display: "none" }} />
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
