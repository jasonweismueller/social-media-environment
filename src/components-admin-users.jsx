import React, { useEffect, useMemo, useState } from "react";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  hasAdminRole,
  getAdminEmail,
  getAdminRole,
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

  // NEW: collapse state
  const [open, setOpen] = useState(false); // default collapsed
  const panelId = "admin-users-panel";

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

  useEffect(() => {
    if (!selectedEmail && me) setSelectedEmail(me);
  }, [me, selectedEmail]);

  if (!hasAdminRole("owner")) return null;

  // Synthetic "me" entry for single-user view if missing
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

  const visibleUsers = useMemo(() => {
    if (showAll) return users;
    const pick = selectedEmail || me;
    const list = (users || []).filter((u) => u.email === pick);
    return list.length === 0 && pick ? [meUser].filter(Boolean) : list;
  }, [showAll, users, selectedEmail, me, meUser]);

  const countLabel = showAll ? `${users.length || 0}` : `${visibleUsers.length || 0}`;

  return (
    <section className="card" style={{ padding: ".5rem .75rem" }}>
      {/* Collapsible header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn ghost"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open ? "true" : "false"}
          aria-controls={panelId}
          title={open ? "Collapse" : "Expand"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: ".25rem .5rem",
            lineHeight: 1.1,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              transition: "transform .15s ease",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            ▸
          </span>
          <span style={{ fontWeight: 600 }}>Users &amp; Roles</span>
          <span className="subtle" style={{ marginLeft: 6 }}>
            ({countLabel})
          </span>
        </button>

        {/* Quick controls stay visible while collapsed */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label className="subtle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>View:</span>
            <select
              className="select"
              disabled={showAll}
              value={selectedEmail || ""}
              onChange={(e) => setSelectedEmail(e.target.value)}
              title="Choose a single user to display"
              style={{ minWidth: 200, padding: ".2rem .4rem" }}
            >
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

          <button
            className={`btn ghost ${showAll ? "active" : ""}`}
            onClick={() => setShowAll((s) => !s)}
            title={showAll ? "Show only the selected user" : "Show all users"}
            style={{ padding: ".25rem .5rem" }}
          >
            {showAll ? "Hide all" : "Show all"}
          </button>

          <button className="btn" onClick={load} disabled={busy} style={{ padding: ".25rem .6rem" }}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      <div id={panelId} hidden={!open} style={{ marginTop: 8 }}>
        {err && <div style={{ color: "crimson", marginTop: 4, fontSize: ".9rem" }}>{err}</div>}

        {/* Add user (compact) */}
        <div className="fieldset" style={{ marginTop: 8, paddingTop: 6 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>Add user</div>
          <div className="grid-3" style={{ gap: 8 }}>
            <label style={{ fontSize: ".9rem" }}>
              Email
              <input
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
                style={{ height: 30, padding: ".25rem .5rem" }}
              />
            </label>
            <label style={{ fontSize: ".9rem" }}>
              Role
              <select
                className="select"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                style={{ height: 30, padding: ".25rem .5rem" }}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="owner">owner</option>
              </select>
            </label>
            <label style={{ fontSize: ".9rem" }}>
              Password
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="set a password"
                style={{ height: 30, padding: ".25rem .5rem" }}
              />
            </label>
          </div>
          <button
            className="btn primary"
            style={{ marginTop: 6, padding: ".3rem .6rem" }}
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

        {/* Users table (compact) */}
        <div className="fieldset" style={{ marginTop: 8, paddingTop: 6 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>
            {showAll ? "Existing (all users)" : "Existing (single user)"}
          </div>

          {busy ? (
            <div className="subtle" style={{ fontSize: ".9rem" }}>Loading…</div>
          ) : visibleUsers.length === 0 ? (
            <div className="subtle" style={{ fontSize: ".9rem" }}>
              No users
              {!showAll && me ? (
                <>
                  {" "}
                  for this selection. Try{" "}
                  <button className="btn ghost" onClick={() => setShowAll(true)} style={{ padding: ".2rem .5rem" }}>
                    Show all
                  </button>
                  .
                </>
              ) : null}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize: ".9rem" }}>
                <thead>
                  <tr className="subtle">
                    <th style={{ textAlign:"left", padding:6, whiteSpace:"nowrap" }}>Email</th>
                    <th style={{ textAlign:"left", padding:6, width: 90 }}>Role</th>
                    <th style={{ textAlign:"left", padding:6, width: 90 }}>Status</th>
                    <th style={{ textAlign:"left", padding:6, minWidth: 320 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((u) => (
                    <tr key={u.email} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: 6, maxWidth: 340, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {u.email === me ? <strong>Me</strong> : null}
                        {u.email === me ? " " : null}
                        {u.email}
                        {u.__synthetic ? <span className="subtle"> · local</span> : null}
                      </td>
                      <td style={{ padding: 6 }}>{u.role}</td>
                      <td style={{ padding: 6 }}>{u.disabled ? "disabled" : "active"}</td>
                      <td style={{ padding: 6 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="btn"
                            onClick={async () => {
                              const role = prompt("Role (viewer/editor/owner):", u.role) || u.role;
                              const res = await adminUpdateUser({ email: u.email, role });
                              if (!res?.ok) alert(res?.err || "Update failed");
                              else load();
                            }}
                            disabled={!!u.__synthetic}
                            style={{ padding: ".25rem .5rem" }}
                            title="Change role"
                          >
                            Role
                          </button>
                          <button
                            className="btn"
                            onClick={async () => {
                              const pwd = prompt("New password:");
                              if (!pwd) return;
                              const res = await adminUpdateUser({ email: u.email, password: pwd });
                              if (!res?.ok) alert(res?.err || "Password update failed");
                              else load();
                            }}
                            disabled={!!u.__synthetic}
                            style={{ padding: ".25rem .5rem" }}
                            title="Reset password"
                          >
                            Reset
                          </button>
                          <button
                            className="btn"
                            onClick={async () => {
                              const res = await adminUpdateUser({ email: u.email, disabled: !u.disabled });
                              if (!res?.ok) alert(res?.err || "Toggle failed");
                              else load();
                            }}
                            disabled={!!u.__synthetic}
                            style={{ padding: ".25rem .5rem" }}
                            title={u.disabled ? "Enable user" : "Disable user"}
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
                            style={{ padding: ".25rem .5rem" }}
                            title="Delete user"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}