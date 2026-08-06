import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProjectId } from "../utils";
import "./ui/tokens.css";
import { Card, PageHeader, Button, IconFacebook, IconInstagram, IconCart, ThemeToggle } from "./ui";

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
export function AdminPlatformPicker({ currentApp }) {
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
              <Button size="sm" variant="ghost" onClick={() => navigate("/admin")}>
                ← All projects
              </Button>
            </>
          }
        />

        <div style={{ display: "grid", gap: 12 }}>
          {PLATFORMS.map((p) => (
            <Card key={p.app} bodyStyle={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 40,
                      height: 40,
                      borderRadius: "var(--admin-radius-md)",
                      background: "var(--admin-accent-soft)",
                      color: "var(--admin-accent-ink)",
                      flexShrink: 0,
                    }}
                  >
                    <p.icon size={22} />
                  </span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--admin-text)" }}>
                      {p.label}
                      {p.app === currentApp && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-muted)", marginLeft: 8 }}>
                          (currently loaded)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 2 }}>{p.blurb}</div>
                  </div>
                </div>
                <Button variant="primary" onClick={() => pick(p.app)}>
                  Open →
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminPlatformPicker;
