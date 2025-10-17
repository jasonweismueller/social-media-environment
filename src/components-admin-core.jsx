// components-admin-core.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
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
  hasAdminRole,
  getAdminEmail,
  getAdminRole,
  startSessionWatch,
  getAdminSecondsLeft,
  touchAdminSession,
  buildFeedShareUrl,
listProjectsFromBackend,
   getDefaultProjectFromBackend,
   setDefaultProjectOnBackend,
   createProjectOnBackend,
   deleteProjectOnBackend,
   setProjectId as persistProjectId,
  getProjectId,
  GS_ENDPOINT, APP, getAdminToken ,
  readPostNames,
  writePostNames,
  postDisplayName,
   getFeedFlagsFromBackend,
  setFeedFlagsOnBackend,
  resolveRandomTimesFlag,
  setRandomTimesLocal,
} from "./utils";

import { PostCard } from "./components-ui-posts";
import { Modal, LoadingOverlay } from "./components-ui-core";
import { ParticipantsPanel } from "./components-admin-parts";
import { randomAvatarByKind } from "./avatar-utils";
import { MediaFieldset } from "./components-admin-media";
import { AdminUsersPanel } from "./components-admin-users";

/* ---------- local helper: gender-neutral comic avatar (64px) ---------------- */
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
function saveLocalBackup(projectId, feedId, app, posts) {
  try {
    const k = `backup::${app || "fb"}::${projectId || "global"}::${feedId}`;
    const list = JSON.parse(localStorage.getItem(k) || "[]");
    const entry = { t: new Date().toISOString(), posts };
    const next = [entry, ...list].slice(0, 5);
    localStorage.setItem(k, JSON.stringify(next));
  } catch {}
}

