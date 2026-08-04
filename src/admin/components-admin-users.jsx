// components-admin-users.jsx
//
// Standalone "Users & access" page — reworked 2026-08-04 (see CLAUDE.md
// "Admin user management rework + project access control"). Previously this
// was AdminUsersPanel, embedded as a tab nested three levels deep inside one
// project's dashboard (project -> platform -> dashboard -> Users), which
// didn't match its own nature: user accounts and their roles aren't scoped
// to a project at all (profiles.role is global — see
// 20260801000002_profiles.sql), so burying the page inside one particular
// project's navigation was misleading. This now lives at the top level
// (/admin/users, mounted by AdminEntry.jsx), reachable from the project
// picker rather than from inside any one project's dashboard.
//
// Also adds real per-user project scoping (new here): granting a user
// access to a specific set of projects (and optionally specific platforms
// within each) via project_access, rather than every admin account seeing
// every project. Supabase-only — see listAllProjectAccess/
// setUserProjectAccess in utils-backend.js for why GAS has no equivalent.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  listAllProjectAccess,
  setUserProjectAccess,
  listProjectsFromBackend,
  hasAdminRole,
  getAdminEmail,
} from "../utils";
import { isSupabaseBackend } from "../utils/utils-supabase-client";
import "./ui/tokens.css";
import { Card, PageHeader, Button, Badge, Toggle, Modal, useToast, useConfirm, EmptyState, IconUser } from "./ui";

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer", hint: "Read-only access" },
  { value: "editor", label: "Editor", hint: "Can edit posts, surveys, and feeds" },
  { value: "owner", label: "Owner", hint: "Full control, including user management" },
];
// Mirrors admin-users/index.ts's own SOLE_OWNER_EMAIL constant — after a
// real self-inflicted lockout (an owner used the role selector on their own
// account and lost access to this very page), the backend now hard-rejects
// any attempt to grant/revoke 'owner' outside this one account. This
// frontend copy exists purely so the UI reflects that constraint up front
// (greying out the impossible option) instead of only ever finding out
// after a rejected request — the Edge Function is still the real
// enforcement, same "frontend gate is UX only" posture as hasAdminRole
// elsewhere in this file.
const SOLE_OWNER_EMAIL = "jason.weismueller@gmail.com";
const NON_OWNER_ROLE_OPTIONS = ROLE_OPTIONS.filter((o) => o.value !== "owner");
const ROLE_TONE = { owner: "accent", editor: "neutral", viewer: "neutral" };
const PLATFORMS = [
  { app: "fb", label: "Facebook" },
  { app: "ig", label: "Instagram" },
  { app: "amz", label: "Amazon" },
];
const ALL_APPS = PLATFORMS.map((p) => p.app);

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function userRowStyle(isActive) {
  return {
    width: "100%",
    boxSizing: "border-box",
    textAlign: "left",
    padding: "10px 12px",
    cursor: "pointer",
    borderRadius: 10,
    marginBottom: 6,
    background: isActive ? "var(--admin-accent-soft)" : "var(--admin-surface)",
    border: isActive ? "1px solid var(--admin-accent-border)" : "1px solid var(--admin-border-subtle)",
    boxShadow: isActive ? "none" : "var(--admin-shadow-sm)",
  };
}

/** Small clickable pill used for the two-way "All projects" / "Selected
 * projects only" switch and for the per-project platform chips below it —
 * one primitive instead of two near-identical hand-rolled button styles. */
function ChoiceChip({ active, onClick, children, tone = "accent", disabled }) {
  const activeStyle =
    tone === "accent"
      ? { background: "var(--admin-accent)", borderColor: "var(--admin-accent)", color: "#fff" }
      : { background: "var(--admin-text)", borderColor: "var(--admin-text)", color: "#fff" };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "1px solid var(--admin-border)",
        background: "var(--admin-surface)",
        color: "var(--admin-text)",
        borderRadius: 999,
        padding: "4px 12px",
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...(active ? activeStyle : null),
      }}
    >
      {children}
    </button>
  );
}

/** Connected pill group for role selection — replaces a plain `<select>` in
 * both the detail panel and the Add User modal, so the three roles (and
 * what each one means, via `title`) are visible at a glance instead of
 * hidden behind a dropdown. */
