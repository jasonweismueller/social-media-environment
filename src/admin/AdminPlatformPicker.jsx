import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProjectId } from "../utils";
import "./ui/tokens.css";
import { Card, PageHeader, Button, IconFacebook, IconInstagram, IconCart, IconChevronRight, ThemeToggle, LogoutButton } from "./ui";

const PLATFORMS = [
  { app: "fb", label: "Facebook", icon: IconFacebook, blurb: "News-feed style posts, comments, reactions." },
  { app: "ig", label: "Instagram", icon: IconInstagram, blurb: "Photo grid feed, likes, comments." },
  { app: "amz", label: "Amazon Reviews", icon: IconCart, blurb: "Product review list." },
];

/**
 * Second step after picking a project: choose which platform's dashboard to
 * open for it. Platform is only switchable via a real page load (each of
 * fb/ig/amz is a separately-bundled app selected by index.html's `?app=`
 * before React mounts) — picking the platform already loaded just changes
 * route client-side, picking a different one does a full navigation.
 */
export function AdminPlatformPicker({ currentApp, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = getProjectId();
  const projectName = location.state?.projectName || projectId;

  useEffect(() => {
    if (!projectId) navigate("/admin", { replace: true });
  }, [projectId, navigate]);

  if (!projectId) return null;

  const pick = (app) => {
    if (app === currentApp) {
      navigate("/admin/dashboard");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("app", app);
    url.searchParams.set("project", projectId);
    url.hash = "#/admin/dashboard";
    window.location.href = url.toString();
  };

  return (
    <div className="admin-shell" style={{ padding: "32px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <PageHeader
          title="Choose a platform"
          subtitle={`Project: ${projectName}`}
          actions={
            <>
              <ThemeToggle />
              <Button size="sm" variant="secondary" style={{ height: 34 }} onClick={() => navigate("/admin")}>
                ← All projects
              </Button>
              <LogoutButton onLogout={onLogout} />
            </>
          }
        />

        {/* One shared surface with a divided row per platform, matching
            AdminProjectPicker's list — no separate elevated Card per item,
            and no "Open →" button, since the whole row is already the click
            target (same "the choose button is unnecessary, you can just
            click it" call the project list already made). */}
        <Card bodyStyle={{ padding: 0 }}>
          {PLATFORMS.map((p, index) => (
            <div
              key={p.app}
              role="button"
              tabIndex={0}
              onClick={() => pick(p.app)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(p.app);
                }
              }}
              className="admin-row-hover"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "14px 18px",
                cursor: "pointer",
                borderBottom: index < PLATFORMS.length - 1 ? "1px solid var(--admin-border-subtle)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 38,
                    height: 38,
                    borderRadius: "var(--admin-radius-md)",
                    background: "var(--admin-accent-soft)",
                    color: "var(--admin-accent-ink)",
                    flexShrink: 0,
                  }}
                >
                  <p.icon size={20} />
                </span>
                <div>
                  <div style={{ fontSize: "var(--admin-text-md)", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--admin-text)" }}>
                    {p.label}
                    {p.app === currentApp && (
                      <span style={{ fontSize: "var(--admin-text-2xs)", fontWeight: 600, color: "var(--admin-muted)", marginLeft: 8 }}>
                        (currently loaded)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "var(--admin-text-xs)", color: "var(--admin-muted)", marginTop: 2 }}>{p.blurb}</div>
                </div>
              </div>
              <span aria-hidden="true" style={{ color: "var(--admin-muted-2)", display: "flex", flexShrink: 0 }}>
                <IconChevronRight size={16} />
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

export default AdminPlatformPicker;
