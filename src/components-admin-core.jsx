// components-admin-core.jsx
import React, { useEffect, useState } from "react";
import {
  uid,
  REACTION_META,
  pravatar,
  randomAvatarUrl,
  randomSVG,
  uploadFileToS3ViaSigner,
  listFeedsFromBackend,
  getDefaultFeedFromBackend,
  setDefaultFeedOnBackend,
  savePostsToBackend,
  loadPostsFromBackend,
  wipeParticipantsOnBackend,
  deleteFeedOnBackend,
  getWipePolicyFromBackend,
  setWipePolicyOnBackend,
  uploadJsonToS3ViaSigner,
  hasAdminRole,       // viewer|editor|owner checks
  getAdminEmail,
  getAdminRole,
  startSessionWatch,
  getAdminSecondsLeft,
  touchAdminSession,
  buildFeedShareUrl
} from "./utils";

// ⬇️ updated imports after UI split
import { PostCard } from "./components-ui-posts";
import { Modal, LoadingOverlay } from "./components-ui-core";
import { ParticipantsPanel } from "./components-admin-parts";
import { randomAvatarByKind } from "./avatar-utils";
import { MediaFieldset } from "./components-admin-media";
// ✅ use your component name:
import { AdminUsersPanel } from "./components-admin-users";

/* -------- local helper: gender-neutral comic avatar (64px) ---------------- */
function genNeutralAvatarDataUrl(size = 64) {
  const s = size;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
  <defs>
    <clipPath id="r"><rect x="0" y="0" width="32" height="32" rx="16" ry="16"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="32" height="32" fill="#e5e7eb"/>
    <circle cx="16" cy="12.5" r="6" fill="#9ca3af"/>
    <rect x="5" y="20" width="22" height="10" rx="5" fill="#9ca3af"/>
  </g>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function RoleGate({ min = "viewer", children, elseRender = null }) {
  return hasAdminRole(min) ? children : (elseRender ?? null);
}


// Keep a small rotating local backup history (last 5)
function saveLocalBackup(feedId, app, posts) {
  try {
    const k = `backup::${app || "fb"}::${feedId}`;
    const list = JSON.parse(localStorage.getItem(k) || "[]");
    const entry = { t: new Date().toISOString(), posts };
    const next = [entry, ...list].slice(0, 5);
    localStorage.setItem(k, JSON.stringify(next));
  } catch {}
}

async function snapshotToS3({ posts, feedId, app = "fb" }) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${feedId}-${ts}.json`;
    // lives under backups/<app>/<feedId>/<timestamp>.json
    const { cdnUrl } = await uploadJsonToS3ViaSigner({
      data: { app, feedId, ts: new Date().toISOString(), posts },
      feedId,
      prefix: `backups/${app}/${feedId}`,
      filename
    });
    return cdnUrl;
  } catch (e) {
    console.warn("Backup to S3 failed (continuing):", e);
    return null;
  }
}

async function copyText(str) {
  try {
    await navigator.clipboard.writeText(str);
    alert("Link copied:\n\n" + str);
  } catch {
    // fallback if clipboard API fails
    prompt("Copy this URL:", str);
  }
}




/* ------------------------ Tiny admin stats fetcher ------------------------- */
async function fetchParticipantsStats(feedId) {
  try {
    const base = window.CONFIG?.API_BASE;
    const admin = window.ADMIN_TOKEN;
    if (!base || !admin) return null;
    const url = `${base}?path=participants_stats&feed_id=${encodeURIComponent(feedId)}&admin_token=${encodeURIComponent(admin)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json || null;
  } catch {
    return null;
  }
}