function SegmentedControl({ options, value, onChange, disabled, title }) {
  return (
    <div
      role="radiogroup"
      title={title}
      style={{
        display: "inline-flex",
        border: "1px solid var(--admin-border)",
        borderRadius: 999,
        padding: 2,
        gap: 2,
        background: "var(--admin-surface-alt)",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            disabled={disabled}
            onClick={() => !active && onChange(opt.value)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "5px 13px",
              fontSize: 12,
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              background: active ? "var(--admin-accent)" : "transparent",
              color: active ? "#fff" : "var(--admin-text)",
              transition: "background 0.12s ease, color 0.12s ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Inline click-to-edit username, shown under the selected user's heading.
 * Starts collapsed (a small "Set a username"/"Edit username" link) rather
 * than an always-open input, since this is edited rarely — matches the
 * dirty-state-driven Save affordance `ProjectAccessEditor` already uses
 * elsewhere on this page. */
function UsernameEditor({ user, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.username || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setValue(user.username || "");
    setEditing(false);
    setErr("");
  }, [user.id]);

  const save = async () => {
    setBusy(true);
    setErr("");
    const res = await adminUpdateUser({ email: user.email, username: value.trim() });
    setBusy(false);
    if (!res?.ok) {
      setErr(res?.err || "Failed to save username");
      return;
    }
    setEditing(false);
    onSaved?.();
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          color: "var(--admin-accent-ink)",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {user.username ? "Edit username" : "Set a username"}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input
        autoFocus
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="username"
        style={{ fontSize: 13, padding: "4px 8px", width: 160 }}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <Button size="sm" variant="primary" onClick={save} busy={busy}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {err && <span style={{ color: "var(--admin-danger-ink)", fontSize: 11 }}>{err}</span>}
    </div>
  );
}

/** Project-access editor for the currently selected user. Local draft state
 * (`draft`: Map<project_id, Set<app>>) is re-seeded from the server's
 * project_access rows whenever the selected user changes or a save
 * completes — not a fully controlled form, since the checklist can be long
 * and re-deriving it from props on every keystroke elsewhere in the page
 * would be wasteful. "All three platforms checked" for a project always
 * saves as an empty apps array (see supabaseSetUserProjectAccess) so a
 * newly-added 4th platform in the future is included automatically rather
 * than silently excluded from every access grant made before it existed. */
function ProjectAccessEditor({ user, projects, savedEntries, onSaved }) {
  const [restricted, setRestricted] = useState(savedEntries.length > 0);
  const [draft, setDraft] = useState(() => {
    const m = new Map();
    savedEntries.forEach((e) => {
      m.set(e.project_id, new Set(e.apps.length ? e.apps : ALL_APPS));
    });
    return m;
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setRestricted(savedEntries.length > 0);
    const m = new Map();
    savedEntries.forEach((e) => {
      m.set(e.project_id, new Set(e.apps.length ? e.apps : ALL_APPS));
    });
    setDraft(m);
    setDirty(false);
    setErr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const markDirty = () => {
    setDirty(true);
    setSavedFlash(false);
  };

  const toggleProject = (projectId, checked) => {
    setDraft((prev) => {
      const next = new Map(prev);
      if (checked) next.set(projectId, new Set(ALL_APPS));
      else next.delete(projectId);
      return next;
    });
    markDirty();
  };

  const toggleApp = (projectId, app) => {
    setDraft((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(projectId) || ALL_APPS);
      if (current.has(app)) {
        if (current.size > 1) current.delete(app);
      } else {
        current.add(app);
      }
      next.set(projectId, current);
      return next;
    });
    markDirty();
  };

  const save = async () => {
    setBusy(true);
    setErr("");
    const entries = restricted
      ? Array.from(draft.entries()).map(([project_id, apps]) => ({
          project_id,
          apps: apps.size >= ALL_APPS.length ? [] : Array.from(apps),
        }))
      : [];
    const res = await setUserProjectAccess(user.id, entries);
    setBusy(false);
    if (!res?.ok) {
      setErr(res?.err || "Failed to save access");
      return;
    }
    setDirty(false);
    setSavedFlash(true);
    onSaved?.(entries);
  };

  return (
    <Card
      title="Project access"
      subtitle="Which projects (and optionally which platforms within them) this user can see."
      actions={
        dirty ? (
          <Button size="sm" variant="primary" onClick={save} busy={busy}>
            Save access
          </Button>
        ) : savedFlash ? (
          <Badge tone="accent">Saved</Badge>
        ) : null
      }
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <ChoiceChip
          active={!restricted}
          onClick={() => {
            setRestricted(false);
            markDirty();
          }}
        >
          All projects
        </ChoiceChip>
        <ChoiceChip
          active={restricted}
          onClick={() => {
            setRestricted(true);
            markDirty();
          }}
        >
          Selected projects only
        </ChoiceChip>
      </div>

      {err && (
        <div style={{ color: "var(--admin-danger-ink)", fontSize: 12, marginBottom: 10 }}>{err}</div>
      )}

      {!restricted ? (
        <div style={{ fontSize: 13, color: "var(--admin-muted)" }}>
          This user can see every project on every platform.
        </div>
      ) : projects.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--admin-muted)" }}>No projects exist yet.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 4,
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid var(--admin-border-subtle)",
            borderRadius: "var(--admin-radius-md)",
            padding: 6,
          }}
        >
          {projects.map((p) => {
            const included = draft.has(p.project_id);
            const apps = draft.get(p.project_id) || new Set(ALL_APPS);
            return (
              <div
                key={p.project_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: "var(--admin-radius-sm)",
                  background: included ? "var(--admin-surface-alt)" : "transparent",
                  flexWrap: "wrap",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(e) => toggleProject(p.project_id, e.target.checked)}
                  />
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-text)" }}>
                      {p.name || p.project_id}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--admin-muted)" }}>
                      {p.project_id}
                    </div>
                  </span>
                </label>

                {included && (
                  <div style={{ display: "flex", gap: 6 }}>
                    {PLATFORMS.map((pl) => (
                      <ChoiceChip
                        key={pl.app}
                        tone="dark"
                        active={apps.has(pl.app)}
                        onClick={() => toggleApp(p.project_id, pl.app)}
                      >
                        {pl.label}
                      </ChoiceChip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// Mirrors the Edge Function's own sanitizeUsername (admin-users/index.ts) —
// used here only to compute the placeholder preview shown while the field
// is empty, the server does the real (authoritative) sanitizing/fallback.
function suggestUsername(email) {
  return String(email || "")
    .split("@")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function AddUserModal({ onClose, onCreated }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("viewer");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!email.trim() || !password.trim()) {
      setErr("Email and password are required.");
      return;
    }
    setBusy(true);
    const res = await adminCreateUser(email.trim(), password.trim(), role, username.trim());
    setBusy(false);
    if (!res?.ok) {
      setErr(res?.err || "Failed to create user.");
      return;
    }
    onCreated(email.trim());
  };

  return (
    <Modal
      title="Add user"
      subtitle="Creates a new admin account with sign-in access."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} busy={busy}>
            Add user
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {err && <div style={{ color: "var(--admin-danger-ink)", fontSize: 12 }}>{err}</div>}
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--admin-muted)" }}>
          Email
          <input
            autoFocus
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            style={{ fontSize: 14 }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--admin-muted)" }}>
          Username
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={suggestUsername(email) || "auto-generated from email"}
            style={{ fontSize: 14 }}
          />
          <span style={{ fontWeight: 400, fontSize: 11 }}>
            Shown instead of the email around the admin dashboard. Sign-in still uses email + password.
          </span>
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--admin-muted)" }}>
          Role
          {/* Owner is never offered here — only SOLE_OWNER_EMAIL can hold
              that role, and creating a brand-new account can't ever be that
              specific account. */}
          <SegmentedControl options={NON_OWNER_ROLE_OPTIONS} value={role} onChange={setRole} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--admin-muted)" }}>
          Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set an initial password"
            style={{ fontSize: 14 }}
          />
        </label>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!password.trim()) {
      setErr("Enter a new password.");
      return;
    }
    setBusy(true);
    setErr("");
    const res = await adminUpdateUser({ email: user.email, password: password.trim() });
    setBusy(false);
    if (!res?.ok) {
      setErr(res?.err || "Failed to reset password.");
      return;
    }
    onDone();
  };

  return (
    <Modal
      title="Reset password"
      subtitle={user.email}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} busy={busy}>
            Set password
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {err && <div style={{ color: "var(--admin-danger-ink)", fontSize: 12 }}>{err}</div>}
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--admin-muted)" }}>
          New password
          <input
            autoFocus
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ fontSize: 14 }}
          />
        </label>
      </div>
    </Modal>
  );
}

export function AdminUsersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const me = getAdminEmail?.() || "";
  const backendHasAccessControl = isSupabaseBackend();

  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const [roleBusyEmail, setRoleBusyEmail] = useState(null);
  const [statusBusyEmail, setStatusBusyEmail] = useState(null);
  const [deleteBusyEmail, setDeleteBusyEmail] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [resetPwUser, setResetPwUser] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const [usersRes, projectList, access] = await Promise.all([
        adminListUsers(),
        listProjectsFromBackend().catch(() => []),
        listAllProjectAccess(),
      ]);
      if (!usersRes?.ok) {
        setErr(usersRes?.err || "Failed to load users");
        setUsers([]);
      } else {
        setUsers(usersRes.users || []);
      }
      setProjects(Array.isArray(projectList) ? projectList : []);
      setAccessRows(Array.isArray(access) ? access : []);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasAdminRole("owner")) return;
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedEmail && users.length) setSelectedEmail(me && users.some((u) => u.email === me) ? me : users[0].email);
  }, [users, me, selectedEmail]);

  const accessByUser = useMemo(() => {
    const m = new Map();
    accessRows.forEach((row) => {
      if (!m.has(row.user_id)) m.set(row.user_id, []);
      m.get(row.user_id).push(row);
    });
    return m;
  }, [accessRows]);

  const selectedUser = users.find((u) => u.email === selectedEmail) || null;
  const sortedUsers = useMemo(() => users.slice().sort((a, b) => a.email.localeCompare(b.email)), [users]);
  const isSelf = !!selectedUser && selectedUser.email === me;
  const isSoleOwner = !!selectedUser && selectedUser.email === SOLE_OWNER_EMAIL;

  const changeRole = async (user, role) => {
    if (role === user.role) return;
    setRoleBusyEmail(user.email);
    const res = await adminUpdateUser({ email: user.email, role });
    setRoleBusyEmail(null);
    if (!res?.ok) toast.error(res?.err || "Failed to change role");
    else load();
  };

  const toggleStatus = async (user) => {
    setStatusBusyEmail(user.email);
    const res = await adminUpdateUser({ email: user.email, disabled: !user.disabled });
    setStatusBusyEmail(null);
    if (!res?.ok) toast.error(res?.err || "Failed to update status");
    else load();
  };

  const deleteUser = async (user) => {
    if (!(await confirm({ title: "Delete user?", message: `Delete ${user.email}? This cannot be undone.`, danger: true, confirmLabel: "Delete" }))) return;
    setDeleteBusyEmail(user.email);
    const res = await adminDeleteUser(user.email);
    setDeleteBusyEmail(null);
    if (!res?.ok) {
      toast.error(res?.err || "Failed to delete user");
      return;
    }
    setSelectedEmail("");
    load();
  };

  if (!hasAdminRole("owner")) {
    return (
      <div className="admin-shell" style={{ minHeight: "100vh", padding: "32px 24px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <Card>
            <div style={{ color: "var(--admin-muted)" }}>
              User management is only available to owners.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell" style={{ minHeight: "100vh", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 4 }}>
          <button
            type="button"
            onClick={() => navigate("/admin")}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--admin-muted)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ← All projects
          </button>
        </div>

        <PageHeader
          title="Users & access"
          subtitle="Manage admin accounts, roles, and which projects each account can see."
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </Button>
              <Button size="sm" variant="primary" onClick={() => setShowAddModal(true)}>
                + Add user
              </Button>
            </>
          }
        />

        {err && (
          <div style={{ color: "var(--admin-danger-ink)", marginBottom: 12, fontSize: 13 }}>{err}</div>
        )}

        {!backendHasAccessControl && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: "var(--admin-radius-md)",
              background: "var(--admin-surface-alt)",
              border: "1px solid var(--admin-border-subtle)",
              fontSize: 12,
              color: "var(--admin-muted)",
            }}
          >
            Per-project access control is only available on the Supabase backend.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 20, alignItems: "start" }}>
          <div>
            {loading && users.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--admin-muted)", padding: "8px 4px" }}>Loading…</div>
            ) : sortedUsers.length === 0 ? (
              <EmptyState compact title="No users yet" message="Use + Add user above to invite your first admin." />
            ) : (
              sortedUsers.map((u) => {
                const isActive = u.email === selectedEmail;
                const grants = u.id ? accessByUser.get(u.id) : null;
                return (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => setSelectedEmail(u.email)}
                    style={userRowStyle(isActive)}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: isActive ? "var(--admin-accent-ink)" : "var(--admin-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.email === me ? "You — " : ""}
                        {u.username || u.email}
                      </div>
                    </div>
                    {u.username && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--admin-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {u.email}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <Badge tone={ROLE_TONE[u.role] || "neutral"}>{u.role}</Badge>
                      {u.disabled && <Badge tone="danger">disabled</Badge>}
                      {backendHasAccessControl && (
                        <Badge tone="neutral">{grants && grants.length ? `${grants.length} project${grants.length === 1 ? "" : "s"}` : "all projects"}</Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            {!selectedUser ? (
              <Card>
                <EmptyState icon={IconUser} title="No user selected" message="Pick a user from the list to view or edit their access." />
              </Card>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--admin-text)" }}>
                          {selectedUser.username || selectedUser.email}
                        </h2>
                        {selectedUser.email === me && <Badge tone="accent">You</Badge>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 12, color: "var(--admin-muted)", flexWrap: "wrap" }}>
                        {selectedUser.username && <span>{selectedUser.email}</span>}
                        {selectedUser.username && <span>·</span>}
                        <span>Created {formatDate(selectedUser.created_at)}</span>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <UsernameEditor user={selectedUser} onSaved={load} />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <SegmentedControl
                        options={isSoleOwner ? ROLE_OPTIONS : NON_OWNER_ROLE_OPTIONS}
                        value={selectedUser.role}
                        disabled={roleBusyEmail === selectedUser.email || isSelf || isSoleOwner}
                        title={
                          isSelf
                            ? "You can't change your own role"
                            : isSoleOwner
                            ? `The owner role is permanently assigned to ${SOLE_OWNER_EMAIL}`
                            : undefined
                        }
                        onChange={(role) => changeRole(selectedUser, role)}
                      />
                      <Button size="sm" variant="secondary" onClick={() => setResetPwUser(selectedUser)}>
                        Reset password
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={isSelf || isSoleOwner}
                        busy={deleteBusyEmail === selectedUser.email}
                        title={isSelf ? "You can't delete your own account" : isSoleOwner ? "The owner account can't be deleted" : "Delete user"}
                        onClick={() => deleteUser(selectedUser)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div style={{ marginTop: 16, maxWidth: 360 }}>
                    <Toggle
                      label={selectedUser.disabled ? "Account disabled" : "Account enabled"}
                      hint={
                        isSelf
                          ? "You can't disable your own account"
                          : isSoleOwner
                          ? "The owner account can't be disabled"
                          : "A disabled account can't sign in"
                      }
                      checked={!selectedUser.disabled}
                      busy={statusBusyEmail === selectedUser.email}
                      disabled={isSelf || isSoleOwner}
                      onChange={() => toggleStatus(selectedUser)}
                    />
                  </div>
                </Card>

                {backendHasAccessControl && selectedUser.id && (
                  <ProjectAccessEditor
                    key={selectedUser.id}
                    user={selectedUser}
                    projects={projects}
                    savedEntries={accessByUser.get(selectedUser.id) || []}
                    onSaved={(entries) => {
                      setAccessRows((prev) => [
                        ...prev.filter((r) => r.user_id !== selectedUser.id),
                        ...entries.map((e) => ({ user_id: selectedUser.id, project_id: e.project_id, apps: e.apps })),
                      ]);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onCreated={async (email) => {
            setShowAddModal(false);
            await load();
            setSelectedEmail(email);
          }}
        />
      )}

      {resetPwUser && (
        <ResetPasswordModal
          user={resetPwUser}
          onClose={() => setResetPwUser(null)}
          onDone={() => {
            setResetPwUser(null);
          }}
        />
      )}
    </div>
  );
}

export default AdminUsersPage;
