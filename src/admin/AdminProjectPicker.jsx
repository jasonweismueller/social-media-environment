import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listProjectsFromBackend,
  createProjectOnBackend,
  deleteProjectOnBackend,
  setDefaultProjectOnBackend,
  getDefaultProjectFromBackend,
  setProjectId as persistProjectId,
  getProjectId,
  hasAdminRole,
  getAdminEmail,
  getAdminUsername,
  touchAdminSession,
} from "../utils";
import "./ui/tokens.css";
import {
  Card,
  PageHeader,
  Button,
  Badge,
  useToast,
  useConfirm,
  usePrompt,
  EmptyState,
  IconFolder,
  IconWarning,
  ThemeToggle,
  LogoutButton,
} from "./ui";

/**
 * Landing page after login: pick a project (or create/delete one), then
 * move on to the platform picker. Always shown on `/admin` regardless of
 * whether a project is already persisted — the user wants this as a
 * deliberate "home base", not something that gets auto-skipped.
 */
export function AdminProjectPicker({ onLogout }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [projects, setProjects] = useState([]);
  const [defaultProjectId, setDefaultProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  // Distinguishes "this account genuinely has zero projects" from "the
  // fetch came back empty because the session is actually dead" — see the
  // load() comment below. Without this, a stale-but-locally-not-yet-expired
  // session (e.g. a Supabase auth session that survived in localStorage
  // past its real validity — this page is the first thing a returning
  // admin hits, so it's the one place this silently-empty-list failure
  // mode is actually visible) rendered as a fully-authed-looking "No
  // projects yet, + New project" screen with no way to tell it apart from
  // a real empty account, and no logout button anywhere on this page to
  // recover from it short of manually clearing site data.
  const [sessionExpired, setSessionExpired] = useState(false);
  const currentProjectId = getProjectId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, def] = await Promise.all([
        listProjectsFromBackend(),
        getDefaultProjectFromBackend(),
      ]);
      const safeList = Array.isArray(list) ? list : [];
      setProjects(safeList);
      setDefaultProjectId(def || null);

      if (safeList.length === 0) {
        // listProjectsFromBackend swallows every failure (network, RLS,
        // an expired/invalid auth session) into a plain empty array, so an
        // empty result alone doesn't tell us whether this account really
        // has zero projects. touchAdminSession() re-checks the real
        // Supabase session (not just the locally-cached token/expiry this
        // app tracks on its own) and fails clearly when that session is
        // actually dead.
        const res = await touchAdminSession();
        setSessionExpired(!res.ok);
      } else {
        setSessionExpired(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const chooseProject = (projectId, projectName) => {
    persistProjectId(projectId, { persist: true, updateUrl: true });
    navigate("/admin/platform", { state: { projectName: projectName || projectId } });
  };

  const createProject = async () => {
    const id = await prompt({
      title: "New project ID",
      message: "Letters, numbers, and underscores only.",
      defaultValue: `proj_${(projects.length || 0) + 1}`,
    });
    if (!id) return;
    const name = (await prompt({ title: "Project name", message: "Optional.", defaultValue: id, required: false })) || id;
    setBusyId("__create__");
    try {
      const ok = await createProjectOnBackend({ projectId: id, name }).catch(() => false);
      if (!ok) {
        toast.error("Failed to create project.");
        return;
      }
      setProjects((prev) => [{ project_id: id, name }, ...prev]);
      chooseProject(id, name);
    } finally {
      setBusyId(null);
    }
  };

  const makeDefault = async (projectId) => {
    setBusyId(projectId);
    try {
      const ok = await setDefaultProjectOnBackend(projectId);
      if (ok) setDefaultProjectId(projectId);
    } finally {
      setBusyId(null);
    }
  };

  const removeProject = async (project) => {
    if (
      !(await confirm({
        title: "Delete project?",
        message: `Delete project "${project.name || project.project_id}"?\nThis deletes ALL its feeds and participants.`,
        danger: true,
        confirmLabel: "Delete",
      }))
    ) {
      return;
    }
    setBusyId(project.project_id);
    try {
      const ok = await deleteProjectOnBackend(project.project_id);
      if (!ok) {
        toast.error("Failed to delete project.");
        return;
      }
      setProjects((prev) => prev.filter((p) => p.project_id !== project.project_id));
      if (defaultProjectId === project.project_id) setDefaultProjectId(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-shell" style={{ padding: "32px 24px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <PageHeader
          title="Projects"
          subtitle={`Signed in as ${getAdminUsername() || getAdminEmail() || "unknown"} — choose a project to continue.`}
          actions={
            <>
              <ThemeToggle />
              {hasAdminRole("owner") && (
                <Button size="sm" variant="ghost" onClick={() => navigate("/admin/users")}>
                  Manage users
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </Button>
              {hasAdminRole("editor") && (
                <Button size="sm" onClick={createProject} busy={busyId === "__create__"}>
                  + New project
                </Button>
              )}
              <LogoutButton onLogout={onLogout} />
            </>
          }
        />

        {!loading && sessionExpired && (
          <Card>
            <EmptyState
              icon={IconWarning}
              title="Your session has expired"
              message="We couldn't load your projects because your sign-in is no longer valid. Log out and sign back in to continue."
              action={
                <Button size="sm" variant="primary" onClick={onLogout}>
                  Log out
                </Button>
              }
            />
          </Card>
        )}

        {!loading && !sessionExpired && projects.length === 0 && (
          <Card>
            <EmptyState
              icon={IconFolder}
              title="No projects yet"
              message="Projects hold your feeds and surveys for a study. Create one to get started."
              action={
                <Button size="sm" variant="primary" onClick={createProject} busy={busyId === "__create__"}>
                  + New project
                </Button>
              }
            />
          </Card>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {projects.map((p) => {
            const isDefault = p.project_id === defaultProjectId;
            const isCurrent = p.project_id === currentProjectId;
            const busy = busyId === p.project_id;

            return (
              <Card key={p.project_id} bodyStyle={{ padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-text)" }}>
                        {p.name || p.project_id}
                      </span>
                      {isDefault && <Badge tone="accent">default</Badge>}
                      {isCurrent && <Badge>current</Badge>}
                    </div>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--admin-muted)", marginTop: 2 }}>
                      {p.project_id}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {hasAdminRole("editor") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isDefault || busy}
                        onClick={() => makeDefault(p.project_id)}
                        title="Make this the default project"
                      >
                        Set default
                      </Button>
                    )}
                    {hasAdminRole("owner") && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        busy={busy}
                        onClick={() => removeProject(p)}
                      >
                        Delete
                      </Button>
                    )}
                    <Button size="sm" variant="primary" onClick={() => chooseProject(p.project_id, p.name)}>
                      Choose →
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AdminProjectPicker;
