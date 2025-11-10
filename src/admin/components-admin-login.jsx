// components-admin-login.jsx
import React, { useEffect, useState } from "react";
import {
  hasAdminSession,
  adminLogin,        // owner password
  adminLoginUser,    // email + password
  getAdminEmail,
  getAdminRole
} from "../utils";

export default function AdminLogin({ onAuth }) {
  const [mode, setMode] = useState("admin"); // "admin" | "owner"
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (hasAdminSession()) onAuth?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (loading) return;
    setErr("");

    if (mode === "admin") {
      if (!email.trim() || !pw.trim()) return;
    } else {
      if (!pw.trim()) return;
    }

    setLoading(true);
    const res =
      mode === "admin"
        ? await adminLoginUser(email.trim(), pw.trim())
        : await adminLogin(pw.trim());
    setLoading(false);

    if (res?.ok) onAuth?.();
    else setErr(res?.err || "Login failed");
  };

  if (hasAdminSession()) {
    return (
      <div className="admin-login-wrap">
        <div className="card admin-login-card">
          <h3 style={{ marginTop: 0 }}>You’re signed in</h3>
          <p className="subtle" style={{ margin: 0 }}>
            {getAdminEmail() || "unknown"} · role: {getAdminRole() || "viewer"}
          </p>
          <button className="btn primary" style={{ marginTop: "1rem" }} onClick={() => onAuth?.()}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  // shared inline style to bulletproof the two toggle buttons
  const toggleBtnStyle = {
    height: 42,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    padding: "0 .75rem",
    width: "100%",
    whiteSpace: "nowrap",
    margin: 0,
  };

  return (
    <div className="admin-login-wrap">
      <div className="card admin-login-card">
        <h2 style={{ margin: 0, textAlign: "center" }}>Admin Login</h2>

        {/* Mode toggle (NO className to avoid global CSS fights) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginTop: 12,
            alignItems: "stretch",
          }}
        >
          <button
            type="button"
            className={mode === "admin" ? "btn primary" : "btn"}
            onClick={() => setMode("admin")}
            style={toggleBtnStyle}
          >
            Sign in as Admin
          </button>
          <button
            type="button"
            className={mode === "owner" ? "btn primary" : "btn"}
            onClick={() => setMode("owner")}
            style={toggleBtnStyle}
          >
            Sign in as Owner
          </button>
        </div>

        {/* Inputs */}
        {mode === "admin" && (
          <label style={{ display: "grid", gap: ".6rem", marginTop: "1rem" }}>
            Email
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="you@example.com"
              autoFocus
              style={{ width: "100%" }}
            />
          </label>
        )}

        <label style={{ display: "grid", gap: ".6rem", marginTop: "1rem" }}>
          {mode === "admin" ? "Password" : "Sign in as Owner"}
          <div className="input-with-toggle" style={{ position: "relative" }}>
            <input
              className="input"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
              autoFocus={mode === "owner"}
              style={{ width: "100%", paddingRight: "2.25rem" }}
            />
            <button
              type="button"
              className="eye-btn"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((v) => !v)}
              title={show ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}
            >
              {show ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5c-5 0-9 4-10 7 1 3 5 7 10 7s9-4 10-7c-1-3-5-7-10-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"></path>
                  <path d="M4 20L20 4" stroke="currentColor" strokeWidth="2" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5c-5 0-9 4-10 7 1 3 5 7 10 7s9-4 10-7c-1-3-5-7-10-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"></path>
                </svg>
              )}
            </button>
          </div>
        </label>

        {err && (
          <div style={{ color: "crimson", fontSize: ".9rem", marginTop: ".5rem" }}>
            {err}
          </div>
        )}

        <button
          className="btn primary"
          onClick={submit}
          disabled={loading || (mode === "admin" ? !email.trim() || !pw.trim() : !pw.trim())}
          style={{ width: "100%", marginTop: "1rem" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}