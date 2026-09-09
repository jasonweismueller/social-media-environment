//// AdminSetPassword.jsx
// Shown instead of the normal admin login whenever the browser just landed
// here via a Supabase invite/recovery email link (isPendingAuthRedirect(),
// utils-core.js) — following that link already signs the browser into a
// temporary Supabase session, this screen just asks for a real password to
// finish setting the account up, then bridges into this app's own
// admin-session localStorage exactly like a normal sign-in (touchAdminSession)
// before handing off to the same onAuth() callback AdminLogin uses.
import React, { useState } from "react";
import { setPasswordFromInvite, setOwnUsername, touchAdminSession, clearPendingAuthRedirect } from "../utils";

const MIN_PASSWORD_LEN = 8;

export default function AdminSetPassword({ onAuth }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [username, setUsername] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (loading) return;
    setErr("");

    if (pw.length < MIN_PASSWORD_LEN) {
      setErr(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords don't match.");
      return;
    }

    setLoading(true);
    const res = await setPasswordFromInvite(pw);
    if (!res?.ok) {
      setLoading(false);
      setErr(
        res?.err ||
          "Couldn't set your password — this link may have expired. Ask whoever invited you to send a new one."
      );
      return;
    }

    const touched = await touchAdminSession();
    if (!touched?.ok) {
      setLoading(false);
      setErr(touched?.err || "Password set, but couldn't sign you in — try signing in normally.");
      return;
    }

    // Optional — if it collides with an existing username, surface that and
    // let them pick a different one rather than silently dropping it; the
    // password/session part above already succeeded either way, so this
    // never blocks getting into the account, only choosing this username.
    if (username.trim()) {
      const named = await setOwnUsername(username.trim());
      if (!named?.ok) {
        setLoading(false);
        setErr(named?.err || "Couldn't set that username — you can change it later from the Users page.");
        return;
      }
    }

    setLoading(false);
    // Without this, AdminEntry would keep showing this exact screen after a
    // successful submit — it checks "is this an invite/recovery link?"
    // ahead of the normal login gate, and that check never clears on its
    // own (see utils-core.js).
    clearPendingAuthRedirect();
    onAuth?.();
  };

  return (
    <div className="admin-login-wrap">
      <div className="card admin-login-card">
        <h2 style={{ margin: 0, textAlign: "center" }}>Welcome</h2>
        <p className="subtle" style={{ margin: "0.5rem 0 0", textAlign: "center" }}>
          Set a password to finish setting up your account.
        </p>

        <label style={{ display: "grid", gap: ".6rem", marginTop: "1.25rem" }}>
          New password
          <div className="input-with-toggle" style={{ position: "relative" }}>
            <input
              className="input"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
              autoFocus
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

        <label style={{ display: "grid", gap: ".6rem", marginTop: "1rem" }}>
          Confirm password
          <input
            className="input"
            type={show ? "text" : "password"}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••••••"
            style={{ width: "100%" }}
          />
        </label>

        <label style={{ display: "grid", gap: ".6rem", marginTop: "1rem" }}>
          Username <span style={{ fontWeight: 400 }}>(optional)</span>
          <input
            className="input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Shown instead of your email around the dashboard"
            style={{ width: "100%" }}
          />
        </label>

        {err && <div style={{ color: "crimson", fontSize: ".9rem", marginTop: ".5rem" }}>{err}</div>}

        <button
          className="btn primary"
          onClick={submit}
          disabled={loading || pw.length < MIN_PASSWORD_LEN || !pw2.trim()}
          style={{ width: "100%", marginTop: "1rem" }}
        >
          {loading ? "Setting password…" : "Set password & continue"}
        </button>
      </div>
    </div>
  );
}
