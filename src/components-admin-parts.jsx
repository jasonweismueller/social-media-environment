// components-admin-parts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  toCSV,
  loadParticipantsRoster,   // requires admin_token (handled in utils)
  summarizeRoster,
  nfCompact,
  extractPerPostFromRosterRow,
} from "./utils";

/* --------------------------- tiny helper + stat --------------------------- */
function ms(n) {
  if (n == null) return "—";
  const s = Math.round(n / 1000);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}
function msShort(n) {
  if (!Number.isFinite(n)) return "—";
  const s = Math.round(n / 1000);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}
// NEW: seconds formatter
function sShort(n) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}s`;
}

export function StatCard({ title, value, sub }) {
  return (
    <div className="card" style={{ padding: ".75rem 1rem" }}>
      <div style={{ fontSize: ".8rem", color: "#6b7280" }}>{title}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: ".8rem", color: "#6b7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ----------------------- Participant detail modal ------------------------- */
export function ParticipantDetailModal({ open, onClose, submission }) {
  if (!open) return null;

  const header = (
    <div className="modal-head">
      <h3 style={{ margin: 0, fontWeight: 600 }}>Submission Details</h3>
      <button className="dots" aria-label="Close" onClick={onClose}>×</button>
    </div>
  );

  const perPost = submission?.perPost || [];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
        {header}
        <div className="modal-body">
          <div className="subtle" style={{ marginBottom: ".5rem" }}>
            <div><strong>Participant:</strong> {submission?.participant_id || "—"}</div>
            <div><strong>Session:</strong> <span style={{ fontFamily: "monospace" }}>{submission?.session_id}</span></div>
            <div><strong>Submitted At:</strong> {submission?.submitted_at_iso || "—"}</div>
            <div><strong>Time to submit:</strong> {msShort(Number(submission?.ms_enter_to_submit))}</div>
          </div>

          {perPost.length === 0 ? (
            <div className="card" style={{ padding: "1rem" }}>No per-post interaction fields found for this submission.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <th style={{ textAlign: "left",  padding: ".4rem .25rem" }}>Post ID</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Reacted</th>
                    <th style={{ textAlign: "center", padding: ".4rem .25rem" }}>Expandable</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Expanded</th>
                    <th style={{ textAlign: "left",  padding: ".4rem .25rem" }}>Reaction(s)</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Commented</th>
                    <th style={{ textAlign: "left",  padding: ".4rem .25rem" }}>Comment</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Shared</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Reported</th>
                    <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Dwell (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {perPost.map((p) => {
                    // Prefer seconds; else convert ms→s as a fallback
                    const dwellSeconds = Number.isFinite(p.dwell_s)
                      ? Number(p.dwell_s)
                      : Number.isFinite(p.dwell_ms)
                        ? Number(p.dwell_ms) / 1000
                        : 0;
                    return (
                      <tr key={p.post_id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: ".35rem .25rem", fontFamily: "monospace" }}>{p.post_id}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.reacted ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.expandable ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.expanded ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem" }}>
                          {p.reaction_type && p.reaction_type.trim()
                            ? p.reaction_type
                            : Array.isArray(p.reaction_types) && p.reaction_types.length
                              ? p.reaction_types.join(", ")
                              : "—"}
                        </td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.commented ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem" }}>
                          {p.comment_text && p.comment_text.trim() ? p.comment_text : "—"}
                        </td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.shared ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.reported ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{sShort(dwellSeconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Participants ------------------------------ */
export function ParticipantsPanel({ feedId }) {
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [showPerPost, setShowPerPost] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSubmission, setDetailSubmission] = useState(null);

  const abortRef = useRef(null);

  // bump cache version so the UI refreshes with new fields
  const mkCacheKey = (id) => `fb_participants_cache_v7::${id || "noid"}`;

  const saveCache = React.useCallback((data) => {
    try { localStorage.setItem(mkCacheKey(feedId), JSON.stringify({ t: Date.now(), rows: data })); } catch {}
  }, [feedId]);

  const readCache = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(mkCacheKey(feedId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.rows) ? parsed : null;
    } catch { return null; }
  }, [feedId]);

  const computeSummaryIdle = React.useCallback((data) => {
    const run = () => {
      React.startTransition(() => {
        try { setSummary(summarizeRoster(data)); } catch {}
      });
    };
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 0)))(run);
  }, []);

  useEffect(() => {
    const cached = readCache();
    if (cached?.rows?.length) {
      setRows(cached.rows);
      setLoading(false);
      computeSummaryIdle(cached.rows);
    }
    refresh(!!cached?.rows?.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId]);

  const refresh = React.useCallback(async (silent = false) => {
    setError("");
    if (!silent) setLoading(true);

    abortRef.current?.abort?.();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      let data;
      try {
        data = await loadParticipantsRoster(feedId, { signal: ctrl.signal });
      } catch {
        if (ctrl.signal.aborted) return;
        data = await loadParticipantsRoster(feedId);
      }
      if (ctrl.signal.aborted) return;

      if (Array.isArray(data)) {
        setRows(data);
        computeSummaryIdle(data);
        saveCache(data);
      } else {
        setError("Unexpected response.");
      }
    } catch (e) {
      if (e?.name !== "AbortError") setError("Failed to load participants");
    } finally {
      setLoading(false);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [feedId, computeSummaryIdle, saveCache]);

  const totalRows = rows?.length || 0;

  const sorted = useMemo(() => {
    if (!rows?.length) return [];
    const a = [...rows];
    a.sort((x, y) => String(y.submitted_at_iso).localeCompare(String(x.submitted_at_iso)));
    return a;
  }, [rows]);

  const visible = useMemo(() => sorted.slice(0, pageSize), [sorted, pageSize]);

  // Compute avg dwell seconds per post by scanning the roster rows (handles both _dwell_s and legacy _dwell_ms)
  const avgDwellSByPost = useMemo(() => {
    const acc = new Map(); // id -> {sum, count}
    if (!rows?.length) return acc;
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        let m = k.match(/^(.*)_dwell_s$/);
        if (m) {
          const id = m[1];
          const s = Number(r[k] || 0);
          if (!acc.has(id)) acc.set(id, { sum: 0, count: 0 });
          const a = acc.get(id);
          a.sum += s;
          a.count += 1;
          continue;
        }
        m = k.match(/^(.*)_dwell_ms$/);
        if (m) {
          const id = m[1];
          const s = Math.round(Number(r[k] || 0) / 1000);
          if (!acc.has(id)) acc.set(id, { sum: 0, count: 0 });
          const a = acc.get(id);
          a.sum += s;
          a.count += 1;
        }
      }
    }
    return acc;
  }, [rows]);

  const perPostList = useMemo(() => {
    if (!showPerPost || !summary?.perPost) return [];
    return Object.entries(summary.perPost).map(([id, agg]) => {
      const dwellAcc = avgDwellSByPost.get(id);
      const avgDwellS = dwellAcc && dwellAcc.count > 0 ? dwellAcc.sum / dwellAcc.count : null;
      return {
        id,
        reacted: agg.reacted,
        expandable: agg.expandable ?? 0,
        expanded: agg.expanded ?? 0,
        expandRate: agg.expandRate,
        commented: agg.commented,
        shared: agg.shared,
        reported: agg.reported,
        avgDwellS,
      };
    });
  }, [showPerPost, summary, avgDwellSByPost]);

  return (
    <div className="card" style={{ padding: "1rem" }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>
          Participants ({nfCompact.format(totalRows)})
          {feedId ? <span className="subtle"> · {feedId}</span> : null}
        </h4>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => refresh(false)}>Refresh</button>
          <button
            className="btn"
            onClick={() => {
              if (!rows?.length) return;

              // 1) Transform dwell_ms → dwell_s
              const transformed = rows.map((r) => {
                const out = { ...r };
                for (const k of Object.keys(r)) {
                  const m = k.match(/^(.*)_dwell_ms$/);
                  if (m) {
                    const base = m[1];
                    const sKey = `${base}_dwell_s`;
                    if (out[sKey] == null) {
                      const ms = Number(r[k] || 0);
                      out[sKey] = Math.round(ms / 1000);
                    }
                    delete out[k];
                  }
                }
                return out;
              });

              // 2) Normalize values
              const BOOL_SUFFIX = /(reacted|expandable|expanded|commented|shared|reported_misinfo)$/;

              const rowsForCsv = transformed.map((r) => {
                const out = { ...r };
                for (const k of Object.keys(out)) {
                  if (/_dwell_s$/.test(k)) {
                    out[k] = Number(out[k] || 0);
                    continue;
                  }
                  if (BOOL_SUFFIX.test(k)) {
                    const v = Number(out[k]);
                    out[k] = Number.isFinite(v) ? (v ? 1 : 0) : 0;
                    continue;
                  }
                  if (/comment_count$/.test(k)) {
                    delete out[k]; // 🚫 drop comment_count column entirely
                    continue;
                  }
                }
                return out;
              });

              // 3) Build header as union of keys
              const headerSet = new Set();
              rowsForCsv.forEach(r => Object.keys(r).forEach(k => headerSet.add(k)));
              const header = Array.from(headerSet);

              // 4) Emit CSV
              const csv = toCSV(rowsForCsv, header);
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `fakebook_participants${feedId ? `_${feedId}` : ""}.csv`;
              document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            }}
            disabled={!rows?.length}
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".5rem", marginTop: ".75rem" }}>
        <StatCard title="Total" value={nfCompact.format(summary?.counts?.total ?? totalRows)} />
        <StatCard title="Completed" value={nfCompact.format(summary?.counts?.completed ?? 0)} sub={`${(((summary?.counts?.completionRate ?? 0) * 100).toFixed(1))}% completion`} />
        <StatCard title="Avg time to submit" value={ms(summary?.timing?.avgEnterToSubmit)} />
        <StatCard title="Median time to submit" value={ms(summary?.timing?.medEnterToSubmit)} />
        <StatCard title="Avg last interaction" value={ms(summary?.timing?.avgEnterToLastInteraction)} />
        <StatCard title="Median last interaction" value={ms(summary?.timing?.medEnterToLastInteraction)} />
      </div>

      {/* per-post aggregate toggle */}
      <div style={{ marginTop: "1rem" }}>
        <button className="btn ghost" onClick={() => setShowPerPost(v => !v)}>
          {showPerPost ? "Hide per-post interactions" : "Show per-post interactions"}
        </button>
      </div>

      {showPerPost && perPostList.length > 0 && (
        <div style={{ marginTop: ".5rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left",  padding: ".4rem .25rem" }}>Post ID</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Reacted</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Expandable</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Expanded</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Expand rate</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Commented</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Shared</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Reported</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Avg dwell (s)</th>
              </tr>
            </thead>
            <tbody>
              {perPostList.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: ".35rem .25rem", fontFamily: "monospace" }}>{p.id}</td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{nfCompact.format(p.reacted)}</td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{nfCompact.format(p.expandable)}</td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{nfCompact.format(p.expanded)}</td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>
                    {p.expandRate == null ? "—" : `${Math.round(p.expandRate * 100)}%`}
                  </td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{nfCompact.format(p.commented)}</td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{nfCompact.format(p.shared)}</td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{nfCompact.format(p.reported)}</td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>{p.avgDwellS == null ? "—" : sShort(p.avgDwellS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* latest submissions */}
      <h5 style={{ margin: "1rem 0 .5rem" }}>Latest submissions</h5>
      {visible.length === 0 ? (
        <div className="subtle" style={{ padding: ".5rem 0" }}>No submissions yet.</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: ".9rem" }}>
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left",  padding: ".4rem .25rem" }}>Participant</th>
                <th style={{ textAlign: "left",  padding: ".4rem .25rem" }}>Submitted At</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Time to Submit</th>
                <th style={{ textAlign: "right", padding: ".4rem .25rem" }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.session_id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: ".35rem .25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.participant_id || "—"}
                  </td>
                  <td style={{ padding: ".35rem .25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.submitted_at_iso || "—"}
                  </td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>
                    {Number.isFinite(Number(r.ms_enter_to_submit)) ? ms(Number(r.ms_enter_to_submit)) : "—"}
                  </td>
                  <td style={{ padding: ".35rem .25rem", textAlign: "right" }}>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        try {
                          const perPostHash = extractPerPostFromRosterRow(r) || {};
                          const perPost = Object.entries(perPostHash).map(([post_id, agg]) => {
                            // seconds (fallback from ms)
                            const dwell_s = Number.isFinite(agg?.dwell_s)
                              ? Number(agg.dwell_s)
                              : Number.isFinite(agg?.dwell_ms)
                                ? Number(agg.dwell_ms) / 1000
                                : 0;

                            // “real” comment = not empty, not dash
                            const rawComment = String(agg.comment_text || "").trim();
                            const hasRealComment = !!(rawComment && !/^[-—\s]+$/.test(rawComment));

                            return {
                              post_id,
                              reacted: Number(agg.reacted) === 1,
                              expandable: Number(agg.expandable) === 1,
                              expanded: Number(agg.expanded) === 1,
                              reaction_types: agg.reactions || agg.reaction_types || [],
                              commented: Number(agg.commented) === 1 ? true : hasRealComment,
                              comment_text: rawComment,
                              shared: Number(agg.shared) === 1,
                              reported: Number(agg.reported) === 1,
                              dwell_s,
                            };
                          });

                          setDetailSubmission({
                            session_id: r.session_id,
                            participant_id: r.participant_id ?? null,
                            submitted_at_iso: r.submitted_at_iso ?? null,
                            ms_enter_to_submit: r.ms_enter_to_submit ?? null,
                            perPost,
                          });
                          setDetailOpen(true);
                        } catch (err) {
                          console.error("Participant Details build failed:", err, r);
                          alert("Failed to open details (see console for error).");
                        }
                      }}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visible.length < sorted.length && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: ".5rem" }}>
              <button className="btn" onClick={() => setPageSize(s => Math.min(s + 25, sorted.length))}>
                Show more
              </button>
            </div>
          )}
        </>
      )}

      {/* footer: status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: ".5rem" }}>
        {error ? <div style={{ color: "crimson", fontSize: ".85rem" }}>{error}</div> : <span />}
        {loading && <div className="subtle" style={{ fontSize: ".85rem" }}>Refreshing…</div>}
      </div>

      {/* detail modal */}
      <ParticipantDetailModal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailSubmission(null); }}
        submission={detailSubmission}
      />
    </div>
  );
}