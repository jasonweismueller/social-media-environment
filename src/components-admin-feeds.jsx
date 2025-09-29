import React, { useEffect, useMemo, useState } from "react";

/**
 * AdminFeedsPanel
 * Props:
 *  - apiBase: string   e.g. your Apps Script web app URL
 *  - adminToken: string (required for admin-only endpoints)
 */
export default function AdminFeedsPanel({ apiBase = "", adminToken }) {
  const [feeds, setFeeds] = useState([]);
  const [defaultFeedId, setDefaultFeedId] = useState("");
  const [selectedFeedId, setSelectedFeedId] = useState("");
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Add Feed form
  const [newFeedId, setNewFeedId] = useState("");
  const [newFeedName, setNewFeedName] = useState("");

  const selectedFeed = useMemo(
    () => feeds.find(f => String(f.feed_id) === String(selectedFeedId)) || null,
    [feeds, selectedFeedId]
  );

  const apiGet = async (path, params = {}) => {
    const url = new URL(apiBase);
    url.searchParams.set("path", path);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
    return res.json();
  };

  const apiPost = async (payload) => {
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`POST ${payload.action} failed (${res.status})`);
    return res.json();
  };

  const refreshFeeds = async () => {
    const [list, def] = await Promise.all([
      apiGet("feeds"),
      apiGet("default_feed")
    ]);
    setFeeds(list || []);
    setDefaultFeedId(def?.feed_id || "");
    // keep selection valid
    setSelectedFeedId(prev => {
      if (prev && (list || []).some(f => String(f.feed_id) === String(prev))) return prev;
      return (list && list[0]?.feed_id) ? String(list[0].feed_id) : "";
    });
  };

  const refreshStats = async (feedId) => {
    if (!feedId) { setStats(null); return; }
    const data = await apiGet("participants", { feed_id: feedId, admin_token: adminToken }).catch(() => null);
    const s = await apiGet("participants_stats", { feed_id: feedId, admin_token: adminToken }).catch(() => null);
    setStats(s ? { ...s, _rows: data || [] } : null);
  };

  useEffect(() => {
    (async () => {
      try { await refreshFeeds(); } catch (e) { setErr(String(e.message || e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try { await refreshStats(selectedFeedId); } catch (_) {}
    })();
  }, [selectedFeedId]);

  const onAddFeed = async () => {
    const fid = newFeedId.trim();
    const name = newFeedName.trim() || newFeedId.trim();
    if (!fid) { setErr("Feed ID is required"); return; }
    setBusy(true); setErr("");
    try {
      // create by publishing an empty posts array; registry row is upserted there
      await apiPost({
        action: "publish_posts",
        admin_token: adminToken,
        feed_id: fid,
        name,
        posts: []
      });
      await refreshFeeds();
      setNewFeedId(""); setNewFeedName("");
      setSelectedFeedId(fid);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  const onDeleteFeed = async (fid) => {
    if (!fid) return;
    if (!window.confirm(`Delete feed "${fid}"? This removes posts, registry row, and participants for that feed.`)) return;
    setBusy(true); setErr("");
    try {
      await apiPost({ action: "delete_feed", admin_token: adminToken, feed_id: fid });
      await refreshFeeds();
      if (selectedFeedId === fid) setSelectedFeedId("");
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  const onSetDefault = async (fid) => {
    if (!fid) return;
    setBusy(true); setErr("");
    try {
      await apiPost({ action: "set_default_feed", admin_token: adminToken, feed_id: fid });
      setDefaultFeedId(fid);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  const onClearDefault = async () => {
    setBusy(true); setErr("");
    try {
      await apiPost({ action: "set_default_feed", admin_token: adminToken, feed_id: "" });
      setDefaultFeedId("");
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  const onWipeParticipants = async (fid) => {
    if (!fid) return;
    if (!window.confirm(`Wipe participants for "${fid}"?`)) return;
    setBusy(true); setErr("");
    try {
      await apiPost({ action: "wipe_participants", admin_token: adminToken, feed_id: fid });
      await refreshStats(fid);
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ padding: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Feeds</h3>
      <p className="subtle" style={{ marginTop: 4 }}>
        Manage multiple feeds. Create, delete, set a default feed, and review basic participation stats.
      </p>

      {/* Add feed */}
      <div className="fieldset" style={{ marginTop: ".75rem" }}>
        <div className="section-title">Add a new feed</div>
        <div className="grid-3">
          <label className="login-label">
            Feed ID
            <input
              className="input"
              value={newFeedId}
              onChange={(e) => setNewFeedId(e.target.value)}
              placeholder="eg. pilot-a"
            />
          </label>
          <label className="login-label">
            Name (optional)
            <input
              className="input"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              placeholder="Pilot A"
            />
          </label>
          <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={onAddFeed} disabled={busy || !newFeedId.trim()}>
              Add feed
            </button>
          </div>
        </div>
      </div>

      {/* Feeds table */}
      <div className="fieldset" style={{ marginTop: ".75rem" }}>
        <div className="section-title">Existing feeds</div>
        {feeds.length === 0 ? (
          <div className="subtle">No feeds yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6b7280", fontSize: ".9rem" }}>
                  <th style={{ padding: "6px 8px" }}>Default</th>
                  <th style={{ padding: "6px 8px" }}>Feed ID</th>
                  <th style={{ padding: "6px 8px" }}>Name</th>
                  <th style={{ padding: "6px 8px" }}>Checksum</th>
                  <th style={{ padding: "6px 8px" }}>Updated</th>
                  <th style={{ padding: "6px 8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeds.map((f) => {
                  const isDefault = String(defaultFeedId) === String(f.feed_id);
                  const isSelected = String(selectedFeedId) === String(f.feed_id);
                  return (
                    <tr key={f.feed_id}
                        style={{ background: isSelected ? "rgba(37,99,235,.06)" : "transparent" }}
                        onClick={() => setSelectedFeedId(String(f.feed_id))}>
                      <td style={{ padding: "6px 8px" }}>
                        <input
                          type="radio"
                          name="defaultFeed"
                          checked={isDefault}
                          onChange={() => onSetDefault(f.feed_id)}
                          title={isDefault ? "Default feed" : "Make default"}
                        />
                      </td>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>{f.feed_id}</td>
                      <td style={{ padding: "6px 8px" }}>{f.name || "—"}</td>
                      <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: ".85rem", color: "#6b7280" }}>
                        {f.checksum || "—"}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#6b7280" }}>{f.updated_at || "—"}</td>
                      <td style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
                        <button className="btn" onClick={(e)=>{e.stopPropagation(); onSetDefault(f.feed_id);}} disabled={busy || isDefault}>Set default</button>
                        <button className="btn" onClick={(e)=>{e.stopPropagation(); onWipeParticipants(f.feed_id);}} disabled={busy}>Wipe participants</button>
                        <button className="btn" onClick={(e)=>{e.stopPropagation(); onDeleteFeed(f.feed_id);}} disabled={busy} style={{ color: "#991b1b", borderColor: "#fecaca" }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 8 }}>
              {defaultFeedId ? (
                <button className="btn" onClick={onClearDefault} disabled={busy}>Clear default</button>
              ) : (
                <span className="subtle">No default feed set.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stats for selected */}
      <div className="fieldset" style={{ marginTop: ".75rem" }}>
        <div className="section-title">Selected feed</div>
        {!selectedFeed ? (
          <div className="subtle">Select a feed above to view stats.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div className="subtle">Feed ID</div>
                <div style={{ fontWeight: 700 }}>{selectedFeed.feed_id}</div>
              </div>
              <div>
                <div className="subtle">Default</div>
                <div>{String(defaultFeedId) === String(selectedFeed.feed_id) ? "Yes" : "No"}</div>
              </div>
              <div>
                <div className="subtle">Name</div>
                <div>{selectedFeed.name || "—"}</div>
              </div>
              <div>
                <div className="subtle">Last updated</div>
                <div>{selectedFeed.updated_at || "—"}</div>
              </div>
            </div>

            <div className="section-title" style={{ marginTop: ".75rem" }}>Participants (live)</div>
            {!stats ? (
              <div className="subtle">Loading…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <StatTile label="Total sessions" value={stats.total} />
                <StatTile label="Submitted" value={stats.submitted} />
                <StatTile label="Avg time (ms)" value={stats.avg_ms_enter_to_submit ?? "—"} />
              </div>
            )}
          </>
        )}
      </div>

      {err && <div style={{ marginTop: 10, color: "#991b1b" }}>{err}</div>}
    </div>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="ghost-card box" style={{ padding: ".6rem .75rem" }}>
      <div className="subtle" style={{ fontSize: ".8rem" }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}