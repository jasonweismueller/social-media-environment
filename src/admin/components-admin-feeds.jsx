import React, { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { pravatar } from "../utils";
import { Card, Table, Th, Td, Toggle, Button, IconButton, Badge, Tabs, RoleGate } from "./ui";
import { FeedParticipantsPage } from "./components-admin-participants-feed";
import { AdminTreeSlotsContext } from "./AdminShell";

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

// The tree-sidebar's Feeds section content (filter box, create/refresh,
// wipe-on-change toggle, the feed rows themselves) — portaled into
// AdminShell's Feeds slot instead of rendering in the main content column,
// see AdminTreeSlotsContext in ./AdminShell for why.
function FeedListContent({ feeds, feedsLoading, onCreateFeed, selectedFeedId, defaultFeedId, onSelectFeed }) {
  return (
    <div>
      {feedsLoading && (
        <div style={{ fontSize: 11, color: "var(--admin-muted)", marginBottom: 6 }}>Loading…</div>
      )}

      {feeds.length === 0 ? (
        <div style={{ fontSize: 12, color: "#6b7280", padding: "8px 4px" }}>No feeds yet.</div>
      ) : (
        feeds.map((f) => {
          const isActive = selectedFeedId === f.feed_id;
          const rowIsDefault = f.feed_id === defaultFeedId;
          return (
            <button
              key={f.feed_id}
              type="button"
              onClick={() => onSelectFeed(f.feed_id)}
              style={feedListButtonStyle(isActive)}
            >
              <div style={{ fontWeight: 700, color: isActive ? "#3730a3" : "#111827" }}>
                {f.name || f.feed_id}
                {rowIsDefault && (
                  <Badge tone="accent" style={{ marginLeft: 6 }}>
                    default
                  </Badge>
                )}
              </div>
            </button>
          );
        })
      )}

      <RoleGate min="editor">
        <Button size="sm" variant="secondary" onClick={onCreateFeed} style={{ width: "100%", marginTop: 6 }}>
          + New feed
        </Button>
      </RoleGate>
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
  defaultFeedId,
  feedStats,
  feedFlags,
  flagKinds,
  allSavingKeys,
  readFlagValue,
  wipeOnChange,
  updatingWipe,
  isSaving,
  posts,
  postNames,
  showAllPosts,
  randomize,
  contentUnitLabel,
  contentUnitLabelPlural,
  onSelectFeed,
  onCreateFeed,
  onRefreshFeeds,
  onLoadStats,
  onLoadFlags,
  onToggleFlag,
  onSetDefaultFeed,
  onDeleteFeed,
  onSetWipePolicy,
  onCopyParticipantLink,
  onSaveFeed,
  onSetShowAllPosts,
  onSetRandomize,
  onRefreshPosts,
  onExportPostsJson,
  onExportFeedPdf,
  onImportPostsJson,
  onOpenNewPost,
  onOpenRandomPost,
  onEditPost,
  onRenamePost,
  onRemovePost,
  onClearFeed,
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
  const isDefault = selectedFeedId === defaultFeedId;

  const { feedsSlot } = useContext(AdminTreeSlotsContext);

  return (
    <>
      {feedsSlot &&
        createPortal(
          <FeedListContent
            feeds={feeds}
            feedsLoading={feedsLoading}
            onCreateFeed={onCreateFeed}
            selectedFeedId={selectedFeedId}
            defaultFeedId={defaultFeedId}
            onSelectFeed={onSelectFeed}
          />,
          feedsSlot
        )}

      <div style={{ minWidth: 0 }}>
        {!selectedFeedId && <div style={{ color: "#6b7280" }}>Select or create a feed.</div>}

        {selectedFeedId && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0 }}>
                {selectedFeedName || selectedFeedId}
                {isDefault && (
                  <Badge tone="accent" style={{ marginLeft: 8 }}>
                    default
                  </Badge>
                )}
              </h3>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  <RoleGate min="editor">
                    <Button size="sm" onClick={onSaveFeed} disabled={isSaving}>
                      {isSaving ? "Saving…" : "Save"}
                    </Button>
                  </RoleGate>
                  <Button size="sm" variant="secondary" onClick={onRefreshPosts} title="Reload posts for this feed from backend">
                    Refresh {contentUnitLabelPlural}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onSetShowAllPosts((s) => !s)}
                    title={showAllPosts ? "Show only the first 5 posts" : "Show all posts"}
                  >
                    {showAllPosts ? "Show first 5" : `Show all (${posts.length})`}
                  </Button>
                  <RoleGate min="editor">
                    <Toggle label="Randomize order" checked={!!randomize} onChange={onSetRandomize} />
                    <Button size="sm" onClick={onOpenRandomPost} title="Generate a synthetic post">
                      + Random {contentUnitLabel}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={onOpenNewPost}>
                      + Add {contentUnitLabel}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={onClearFeed}
                      disabled={!posts.length}
                      title="Delete all posts from this feed"
                    >
                      Clear Feed
                    </Button>
                  </RoleGate>
                </div>

                <Card>
                  {posts.length === 0 ? (
                    <div className="subtle" style={{ padding: ".5rem 0" }}>
                      No posts yet.
                    </div>
                  ) : (
                    <Table>
                      <thead>
                        <tr>
                          <Th style={{ width: 36 }} />
                          <Th>Post</Th>
                          <Th>Author</Th>
                          <Th style={{ minWidth: 260 }}>Text</Th>
                          <Th>Time</Th>
                          <Th>Media</Th>
                          <Th style={{ minWidth: 220 }}>Actions</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllPosts ? posts : posts.slice(0, 5)).map((p) => (
                          <tr key={p.id}>
                            <Td>
                              <div className="avatar">
                                <img className="avatar-img" alt="" src={p.avatarUrl || pravatar(8)} />
                              </div>
                            </Td>
                            <Td style={{ fontFamily: "monospace" }}>
                              {postNames[p.id] || <span className="subtle">—</span>}
                            </Td>
                            <Td style={{ fontWeight: 600 }}>
                              {p.author || <span className="subtle">—</span>}
                              {p.badge ? " ✔" : ""}
                            </Td>
                            <Td style={{ maxWidth: 520, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.text || <span className="subtle">—</span>}
                            </Td>
                            <Td>
                              <span className="subtle">{p.time ? p.time : "—"}</span>
                            </Td>
                            <Td>
                              {p.videoMode !== "none" ? "🎬 video" : p.imageMode !== "none" ? "🖼️ image" : <span className="subtle">none</span>}
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
                        ))}
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
                defaultFeedId={defaultFeedId}
                postNamesMap={postNames}
                posts={posts}
                onLogout={onLogout}
              />
            )}

            {activeFeedTab === "settings" && (
              <div style={{ display: "grid", gap: 16 }}>
                <Card title="Identity">
                  <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div>
                      <span style={{ color: "#6b7280" }}>Name: </span>
                      {selectedFeedName || selectedFeedId}
                    </div>
                    <div>
                      <span style={{ color: "#6b7280" }}>ID: </span>
                      <span style={{ fontFamily: "monospace" }}>{selectedFeedId}</span>
                    </div>
                    <RoleGate min="editor">
                      <div>
                        <Button size="sm" variant="secondary" onClick={() => onSetDefaultFeed(selectedFeedId)} disabled={isDefault}>
                          {isDefault ? "Already default" : "Make default"}
                        </Button>
                      </div>
                    </RoleGate>
                  </div>
                </Card>

                <Card title="Participant stats">
                  <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 11 }}>Total</div>
                      <div style={{ fontWeight: 700 }}>{stats ? stats.total : "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 11 }}>Submitted</div>
                      <div style={{ fontWeight: 700 }}>{stats ? stats.submitted : "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 11 }}>Avg (m:ss)</div>
                      <div style={{ fontWeight: 700 }}>
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
                  <Card title="Randomize" subtitle="Per-feed participant-facing randomization flags">
                    <div style={{ display: "grid", gap: 8, maxWidth: 320 }}>
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

                <Card title="Sharing">
                  <Button size="sm" variant="secondary" onClick={() => onCopyParticipantLink(feeds.find((f) => f.feed_id === selectedFeedId) || { feed_id: selectedFeedId, name: selectedFeedName })}>
                    Copy participant link
                  </Button>
                </Card>

                <RoleGate min="editor">
                  <Card title="Import / export" subtitle="Back up or move this feed's posts">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <Button size="sm" variant="secondary" onClick={onExportPostsJson} title="Export current posts as JSON">
                        Export JSON
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={onExportFeedPdf}
                        disabled={!selectedFeedId || !posts?.length}
                        title="Export this feed as a printable PDF using the rendered post layout"
                      >
                        Export Feed PDF
                      </Button>
                      <label className="btn ghost" title="Import posts from a JSON backup" style={{ cursor: "pointer" }}>
                        Import JSON
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
                    </div>
                  </Card>
                </RoleGate>

                <RoleGate min="owner">
                  <Card title="Danger zone">
                    <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--admin-border-subtle)" }}>
                      <Toggle
                        label="Wipe on change"
                        hint="Publishing a checksum-changing feed wipes its participants"
                        checked={!!wipeOnChange}
                        busy={updatingWipe}
                        disabled={wipeOnChange === null}
                        onChange={onSetWipePolicy}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onDeleteFeed(feeds.find((f) => f.feed_id === selectedFeedId) || { feed_id: selectedFeedId, name: selectedFeedName })}
                    >
                      Delete feed
                    </Button>
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
