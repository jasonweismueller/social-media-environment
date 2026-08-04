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
} from "../utils";
import "./ui/tokens.css";
import { Card, PageHeader, Button, Badge, useToast, useConfirm, usePrompt, EmptyState, IconFolder } from "./ui";

/**
 * Landing page after login: pick a project (or create/delete one), then
 * move on to the platform picker. Always shown on `/admin` regardless of
 * whether a project is already persisted — the user wants this as a
 * deliberate "home base", not something that gets auto-skipped.
 */
export function AdminProjectPicker() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [projects, setProjects] = useState([]);
  const [defaultProjectId, setDefaultProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const currentProjectId = getProjectId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, def] = await Promise.all([
        listProjectsFromBackend(),
        getDefaultProjectFromBackend(),
      ]);
      setProjects(Array.isArray(list) ? list : []);
      setDefaultProjectId(def || null);
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
            </>
          }
        />

        {!loading && projects.length === 0 && (
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