function msToMinSec(n) {
  if (n == null) return "—";
  const s = Math.round(Number(n) / 1000);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

/* ---------------------------- Posts local cache --------------------------- */
function getCachedPosts(feedId, checksum) {
  try {
    const k = `posts::${feedId}`;
    const meta = JSON.parse(localStorage.getItem(`${k}::meta`) || "null");
    if (!meta || meta.checksum !== checksum) return null;
    const data = JSON.parse(localStorage.getItem(k) || "null");
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}
function setCachedPosts(feedId, checksum, posts) {
  try {
    const k = `posts::${feedId}`;
    localStorage.setItem(k, JSON.stringify(posts || []));
    localStorage.setItem(`${k}::meta`, JSON.stringify({ checksum, t: Date.now() }));
  } catch {}
}

/* ------------------------------- UI Bits --------------------------------- */
function Section({ title, subtitle, right = null, children }) {
  return (
    <section className="card" style={{ padding: "1rem" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:".75rem", flexWrap:"wrap", marginBottom:".5rem" }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {subtitle && <div className="subtle" style={{ marginTop: 4 }}>{subtitle}</div>}
        </div>
        {!!right && <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" }}>{right}</div>}
      </div>
      {children}
    </section>
  );
}

function ChipToggle({ label, checked, onChange }) {
  return (
    <button
      className={`btn ghost ${checked ? "active" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{ borderRadius: 999, padding: ".35rem .7rem" }}
    >
      <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", marginRight:8, background: checked ? "var(--accent, #2563eb)" : "var(--line)" }} />
      {label}
    </button>
  );
}

/* ----------------------------- Admin Dashboard ---------------------------- */



export function AdminDashboard({
  posts, setPosts,
  randomize, setRandomize,
  showComposer, setShowComposer,
  resetLog,
  onPublishPosts, // optional override
  onLogout,
}) {

  const [sessExpiringSec, setSessExpiringSec] = useState(null); // number | null
const [sessExpired, setSessExpired] = useState(false);
const [touching, setTouching] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [participantsRefreshKey, setParticipantsRefreshKey] = useState(0);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAllFeeds, setShowAllFeeds] = useState(false);
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [ppOpen, setPpOpen] = useState(true);
// collapse + participants paging toggle
const [participantsCollapsed, setParticipantsCollapsed] = useState(false);
const [usersCollapsed, setUsersCollapsed] = useState(false);
const [showAllParticipants, setShowAllParticipants] = useState(false);

function IconChevron({ open }) {
  // ▾ (open) / ▸ (closed)
  return <span aria-hidden="true" style={{ fontSize: 16 }}>{open ? "▾" : "▸"}</span>;
}
function IconBtn({ title, onClick }) {
  return (
    <button
      className="btn ghost"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{ padding: ".15rem .35rem", minWidth: 0 }}
    >
      {title.includes("collapse") || title.includes("expand") ? null : null}
    </button>
  );
}

  // --- NEW: wipe-on-change global policy
  const [wipeOnChange, setWipeOnChange] = useState(null);     // null = unknown yet
  const [updatingWipe, setUpdatingWipe] = useState(false);

  const [feeds, setFeeds] = useState([]);
  const [feedId, setFeedId] = useState("");
  const [feedName, setFeedName] = useState("");
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [defaultFeedId, setDefaultFeedId] = useState(null);

  const [feedStats, setFeedStats] = useState({});
  const loadStatsFor = async (id) => {
    if (!id || feedStats[id]) return;
    const s = await fetchParticipantsStats(id);
    setFeedStats((m) => ({ ...m, [id]: s || { total: 0, submitted: 0, avg_ms_enter_to_submit: null } }));
  };

  const keepAlive = async () => {
    try {
      setTouching(true);
      const res = await touchAdminSession();
      if (res?.ok) {
        const left = getAdminSecondsLeft();
        if (left != null && left > 120) setSessExpiringSec(null);
        setSessExpired(false);
        return;
      }
      setSessExpired(true);
    } catch {
      setSessExpired(true);
    } finally {
      setTouching(false);
    }
  };

useEffect(() => {
  // warn 2 minutes before expiry; tick every second
  const stop = startSessionWatch({
    warnAtSec: 120,
    tickMs: 1000,
    onExpiring: (leftSec) => setSessExpiringSec(leftSec),
    onExpired: () => { setSessExpired(true); setSessExpiringSec(0); },
  });
  return stop;
}, []);

useEffect(() => {
  if (isSaving) return;
  // when you finish saving, recompute seconds left (just for snappier UI)
  const left = getAdminSecondsLeft();
  if (left != null && left > 120) setSessExpiringSec(null);
}, [isSaving]);

useEffect(() => {
  let alive = true;
  (async () => {
    setFeedsLoading(true);
    const [list, backendDefault] = await Promise.all([
      listFeedsFromBackend(),
      getDefaultFeedFromBackend(),
    ]);
    if (!alive) return;

    const feedsList = Array.isArray(list) ? list : [];
    setFeeds(feedsList);
    setDefaultFeedId(backendDefault || null);

    // Admin ignores URL; prefer backend default, else first feed
    const chosen =
      feedsList.find(f => f.feed_id === backendDefault) ||
      feedsList[0] ||
      null;

    if (chosen) {
      setFeedId(chosen.feed_id);
      setFeedName(chosen.name || chosen.feed_id);
      const cached = getCachedPosts(chosen.feed_id, chosen.checksum);
     if (cached) {
       setPosts(cached);
     } else {
       const fresh = await loadPostsFromBackend(chosen.feed_id, { force: true });
       const arr = Array.isArray(fresh) ? fresh : [];
       setPosts(arr);
       setCachedPosts(chosen.feed_id, chosen.checksum, arr);
     }
    } else {
      setFeedId("feed_1");
      setFeedName("Feed 1");
      setPosts([]);
    }
    setFeedsLoading(false);
  })();
  return () => { alive = false; };
}, []);


  useEffect(() => {
    if (!isSaving) return;
    const prevOverflow = document.body.style.overflow;
    const prevCursor = document.body.style.cursor;

    document.body.style.overflow = "hidden";
    document.body.style.cursor = "progress";
    document.body.setAttribute("aria-busy", "true");

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.cursor = prevCursor;
      document.body.removeAttribute("aria-busy");
    };
  }, [isSaving]);

  const selectFeed = async (id) => {
    const row = feeds.find(f => String(f.feed_id) === String(id));
    setFeedId(id);
    setFeedName(row?.name || id);

    const cached = row ? getCachedPosts(id, row.checksum) : null;
    if (cached) {
      setPosts(cached);
      return;
    }
    const fresh = await loadPostsFromBackend(id, { force: true });
    const arr = Array.isArray(fresh) ? fresh : [];
    setPosts(arr);
    if (row) setCachedPosts(id, row.checksum, arr);
  };

  const createNewFeed = () => {
    const id = prompt("New feed ID (letters/numbers/underscores):", `feed_${(feeds.length || 0) + 1}`);
    if (!id) return;
    const name = prompt("Optional feed name (shown in admin):", id) || id;
    setFeedId(id);
    setFeedName(name);
    setPosts([]);
    setFeeds(prev => {
      const exists = prev.some(f => String(f.feed_id) === String(id));
      return exists ? prev : [{ feed_id: id, name, checksum: "", updated_at: "" }, ...prev];
    });
  };

  const openNew = () => {
    setIsNew(true);
    const avatarRandomKind = "any";
    setEditing({
      id: uid(),
      author: "",
      time: "Just now",
      showTime: true,            // NEW
      text: "",
      links: [],
      badge: false,

      avatarMode: "random",
      avatarRandomKind,
      avatarUrl: randomAvatarByKind(avatarRandomKind, "new", "", randomAvatarUrl),

      // media defaults
      imageMode: "none",
      image: null,

      videoMode: "none",
      video: null,
      videoPosterUrl: "",
      videoAutoplayMuted: true,
      videoShowControls: true,
      videoLoop: false,

      interventionType: "none",
      noteText: "",
      showReactions: false,
      selectedReactions: ["like"],
      reactions: { like: 0, love: 0, care: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
      metrics: { comments: 0, shares: 0 },

      adType: "none",
      adDomain: "",
      adHeadline: "",
      adSubheadline: "",
      adButtonText: "",
    });
  };
  const openEdit = (p) => { setIsNew(false); setEditing({ ...p, showTime: p.showTime !== false }); };

  const removePost = (id) => {
    if (!confirm("Delete this post?")) return;
    setPosts((arr) => arr.filter((p) => p.id !== id));
  };

  const saveEditing = () => {
    if (!editing.author?.trim()) { alert("Author is required."); return; }
    if (!editing.text?.trim()) { alert("Post text is required."); return; }

    setPosts((arr) => {
      const idx = arr.findIndex((p) => p.id === editing.id);
      const clean = { ...editing };

      // keep avatar in sync for company logos
      if (clean.avatarMode === "random" && !clean.avatarUrl) {
        clean.avatarUrl = randomAvatarByKind(clean.avatarRandomKind || "any", clean.id || clean.author || "seed", clean.author || "", randomAvatarUrl);
      }
      if (clean.avatarMode === "random" && clean.avatarRandomKind === "company") {
        clean.avatarUrl = randomAvatarByKind("company", clean.id || clean.author || "seed", clean.author || "");
      }
      // NEW: neutral mode always generates data URL
      if (clean.avatarMode === "neutral") {
        clean.avatarUrl = genNeutralAvatarDataUrl(64);
      }

      // Enforce mutual exclusivity: image OR video
      if (clean.videoMode !== "none") {
        clean.imageMode = "none";
        clean.image = null;
      } else if (clean.imageMode !== "none") {
        clean.videoMode = "none";
        clean.video = null;
        clean.videoPosterUrl = "";
      }

      if (clean.imageMode === "none") clean.image = null;
      if (clean.imageMode === "random" && !clean.image) clean.image = randomSVG("Image");

      // default showTime true if field missing
      if (typeof clean.showTime === "undefined") clean.showTime = true;

      return idx === -1 ? [...arr, clean] : arr.map((p, i) => (i === idx ? clean : p));
    });
    setEditing(null);
  };

  const clearFeed = () => {
    if (!posts.length) return;
    if (!confirm("Delete ALL posts from this feed? This cannot be undone.")) return;
    setPosts([]);
  };

  return (
    <div className="admin-shell" style={{ display: "grid", gap: "1rem" }}>


      {sessExpiringSec != null && !sessExpired && (
  <div role="status" className="admin-banner">
    <div className="title">
      <span>Admin session is expiring</span>
      <span className="subtle">
        (~{Math.max(0, Math.floor(sessExpiringSec / 60))}m {String(sessExpiringSec % 60).padStart(2,"0")}s left)
      </span>
    </div>
    <div className="actions">
      <button className="btn ghost" onClick={() => setSessExpiringSec(null)}>Dismiss</button>
      <button className="btn" onClick={keepAlive} disabled={touching}>
        {touching ? "Refreshing…" : "Stay signed in"}
      </button>
    </div>
  </div>
)}

      {feedsLoading && (
        <LoadingOverlay
          title="Loading dashboard…"
          subtitle="Fetching feeds and posts from backend"
        />
      )}

      <Section
        title="Admin Dashboard"
        subtitle={`Signed in as ${getAdminEmail() || "unknown"} · role: ${getAdminRole() || "viewer"}`}
        right={<button className="btn ghost" onClick={onLogout} title="Sign out of the admin session">Log out</button>}
      />

      <div style={{ display:"grid", gap:"1rem", gridTemplateColumns:"minmax(0,1fr)" }} className="admin-grid">
       {/* Feeds */}
<Section
  title={`Feeds (${feeds.length || 0})`}
  subtitle="Keep the UI minimal: choose the editing feed via dropdown. By default, only the Default and Loaded feeds are shown; expand to see all."
  right={
    <>
      {/* Editing feed dropdown (replaces the old 'Editing:' chip) */}
      <div className="feed-picker" style={{ display:"flex", alignItems:"center", gap:".5rem" }}>
        <span className="subtle">Editing:</span>
        <select
          className="select"
          value={feedId || ""}
          onChange={(e) => selectFeed(e.target.value)}
          title="Choose which feed to load into the editor"
          style={{ minWidth: 220 }}
        >
          {feeds.map((f) => (
            <option key={f.feed_id} value={f.feed_id}>
              {(f.name || f.feed_id)}{f.feed_id === defaultFeedId ? " (default)" : ""}
            </option>
          ))}
        </select>

        <button
          className="btn ghost"
          onClick={() => setShowAllFeeds(v => !v)}
          title={showAllFeeds ? "Hide full list and show only Default + Loaded" : "Show all feeds in the registry"}
        >
          {showAllFeeds ? "Hide full list" : "All feeds…"}
        </button>
      </div>

      <RoleGate min="editor">
        <button className="btn ghost" onClick={createNewFeed}>+ New feed</button>
      </RoleGate>

      <button
        className="btn"
        onClick={async () => {
          setFeedsLoading(true);
          const [list, backendDefault] = await Promise.all([
            listFeedsFromBackend(),
            getDefaultFeedFromBackend()
          ]);
          setFeeds(Array.isArray(list) ? list : []);
          setDefaultFeedId(backendDefault || null);
          try {
            const policy = await getWipePolicyFromBackend();
            if (policy !== null) setWipeOnChange(!!policy);
          } catch {}
          setFeedsLoading(false);
        }}
        title="Reload feed registry from backend"
      >
        Refresh Feeds
      </button>

      <RoleGate min="owner">
        <button
          className={`btn ghost ${wipeOnChange ? "active" : ""}`}
          disabled={updatingWipe || wipeOnChange === null}
          title="When ON, publishing posts that change the checksum wipes that feed’s participants."
          onClick={async () => {
            if (wipeOnChange === null) return;
            try {
              setUpdatingWipe(true);
              const next = !wipeOnChange;
              const res = await setWipePolicyOnBackend(next);
              if (res?.ok) {
                setWipeOnChange(!!res.wipe_on_change);
              } else {
                alert(res?.err || "Failed to update policy");
              }
            } finally {
              setUpdatingWipe(false);
            }
          }}
        >
          {wipeOnChange ? "Wipe on change: ON" : "Wipe on change: OFF"}
        </button>
      </RoleGate>
    </>
  }
>
  <div style={{ overflowX: "auto" }}>
    <table style={{ width:"100%", borderCollapse:"collapse" }}>
      <thead>
        <tr className="subtle" style={{ textAlign:"left" }}>
          <th style={{ padding: ".4rem .5rem", width: 36 }} />
          <th style={{ padding: ".4rem .5rem", minWidth: 100 }}>Name</th>
          <th style={{ padding: ".4rem .5rem", minWidth: 100 }}>ID</th>
          <th style={{ padding: ".4rem .5rem", minWidth: 80 }}>Updated</th>
          <th style={{ padding: ".4rem .5rem", textAlign: "center" }}>Total</th>
          <th style={{ padding: ".4rem .5rem", textAlign: "center" }}>Submitted</th>
          <th style={{ padding: ".4rem .5rem", textAlign: "center"}}>Avg (m:ss)</th>
          <th style={{ padding: ".4rem .5rem", minWidth: 420 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {(() => {
          // Only show Default + Loaded unless expanded
          const importantIds = Array.from(new Set([defaultFeedId, feedId].filter(Boolean)));
          const visible = showAllFeeds
            ? feeds
            : feeds.filter(f => importantIds.includes(f.feed_id));

          // If there are no feeds yet
          if (!visible.length) {
            return (
              <tr>
                <td colSpan={8} className="subtle" style={{ padding: ".75rem" }}>
                  No feeds yet. Click "+ New feed" to create one, then use "Save" to publish posts into it.
                </td>
              </tr>
            );
          }

          return visible.map((f) => {
            const isDefault = f.feed_id === defaultFeedId;
            const isLoaded = f.feed_id === feedId;
            const stats = feedStats[f.feed_id];

            return (
              <tr
                key={f.feed_id}
                className={`feed-row ${isLoaded ? "is-loaded" : ""} ${isDefault ? "is-default" : ""}`}
                style={{ borderTop: "1px solid var(--line)" }}
                aria-current={isLoaded ? "true" : undefined}
              >
                <td style={{ padding: ".5rem .5rem" }}>
                  <span className="feed-dot" aria-hidden="true" />
                </td>
                <td style={{ padding: ".5rem .5rem", fontWeight: 600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {f.name || f.feed_id} {isDefault ? <span className="subtle">· default</span> : null}
                  {isLoaded && !isDefault ? <span className="subtle"> · loaded</span> : null}
                </td>
                <td style={{ padding: ".5rem .5rem", fontFamily: "monospace" }}>{f.feed_id}</td>
                <td style={{ padding: ".5rem .5rem" }}>
                  <span className="subtle">{f.updated_at ? new Date(f.updated_at).toLocaleString() : "—"}</span>
                </td>

                <td style={{ padding: ".5rem .5rem", textAlign: "center" }}>{stats ? stats.total : "—"}</td>
                <td style={{ padding: ".5rem .5rem", textAlign: "center" }}>{stats ? stats.submitted : "—"}</td>
                <td style={{ padding: ".5rem .5rem", textAlign: "center" }}>
                  {stats && stats.avg_ms_enter_to_submit != null ? msToMinSec(stats.avg_ms_enter_to_submit) : "—"}
                </td>

                <td style={{ padding: ".5rem .5rem" }}>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:".4rem", alignItems:"center" }}>
                    <button
                      className="btn"
                      title="Load this feed into the editor"
                      onClick={() => selectFeed(f.feed_id)}
                      disabled={isLoaded}
                    >
                      Load
                    </button>

                    <RoleGate min="editor">
                      <button
                        className="btn"
                        title="Make this the backend default feed"
                        onClick={async () => {
                          const ok = await setDefaultFeedOnBackend(f.feed_id);
                          if (ok) setDefaultFeedId(f.feed_id);
                        }}
                        disabled={isDefault}
                      >
                        Default
                      </button>

                      <button
                        className="btn"
                        disabled={isSaving}
                        title="Save CURRENT editor posts into this feed"
                        onClick={async () => {
                          if (f.feed_id !== feedId) {
                            const proceed = confirm(
                              `You are about to SAVE the CURRENT editor posts (for "${feedName || feedId}") INTO a DIFFERENT feed ("${f.name || f.feed_id}").\n\nThis may overwrite that feed. Continue?`
                            );
                            if (!proceed) return;
                          }

                          setIsSaving(true);
                          try {
                            saveLocalBackup(feedId, "fb", posts);
                            await snapshotToS3({ posts, feedId, app: "fb" });
                            const ok = await savePostsToBackend(posts, {
                              feedId: f.feed_id,
                              name: f.name || f.feed_id,
                              app: "fb",
                            });
                            if (ok) {
                              const list = await listFeedsFromBackend();
                              const nextFeeds = Array.isArray(list) ? list : [];
                              setFeeds(nextFeeds);
                              const row = nextFeeds.find((x) => x.feed_id === f.feed_id);
                              if (row) {
                                const fresh = await loadPostsFromBackend(f.feed_id, { force: true });
                                const arr = Array.isArray(fresh) ? fresh : [];
                                setPosts(arr);
                                setCachedPosts(f.feed_id, row.checksum, arr);
                              }
                              alert("Feed saved (snapshot created).");
                            } else {
                              alert("Failed to save feed. A local snapshot was still created.");
                            }
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                    </RoleGate>

                    {!stats && (
                      <button
                        className="btn ghost"
                        title="Load participant stats for this feed"
                        onClick={() => loadStatsFor(f.feed_id)}
                      >
                        Load stats
                      </button>
                    )}

                    <button
  className="btn ghost"
  title="Copy participant link for this feed"
  onClick={async () => {
    if (!f?.feed_id) { alert("Missing feed_id for this row"); return; }
    const url = (typeof buildFeedShareUrl === "function")
      ? buildFeedShareUrl(f) // ← pass the whole feed row, not f.feed_id
      : `${window.location.origin}/#/?feed=${encodeURIComponent(f.feed_id)}`;
    await navigator.clipboard.writeText(url).catch(()=>{});
    alert("Link copied:\n" + url);
  }}
>
  Copy link
</button>

                    <RoleGate min="owner">
                      <button
                        className="btn ghost danger"
                        title="Delete the entire feed (posts, participants, registry)"
                        onClick={async () => {
                          const okGo = confirm(`Delete feed "${f.name || f.feed_id}"?\n\nThis removes posts, participants, and cannot be undone.`);
                          if (!okGo) return;
                          const ok = await deleteFeedOnBackend(f.feed_id);
                          if (ok) {
                            if (f.feed_id === feedId) {
                              const next = feeds.filter(x => x.feed_id !== f.feed_id);
                              const nextSel = next[0] || null;
                              setFeeds(next);
                              if (nextSel) {
                                await selectFeed(nextSel.feed_id);
                              } else {
                                setFeedId(""); setFeedName(""); setPosts([]);
                              }
                            } else {
                              setFeeds(prev => prev.filter(x => x.feed_id !== f.feed_id));
                            }
                            if (defaultFeedId === f.feed_id) setDefaultFeedId(null);
                            alert("Feed deleted.");
                          } else {
                            alert("Failed to delete feed. Please re-login and try again.");
                          }
                        }}
                      >
                        Delete
                      </button>
                    </RoleGate>
                  </div>
                </td>
              </tr>
            );
          });
        })()}
      </tbody>
    </table>
  </div>
