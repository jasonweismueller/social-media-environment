import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pravatar, hasAdminRole } from "../utils";
import { Card, Table, Th, Td, Toggle, Button, IconButton, Tabs, RoleGate, EmptyState } from "./ui";
import { FeedParticipantsPage } from "./components-admin-participants-feed";
import { AdminTreeSlotsContext, TreeAddButton } from "./AdminShell";

function feedListButtonStyle(isActive) {
  return {
    width: "100%",
    boxSizing: "border-box",
    textAlign: "left",
    padding: "10px 12px",
    cursor: "pointer",
    borderRadius: 10,
    marginBottom: 6,
    background: isActive ? "#eef2ff" : "#fff",
    border: isActive ? "1px solid #c7d2fe" : "1px solid #e5e7eb",
    boxShadow: isActive ? "0 1px 2px rgba(79,70,229,0.10)" : "0 1px 2px rgba(0,0,0,0.03)",
    transition: "all 0.15s ease",
  };
}

function msToMinSec(n) {
  if (n == null) return "—";
  const s = Math.round(Number(n) / 1000);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function keyFor(pid, fid) {
  return `${pid || "global"}::${fid}`;
}

// Shrinks its own font-size to whatever fits its parent cell's width,
// instead of forcing the cell (and therefore the whole table) wider — used
// in the posts table below, which is table-layout:fixed specifically so
// each cell has a stable, content-independent width to measure against.
// Only falls back to ellipsis-truncating once minFontSize still doesn't fit
// (e.g. an extremely long, unbroken post name).
function FitText({ children, style, minFontSize = 10, maxFontSize = 13, title }) {
  const spanRef = useRef(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useLayoutEffect(() => {
    const el = spanRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const measure = () => {
      const parentStyle = getComputedStyle(parent);
      const available =
        parent.clientWidth -
        parseFloat(parentStyle.paddingLeft || 0) -
        parseFloat(parentStyle.paddingRight || 0);
      if (available <= 0) return;

      el.style.fontSize = `${maxFontSize}px`;
      const natural = el.scrollWidth;
      if (natural > available) {
        setFontSize(Math.max(minFontSize, Math.floor((available / natural) * maxFontSize)));
      } else {
        setFontSize(maxFontSize);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [children, maxFontSize, minFontSize]);

  return (
    <span
      ref={spanRef}
      title={title}
      style={{
        ...style,
        fontSize,
        display: "block",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </span>
  );
}

// The tree-sidebar's Feeds section content (filter box, create/refresh,
// wipe-on-change toggle, the feed rows themselves) — portaled into
// AdminShell's Feeds slot instead of rendering in the main content column,
// see AdminTreeSlotsContext in ./AdminShell for why.
function FeedListContent({
  feeds,
  feedsLoading,
  selectedFeedId,
  onSelectFeed,
  onSaveFeed,
  isSaving,
  deletingFeed,
  onDeleteSelectedFeed,
  onRenameFeed,
}) {
  const canRename = hasAdminRole("editor");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (f) => {
    if (!canRename) return;
    setRenamingId(f.feed_id);
    setRenameValue(f.name || f.feed_id);
  };
  const commitRename = () => {
    if (renamingId) onRenameFeed?.(renamingId, renameValue);
    setRenamingId(null);
  };

  return (
    <div>
      {feedsLoading && (
        <div style={{ fontSize: 11, color: "var(--admin-muted)", marginBottom: 6 }}>Loading…</div>
      )}

      {feeds.length === 0 ? (
        !feedsLoading && <EmptyState compact title="No feeds yet" message="Use + above to create one." />
      ) : (
        feeds.map((f) => {
          const isActive = selectedFeedId === f.feed_id;
          const isRenaming = renamingId === f.feed_id;
          return (
            <button
              key={f.feed_id}
              type="button"
              onClick={() => !isRenaming && onSelectFeed(f.feed_id)}
              onDoubleClick={() => isActive && startRename(f)}
              title={isActive && canRename && !isRenaming ? "Double-click to rename" : undefined}
              style={feedListButtonStyle(isActive)}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    fontSize: 13,
                    fontWeight: 700,
                    border: "1px solid var(--admin-accent)",
                    borderRadius: 6,
                    padding: "2px 6px",
                  }}
                />
              ) : (
                <div style={{ fontWeight: 700, color: isActive ? "#3730a3" : "#111827" }}>
                  {f.name || f.feed_id}
                </div>
              )}
            </button>
          );
        })
      )}

      {selectedFeedId && (
        <RoleGate min="editor">
          <Button
            size="sm"
            variant="secondary"
            onClick={onSaveFeed}
            busy={isSaving}
            style={{
              width: "100%",
              marginTop: 10,
              background: "#ecfdf5",
              borderColor: "#a7f3d0",
              color: "#047857",
            }}
          >
            {isSaving ? "Saving…" : "Save feed"}
          </Button>
        </RoleGate>
      )}
      {selectedFeedId && (
        <RoleGate min="owner">
          <Button
            size="sm"
            variant="secondary"
            onClick={onDeleteSelectedFeed}
            busy={deletingFeed}
            style={{
              width: "100%",
              marginTop: 6,
              background: "var(--admin-danger-soft)",
              borderColor: "var(--admin-danger-border)",
              color: "var(--admin-danger-ink)",
            }}
          >
            {deletingFeed ? "Deleting…" : "Delete feed"}
          </Button>
        </RoleGate>
      )}
    </div>
  );
}

/**
 * Master-detail conversion of the old flat Feeds table + separate top-level
 * Posts/Feed-Participants pages, mirroring AdminSurveysPanel's layout so the
 * two main admin sections feel consistent. All backend-fetch/caching logic
 * stays in AdminDashboard (too entangled with checksum-aware caching and S3
 * snapshotting to safely relocate) — this component is purely presentational,
 * fed by props/callbacks, the same pattern FeedParticipantsPage already used.
 * The feed list itself (left column) is portaled into AdminShell's sidebar —
 * see AdminTreeSlotsContext in ./AdminShell — so this component only ever
 * renders the detail pane, at full content width.
 */
export function AdminFeedsPanel({
  projectId,
  feeds,
  feedsLoading,
  selectedFeedId,
  selectedFeedName,
  feedStats,
  feedFlags,
  flagKinds,
  allSavingKeys,
  readFlagValue,
  wipeOnChange,
  updatingWipe,
  isSaving,
  deletingFeed,
  posts,
  postNames,
  randomize,
  contentUnitLabel,
  contentUnitLabelPlural,
  onSelectFeed,
  onCreateFeed,
  onCopyFeed,
  onRefreshFeeds,
  onLoadStats,
  onLoadFlags,
  onToggleFlag,
  onDeleteFeed,
  onSetWipePolicy,
  onCopyParticipantLink,
  onRenameFeed,
  onSaveFeed,
  onSetRandomize,
  onRefreshPosts,
  onExportPostsJson,
  onExportFeedPdf,
  onImportPostsJson,
  onOpenNewPost,
  onEditPost,
  onRenamePost,
  onRemovePost,
  onLogout,
}) {
  const [activeFeedTab, setActiveFeedTab] = useState("posts");

  // Reset to the Posts tab whenever a different feed is selected — mirrors
  // AdminSurveysPanel's own tab-reset-on-selection effect.
  useEffect(() => {
    setActiveFeedTab("posts");
  }, [selectedFeedId]);

  // Flags used to be lazily fetched only when the Randomize popover opened;
  // now that the toggles live in a dedicated Settings tab (not a popover),
  // fetch them the first time that tab is actually viewed for this feed.
  useEffect(() => {
    if (selectedFeedId && activeFeedTab === "settings") onLoadFlags(selectedFeedId);
  }, [selectedFeedId, activeFeedTab, onLoadFlags]);

  const rowKey = keyFor(projectId, selectedFeedId);
  const ff = feedFlags[rowKey] || {};
  const stats = feedStats[rowKey];
  const anyFlagBusy = allSavingKeys.some((k) => ff[k]);

  const { feedsSlot, feedsAddSlot } = useContext(AdminTreeSlotsContext);

  const handleDeleteSelectedFeed = () => {
    onDeleteFeed(feeds.find((f) => f.feed_id === selectedFeedId) || { feed_id: selectedFeedId, name: selectedFeedName });
  };

  return (
    <>
      {feedsAddSlot &&
        createPortal(
          <RoleGate min="editor">
            <TreeAddButton onClick={onCreateFeed} title="New feed" />
          </RoleGate>,
          feedsAddSlot
        )}
      {feedsSlot &&
        createPortal(
          <FeedListContent
            feeds={feeds}
            feedsLoading={feedsLoading}
            selectedFeedId={selectedFeedId}
            onSelectFeed={onSelectFeed}
            onSaveFeed={onSaveFeed}
            isSaving={isSaving}
            deletingFeed={deletingFeed}
            onDeleteSelectedFeed={handleDeleteSelectedFeed}
            onRenameFeed={onRenameFeed}
          />,
          feedsSlot
        )}

      <div style={{ minWidth: 0 }}>
        {!selectedFeedId && (
          <EmptyState
            icon="📰"
            title="No feed selected"
            message="Pick a feed from the list, or create a new one to get started."
          />
        )}

        {selectedFeedId && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0 }}>{selectedFeedName || selectedFeedId}</h3>
            </div>

            <Tabs
              ariaLabel="Feed detail sections"
              activeId={activeFeedTab}
              onChange={setActiveFeedTab}
              tabs={[
                {
                  id: "posts",
                  label: contentUnitLabelPlural,
                  summary: `${posts.length} ${(posts.length === 1 ? contentUnitLabel : contentUnitLabelPlural).toLowerCase()}`,
                },
                { id: "participants", label: "Participants", summary: "Behavioural data" },
                { id: "settings", label: "Settings", summary: "Flags, defaults & danger zone" },
              ]}
            />

            {activeFeedTab === "posts" && (
              <>
                <Card
                  title={contentUnitLabelPlural}
                  actions={
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {/* Plain glyph, no button chrome — a secondary, low-emphasis
                          action next to "+" (the actual primary one), not an
                          equally-weighted icon button. */}
                      <button
                        type="button"
                        onClick={onRefreshPosts}
                        title={`Refresh ${contentUnitLabelPlural.toLowerCase()} from backend`}
                        aria-label="Refresh"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--admin-muted)",
                          cursor: "pointer",
                          fontSize: 17,
                          lineHeight: 1,
                          padding: 4,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        ↻
                      </button>
                      <RoleGate min="editor">
                        <IconButton size="sm" onClick={onOpenNewPost} title={`Add ${contentUnitLabel.toLowerCase()}`}>
                          ➕
                        </IconButton>
                      </RoleGate>
                    </div>
                  }
                >
                  {posts.length === 0 ? (
                    <EmptyState
                      icon="📝"
                      title={`No ${contentUnitLabelPlural.toLowerCase()} yet`}
                      message={`Use the + button above to add the first one, or import a backup JSON from Settings.`}
                    />
                  ) : (
                    <Table style={{ tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <Th style={{ width: "6%" }} />
                          <Th style={{ width: "14%" }}>Post</Th>
                          <Th style={{ width: "12%" }}>Author</Th>
                          <Th style={{ width: "38%" }}>Text</Th>
                          <Th style={{ width: "9%" }}>Time</Th>
                          <Th style={{ width: "9%" }}>Media</Th>
                          <Th style={{ width: "12%" }}>Actions</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {posts.map((p) => {
                          const postLabel = (p.postName || p.name || postNames[p.id] || "").trim();
                          const authorLabel = p.author || "";
                          return (
                            <tr key={p.id}>
                              <Td>
                                <div className="avatar">
                                  <img
                                    className="avatar-img"
                                    alt=""
                                    src={p.avatarUrl || pravatar(8)}
                                    width={40}
                                    height={40}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </div>
                              </Td>
                              <Td style={{ fontFamily: "monospace" }}>
                                {postLabel ? (
                                  <FitText title={postLabel}>{postLabel}</FitText>
                                ) : (
                                  <span className="subtle">—</span>
                                )}
                              </Td>
                              <Td style={{ fontWeight: 600 }}>
                                {authorLabel ? (
                                  <FitText title={authorLabel}>
                                    {authorLabel}
                                    {p.badge ? " ✔" : ""}
                                  </FitText>
                                ) : (
                                  <span className="subtle">—</span>
                                )}
                              </Td>
                              <Td>
                                {p.text ? (
                                  <FitText title={p.text}>{p.text}</FitText>
                                ) : (
                                  <span className="subtle">—</span>
                                )}
                              </Td>
                              <Td>
                                {p.time ? p.time : <span className="subtle">—</span>}
                              </Td>
                              <Td>
                                {p.videoMode !== "none" ? "video" : p.imageMode !== "none" ? "image" : <span className="subtle">none</span>}
                              </Td>
                              <Td>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <IconButton size="sm" onClick={() => onEditPost(p)} title="Edit post">
                                    ✏️
                                  </IconButton>
                                  <IconButton size="sm" onClick={() => onRemovePost(p.id)} title="Delete post">
                                    🗑️
                                  </IconButton>
                                </div>
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </>
            )}

            {activeFeedTab === "participants" && (
              <FeedParticipantsPage
                key={`fpp::${projectId}::${selectedFeedId}`}
                projectId={projectId}
                feedId={selectedFeedId}
                feedName={selectedFeedName}
                postNamesMap={postNames}
                posts={posts}
                onLogout={onLogout}
              />
            )}

            {activeFeedTab === "settings" && (
              <div style={{ display: "grid", gap: 16 }}>
                <Card
                  title={selectedFeedName || selectedFeedId}
                  subtitle={`ID: ${selectedFeedId}`}
                  actions={
                    <RoleGate min="editor">
                      <Button size="sm" variant="secondary" onClick={onCopyFeed} title="Duplicate this feed's posts into a new feed">
                        Copy feed
                      </Button>
                    </RoleGate>
                  }
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap", fontSize: 13 }}>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 11 }}>Total participants</div>
                      <div style={{ fontWeight: 700, fontSize: 17 }}>{stats ? stats.total : "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 11 }}>Submitted</div>
                      <div style={{ fontWeight: 700, fontSize: 17 }}>{stats ? stats.submitted : "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 11 }}>Avg time (m:ss)</div>
                      <div style={{ fontWeight: 700, fontSize: 17 }}>
                        {stats && stats.avg_ms_enter_to_submit != null ? msToMinSec(stats.avg_ms_enter_to_submit) : "—"}
                      </div>
                    </div>
                    {!stats && (
                      <Button size="sm" variant="secondary" onClick={() => onLoadStats(selectedFeedId)}>
                        Load stats
                      </Button>
                    )}
                  </div>
                </Card>

                <RoleGate min="editor">
                  <Card title="Behavior" subtitle="How this feed behaves for participants">
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", columnGap: 20 }}>
                      <Toggle
                        label="Randomize post order"
                        hint="Shuffles order, this session only"
                        checked={!!randomize}
                        onChange={onSetRandomize}
                      />
                      {Object.entries(flagKinds).map(([kind, { label, savingKey }]) => (
                        <Toggle
                          key={kind}
                          label={label}
                          checked={readFlagValue(ff, kind)}
                          busy={!!ff[savingKey] || (!ff.loaded && !!anyFlagBusy)}
                          disabled={allSavingKeys.some((k) => k !== savingKey && ff[k])}
                          onChange={() => onToggleFlag(selectedFeedId, kind)}
                        />
                      ))}
                    </div>
                  </Card>
                </RoleGate>

                <Card title="Sharing & export" subtitle="Participant links, backups, and printable copies">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onCopyParticipantLink(feeds.find((f) => f.feed_id === selectedFeedId) || { feed_id: selectedFeedId, name: selectedFeedName })}
                    >
                      Copy participant link
                    </Button>
                    <RoleGate min="editor">
                      <Button size="sm" variant="secondary" onClick={onExportPostsJson} title="Export current posts as JSON">
                        Export Feed
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={onExportFeedPdf}
                        disabled={!selectedFeedId || !posts?.length}
                        title="Export this feed as a printable PDF using the rendered post layout"
                      >
                        Export PDF
                      </Button>
                      <label className="btn ghost" title="Import posts from a JSON backup" style={{ cursor: "pointer" }}>
                        Import Feed
                        <input
                          type="file"
                          accept="application/json"
                          style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            await onImportPostsJson(file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </RoleGate>
                  </div>
                </Card>

                {/* "Delete feed" itself now lives in the sidebar, next to Save
                    feed / + New feed — see FeedListContent above. */}
                <RoleGate min="owner">
                  <Card title="Danger zone">
                    <Toggle
                      label="Wipe on change"
                      hint="Publishing a checksum-changing feed wipes its participants"
                      checked={!!wipeOnChange}
                      busy={updatingWipe}
                      disabled={wipeOnChange === null}
                      onChange={onSetWipePolicy}
                    />
                  </Card>
                </RoleGate>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
