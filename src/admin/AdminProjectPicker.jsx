import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listProjectsFromBackend,
  createProjectOnBackend,
  deleteProjectOnBackend,
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
  IconButton,
  Badge,
  useToast,
  useConfirm,
  usePrompt,
  EmptyState,
  IconFolder,
  IconWarning,
  IconTrash,
  IconChevronRight,
  ThemeToggle,
  LogoutButton,
} from "./ui";

// Matches ThemeToggle/LogoutButton's own 34px default — Button's "sm" size
// (30px) and "md" size (36px) don't land on that exactly, and changing
// Button.jsx's shared SIZES map to fit this one header row would ripple
// into every other admin page that uses "sm"/"md". A local height override
// is the surgical fix; mirrored onto every header action here (and onto the
// identical header row in AdminPlatformPicker.jsx/AdminUsersPage.jsx) so
// every top-level admin page's header buttons line up at one consistent
// height instead of some being 30px text and others 34px icon boxes.
const HEADER_BTN_STYLE = { height: 34 };

function ProjectIconBadge() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 38,
        flexShrink: 0,
        borderRadius: "var(--admin-radius-md)",
        background: "var(--admin-accent-soft)",
        color: "var(--admin-accent-ink)",
      }}
    >
      <IconFolder size={19} />
    </span>
  );
}

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
      const list = await listProjectsFromBackend();
      const safeList = Array.isArray(list) ? list : [];
      setProjects(safeList);

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
                <Button size="sm" variant="secondary" style={HEADER_BTN_STYLE} onClick={() => navigate("/admin/users")}>
                  Manage users
                </Button>
              )}
              <Button size="sm" variant="secondary" style={HEADER_BTN_STYLE} onClick={load} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </Button>
              {hasAdminRole("editor") && (
                <Button size="sm" variant="primary" style={HEADER_BTN_STYLE} onClick={createProject} busy={busyId === "__create__"}>
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

        {projects.length > 0 && (
          // One shared surface for the whole list instead of a separate
          // elevated Card per project — each project is a plain divided row
          // inside it. Directly answers the "big separate boxes for each
          // project, repeating the same buttons every time" complaint: the
          // box count no longer scales with project count, and every row's
          // primary action is just clicking the row (the "Choose →" button
          // this used to have was redundant with that and has been
          // dropped), leaving Delete as the one secondary action, a compact
          // icon button. No "default project" concept anymore either — it
          // was never anything more than a badge + a bookmark toggle, and
          // now that picking a project is always its own required step
          // before reaching a dashboard (not a fallback the dashboard ever
          // needs), it stopped doing anything real, same reasoning that
          // already applied to removing "default feed."
          <Card bodyStyle={{ padding: 0 }}>
            {projects.map((p, index) => {
              const isCurrent = p.project_id === currentProjectId;
              const busy = busyId === p.project_id;

              return (
                <div
                  key={p.project_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => chooseProject(p.project_id, p.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      chooseProject(p.project_id, p.name);
                    }
                  }}
                  className="admin-row-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    padding: "14px 18px",
                    cursor: "pointer",
                    borderBottom: index < projects.length - 1 ? "1px solid var(--admin-border-subtle)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                    <ProjectIconBadge />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "var(--admin-text-md)", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--admin-text)" }}>
                          {p.name || p.project_id}
                        </span>
                        {isCurrent && <Badge>current</Badge>}
                      </div>
                      <div style={{ fontSize: "var(--admin-text-xs)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--admin-muted)", marginTop: 2 }}>
                        {p.project_id}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                    // The row itself is the primary click target (onClick
                    // above) — without this, clicking a button inside would
                    // bubble up and *also* fire that, e.g. Delete would
                    // delete AND navigate in the same click.
                    onClick={(e) => e.stopPropagation()}
                  >
                    {hasAdminRole("owner") && (
                      <IconButton
                        size="sm"
                        danger
                        disabled={busy}
                        busy={busy}
                        onClick={() => removeProject(p)}
                        title="Delete project"
                      >
                        <IconTrash size={15} />
                      </IconButton>
                    )}
                    <span aria-hidden="true" style={{ color: "var(--admin-muted-2)", display: "flex", marginLeft: 4 }}>
                      <IconChevronRight size={16} />
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}

export default AdminProjectPicker;