</Section>

<Section
  title="Participants"
  subtitle={
    <>
      <span>Live snapshot & interaction aggregates for </span>
      <code style={{ fontSize: ".9em" }}>{feedId || "—"}</code>
      {defaultFeedId === feedId && <span className="subtle"> · default</span>}
    </>
  }
  right={
    <div style={{ display:"flex", gap:".4rem", alignItems:"center", flexWrap:"wrap" }}>
      {/* Show first 5 / all toggle */}
      <button
        className="btn ghost"
        onClick={() => setShowAllParticipants(s => !s)}
        title={showAllParticipants ? "Show only the first 5 participants" : "Show all participants"}
      >
        {showAllParticipants ? "Show first 5" : "Show all"}
      </button>

      <RoleGate min="owner">
        <button
          className="btn ghost danger"
          title="Delete the participants sheet for this feed (cannot be undone)"
          onClick={async () => {
            if (!feedId) return;
            const okGo = confirm(
              `Wipe ALL participants for feed "${feedName || feedId}"?\n\nThis deletes the sheet and cannot be undone.`
            );
            if (!okGo) return;
            const ok = await wipeParticipantsOnBackend(feedId);
            if (ok) {
              setParticipantsRefreshKey(k => k + 1);
              alert("Participants wiped.");
            } else {
              alert("Failed to wipe participants. Please re-login and try again.");
              onLogout?.();
            }
          }}
        >
          Wipe
        </button>
      </RoleGate>

      {/* Chevron — icon-only, top-right; does not replace heading */}
      <button
        className="btn ghost"
        onClick={() => setParticipantsCollapsed(v => !v)}
        aria-label={participantsCollapsed ? "Expand participants" : "Collapse participants"}
        title={participantsCollapsed ? "Expand" : "Collapse"}
        style={{ padding: ".15rem .35rem", minWidth: 0 }}
      >
        <IconChevron open={!participantsCollapsed} />
      </button>
    </div>
  }
