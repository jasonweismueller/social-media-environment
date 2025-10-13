import React, { useEffect, useMemo, useState } from "react";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  hasAdminRole,
  getAdminEmail,
  getAdminRole, // ⬅️ added
} from "./utils";

export function AdminUsersPanel() {
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ email: "", role: "viewer", password: "" });

  // Filtering state
  const me = getAdminEmail?.() || "";
  const [showAll, setShowAll] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(me || "");

  const load = async () => {
    setErr("");
    try {
      setBusy(true);
      const res = await adminListUsers();
      if (res?.ok) setUsers(res.users || []);
      else setErr(res?.err || "Failed to load users");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (hasAdminRole("owner")) load();
  }, []);

  // If signed-in email changes (unlikely), keep selector in sync
  useEffect(() => {
    if (!selectedEmail && me) setSelectedEmail(me);
  }, [me, selectedEmail]);

  if (!hasAdminRole("owner")) return null;

  // Synthetic "me" user (fallback for single-user view when server list doesn't include you yet)
  const meUser = useMemo(() => {
    const email = me || selectedEmail || "";
    if (!email) return null;
    return {
      email,
      role: getAdminRole?.() || "owner",
      disabled: false,
      __synthetic: true,
    };
  }, [me, selectedEmail]);

  // Computed filtered list
  const visibleUsers = useMemo(() => {
    if (showAll) return users;
    const pick = selectedEmail || me;
    const list = (users || []).filter((u) => u.email === pick);
    return list.length === 0 && pick ? [meUser].filter(Boolean) : list;
  }, [showAll, users, selectedEmail, me, meUser]);

  return (
    <section className="card" style={{ padding: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0 }}>Users &amp; Roles</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Single-user dropdown (disabled when Show all) */}
          <label className="subtle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>View:</span>
            <select
              className="select"
              disabled={showAll}
              value={selectedEmail || ""}
              onChange={(e) => setSelectedEmail(e.target.value)}
              title="Choose a single user to display"
              style={{ minWidth: 220 }}
            >
              {/* 'Me' (current admin) first, then others if not already present */}
              {me && !users.some((u) => u.email === me) ? (
                <option value={me}>Me ({me})</option>
              ) : null}
              {users
                .slice()
                .sort((a, b) => a.email.localeCompare(b.email))
                .map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.email === me ? `Me (${u.email})` : u.email}
                  </option>
                ))}
            </select>
          </label>

          {/* Show all toggle */}
          <button
            className={`btn ghost ${showAll ? "active" : ""}`}
            onClick={() => setShowAll((s) => !s)}
            title={showAll ? "Show only the selected user" : "Show all users"}
          >
            {showAll ? "Hide full list" : "Show all"}
          </button>

          <button className="btn" onClick={load} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {err && <div style={{ color: "crimson", marginTop: 8 }}>{err}</div>}

      <div className="fieldset" style={{ marginTop: 12 }}>
        <div className="section-title">Add user</div>
        <div className="grid-3">
          <label>
            Email
            <input
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@example.com"
            />
          </label>
          <label>
            Role
            <select
              className="select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="owner">owner</option>
            </select>
          </label>
          <label>
            Password
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="set a password"
            />
          </label>
        </div>
        <button
          className="btn primary"
          style={{ marginTop: 8 }}
          disabled={busy || !form.email.trim() || !form.password.trim()}
          onClick={async () => {
            setBusy(true);
            setErr("");
            const res = await adminCreateUser(
              form.email.trim(),
              form.password.trim(),
              form.role
            );
            if (!res?.ok) setErr(res?.err || "Create failed");
            await load();
            setBusy(false);
          }}
        >
          Add user
        </button>
      </div>

      <div className="fieldset" style={{ marginTop: 12 }}>
        <div className="section-title">
          {showAll ? "Existing (all users)" : "Existing (single user)"}
        </div>

        {busy ? (
          <div className="subtle">Loading…</div>
        ) : visibleUsers.length === 0 ? (
          <div className="subtle">
            No users
            {!showAll && me ? (
              <>
                {" "}
                for this selection. Try{" "}
                <button className="btn ghost" onClick={() => setShowAll(true)}>
                  Show all
                </button>
                .
              </>
            ) : null}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="subtle">
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => (
                <tr key={u.email} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: 8 }}>
                    {u.email === me ? <strong>Me</strong> : null}
                    {u.email === me ? " " : null}
                    {u.email}
                    {u.__synthetic ? <span className="subtle"> · local</span> : null}
                  </td>
                  <td style={{ padding: 8 }}>{u.role}</td>
                  <td style={{ padding: 8 }}>{u.disabled ? "disabled" : "active"}</td>
                  <td style={{ padding: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="btn"
                      onClick={async () => {
                        const role =
                          prompt("Role (viewer/editor/owner):", u.role) || u.role;
                        const res = await adminUpdateUser({ email: u.email, role });
                        if (!res?.ok) alert(res?.err || "Update failed");
                        else load();
                      }}
                      disabled={!!u.__synthetic}
                    >
                      Change role
                    </button>
                    <button
                      className="btn"
                      onClick={async () => {
                        const pwd = prompt("New password:");
                        if (!pwd) return;
                        const res = await adminUpdateUser({
                          email: u.email,
                          password: pwd,
                        });
                        if (!res?.ok) alert(res?.err || "Password update failed");
                        else load();
                      }}
                      disabled={!!u.__synthetic}
                    >
                      Reset password
                    </button>
                    <button
                      className="btn"
                      onClick={async () => {
                        const res = await adminUpdateUser({
                          email: u.email,
                          disabled: !u.disabled,
                        });
                        if (!res?.ok) alert(res?.err || "Toggle failed");
                        else load();
                      }}
                      disabled={!!u.__synthetic}
                    >
                      {u.disabled ? "Enable" : "Disable"}
                    </button>
                    <button
                      className="btn ghost danger"
                      onClick={async () => {
                        if (!confirm(`Delete ${u.email}?`)) return;
                        const res = await adminDeleteUser(u.email);
                        if (!res?.ok) alert(res?.err || "Delete failed");
                        else load();
                      }}
                      disabled={!!u.__synthetic}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}