import React, { createContext, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

// Absolute paths (not relative "feeds"/"surveys") — relative NavLink targets
// resolve against the current URL segment-by-segment in react-router, so a
// relative link clicked from a non-index route appends onto the existing
// path instead of replacing it.
const FEEDS_PATH = "/admin/dashboard/feeds";
const SURVEYS_PATH = "/admin/dashboard/surveys";
const USERS_PATH = "/admin/dashboard/users";

// Lets AdminFeedsPanel/AdminSurveysPanel portal their own list column (feed
// list / survey list — filter box, create/refresh buttons, the rows
// themselves) into this sidebar instead of rendering it in the main content
// column. This merges what used to be two separate fixed-width chrome
// columns (240px nav + 280px list) into one, without moving any of the
// list-owning state out of those two files — AdminSurveysPanel in particular
// owns a large, self-contained state machine (surveys/selectedSurveyId/
// survey/etc., ~3000 lines) that would be risky to partially lift into
// AdminDashboard just for this. Only *where* the list JSX renders changes;
// who owns the data behind it does not. Same portal-into-`.admin-shell`
// rationale as `src/admin/ui/Popover.jsx` (CSS variables scoped to
// `.admin-shell` render invisibly past that boundary) — these slots always
// live inside `.admin-shell` already, so that's automatically satisfied.
export const AdminTreeSlotsContext = createContext({
  feedsSlot: null,
  surveysSlot: null,
});

function navItemStyle(isActive) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 10px",
    borderRadius: "var(--admin-radius-sm)",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    color: isActive ? "var(--admin-accent-ink)" : "var(--admin-text)",
    background: isActive ? "var(--admin-accent-soft)" : "transparent",
  };
}

// One expandable section of the tree sidebar (Feeds or Surveys): a single
// button that both navigates (when not already the active section) and
// toggles its own list open/closed (when it already is) — no separate
// disclosure control. Only the active *and expanded* section grows to fill
// the sidebar's remaining height; collapsed/inactive sections take just
// their header's height.
function TreeSection({ to, icon, label, active, expanded, onToggleExpand, slotRef }) {
  const showList = active && expanded;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
      <NavLink
        to={to}
        onClick={(e) => {
          if (active) {
            // Already here — this click can only mean "toggle the list",
            // since re-navigating to the same route would be a no-op anyway.
            e.preventDefault();
            onToggleExpand();
          }
          // Otherwise let the normal Link navigation happen; the effect in
          // AdminShell that resets expandedKey on route change expands it.
        }}
        aria-expanded={active ? expanded : undefined}
        style={({ isActive }) => navItemStyle(isActive)}
      >
        <span aria-hidden="true">{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {active && (
          <span
            aria-hidden="true"
            style={{
              fontSize: 18,
              lineHeight: 1,
              color: "var(--admin-muted)",
              transform: expanded ? "rotate(90deg)" : "none",
              transition: "transform .15s ease",
            }}
          >
            ▸
          </span>
        )}
      </NavLink>
      {showList && (
        // Sized to its own content (not stretched to fill the sidebar) so
        // Surveys/Users below don't get pushed down by empty leftover space
        // when the list is short — capped + scrollable so a long list still
        // can't push them off-screen.
        <div
          ref={slotRef}
          style={{
            maxHeight: "45vh",
            overflowY: "auto",
            marginTop: 10,
            paddingRight: 6,
          }}
        />
      )}
    </div>
  );
}

/**
 * Presentational layout only — owns no data. All project/feed/session state
 * stays in AdminDashboard and is threaded in as props/children so nothing
 * about the existing state machines needs to move. The feed/survey *list*
 * content itself is portaled in by AdminFeedsPanel/AdminSurveysPanel via
 * AdminTreeSlotsContext (see above) — this component only owns the slot
 * DOM nodes and which section is expanded.
 */
export function AdminShell({
  title,
  subtitle,
  onLogout,
  backTo,
  backLabel = "← All projects",
  projectSwitcher,
  showUsersNav = true,
  children,
}) {
  const location = useLocation();
  const [feedsSlotEl, setFeedsSlotEl] = useState(null);
  const [surveysSlotEl, setSurveysSlotEl] = useState(null);

  const isFeedsActive = location.pathname.startsWith(FEEDS_PATH);
  const isSurveysActive = location.pathname.startsWith(SURVEYS_PATH);
  const activeKey = isFeedsActive ? "feeds" : isSurveysActive ? "surveys" : null;

  // Which section's list is currently shown, independent of which route is
  // active — lets a user collapse the active section down to just its
  // header (e.g. to declutter while working in the detail pane) without
  // navigating away. Re-expands automatically whenever the active section
  // itself changes, so navigating to Surveys after collapsing Feeds doesn't
  // land on a Surveys section that's confusingly already collapsed too.
  const [expandedKey, setExpandedKey] = useState(activeKey);
  useEffect(() => {
    setExpandedKey(activeKey);
  }, [activeKey]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "288px minmax(0,1fr)",
        minHeight: "100vh",
        alignItems: "start",
      }}
    >
      <aside
        className="admin-tree-sidebar"
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--admin-border-subtle)",
          background: "var(--admin-surface)",
          padding: "16px 12px",
        }}
      >
        <div style={{ padding: "4px 8px 16px", flex: "0 0 auto", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {backTo && (
              <Link
                to={backTo}
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--admin-muted)",
                  textDecoration: "none",
                  marginBottom: 8,
                }}
              >
                {backLabel}
              </Link>
            )}
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--admin-text)" }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 3 }}>
                {subtitle}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Log out"
            aria-label="Log out"
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              marginTop: 2,
              border: "none",
              borderRadius: "var(--admin-radius-sm)",
              background: "transparent",
              color: "var(--admin-danger-ink, #b91c1c)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ⏻
          </button>
        </div>

        {projectSwitcher && (
          <div
            style={{
              flex: "0 0 auto",
              padding: "10px 8px",
              marginBottom: 8,
              borderRadius: "var(--admin-radius-md)",
              background: "var(--admin-surface-alt)",
              border: "1px solid var(--admin-border-subtle)",
            }}
          >
            {projectSwitcher}
          </div>
        )}

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0 }}>
          <TreeSection
            to={FEEDS_PATH}
            icon="🗂️"
            label="Feeds"
            active={isFeedsActive}
            expanded={expandedKey === "feeds"}
            onToggleExpand={() => setExpandedKey((k) => (k === "feeds" ? null : "feeds"))}
            slotRef={setFeedsSlotEl}
          />
          <TreeSection
            to={SURVEYS_PATH}
            icon="📋"
            label="Surveys"
            active={isSurveysActive}
            expanded={expandedKey === "surveys"}
            onToggleExpand={() => setExpandedKey((k) => (k === "surveys" ? null : "surveys"))}
            slotRef={setSurveysSlotEl}
          />
          {showUsersNav && (
            <NavLink
              to={USERS_PATH}
              style={({ isActive }) => ({ ...navItemStyle(isActive), flex: "0 0 auto" })}
            >
              <span aria-hidden="true">🔐</span>
              Users
            </NavLink>
          )}
        </nav>
      </aside>

      <main style={{ padding: "24px 28px", minWidth: 0 }}>
        <AdminTreeSlotsContext.Provider
          value={{ feedsSlot: feedsSlotEl, surveysSlot: surveysSlotEl }}
        >
          {children}
        </AdminTreeSlotsContext.Provider>
      </main>
    </div>
  );
}