>
  {/* Body collapses, header stays */}
  {!participantsCollapsed ? (
    feedId ? (
      <ParticipantsPanel
        key={`pp::${feedId}::${participantsRefreshKey}`}
        feedId={feedId}
        compact
        limit={showAllParticipants ? undefined : 5}
      />
    ) : (
      <div className="subtle" style={{ padding: ".5rem 0" }}>
        No feed selected.
      </div>
    )
  ) : null}
</Section>
       
{/* Posts (compact-only) */}
<Section
  title={`Posts (${posts.length})`}
  subtitle={
    showAllPosts
      ? "Compact list of all posts."
      : `Compact list · showing first ${Math.min(5, posts.length)}`
  }
  right={
    <>
      <button
        className="btn"
        onClick={async () => {
          const fresh = await loadPostsFromBackend(feedId, { force: true });
          const arr = Array.isArray(fresh) ? fresh : [];
          setPosts(arr);
          const row = feeds.find(f => f.feed_id === feedId);
          if (row) setCachedPosts(feedId, row.checksum, arr);
        }}
        title="Reload posts for this feed from backend"
      >
        Refresh Posts
      </button>

      <button
        className="btn ghost"
        title="Export current posts as JSON"
        onClick={() => {
          const payload = { app: "fb", feedId, ts: new Date().toISOString(), posts };
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${feedId}-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }}
      >
        Export JSON
      </button>

      <label className="btn ghost" title="Import posts from a JSON backup" style={{ cursor: "pointer" }}>
        Import JSON
        <input
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const text = await f.text();
              const parsed = JSON.parse(text);
              const imported = Array.isArray(parsed) ? parsed : (parsed.posts || []);
              if (!Array.isArray(imported)) { alert("This file doesn't look like a posts backup."); return; }
              if (!confirm(`Replace current editor posts (${posts.length}) with imported posts (${imported.length})?`)) return;
              setPosts(imported);
              alert("Imported. Remember to Save to publish back to the backend.");
            } catch (err) {
              console.error(err);
              alert("Failed to import JSON.");
            } finally {
              e.target.value = "";
            }
          }}
        />
      </label>

      {/* NEW: show first 5 vs all */}
      <button
        className="btn ghost"
        onClick={() => setShowAllPosts(s => !s)}
        title={showAllPosts ? "Show only the first 5 posts" : "Show all posts"}
      >
        {showAllPosts ? "Show first 5" : `Show all (${posts.length})`}
      </button>

      <RoleGate min="editor">
        <ChipToggle label="Randomize order" checked={!!randomize} onChange={setRandomize} />
        <button className="btn" onClick={() => { const p = makeRandomPost(); setIsNew(true); setEditing(p); }} title="Generate a synthetic post">
          + Random Post
        </button>
        <button className="btn ghost" onClick={openNew}>+ Add Post</button>
        <button className="btn ghost danger" onClick={clearFeed} disabled={!posts.length} title="Delete all posts from this feed">
          Clear Feed
        </button>
      </RoleGate>
    </>
  }
