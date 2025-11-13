// components-admin-parts.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  loadParticipantsRoster,        // GET roster (admin token handled in utils)
  summarizeRoster,               // builds {counts, timing, perPost}
  nfCompact,                     // number formatter
  extractPerPostFromRosterRow,   // per-submission → per-post hash
  APP,
  getProjectId as getProjectIdUtil,
  setProjectId as setProjectIdUtil,
  readPostNames,                 // { [postId]: "Pretty Name" }
} from "../utils";

/* ----------------------------- helpers ----------------------------- */
const ms = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const s = Math.round(Number(n) / 1000);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
};
const sShort = (n) => (Number.isFinite(n) ? `${Math.round(n)}s` : "—");

function labelForKey(key, nameMap) {
  // turns "<postId>_<suffix>" → "<prettyName>_<suffix>" in CSV header
  const m = /^(.+?)_([a-z_]+)$/.exec(key);
  if (!m) return key;
  const [, base, suf] = m;
  const pretty = nameMap?.[base]?.trim?.() || base;
  return `${pretty}_${suf}`;
}

function makeCsvWithPrettyHeaders(rows, keys, labels) {
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = (labels?.length === keys.length ? labels : keys).map(esc).join(",");
  const body = rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n");
  return head + "\n" + body;
}

/* --------------------------- stat card ----------------------------- */
export function StatCard({ title, value, sub, compact = false }) {
  return (
    <div className="card" style={{ padding: compact ? ".5rem .75rem" : ".75rem 1rem" }}>
      <div style={{ fontSize: compact ? ".75rem" : ".8rem", color: "#6b7280" }}>{title}</div>
      <div style={{ fontSize: compact ? "1.1rem" : "1.25rem", fontWeight: 700 }}>{value}</div>
      {sub ? (
        <div style={{ fontSize: compact ? ".75rem" : ".8rem", color: "#6b7280", marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------- detail modal ------------------------- */
export function ParticipantDetailModal({ open, onClose, submission }) {
  if (!open) return null;
  const perPost = submission?.perPost || [];

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
        <div className="modal-head">
          <h3 style={{ margin: 0, fontWeight: 600 }}>Submission Details</h3>
          <button className="dots" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="subtle" style={{ marginBottom: ".5rem" }}>
            <div><strong>Participant:</strong> {submission?.participant_id || "—"}</div>
            <div><strong>Session:</strong> <span style={{ fontFamily: "monospace" }}>{submission?.session_id || "—"}</span></div>
            <div><strong>Submitted At:</strong> {submission?.submitted_at_iso || "—"}</div>
            <div><strong>Time to submit:</strong> {ms(submission?.ms_enter_to_submit)}</div>
          </div>

          {perPost.length === 0 ? (
            <div className="card" style={{ padding: "1rem" }}>
              No per-post interaction fields found for this submission.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <th style={{ textAlign: "left",  padding: ".4rem .25rem" }}>Post ID</th>
                    <th style={{ textAlign: "left",  padding: ".4rem .25rem" }}>Name</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Reacted</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Expandable</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Expanded</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Commented</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Saved</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Shared</th>
                    <th style={{ textAlign: "center",padding: ".4rem .25rem" }}>Reported</th>
                    <th style={{ textAlign: "right", padding: ".4rem .25rem" }}>Dwell (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {perPost.map((p) => {
                    const dwellSeconds = Number.isFinite(p?.dwell_s)
                      ? Number(p.dwell_s)
                      : Number.isFinite(p?.dwell_ms)
                        ? Number(p.dwell_ms) / 1000
                        : 0;
                    return (
                      <tr key={p.post_id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: ".35rem .25rem", fontFamily: "monospace" }}>{p.post_id}</td>
                        <td style={{ padding: ".35rem .25rem" }}>{p.name || "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.reacted ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.expandable ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.expanded ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.commented ? "✓" : "—"}</td>
                        <td style={{ padding: ".35rem .25rem", textAlign: "center" }}>{p.saved ? "✓" : "—"}</td>
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
    </div>,
    document.body
  );
}

/* --------------------------- participants panel --------------------------- */
export function ParticipantsPanel({
  feedId,
  projectId: projectIdProp,
  compact = false,
  limit,
  onCountChange,
  postNamesMap,
}) {
  // Effective project id: prefer prop, else util, else "global"
  const projectId = projectIdProp ?? getProjectIdUtil() ?? "global";
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [showPerPost, setShowPerPost] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSubmission, setDetailSubmission] = useState(null);
  const abortRef = useRef(null);

  // post-name mappings for pretty headers and UI tables
  const nameStore = postNamesMap || readPostNames(projectId, feedId) || {};

  // keep utils’ project in sync so roster GET includes ?project_id
  useEffect(() => {
    setProjectIdUtil(projectId, { persist: true, updateUrl: false });
  }, [projectId]);

  // cache key includes APP + projectId + feedId to scope correctly
  const mkCacheKey = (id, pid = projectId) =>
    `participants_cache_v8::${APP || "app"}::${pid || "no-project"}::${id || "noid"}`;

  const saveCache = (data, pid = projectId) => {
    try {
      localStorage.setItem(mkCacheKey(feedId, pid), JSON.stringify({ t: Date.now(), rows: data }));
    } catch {}
  };

  const readCache = (pid = projectId) => {
    try {
      const raw = localStorage.getItem(mkCacheKey(feedId, pid));
      const parsed = JSON.parse(raw || "{}");
      return Array.isArray(parsed?.rows) ? parsed : null;
    } catch {
      return null;
    }
  };

  const computeSummaryIdle = (data) => {
    const run = () => {
      try { setSummary(summarizeRoster(data)); } catch {}
    };
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 0)))(run);
  };

  const refresh = async (silent = false, pidOverride) => {
    setError("");
    if (!silent) setLoading(true);

    abortRef.current?.abort?.();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const pid = pidOverride ?? projectId;
      const data = await loadParticipantsRoster(feedId, { signal: ctrl.signal, projectId: pid });
      if (!ctrl.signal.aborted && Array.isArray(data)) {
        setRows(data);
        computeSummaryIdle(data);
        saveCache(data, pid);
      }
    } catch (e) {
      if (e?.name !== "AbortError") setError("Failed to load participants");
    } finally {
      setLoading(false);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  // initial load from cache then network
  useEffect(() => {
    const cached = readCache(projectId);
    if (cached?.rows?.length) {
      setRows(cached.rows);
      setLoading(false);
      computeSummaryIdle(cached.rows);
    }
    refresh(!!cached?.rows?.length);
    return () => abortRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId, projectId]);

  // bubble up row count
  useEffect(() => {
    onCountChange?.(rows?.length || 0);
  }, [rows, onCountChange]);

  // sorted submissions by submitted_at_iso desc
  const sorted = useMemo(() => {
    if (!rows?.length) return [];
    const a = [...rows];
    a.sort((x, y) => String(y.submitted_at_iso).localeCompare(String(x.submitted_at_iso)));
    return a;
  }, [rows]);

  // visible slice
  const effectivePageSize = typeof limit === "number" && limit >= 0 ? Math.min(limit, sorted.length) : pageSize;
  const visible = useMemo(() => sorted.slice(0, effectivePageSize), [sorted, effectivePageSize]);

  // avg dwell seconds per post (supports _dwell_s and legacy _dwell_ms)
  const avgDwellSByPost = useMemo(() => {
    const acc = new Map();
    if (!rows?.length) return acc;
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        let m = k.match(/^(.*)_dwell_s$/);
        if (m) {
          const id = m[1];
          const s = Number(r[k] || 0);
          if (!acc.has(id)) acc.set(id, { sum: 0, count: 0 });
          const a = acc.get(id); a.sum += s; a.count += 1;
          continue;
        }
        m = k.match(/^(.*)_dwell_ms$/);
        if (m) {
          const id = m[1];
          const s = Math.round(Number(r[k] || 0) / 1000);
          if (!acc.has(id)) acc.set(id, { sum: 0, count: 0 });
          const a = acc.get(id); a.sum += s; a.count += 1;
        }
      }
    }
    return acc;
  }, [rows]);

  // per-post aggregate table (adds IG "saved")
  const perPostList = useMemo(() => {
    if (!showPerPost || !summary?.perPost) return [];
    return Object.entries(summary.perPost).map(([id, agg]) => {
      const dwellAcc = avgDwellSByPost.get(id);
      const avgDwellS = dwellAcc && dwellAcc.count > 0 ? dwellAcc.sum / dwellAcc.count : null;
      return {
        id,
        name: nameStore[id] || "",
        reacted: agg.reacted ?? 0,
        expandable: agg.expandable ?? 0,
        expanded: agg.expanded ?? 0,
        commented: agg.commented ?? 0,
        saved: agg.saved ?? 0,          // IG
        shared: agg.shared ?? 0,
        reported: agg.reported ?? 0,
        avgDwellS,
      };
    });
  }, [showPerPost, summary, avgDwellSByPost, nameStore]);

  // ----- compact toggles (spacing/typography) -----
  const padCell = compact ? ".3rem .25rem" : ".4rem .25rem";
  const fsTable = compact ? ".85rem" : ".9rem";
  const wrapperPad = compact ? ".75rem 1rem" : "1rem";
  const headerGap = compact ? ".35rem" : ".5rem";
  const statsGap = compact ? ".4rem" : ".5rem";

  return (
    <div className="card" style={{ padding: wrapperPad }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: headerGap, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, fontSize: compact ? "1rem" : "1.05rem" }}>
          Participants{feedId ? <span className="subtle"> · {feedId}</span> : null}
          <span className="subtle"> · {APP} · {projectId || "global"}</span>
        </h4>
        <div style={{ display: "flex", gap: headerGap, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => refresh(false)} style={{ padding: compact ? ".25rem .6rem" : undefined }}>
            Refresh
          </button>
          <button
            className="btn"
            onClick={() => {
  if (!rows?.length) return;

  // Canonical field mapping for IG → FB-style
  const normalizeIG = (r) => {
    const out = { ...r };

    for (const k of Object.keys(r)) {
      const v = Number(r[k] || 0);

      if (k.endsWith("_like")) {
        const base = k.replace("_like", "");
        out[base + "_reacted"] = v ? 1 : 0;
        delete out[k];
      }

      if (k.endsWith("_open_comments") || k.endsWith("_send_comment")) {
        const base = k.replace(/_(open_comments|send_comment)/, "");
        out[base + "_expandable"] = 1;
        out[base + "_expanded"] = 1;
        out[base + "_commented"] = 1;
        delete out[k];
      }

      if (k.endsWith("_save_post")) {
        const base = k.replace("_save_post", "");
        out[base + "_saved"] = v ? 1 : 0;
        delete out[k];
      }

      if (k.endsWith("_send_share")) {
        const base = k.replace("_send_share", "");
        out[base + "_shared"] = v ? 1 : 0;
        delete out[k];
      }

      if (k.endsWith("_menu_report")) {
        const base = k.replace("_menu_report", "");
        out[base + "_reported"] = v ? 1 : 0;
        delete out[k];
      }
    }

    return out;
  };

  // -------- 1) Normalize all rows --------
  const normalizedAll = rows.map(raw => {
    let r = normalizeIG(raw); // IG → FB unification

    // Dwell: _dwell_ms → _dwell_s
    for (const k of Object.keys(r)) {
      if (k.endsWith("_dwell_ms")) {
        const base = k.replace("_dwell_ms", "");
        const msVal = Number(r[k] || 0);
        const sKey = base + "_dwell_s";
        if (r[sKey] == null) {
          r[sKey] = Math.round(msVal / 1000);
        }
        delete r[k];
      }
    }

    // Normalise booleans
    const BOOL_SUFFIX = /(reacted|expandable|expanded|commented|saved|shared|reported)$/;
    const out = { ...r };

    for (const k of Object.keys(out)) {
      if (BOOL_SUFFIX.test(k)) {
        const v = Number(out[k]);
        out[k] = Number.isFinite(v) ? (v ? 1 : 0) : 0;
        continue;
      }
      if (/comment_count$/.test(k)) {
        delete out[k];
      }
    }

    return out;
  });

  // -------- 2) Build key list --------
  const keySet = new Set();
  normalizedAll.forEach(r => Object.keys(r).forEach(k => keySet.add(k)));
  const keys = Array.from(keySet);

  // -------- 3) Pretty headers --------
  const labels = keys.map(k => labelForKey(k, nameStore));

  // -------- 4) Convert to CSV --------
  const csv = makeCsvWithPrettyHeaders(normalizedAll, keys, labels);

  // -------- 5) Trigger download --------
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${APP}_participants${projectId ? `_${projectId}` : ""}${feedId ? `_${feedId}` : ""}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}}
            disabled={!rows?.length}
            style={{ padding: compact ? ".25rem .6rem" : undefined }}
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* stats */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
        gap: statsGap,
        marginTop: compact ? ".5rem" : ".75rem"
      }}>
        <StatCard compact={compact} title="Total" value={nfCompact.format(summary?.counts?.total ?? (rows?.length || 0))} />
        <StatCard compact={compact} title="Completed" value={nfCompact.format(summary?.counts?.completed ?? 0)} sub={`${(((summary?.counts?.completionRate ?? 0) * 100).toFixed(1))}% completion`} />
        <StatCard compact={compact} title="Avg time to submit" value={ms(summary?.timing?.avgEnterToSubmit)} />
        <StatCard compact={compact} title="Median time to submit" value={ms(summary?.timing?.medEnterToSubmit)} />
        <StatCard compact={compact} title="Avg last interaction" value={ms(summary?.timing?.avgEnterToLastInteraction)} />
        <StatCard compact={compact} title="Median last interaction" value={ms(summary?.timing?.medEnterToLastInteraction)} />
      </div>

      {/* per-post toggle */}
      <div style={{ marginTop: compact ? ".6rem" : "1rem" }}>
        <button className="btn ghost" onClick={() => setShowPerPost(v => !v)} style={{ padding: compact ? ".25rem .6rem" : undefined }}>
          {showPerPost ? "Hide per-post interactions" : "Show per-post interactions"}
        </button>
      </div>

      {/* per-post table */}
      {showPerPost && perPostList.length > 0 && (
        <div style={{ marginTop: ".5rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fsTable }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left",  padding: padCell }}>Post ID</th>
                <th style={{ textAlign: "left",  padding: padCell }}>Name</th>
                <th style={{ textAlign: "right", padding: padCell }}>Reacted</th>
                <th style={{ textAlign: "right", padding: padCell }}>Expandable</th>
                <th style={{ textAlign: "right", padding: padCell }}>Expanded</th>
                <th style={{ textAlign: "right", padding: padCell }}>Commented</th>
                <th style={{ textAlign: "right", padding: padCell }}>Saved</th>
                <th style={{ textAlign: "right", padding: padCell }}>Shared</th>
                <th style={{ textAlign: "right", padding: padCell }}>Reported</th>
                <th style={{ textAlign: "right", padding: padCell }}>Avg dwell (s)</th>
              </tr>
            </thead>
            <tbody>
              {perPostList.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: padCell, fontFamily: "monospace" }}>{p.id}</td>
                  <td style={{ padding: padCell }}>{p.name || "—"}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.reacted)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.expandable)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.expanded)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.commented)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.saved)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.shared)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{nfCompact.format(p.reported)}</td>
                  <td style={{ padding: padCell, textAlign: "right" }}>{sShort(p.avgDwellS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* latest submissions */}
      <h5 style={{ margin: compact ? ".75rem 0 .4rem" : "1rem 0 .5rem", fontSize: compact ? ".95rem" : "1rem" }}>
        Latest submissions
      </h5>
      {visible.length === 0 ? (
        <div className="subtle" style={{ padding: ".5rem 0", fontSize: compact ? ".85rem" : ".9rem" }}>
          No submissions yet.
        </div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: fsTable }}>
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left",  padding: padCell }}>Participant</th>
                <th style={{ textAlign: "left",  padding: padCell }}>Submitted At</th>
                <th style={{ textAlign: "right", padding: padCell }}>Time to Submit</th>
                <th style={{ textAlign: "right", padding: padCell }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.session_id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: padCell, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.participant_id || "—"}
                  </td>
                  <td style={{ padding: padCell, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.submitted_at_iso || "—"}
                  </td>
                  <td style={{ padding: padCell, textAlign: "right" }}>
                    {ms(r.ms_enter_to_submit)}
                  </td>
                  <td style={{ padding: padCell, textAlign: "right" }}>
                    <button
                      className="btn ghost"
                      style={{ padding: compact ? ".25rem .6rem" : undefined }}
                      onClick={() => {
                        try {
                          const perPostHash = extractPerPostFromRosterRow(r) || {};
                          const names = nameStore;
const perPost = Object.entries(perPostHash).map(([post_id, rawAgg]) => {

  // --- IG → canonical mapping ---
  const mapIG = (agg) => {
    const out = { ...agg };

    // Like → reacted
    if (agg.like === 1) out.reacted = 1;

    // Comments
    if (agg.open_comments === 1 || agg.send_comment === 1) {
      out.expandable = 1;
      out.expanded = 1;
      out.commented = 1;
    }

    // Saved
    if (agg.save_post === 1) out.saved = 1;

    // Shared
    if (agg.send_share === 1) out.shared = 1;

    // Reported
    if (agg.menu_report === 1) out.reported = 1;

    return out;
  };

  const agg = mapIG(rawAgg);   // <-- normalize IG fields

  // --- dwell time (FB/IG both supported) ---
  const dwell_s = Number.isFinite(agg?.dwell_s)
    ? Number(agg.dwell_s)
    : Number.isFinite(agg?.dwell_ms)
      ? Number(agg.dwell_ms) / 1000
      : 0;

  // --- comment text (canonical) ---
  const rawComment = String(agg?.comment_text || "").trim();
  const hasRealComment = !!(rawComment && !/^[-—\s]+$/.test(rawComment));

  return {
    post_id,
    name: names[post_id] || "",
    reacted: Number(agg?.reacted) === 1,
    expandable: Number(agg?.expandable) === 1,
    expanded: Number(agg?.expanded) === 1,
    commented: Number(agg?.commented) === 1 || hasRealComment,
    saved: Number(agg?.saved) === 1,
    shared: Number(agg?.shared) === 1,
    reported: Number(agg?.reported) === 1,
    comment_text: rawComment,
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
                          alert("Failed to open details (see console).");
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

          {typeof limit !== "number" && visible.length < sorted.length && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: ".5rem" }}>
              <button
                className="btn"
                onClick={() => setPageSize((s) => Math.min(s + 25, sorted.length))}
                style={{ padding: compact ? ".3rem .75rem" : undefined }}
              >
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