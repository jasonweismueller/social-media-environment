import React, { createContext, useCallback, useContext, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

const PromptContext = createContext(null);

const inputStyle = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  borderRadius: "var(--admin-radius-sm)",
  border: "1px solid var(--admin-border)",
  fontSize: 13,
  color: "var(--admin-text)",
  boxSizing: "border-box",
};

/**
 * Admin-themed single-field text prompt, replacing browser `window.prompt()`
 * calls. `usePrompt()` returns a function resolving to the entered string,
 * or `null` if cancelled — the same "null means cancel" shape as
 * `window.prompt`.
 */
export function PromptProvider({ children }) {
  const [state, setState] = useState(null);
  const [value, setValue] = useState("");

  const promptFn = useCallback((opts) => {
    const config = typeof opts === "string" ? { message: opts } : opts || {};
    return new Promise((resolve) => {
      setValue(config.defaultValue || "");
      setState({ ...config, resolve });
    });
  }, []);

  const settle = (val) => {
    state?.resolve?.(val);
    setState(null);
  };

  return (
    <PromptContext.Provider value={promptFn}>
      {children}
      {state && (
        <Modal
          title={state.title || "Enter a value"}
          onClose={() => settle(null)}
          width={420}
          footer={
            <>
              <Button variant="secondary" onClick={() => settle(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => settle(value)}
                disabled={state.required !== false && !value.trim()}
              >
                {state.confirmLabel || "OK"}
              </Button>
            </>
          }
        >
          {state.message && (
            <div style={{ fontSize: 13, color: "var(--admin-muted)", marginBottom: 10, lineHeight: 1.4 }}>
              {state.message}
            </div>
          )}
          <input
            autoFocus
            type={state.inputType || "text"}
            value={value}
            placeholder={state.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (state.required === false || value.trim())) settle(value);
            }}
            style={inputStyle}
          />
        </Modal>
      )}
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error("usePrompt must be used within a PromptProvider");
  return ctx;
}