>
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr className="subtle">
          <th style={{ textAlign:"left", padding: ".4rem .5rem", width: 36 }} />
          <th style={{ textAlign:"left", padding: ".4rem .5rem", minWidth: 140 }}>Author</th>
          <th style={{ textAlign:"left", padding: ".4rem .5rem", minWidth: 80 }}>Time</th>
          <th style={{ textAlign:"left", padding: ".4rem .5rem", minWidth: 280 }}>Text</th>
          <th style={{ textAlign:"center", padding: ".4rem .5rem", minWidth: 120 }}>Meta</th>
          <th style={{ textAlign:"left", padding: ".4rem .5rem", minWidth: 220 }}>ID</th>
          <th style={{ textAlign:"left", padding: ".4rem .5rem", minWidth: 200 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {(showAllPosts ? posts : posts.slice(0, 5)).map((p) => (
          <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
            <td style={{ padding: ".4rem .5rem", verticalAlign: "middle" }}>
              <div className="avatar" style={{ width: 28, height: 28 }}>
                <img className="avatar-img" alt="" src={p.avatarUrl || pravatar(7)} style={{ width: 28, height: 28 }} />
              </div>
            </td>
            <td
              style={{
                padding: ".4rem .5rem",
                whiteSpace:"nowrap",
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
              onClick={() => setEditing({
                ...p,
                showTime: p.showTime !== false,
                avatarUrl:
                  p.avatarMode === "random" && p.avatarRandomKind === "company"
                    ? randomAvatarByKind("company", p.id || p.author || "seed", p.author || "")
                    : (p.avatarMode === "neutral" ? genNeutralAvatarDataUrl(64) : p.avatarUrl)
              })}
              title="Click to edit"
            >
              <span style={{ fontWeight: 600, cursor:"pointer" }}>{p.author || "—"}</span>
              {p.badge && <span className="badge" aria-label="verified" style={{ marginLeft: 6 }} />}
            </td>
            <td style={{ padding: ".4rem .5rem", whiteSpace:"nowrap" }}>
              {p.showTime !== false && p.time ? p.time : "—"}
            </td>
            <td
              style={{
                padding: ".4rem .5rem",
                color: "#374151",
                maxWidth: 420,
                overflow:"hidden",
                textOverflow:"ellipsis",
                whiteSpace:"nowrap",
                cursor:"pointer"
              }}
              onClick={() => setEditing({
                ...p,
                showTime: p.showTime !== false,
                avatarUrl:
                  p.avatarMode === "random" && p.avatarRandomKind === "company"
                    ? randomAvatarByKind("company", p.id || p.author || "seed", p.author || "")
                    : (p.avatarMode === "neutral" ? genNeutralAvatarDataUrl(64) : p.avatarUrl)
              })}
              title="Click to edit"
            >
              {p.text || "—"}
            </td>
            <td style={{ padding: ".4rem .5rem", textAlign: "center", whiteSpace:"nowrap" }}>
              {p.adType === "ad" ? "Sponsored" : "Organic"} ·{" "}
              {p.interventionType === "label" ? "Label" : p.interventionType === "note" ? "Note" : "None"}
            </td>
            <td style={{ padding: ".4rem .5rem", fontFamily: "monospace", maxWidth: 260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {p.id}
            </td>
            <td style={{ padding: ".4rem .5rem" }}>
              <div style={{ display:"flex", gap: ".35rem", flexWrap:"wrap" }}>
                <RoleGate min="editor">
                  <button
                    className="btn ghost"
                    title="Edit post"
                    onClick={() => setEditing({
                      ...p,
                      showTime: p.showTime !== false,
                      avatarUrl:
                        p.avatarMode === "random" && p.avatarRandomKind === "company"
                          ? randomAvatarByKind("company", p.id || p.author || "seed", p.author || "")
                          : (p.avatarMode === "neutral" ? genNeutralAvatarDataUrl(64) : p.avatarUrl)
                    })}
                  >
                    Edit
                  </button>
                  <button className="btn ghost danger" title="Delete post" onClick={() => removePost(p.id)}>
                    Delete
                  </button>
                </RoleGate>
              </div>
            </td>
          </tr>
        ))}
        {!posts.length && (
          <tr>
            <td colSpan={7} className="subtle" style={{ padding: ".6rem" }}>
              No posts yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</Section>
      </div>

       {/* Users (owners only) */}
        <RoleGate min="owner">
          <Section title="Users" subtitle="Manage admin users & roles.">
            <AdminUsersPanel />
          </Section>
        </RoleGate>


      {editing && (
        <Modal
          title={isNew ? "Add Post" : "Edit Post"}
          onClose={() => setEditing(null)}
          wide
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <RoleGate min="editor" elseRender={<button className="btn" disabled title="Viewer mode">Save</button>}>
                <button className="btn primary" onClick={saveEditing}>{isNew ? "Add" : "Save"}</button>
              </RoleGate>
            </>
          }
        >
          <div className="editor-grid">
            <div className="editor-form">
              <h4 className="section-title">Basics</h4>
              <label>Author
                <input
                  className="input"
                  value={editing.author}
                  onChange={(e) => {
                    const author = e.target.value;
                    setEditing(ed => ({
                      ...ed,
                      author,
                      avatarUrl:
                        ed.avatarMode === "random" && ed.avatarRandomKind === "company"
                          ? randomAvatarByKind("company", ed.id || author || "seed", author || "")
                          : (ed.avatarMode === "neutral" ? genNeutralAvatarDataUrl(64) : ed.avatarUrl)
                    }));
                  }}
                />
              </label>
              <div className="grid-2">
                <label>Verification badge
                  <select className="select" value={String(!!editing.badge)} onChange={(e) => setEditing({ ...editing, badge: e.target.value === "true" })}>
                    <option value="false">Off</option>
                    <option value="true">On</option>
                  </select>
                </label>
                <label>Time
                  <input className="input" value={editing.time} onChange={(e) => setEditing({ ...editing, time: e.target.value })} />
                  <div className="subtle" style={{ marginTop: 6 }}>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={editing.showTime !== false}
                        onChange={(e) => setEditing({ ...editing, showTime: !!e.target.checked })}
                      /> Show time
                    </label>
                  </div>
                </label>
              </div>
              <label>Post text
                <textarea className="textarea" rows={5} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
              </label>

              <h4 className="section-title">Profile Photo</h4>
              <fieldset className="fieldset">
                <div className="grid-2">
                  <label>Mode
                    <select
                      className="select"
                      value={editing.avatarMode}
                      onChange={(e) => {
                        const m = e.target.value;
                        let url = editing.avatarUrl;
                        if (m === "random") {
                          const kind = editing.avatarRandomKind || "any";
                          url = randomAvatarByKind(kind, editing.id || editing.author || "seed", editing.author || "", randomAvatarUrl);
                        } else if (m === "neutral") {
                          url = genNeutralAvatarDataUrl(64);
                        }
                        if (m === "upload") url = "";
                        if (m === "url")    url = editing.avatarUrl || "";
                        setEditing({ ...editing, avatarMode: m, avatarUrl: url });
                      }}
                    >
                      <option value="random">Random avatar</option>
                      <option value="neutral">Neutral avatar</option>
                      <option value="upload">Upload image</option>
                      <option value="url">Direct URL</option>
                    </select>
                  </label>
                  <div className="avatar-preview">
                    <div className="avatar"><img className="avatar-img" alt="" src={editing.avatarUrl || pravatar(8)} /></div>
                  </div>
                </div>

                {editing.avatarMode === "random" && (
                  <label>Random type
                    <select
                      className="select"
                      value={editing.avatarRandomKind || "any"}
                      onChange={(e) => {
                        const kind = e.target.value;
                        const url = randomAvatarByKind(kind, editing.id || editing.author || "seed", editing.author || "", randomAvatarUrl);
                        setEditing({ ...editing, avatarRandomKind: kind, avatarUrl: url });
                      }}
                    >
                      <option value="any">Any</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="company">Company logo</option>
                    </select>
                  </label>
                )}

                {editing.avatarMode === "url" && (
                  <label>Avatar URL
                    <input className="input" value={editing.avatarUrl || ""} onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })} />
                  </label>
                )}
                {editing.avatarMode === "upload" && (
  <label>Upload avatar
    <input
      type="file"
      accept="image/*"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;

        const headerEl = document.querySelector(".modal h3, .section-title");
        const restoreTitle = () => {
          if (headerEl) headerEl.textContent = isNew ? "Add Post" : "Edit Post";
        };
        const setPct = (pct) => {
          if (headerEl && typeof pct === "number") {
            headerEl.textContent = `Uploading… ${pct}%`;
          }
        };

        try {
          if (headerEl) headerEl.textContent = "Uploading… 0%";

          const { cdnUrl } = await uploadFileToS3ViaSigner({
            file: f,
            feedId: feedId || "global",
            prefix: "avatars",
            onProgress: setPct,
          });

          restoreTitle();

          setEditing((ed) => ({
            ...ed,
            avatarMode: "url",
            avatarUrl: cdnUrl,
          }));

          alert("Avatar uploaded ✔");
        } catch (err) {
          console.error("Avatar upload failed", err);
          alert(String(err?.message || "Avatar upload failed."));
          restoreTitle();
        } finally {
          e.target.value = ""; // allow re-pick
        }
      }}
    />
  </label>
)}

              </fieldset>

              {/* ----------------------- MEDIA (moved to its own file) ----------------------- */}
              <MediaFieldset
                editing={editing}
                setEditing={setEditing}
                feedId={feedId}
                isNew={isNew}
                setUploadingVideo={setUploadingVideo}
                setUploadingPoster={setUploadingPoster}
              />

              <h4 className="section-title">Ad</h4>
              <fieldset className="fieldset">
                <label>Ad type
                  <select className="select" value={editing.adType || "none"} onChange={(e) => setEditing({ ...editing, adType: e.target.value })}>
                    <option value="none">None</option>
                    <option value="ad">Sponsored Ad</option>
                  </select>
                </label>

                {editing.adType === "ad" && (
                  <>
                    <label>Domain / URL
                      <input className="input" value={editing.adDomain || ""} onChange={(e) => setEditing({ ...editing, adDomain: e.target.value })} placeholder="www.example.com" />
                    </label>
                    <label>Headline
                      <input className="input" value={editing.adHeadline || ""} onChange={(e) => setEditing({ ...editing, adHeadline: e.target.value })} placeholder="Free Shipping" />
                    </label>
                    <label>Subheadline
                      <input className="input" value={editing.adSubheadline || ""} onChange={(e) => setEditing({ ...editing, adSubheadline: e.target.value })} placeholder="Product sub copy here" />
                    </label>
                    <label>Button Text
                      <input className="input" value={editing.adButtonText || ""} onChange={(e) => setEditing({ ...editing, adButtonText: e.target.value })} placeholder="Shop now" />
                    </label>
                  </>
                )}
              </fieldset>

              <h4 className="section-title">Intervention</h4>
              <fieldset className="fieldset">
                <label>Type
                  <select className="select" value={editing.interventionType} onChange={(e) => setEditing({ ...editing, interventionType: e.target.value })}>
                    <option value="none">None</option>
                    <option value="label">False info label</option>
                    <option value="note">Context note</option>
                  </select>
                </label>
                {editing.interventionType === "note" && (
                  <label>Note text
                    <input className="input" value={editing.noteText || ""} onChange={(e) => setEditing({ ...editing, noteText: e.target.value })} />
                  </label>
                )}
              </fieldset>

              <h4 className="section-title">Reactions & Metrics</h4>
              <fieldset className="fieldset">
                <label>Show reactions
                  <select className="select" value={String(!!editing.showReactions)} onChange={(e) => setEditing({ ...editing, showReactions: e.target.value === "true" })}>
                    <option value="false">Hide</option>
                    <option value="true">Show</option>
                  </select>
                </label>

                <div className="subtle">Display these reactions</div>
                <div className="rx-pills">
                  {Object.keys(REACTION_META).map((key) => {
                    const checked = (editing.selectedReactions || []).includes(key);
                    return (
                      <label key={key} className={`pill ${checked ? "active" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const prev = new Set(editing.selectedReactions || []);
                            e.target.checked ? prev.add(key) : prev.delete(key);
                            setEditing({ ...editing, selectedReactions: Array.from(prev) });
                          }}
                        />
                          <span className="emoji">{REACTION_META[key].emoji}</span>
                          <span>{REACTION_META[key].label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="grid-3">
                  {Object.keys(REACTION_META).map((key) => (
                    <label key={key}>
                      {REACTION_META[key].label}
                      <input
                        className="input"
                        type="number" min="0" inputMode="numeric" placeholder="0"
                        value={Number(editing.reactions?.[key] || 0) === 0 ? "" : editing.reactions?.[key]}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const v = e.target.value === "" ? 0 : Number(e.target.value);
                          setEditing((ed) => ({ ...ed, reactions: { ...(ed.reactions || {}), [key]: v } }));
                        }}
                      />
                    </label>
                  ))}
                </div>

                <div className="grid-2">
                  <label>Comments
                    <input
                      className="input"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="0"
                      value={(editing.metrics?.comments ?? 0) === 0 ? "" : editing.metrics.comments}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const v = e.target.value === "" ? 0 : Number(e.target.value);
                        setEditing((ed) => ({ ...ed, metrics: { ...(ed.metrics || {}), comments: v } }));
                      }}
                    />
                  </label>
                  <label>Shares
                    <input
                      className="input"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="0"
                      value={(editing.metrics?.shares ?? 0) === 0 ? "" : editing.metrics.shares}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const v = e.target.value === "" ? 0 : Number(e.target.value);
                        setEditing((ed) => ({ ...ed, metrics: { ...(ed.metrics || {}), shares: v } }));
                      }}
                    />
                  </label>
                </div>
              </fieldset>
            </div>

            <aside className="editor-preview">
              <div className="preview-head">Live preview</div>
              <div className="preview-zoom" style={{ pointerEvents: "auto" }}>
                <PostCard
                  key={editing.id || "preview"}
                  post={{
                    ...editing,
                    // pass neutral data URL when mode is neutral
                    avatarUrl:
                      editing.avatarMode === "neutral"
                        ? genNeutralAvatarDataUrl(64)
                        : (editing.avatarMode === "random" && !editing.avatarUrl
                            ? randomAvatarByKind(editing.avatarRandomKind || "any", editing.id || editing.author || "seed", editing.author || "", randomAvatarUrl)
                            : editing.avatarUrl),
                    // hide time in preview if toggled off (by blanking it)
                    time: editing.showTime === false ? "" : editing.time,
                    image:
                      editing.imageMode === "random"
                        ? (editing.image || randomSVG("Image"))
                        : editing.imageMode === "none"
                        ? null
                        : editing.image,
                  }}
                  registerViewRef={() => () => {}}
                  onAction={(a, m) => console.debug("preview action:", a, m)}
                  respectShowReactions={true}
                />
              </div>
            </aside>
          </div>
        </Modal>
      )}

      {isSaving && (
  <LoadingOverlay
    title="Saving feed…"
    subtitle="Creating snapshot & publishing your changes"
  />
)}

{sessExpired && (
  <div aria-live="assertive" className="admin-expired-backdrop">
    <div className="admin-expired-dialog">
      <h3>Session expired</h3>
      <p className="subtle">Your admin token has expired. Please re-authenticate to continue.</p>
      <div className="admin-expired-actions">
        <button className="btn ghost" onClick={keepAlive} disabled={touching}>
          {touching ? "Trying…" : "Try to refresh"}
        </button>
        <button className="btn primary" onClick={() => { setSessExpired(false); onLogout?.(); }}>
          Go to login
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
}

// -------------------- Random Post Generator helpers --------------------
const RAND_NAMES = [
  "Jordan Li","Maya Patel","Samir Khan","Alex Chen","Luca Rossi",
  "Nora Williams","Priya Nair","Diego Santos","Hana Suzuki","Ava Johnson",
  "Ethan Brown","Isabella Garcia","Leo Muller","Zoe Martin","Ibrahim Ali"
];
const RAND_TIMES = ["Just now","2m","8m","23m","1h","2h","3h","Yesterday","2d","3d"];
const LOREM_SNIPPETS = [
  "This is wild—can't believe it happened.","Anyone else following this?",
  "New details emerging as we speak.","Here is what I've learned so far.",
  "Not saying it is true, but interesting.","Quick thread on what matters here.",
  "Posting this for discussion.","Context below—make up your own mind.",
  "Sharing for visibility.","Thoughts?","Sources seem mixed on this.",
  "Bookmarking this for later.","Some folks say this is misleading.",
  "If accurate, this is big.","Adding a couple links in the comments."
];
const NOTE_SNIPPETS = [
  "Independent fact-checkers say the claim lacks supporting evidence.",
  "Multiple sources indicate the post omits key context.",
  "Experts disagree and advise caution when sharing.",
  "Additional reporting contradicts the central claim."
];
const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt  = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chance   = (p) => Math.random() < p;

function makeRandomPost() {
  const author = randPick(RAND_NAMES);
  const time = randPick(RAND_TIMES);
  const text = Array.from({ length: randInt(1, 3) }, () => randPick(LOREM_SNIPPETS)).join(" ");
  const willHaveImage = chance(0.55);
  const interventionType = chance(0.20) ? randPick(["label", "note"]) : "none";
  const noteText = interventionType === "note" ? randPick(NOTE_SNIPPETS) : "";
  const showReactions = chance(0.85);
  const rxKeys = Object.keys(REACTION_META);
  const selectedReactions = showReactions
    ? rxKeys.sort(() => 0.5 - Math.random()).slice(0, randInt(1, 3))
    : ["like"];

  const baseCount = randInt(5, 120);
  const rx = (p) => randInt(0, Math.floor(baseCount*p));
  const reactions = {
    like:  chance(0.9) ? rx(0.6) : 0,
    love:  chance(0.5) ? rx(0.5) : 0,
    care:  chance(0.25)? rx(0.3) : 0,
    haha:  chance(0.35)? rx(0.4) : 0,
    wow:   chance(0.3) ? rx(0.35): 0,
    sad:   chance(0.2) ? rx(0.25): 0,
    angry: chance(0.2) ? rx(0.25): 0,
  };
  const metrics = {
    comments: chance(0.6) ? rx(0.5) : 0,
    shares:   chance(0.4) ? rx(0.35): 0,
  };

  const avatarRandomKind = "any";

  return {
    id: uid(),
    author, time, showTime: true, text, links: [],
    badge: chance(0.15),
    avatarMode: "random",
    avatarRandomKind,
    avatarUrl: randomAvatarByKind(avatarRandomKind, author, author, randomAvatarUrl),
    imageMode: willHaveImage ? "random" : "none",
    image: willHaveImage ? randomSVG(randPick(["Image", "Update", "Breaking"])) : null,
    videoMode: "none",
    video: null,
    videoPosterUrl: "",
    videoAutoplayMuted: true,
    videoShowControls: true,
    videoLoop: false,
    interventionType, noteText,
    showReactions, selectedReactions, reactions, metrics,
    adType: "none",
    adDomain: "",
    adHeadline: "",
    adSubheadline: "",
    adButtonText: "",
  };
}