async function snapshotToS3({ posts, projectId, feedId, app = "fb" }) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${projectId || "global"}-${feedId}-${ts}.json`;
    const { cdnUrl } = await uploadJsonToS3ViaSigner({
            data: { app, projectId: projectId || "global", feedId, ts: new Date().toISOString(), posts },
      projectId,
      feedId,
      prefix: `backups/${app}/${projectId || "global"}/${feedId}`,
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
    prompt("Copy this URL:", str);
  }
}



/* ------------------------ Tiny admin stats fetcher --------------------------- */
async function fetchParticipantsStats(projectId, feedId) {
  try {
    const admin = getAdminToken?.();
    if (!admin || !feedId) return null;

    // Respect project scoping: omit project_id when "global" or empty
    const params = new URLSearchParams({
      path: "participants_stats",
      app: APP,
      feed_id: String(feedId),
      admin_token: admin,
    });
    const effPid = projectId && projectId !== "global" ? String(projectId) : "";
    if (effPid) params.set("project_id", effPid);

    const res = await fetch(`${GS_ENDPOINT}?${params.toString()}`, { mode: "cors", cache: "no-store" });
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
function getCachedPosts(projectId, feedId, checksum) {
  try {
    const k = `posts::${projectId || "global"}::${feedId}`;
    const meta = JSON.parse(localStorage.getItem(`${k}::meta`) || "null");
    if (!meta || meta.checksum !== checksum) return null;
    const data = JSON.parse(localStorage.getItem(k) || "null");
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}
function setCachedPosts(projectId, feedId, checksum, posts) {
  try {
    const k = `posts::${projectId || "global"}::${feedId}`;
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

/* ----------------------------- Admin Dashboard ------------------------------ */
export function AdminDashboard({
  posts, setPosts,
  randomize, setRandomize,
  showComposer, setShowComposer,
  resetLog,
  onPublishPosts, // optional override
  onLogout,
}) {


  const pidForBackend = (pid) => (pid && pid !== "global" ? pid : undefined);
  const [sessExpiringSec, setSessExpiringSec] = useState(null);
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
  const [feedStats, setFeedStats] = useState({});
  const [postNames, setPostNames] = useState({});
  // Per-feed flags (keyed by `${projectId}::${feedId}`)
const [feedFlags, setFeedFlags] = useState({}); // { [key]: { random_time?: boolean, loading?: boolean, _loaded?: boolean } }

const flagsKey = (pid, fid) => `${pid || "global"}::${fid || ""}`;

const setFlagsLocal = (pid, fid, next) => {
  const k = flagsKey(pid, fid);
  setFeedFlags((m) => ({ ...m, [k]: { ...(m[k] || {}), ...next } }));
};

/** Lazy-load flags for a feed (caches in state) */
const loadFlagsForFeed = async (pid, fid) => {
  if (!fid) return;
  const k = flagsKey(pid, fid);
  if (feedFlags[k]?._loaded) return;
  try {
    setFlagsLocal(pid, fid, { loading: true });
    const flags = await getFeedFlagsFromBackend(fid);
    setFlagsLocal(pid, fid, { ...(flags || {}), loading: false, _loaded: true });
  } catch {
    setFlagsLocal(pid, fid, { loading: false, _loaded: true });
  }
};

/** Toggle random_time for a feed (persists to backend + local cache) */
const toggleRandomTimesForFeed = async (pid, fid, curVal) => {
  if (!fid) return;
  const next = !curVal;
  // optimistic UI
  setFlagsLocal(pid, fid, { random_time: next, loading: true });
  try {
    const res = await setFeedFlagsOnBackend(fid, { random_time: next });
    if (!res?.ok) throw new Error(res?.err || "Update failed");
    // also persist into local cache used by the public UI resolver
    setRandomTimesLocal(next, fid);
    setFlagsLocal(pid, fid, { random_time: next, loading: false, _loaded: true });
    alert(`Random times ${next ? "enabled" : "disabled"} for "${fid}".`);
  } catch (e) {
    // revert on failure
    setFlagsLocal(pid, fid, { random_time: curVal, loading: false });
    alert(String(e?.message || e || "Failed to update flag."));
  }
};

useEffect(() => {
  if (feedId) loadFlagsForFeed(projectId, feedId);
}, [projectId, feedId]);

  const [participantsCount, setParticipantsCount] = useState(null);
  // One-time "app boot" latch. We hide it only after the first full load finishes.
const [booting, setBooting] = useState(true);

   // --- projects
 const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(() => {
   try {
     const sp = new URLSearchParams(window.location.search);
     return sp.get("project") || sp.get("project_id") || getProjectId?.() || "global";
   } catch {
     return getProjectId?.() || "global";
   }
 });
 const [projectName, setProjectName] = useState("");
 const [projectsLoading, setProjectsLoading] = useState(true);
 const [projectsError, setProjectsError] = useState("");
 const [defaultProjectId, setDefaultProjectId] = useState(null);
 const projectsAbortRef = useRef(null);

  // collapse + participants paging toggle
  const [feedsCollapsed, setFeedsCollapsed] = useState(true); // (unused by design)
  const [participantsCollapsed, setParticipantsCollapsed] = useState(true);
  const [postsCollapsed, setPostsCollapsed] = useState(true);
  const [usersCollapsed, setUsersCollapsed] = useState(true);
  const [showAllParticipants, setShowAllParticipants] = useState(false);

  // --- wipe-on-change global policy
  // --- wipe-on-change global policy
const [wipeOnChange, setWipeOnChange] = useState(null);
const [updatingWipe, setUpdatingWipe] = useState(false);

const [feeds, setFeeds] = useState([]);
const [feedId, setFeedId] = useState("");
const [feedName, setFeedName] = useState("");
const [feedsLoading, setFeedsLoading] = useState(false);
const [feedsError, setFeedsError] = useState("");



// ✅ needed for “(default)” labels & actions
const [defaultFeedId, setDefaultFeedId] = useState(null);

// ✅ needed for abortable loading
const feedsAbortRef = useRef(null);

// One source of truth for the blocking overlay
const showOverlay =
  isSaving ||
  (booting && !projectsError && !feedsError) ||
  (!booting && feedsLoading && !feedsError);

// If you still want to blur the app behind the overlay, tie it to the same flag.
// (Or make this just `isSaving` if you only want blur while saving.)
const showBlur = showOverlay;

  const keyFor = (pid, fid) => `${pid || "global"}::${fid}`;
 const loadStatsFor = async (id) => {
   if (!id) return;
   const k = keyFor(projectId, id);
   if (feedStats[k]) return; // already have stats for *this project + feed*
   const s = await fetchParticipantsStats(projectId, id);
   setFeedStats((m) => ({
     ...m,
     [k]: s || { total: 0, submitted: 0, avg_ms_enter_to_submit: null }
   }));
 };

 useEffect(() => {
  const syncFromUrl = () => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const pid = sp.get("project") || sp.get("project_id");
      if (pid && pid !== projectId) setProjectId(pid);
    } catch {}
  };
  window.addEventListener("popstate", syncFromUrl);
  window.addEventListener("hashchange", syncFromUrl);
  return () => {
    window.removeEventListener("popstate", syncFromUrl);
    window.removeEventListener("hashchange", syncFromUrl);
  };
}, [projectId]);

  useEffect(() => {
   if (!projectId) return;
   // Persist for other modules/refreshes, but don’t touch the URL here
   persistProjectId(projectId, { persist: true, updateUrl: false });
 }, [projectId]);
  

  // counts
  const [usersCount, setUsersCount] = useState(null);

  useEffect(() => {
  // Hide the initial, one-and-done boot overlay once BOTH loaders are idle
  if (!projectsLoading && !feedsLoading) {
    setBooting(false);
  }
}, [projectsLoading, feedsLoading]);

  // always fetch stats for the currently selected feed (so the title has a number)
   useEffect(() => {
   if (feedId) loadStatsFor(feedId);
 }, [feedId, projectId]); // <- include projectId

  // handy local for the current feed's stats
  const curStats = feedStats[keyFor(projectId, feedId)];

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
    const left = getAdminSecondsLeft();
    if (left != null && left > 120) setSessExpiringSec(null);
  }, [isSaving]);

  
  const loadProjects = useCallback(async () => {
   projectsAbortRef.current?.abort?.();
   const ctrl = new AbortController();
   projectsAbortRef.current = ctrl;
   setProjectsError("");
   setProjectsLoading(true);
   try {
     const [list, backendDefault] = await Promise.all([
       listProjectsFromBackend({ signal: ctrl.signal }).catch(() => [{ project_id: "global", name: "Global" }]),
       getDefaultProjectFromBackend({ signal: ctrl.signal }).catch(() => "global"),
     ]);
     if (ctrl.signal.aborted) return;
      const projList = (Array.isArray(list) && list.length) ? list : [{ project_id: "global", name: "Global" }];
 setProjects(projList);
 setDefaultProjectId(backendDefault || null);
 
 // read from URL first (hard-refresh friendly), then current state/storage, then backend default, then first
 let fromUrl = "";
 try {
   const sp = new URLSearchParams(window.location.search);
   fromUrl = sp.get("project") || sp.get("project_id") || "";
 } catch {}
 const desired =
   fromUrl ||
   projectId ||
   getProjectId?.() ||
   backendDefault ||
   projList[0]?.project_id ||
   "global";
 
 const chosen = projList.find(p => p.project_id === desired) || projList[0];
 const chosenId = chosen?.project_id || "global";
 setProjectId(chosenId);
 persistProjectId(chosenId, { persist: true, updateUrl: false });
 setProjectName(chosen?.name || chosenId || "Global");
   } catch (e) {
     const isAbort = e?.name === "AbortError";
     setProjectsError(isAbort ? "Project loading was interrupted. You can try again." : "Failed to load projects from the backend. Please try again.");
   } finally {
     if (projectsAbortRef.current === ctrl) projectsAbortRef.current = null;
     setProjectsLoading(false);
   }
 }, [projectId]);
  
  
  // ---------- Centralized, abortable feed loader with friendly errors ----------
  const loadFeeds = useCallback(async () => {
    // cancel any in-flight attempt
    feedsAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    feedsAbortRef.current = ctrl;

    setFeedsError("");
    setFeedsLoading(true);

    try {
      // Try parallel fetch
      const effPid = pidForBackend(projectId);
 const [list, backendDefault] = await Promise.all([
   listFeedsFromBackend({ projectId: effPid, signal: ctrl.signal }),
   getDefaultFeedFromBackend({ projectId: effPid, signal: ctrl.signal }),
 ]);

      if (ctrl.signal.aborted) return;

      const feedsList = Array.isArray(list) ? list : [];
      setFeeds(feedsList);
      setDefaultFeedId(backendDefault || null);

      const chosen =
        feedsList.find(f => f.feed_id === backendDefault) ||
        feedsList[0] ||
        null;

      if (chosen) {
        setFeedId(chosen.feed_id);
        setFeedName(chosen.name || chosen.feed_id);

        const cached = getCachedPosts(projectId, chosen.feed_id, chosen.checksum);
        if (cached) {
          setPosts(cached);
        } else {
           const fresh = await loadPostsFromBackend(
   chosen.feed_id,
   { projectId: pidForBackend(projectId), force: true, signal: ctrl.signal }
);
          if (ctrl.signal.aborted) return;
          const arr = Array.isArray(fresh) ? fresh : [];
          arr.forEach(p => { if ("showTime" in p) delete p.showTime; });
          setPosts(arr);
          setCachedPosts(projectId, chosen.feed_id, chosen.checksum, arr);
        }
      setPostNames(readPostNames(projectId, chosen.feed_id) || {});
      } else {
        setFeedId("");
        setFeedName("");
        setPosts([]);
        setPostNames({});
      }

      
      // Best-effort policy fetch
      try {
        const policy = await getWipePolicyFromBackend({ signal: ctrl.signal });
        if (!ctrl.signal.aborted && policy !== null) setWipeOnChange(!!policy);
      } catch {}
    } catch (e) {
      const isAbort = e?.name === "AbortError";
      setFeedsError(isAbort ? "Feed loading was interrupted. You can try again." : "Failed to load feeds from the backend. Please try again.");
    } finally {
      if (feedsAbortRef.current === ctrl) feedsAbortRef.current = null;
      setFeedsLoading(false);
    }
  }, [setPosts,projectId]);

  // Initial load

 useEffect(() => {
   loadProjects();
   return () => { projectsAbortRef.current?.abort?.(); };
 }, [loadProjects]);

useEffect(() => {
  if (!projectId) return;

  // clear per-project feed stats cache when switching projects
  setFeedStats({});

  loadFeeds();
  return () => { feedsAbortRef.current?.abort?.(); };
}, [projectId, loadFeeds]);

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

    // Load posts
    const cached = row ? getCachedPosts(projectId, id, row.checksum) : null;
    if (cached) {
      setPosts(cached);
    } else {
      const fresh = await loadPostsFromBackend(id, { projectId: pidForBackend(projectId), force: true });
      const arr = Array.isArray(fresh) ? fresh : [];
      arr.forEach(p => { if ("showTime" in p) delete p.showTime; });
      setPosts(arr);
      if (row) setCachedPosts(projectId, id, row.checksum, arr);
    }

    // Load names
    setPostNames(readPostNames(projectId, id) || {});
  };

  const createNewProject = async () => {
   const id = prompt("New project ID (letters/numbers/underscores):", `proj_${(projects.length || 0) + 1}`);
   if (!id) return;
   const name = prompt("Optional project name:", id) || id;
   const ok = await (createProjectOnBackend?.({ projectId: id, name }).catch(()=>true));
   if (!ok) { alert("Failed to create project."); return; }
   setProjects(prev => [{ project_id: id, name }, ...prev]);
   setProjectId(id);
   setProjectName(name);
   // ensure fresh feeds context
   setFeeds([]); setFeedId(""); setFeedName(""); setPosts([]);
   loadFeeds();
 };

  const createNewFeed = () => {
    const id = prompt("New feed ID (letters/numbers/underscores):", `feed_${(feeds.length || 0) + 1}`);
    if (!id) return;
    const name = prompt("Optional feed name (shown in admin):", id) || id;
    setFeedId(id);
    setFeedName(name);
    setPosts([]);
    setPostNames({});
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
      postName: "",
      author: "",
      time: "Just now",
      text: "",
      links: [],
      badge: false,

      avatarMode: "random",
      avatarRandomKind,
      avatarUrl: randomAvatarByKind(avatarRandomKind, "new", "", randomAvatarUrl),

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
    const openEdit = (p) => {
   setIsNew(false);
   setEditing({
     ...p,
     // prefer previously-saved backend name if postName not set
     postName: p.postName ?? p.name ?? "",
   });
};

  const removePost = (id) => {
    if (!confirm("Delete this post?")) return;
    setPosts((arr) => arr.filter((p) => p.id !== id));
    // Remove its name from the mapping
    const next = { ...(postNames || {}) };
    if (next[id]) {
      delete next[id];
      setPostNames(next);
      writePostNames(projectId, feedId, next);
    }
  };

  const saveEditing = () => {
    if (!editing.author?.trim()) { alert("Author is required."); return; }
    if (!editing.text?.trim()) { alert("Post text is required."); return; }

    setPosts((arr) => {
      const idx = arr.findIndex((p) => p.id === editing.id);
      const clean = { ...editing };
      if ("showTime" in clean) delete clean.showTime; // normalize legacy posts

  
    // persist friendly name on the post object itself
     if (clean.postName && !clean.name) clean.name = clean.postName;

      // apply avatar rules
      if (clean.avatarMode === "random" && !clean.avatarUrl) {
        clean.avatarUrl = randomAvatarByKind(clean.avatarRandomKind || "any", clean.id || clean.author || "seed", clean.author || "", randomAvatarUrl);
      }
      if (clean.avatarMode === "random" && clean.avatarRandomKind === "company") {
        clean.avatarUrl = randomAvatarByKind("company", clean.id || clean.author || "seed", clean.author || "");
      }
      if (clean.avatarMode === "neutral") {
        clean.avatarUrl = genNeutralAvatarDataUrl(64);
      }

      // media exclusivity
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

      // update list
      const nextPosts = idx === -1 ? [...arr, clean] : arr.map((p, i) => (i === idx ? clean : p));

      // ⬇️ persist post name (for CSV header mapping)
      const name = (clean.postName || "").trim();
      const nextNames = { ...(postNames || {}) };
      if (name) nextNames[clean.id] = name;
      else delete nextNames[clean.id];
      setPostNames(nextNames);
      writePostNames(projectId, feedId, nextNames);

      return nextPosts;
    });
    setEditing(null);
  };

  const clearFeed = () => {
    if (!posts.length) return;
    if (!confirm("Delete ALL posts from this feed? This cannot be undone.")) return;
    setPosts([]);
    setPostNames({});
    writePostNames(projectId, feedId, {}); // clear name map too
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

      {/* Loading & error overlays for feeds */}
       {showOverlay && (
   <LoadingOverlay
     title={isSaving ? "Saving feed…" : "Loading dashboard…"}
     subtitle={isSaving ? "Creating snapshot & publishing your changes"
                        : "Fetching projects, feeds and posts from backend"}
   />
 )}
      {!feedsLoading && !!feedsError && (
        <div aria-live="assertive" className="admin-expired-backdrop">
          <div className="admin-expired-dialog">
            <h3>Feed loading failed</h3>
            <p className="subtle">{feedsError}</p>
            <div className="admin-expired-actions">
              <button className="btn" onClick={() => loadFeeds()}>Try again</button>
              <button className="btn ghost" onClick={() => setFeedsError("")}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

<div
  style={{
    filter: showBlur ? "blur(6px)" : "none",
    transition: "filter .2s ease",
    pointerEvents: showBlur ? "none" : "auto",
    userSelect: showBlur ? "none" : "auto",
  }}
>

      <Section
        title="Admin Dashboard"
        subtitle={`Signed in as ${getAdminEmail() || "unknown"} · role: ${getAdminRole() || "viewer"}`}
        right={<button className="btn ghost" onClick={onLogout} title="Sign out of the admin session">Log out</button>}
      />
      <div style={{ display:"grid", gap:"1rem", gridTemplateColumns:"minmax(0,1fr)" }} className="admin-grid">


 {/* Projects */}
 <Section
   title={`Projects (${projects.length || 0})`}
   subtitle="Choose the project first; feeds and participants are scoped to the selected project."
   right={
     <>
       <div className="feed-picker" style={{ display:"flex", alignItems:"center", gap:".5rem" }}>
         <span className="subtle">Project:</span>
         <select
           className="select"
           value={projectId || "global"}
           onChange={async (e) => {
             const pid = e.target.value;
             const row = projects.find(p => p.project_id === pid);
             setBooting(true); // optional: treat project switches like a fresh boot
             setProjectId(pid);
             setProjectName(row?.name || pid);
             persistProjectId(pid, { persist: true, updateUrl: true });
             // reset feed context so we don’t display stale data
             setFeeds([]); setFeedId(""); setFeedName(""); setPosts([]);
           }}
           title="Choose project"
           style={{ minWidth: 220 }}
         >
           {projects.map((p) => (
             <option key={p.project_id} value={p.project_id}>
               {(p.name || p.project_id)}{p.project_id === defaultProjectId ? " (default)" : ""}
             </option>
           ))}
         </select>
         <button className="btn" onClick={() => loadProjects()} title="Reload project list">Refresh Projects</button>
       </div>
       <RoleGate min="editor">
         <button className="btn ghost" onClick={createNewProject}>+ New project</button>
         <button
           className="btn ghost"
           onClick={async () => {
             const ok = await setDefaultProjectOnBackend?.(projectId);
             if (ok) setDefaultProjectId(projectId);
           }}
           disabled={!projectId || projectId === defaultProjectId}
           title="Make this the default project"
         >
           Default
         </button>
       </RoleGate>

       <RoleGate min="owner">
         <button
           className="btn ghost danger"
           onClick={async () => {
             if (!projectId) return;
             if (!confirm(`Delete project "${projectName || projectId}"?\nThis deletes ALL its feeds and participants.`)) return;
             const ok = await deleteProjectOnBackend?.(projectId);
             if (!ok) { alert("Failed to delete project."); return; }
             const next = projects.filter(p => p.project_id !== projectId);
             setProjects(next);
             const fallback = next[0] || { project_id: "global", name: "Global" };
             setProjectId(fallback.project_id);
             setProjectName(fallback.name || fallback.project_id);
             persistProjectId(fallback.project_id, { persist: true, updateUrl: true });
           }}
         >
           Delete
         </button>
       </RoleGate>
     </>
   }
 />


        {/* Feeds (no collapse by design) */}
        <Section
          title={`Feeds (${feeds.length || 0})`}
          subtitle="Keep the UI minimal: choose the editing feed via dropdown. By default, only the Default and Loaded feeds are shown; expand to see all."
          right={
            <>
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
                onClick={() => loadFeeds()}
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
                  const importantIds = Array.from(new Set([defaultFeedId, feedId].filter(Boolean)));
                  const visible = showAllFeeds
                    ? feeds
                    : feeds.filter(f => importantIds.includes(f.feed_id));

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
                    const stats = feedStats[keyFor(projectId, f.feed_id)];

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
                                    saveLocalBackup(projectId, feedId, "fb", posts);
                                    await snapshotToS3({ posts, projectId, feedId, app: "fb" });
                                    const ok = await savePostsToBackend(posts, {
                                      projectId: pidForBackend(projectId),                                      
                                      feedId: f.feed_id,
                                      name: f.name || f.feed_id,
                                      app: "fb",
                                    });
                                    if (ok) {
                                      const list = await listFeedsFromBackend({ projectId: pidForBackend(projectId) });
                                      const nextFeeds = Array.isArray(list) ? list : [];
                                      setFeeds(nextFeeds);
                                      const row = nextFeeds.find((x) => x.feed_id === f.feed_id);
                                      if (row) {
                                        const fresh = await loadPostsFromBackend(f.feed_id, { projectId: pidForBackend(projectId), force: true });
                                        const arr = Array.isArray(fresh) ? fresh : [];
                                        arr.forEach(p => { if ("showTime" in p) delete p.showTime; });
                                        setPosts(arr);
                                        setCachedPosts(projectId, f.feed_id, row.checksum, arr);
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
    if (!f?.feed_id) {
      alert("Missing feed_id for this row");
      return;
    }

    // ✅ Use query params (no hash)
    const url =
      typeof buildFeedShareUrl === "function"
        ? buildFeedShareUrl({ ...f, project_id: projectId })
        : `${window.location.origin}/?project=${encodeURIComponent(
            projectId || "global"
          )}&feed=${encodeURIComponent(f.feed_id)}`;

    await navigator.clipboard.writeText(url).catch(() => {});
    alert("Link copied:\n" + url);
  }}
>
  Copy Link
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

        {/* Participants */}
        <Section
          title={`Participants${Number.isFinite(participantsCount) ? ` (${participantsCount})` : ""}`}
          subtitle={
            <>
               <span>Live snapshot for </span>
 <code style={{ fontSize: ".9em" }}>{projectId || "global"}</code>
 <span className="subtle"> · </span>
 <code style={{ fontSize: ".9em" }}>{feedId || "—"}</code>
              {defaultFeedId === feedId && <span className="subtle"> · default</span>}
            </>
          }
          right={
            <div style={{ display:"flex", gap:".4rem", alignItems:"center", flexWrap:"wrap" }}>
              {!participantsCollapsed && (
                <>
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
                </>
              )}

              <button
                type="button"
                className="btn ghost section-chev"
                onClick={() => setParticipantsCollapsed(v => !v)}
                aria-expanded={!participantsCollapsed}
                aria-controls="participants-body"
                title={participantsCollapsed ? "Expand" : "Collapse"}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M5.8 7.8a1 1 0 0 1 1.4 0L10 10.6l2.8-2.8a1 1 0 1 1 1.4 1.4l-3.5 3.5a1 1 0 0 1-1.4 0L5.8 9.2a1 1 0 0 1 0-1.4z"/>
                </svg>
              </button>
            </div>
          }
        >
          <div
            id="participants-body"
            className={`section-collapse ${participantsCollapsed ? "is-collapsed" : ""}`}
            aria-hidden={participantsCollapsed}
          >
            <div className="section-collapse-inner">
              <ParticipantsPanel
              key={`pp::${projectId}::${feedId}::${participantsRefreshKey}`}
  projectId={projectId}
  feedId={feedId}
  postNamesMap={postNames}
                compact
                limit={showAllParticipants ? undefined : 5}
                onCountChange={setParticipantsCount}
              />
            </div>
          </div>
        </Section>

        <Section
          title={`Posts (${posts.length})`}
          subtitle={
            showAllPosts
              ? "Compact list of all posts."
              : `Compact list · showing first ${Math.min(5, posts.length)}`
          }
          right={
            <>
              {!postsCollapsed && (
                <>
                  <button
                    className="btn"
                    onClick={async () => {
                      const fresh = await loadPostsFromBackend(feedId, { projectId: pidForBackend(projectId), force: true });
                      const arr = Array.isArray(fresh) ? fresh : [];
                      arr.forEach(p => { if ("showTime" in p) delete p.showTime; });
                      setPosts(arr);
                      const row = feeds.find(f => f.feed_id === feedId);
                      if (row) setCachedPosts(projectId, feedId, row.checksum, arr);
                           // keep the name map in sync with the current feed
     setPostNames(readPostNames(projectId, feedId) || {});
                    }}
                    title="Reload posts for this feed from backend"
                  >
                    Refresh Posts
                  </button>

                  <button
                    className="btn ghost"
                    title="Export current posts as JSON"
                    onClick={() => {
                       const payload = {
  app: "fb",
   projectId: projectId || "global",
   feedId,
   ts: new Date().toISOString(),
   posts: posts.map(p => ({
     ...p,
     // ensure 'name' exists in the export (falls back to the local map)
     name: (p.name ?? (postNames?.[p.id]) ?? "").trim() || undefined,
   })),
 };
                      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${projectId || "global"}-${feedId}-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
                      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
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

                  <button
                    className="btn ghost"
                    onClick={() => setShowAllPosts(s => !s)}
                    title={showAllPosts ? "Show only the first 5 posts" : "Show all posts"}
                  >
                    {showAllPosts ? "Show first 5" : `Show all (${posts.length})`}
                  </button>

                  <RoleGate min="editor">
                    <ChipToggle label="Randomize order" checked={!!randomize} onChange={setRandomize} />
                     {(() => {
   const k = flagsKey(projectId, feedId);
   const rec = feedFlags[k] || {};
   // lazy-load once for current feed
   if (feedId && !rec._loaded && !rec.loading) loadFlagsForFeed(projectId, feedId);
   const checked = !!rec.random_time;
   const label = rec.loading ? "Randomize times (updating…)" : "Randomize times";
   return (
     <ChipToggle
       label={label}
       checked={checked}
       onChange={(nextVal) => {
         if (rec.loading) return;           // ignore while mid-update
         toggleRandomTimesForFeed(projectId, feedId, checked);
       }}
     />
   );
 })()}
                    <button className="btn" onClick={() => { const p = makeRandomPost(); setIsNew(true); setEditing(p); }} title="Generate a synthetic post">
                      + Random Post
                    </button>
                    <button className="btn ghost" onClick={openNew}>+ Add Post</button>
                    <button className="btn ghost danger" onClick={clearFeed} disabled={!posts.length} title="Delete all posts from this feed">
                      Clear Feed
                    </button>
                  </RoleGate>
                </>
              )}

              <button
                type="button"
                className="btn ghost section-chev"
                onClick={() => setPostsCollapsed(v => !v)}
                aria-expanded={!postsCollapsed}
                aria-controls="posts-body"
                title={postsCollapsed ? "Expand" : "Collapse"}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M5.8 7.8a1 1 0 0 1 1.4 0L10 10.6l2.8-2.8a1 1 0 1 1 1.4 1.4l-3.5 3.5a1 1 0 0 1-1.4 0L5.8 9.2a1 1 0 0 1 0-1.4z"/>
                </svg>
              </button>
            </>
          }
        >
          <div
            id="posts-body"
            className={`section-collapse ${postsCollapsed ? "is-collapsed" : ""}`}
            aria-hidden={postsCollapsed}
          >
            <div className="section-collapse-inner">
              <div style={{ overflowX: "auto" }}>
                <div style={{ overflowX: "auto" }}>
                  {posts.length === 0 ? (
                    <div className="subtle" style={{ padding: ".5rem 0" }}>
                      No posts yet.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr className="subtle">
                          <th style={{ textAlign: "left", padding: 8, width: 36 }} />
                          <th style={{ padding: 8, fontFamily: "monospace" }}>Post</th>
                          <th style={{ textAlign: "left", padding: 8, minWidth: 160 }}>Author</th>
                          <th style={{ textAlign: "left", padding: 8, minWidth: 260 }}>Text</th>
                          <th style={{ textAlign: "left", padding: 8, minWidth: 80 }}>Time</th>
                          <th style={{ textAlign: "left", padding: 8, minWidth: 120 }}>Media</th>
                          <th style={{ textAlign: "left", padding: 8, minWidth: 220 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllPosts ? posts : posts.slice(0, 5)).map((p) => (
                          <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                               <td style={{ padding: 8 }}>
         <div className="avatar">
           <img className="avatar-img" alt="" src={p.avatarUrl || pravatar(8)} />
         </div>
       </td>

                                  <td style={{ padding: 8, fontFamily: "monospace" }}>
         {postNames[p.id] || <span className="subtle">—</span>}
       </td>
                            <td style={{ padding: 8, fontWeight: 600 }}>
                              {p.author || <span className="subtle">—</span>}
                              {p.badge ? " ✔" : ""}
                            </td>
                            <td style={{ padding: 8, maxWidth: 520, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.text || <span className="subtle">—</span>}
                            </td>
                            <td style={{ padding: 8 }}>
                              <span className="subtle">{p.time ? p.time : "—"}</span>
                            </td>
                            <td style={{ padding: 8 }}>
                              {p.videoMode !== "none"
                                ? "🎬 video"
                                : p.imageMode !== "none"
                                ? "🖼️ image"
                                : <span className="subtle">none</span>}
                            </td>
                            <td style={{ padding: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button className="btn" onClick={() => openEdit(p)}>Edit</button>
                               <button
           className="btn ghost"
           title="Rename this post for CSV columns"
           onClick={() => {
             const cur = postNames[p.id] || "";
             const next = prompt("Post name (used in CSV headers):", cur ?? "");
             if (next === null) return; // cancelled
             const name = (next || "").trim();
             const map = { ...(postNames || {}) };
             if (name) map[p.id] = name; else delete map[p.id];
             setPostNames(map);
             writePostNames(projectId, feedId, map);
           }}
         >
           Rename
         </button>
                              <button className="btn ghost danger" onClick={() => removePost(p.id)}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Users (owners only) */}
     <RoleGate min="owner">
  <Section
    title={`Users${usersCount != null ? ` (${usersCount})` : ""}`}
    subtitle="Manage admin users & roles."
    right={
      <button
        type="button"
        className="btn ghost section-chev"
        onClick={() => setUsersCollapsed(v => !v)}
        aria-expanded={!usersCollapsed}
        aria-controls="users-body"
        title={usersCollapsed ? "Expand" : "Collapse"}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M5.8 7.8a1 1 0 0 1 1.4 0L10 10.6l2.8-2.8a1 1 0 1 1 1.4 1.4l-3.5 3.5a1 1 0 0 1-1.4 0L5.8 9.2a1 1 0 0 1 0-1.4z"/>
        </svg>
      </button>
    }
  >
    <div
      id="users-body"
      className={`section-collapse ${usersCollapsed ? "is-collapsed" : ""}`}
      aria-hidden={usersCollapsed}
    >
      <div
  className="section-collapse-inner"
  style={{ display: usersCollapsed ? "none" : "block" }} // hide, don't unmount
>
  <AdminUsersPanel embed onCountChange={setUsersCount} />
</div>
    </div>

   
  </Section>
</RoleGate>
      </div>

      
</div>

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

              {/* NEW: Post name for CSV mapping */}
              <label>Post name (for CSV)
                <input
                  className="input"
                  placeholder="e.g. Vaccine Story A"
                  value={editing.postName || ""}
                  onChange={(e) => setEditing(ed => ({ ...ed, postName: e.target.value }))}
                />
                <div className="subtle" style={{ marginTop: 4 }}>
                  This label replaces the post ID in CSV headers (e.g., <code>{(editing.postName || "Name")}_reacted</code>).
                </div>
              </label>

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
   Leave blank to hide time.
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
                            projectId: projectId || "global",
 feedId: feedId || "default",
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
                projectId={projectId}
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
                    avatarUrl:
                      editing.avatarMode === "neutral"
                        ? genNeutralAvatarDataUrl(64)
                        : (editing.avatarMode === "random" && !editing.avatarUrl
                            ? randomAvatarByKind(editing.avatarRandomKind || "any", editing.id || editing.author || "seed", editing.author || "", randomAvatarUrl)
                            : editing.avatarUrl),
                    
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
    postName: "",
    author, time, text, links: [],
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