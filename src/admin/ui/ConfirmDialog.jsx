import React, { createContext, useCallback, useContext, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

const ConfirmContext = createContext(null);

/**
 * Admin-themed confirm dialog, replacing browser `window.confirm()` calls.
 * `useConfirm()` returns a function with the same "resolves true/false"
 * shape as `window.confirm`, so call sites just need `await confirm(...)`
 * instead of a bare `confirm(...)`.
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((opts) => {
    const config = typeof opts === "string" ? { message: opts } : opts || {};
    return new Promise((resolve) => {
      setState({ ...config, resolve });
    });
  }, []);

  const settle = (value) => {
    state?.resolve?.(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title || "Please confirm"}
          onClose={() => settle(false)}
          width={420}
          footer={
            <>
              <Button variant="secondary" onClick={() => settle(false)}>
                {state.cancelLabel || "Cancel"}
              </Button>
              <Button variant={state.danger ? "danger" : "primary"} onClick={() => settle(true)} autoFocus>
                {state.confirmLabel || "Confirm"}
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 13, color: "var(--admin-text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {state.message}
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
