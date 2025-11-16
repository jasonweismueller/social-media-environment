// components-admin-dashboard.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  uid,
  pravatar,
  randomAvatarUrl,
  randomSVG,
  uploadJsonToS3ViaSigner,
  listFeedsFromBackend,
  getDefaultFeedFromBackend,
  setDefaultFeedOnBackend,
  savePostsToBackend,
  loadPostsFromBackend,
  wipeParticipantsOnBackend,
  deleteFeedOnBackend,
  getWipePolicyFromBackend,
  setWipePolicyOnBackend,
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
  GS_ENDPOINT, APP, getAdminToken,
  readPostNames,
  writePostNames,
  normalizeFlagsForStore, normalizeFlagsForRead,
} from "../utils";

import { Modal, LoadingOverlay } from "../ui-core";
import { ParticipantsPanel } from "./components-admin-parts";
import { AdminUsersPanel } from "./components-admin-users";
import { randomAvatarByKind } from "../avatar-utils";

// Dynamically choose correct editor (FB or IG)
import { genNeutralAvatarDataUrl, makeRandomPost } from "./components-admin-editor-facebook";
import { AdminPostEditor as AdminPostEditorFB } from "./components-admin-editor-facebook";
import { AdminPostEditor as AdminPostEditorIG } from "./components-admin-editor-instagram";

const keyFor = (pid, fid) => `${pid || "global"}::${fid}`;

// Pick based on current app (set in main-facebook.jsx or main-instagram.jsx)
const app = (window.APP || new URLSearchParams(window.location.search).get("app") || "fb").toLowerCase();
const AdminPostEditor = app === "ig" ? AdminPostEditorIG : AdminPostEditorFB;

/* ---------- small access gate ---------------- */
function RoleGate({ min = "viewer", children, elseRender = null }) {
  return hasAdminRole(min) ? children : (elseRender ?? null);
}

/* ---------- local backups + snapshots ---------------- */
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

/* ------------------------ Feed flags helpers (randomize_*) ------------------ */
async function getFeedFlagsFromBackend({ projectId, feedId }) {
  try {
    if (!feedId) return { randomize_times: false };
    const params = new URLSearchParams({
      path: "get_feed_flags",
      app: APP,
      feed_id: String(feedId),
    });
    const effPid = projectId && projectId !== "global" ? String(projectId) : "";
    if (effPid) params.set("project_id", effPid);

    const res = await fetch(`${GS_ENDPOINT}?${params.toString()}`, {
      mode: "cors",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    const raw = (json && json.flags) ? json.flags : {};
    const norm = normalizeFlagsForRead(raw);
    return {
      randomize_times:   !!(norm.randomize_times   ?? norm.random_time),
      randomize_avatars: !!(norm.randomize_avatars ?? norm.random_avatar),
      randomize_names:   !!(norm.randomize_names   ?? norm.random_name),
      randomize_images:  !!(norm.randomize_images  ?? norm.random_image ?? norm.rand_images),
      randomize_bios:    !!(norm.randomize_bios    ?? norm.random_bio)
    };
   } catch {
    return { randomize_times: false, randomize_avatars: false, randomize_names: false, randomize_images: false, randomize_bios: false};
   }
}

async function setFeedFlagsOnBackend({ projectId, feedId, patch }) {
  const admin = getAdminToken?.();
  if (!admin) return { ok: false, err: "admin token missing" };

  const payload = {
    action: "set_feed_flags",
    app: APP,
    feed_id: String(feedId),
    flags: normalizeFlagsForStore(patch || {}),
    admin_token: admin,
  };
  if (projectId && projectId !== "global") payload.project_id = projectId;

  const doPost = async (body) => {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
    }).catch(() => null);
    return res ? res.json().catch(() => ({ ok: false })) : { ok: false };
  };

  let out = await doPost(payload);

  if (!out?.ok && /unknown action/i.test(String(out?.err || ""))) {
    out = await doPost({ ...payload, action: "set_flags" });
  }

  return out || { ok: false, err: "no response" };
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

function FlagToggle({ projectId, feedId, flag, label }) {
  const rowKey = keyFor(projectId, feedId);
  const ff = feedFlags[rowKey] || {};

  const storeKey = flag.replace("randomize_", "random_"); // randomize_images → random_image
  const active = !!(ff[flag] ?? ff[storeKey]);
  const savingKey = `saving_${flag}`;
  const busy = !!ff[savingKey];

  const anySaving = Object.keys(ff).some(k => /^saving/.test(k));

  return (
    <ChipToggle
      label={label}
      checked={active}
      onChange={async (next) => {
        if (!ff.loaded && !ff.loading) await loadFlagsFor(feedId);
        if (anySaving) return;

        setFeedFlags(m => ({
          ...m,
          [rowKey]: { ...(m[rowKey] || {}), [savingKey]: true }
        }));

        try {
          const res = await setFeedFlagsOnBackend({
            projectId,
            feedId,
            patch: { [storeKey]: next },
          });
          if (!res?.ok) throw new Error(res?.err || "Failed to update feed flag.");
          await loadFlagsFor(feedId, { force: true });
        } catch (e) {
          alert(e.message || "Failed to update feed flag. Please re-login and try again.");
        } finally {
          setFeedFlags(m => ({
            ...m,
            [rowKey]: { ...(m[rowKey] || {}), [savingKey]: false }
          }));
        }
      }}
    />
  );
}

/* ----------------------------- Admin Dashboard ------------------------------ */
export function AdminDashboard({
  posts, setPosts,
  randomize, setRandomize,
  showComposer, setShowComposer, // (kept for API parity, not used here)
  resetLog,                      // "
  onPublishPosts,                // optional override (kept)
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
  const [participantsCount, setParticipantsCount] = useState(null);
  const [booting, setBooting] = useState(true);

  // projects
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

  // collapse toggles
  const [feedsCollapsed] = useState(true); // intentionally unused
  const [participantsCollapsed, setParticipantsCollapsed] = useState(true);
  const [postsCollapsed, setPostsCollapsed] = useState(true);
  const [usersCollapsed, setUsersCollapsed] = useState(true);
  const [showAllParticipants, setShowAllParticipants] = useState(false);

  // global wipe policy
  const [wipeOnChange, setWipeOnChange] = useState(null);
  const [updatingWipe, setUpdatingWipe] = useState(false);

  // feeds
  const [feeds, setFeeds] = useState([]);
  const [feedId, setFeedId] = useState("");
  const [feedName, setFeedName] = useState("");
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [feedsError, setFeedsError] = useState("");

  const [defaultFeedId, setDefaultFeedId] = useState(null);
  const feedsAbortRef = useRef(null);

  // feed flags per project+feed
  const [feedFlags, setFeedFlags] = useState({});

  // UX overlay control
  const showOverlay =
    isSaving ||
    (booting && !projectsError && !feedsError) ||
    (!booting && feedsLoading && !feedsError);
  const showBlur = showOverlay;



  const loadStatsFor = async (id) => {
    if (!id) return;
    const k = keyFor(projectId, id);
    if (feedStats[k]) return; // already loaded for this (project,feed)
    const s = await fetchParticipantsStats(projectId, id);
    setFeedStats((m) => ({
      ...m,
      [k]: s || { total: 0, submitted: 0, avg_ms_enter_to_submit: null }
    }));
  };

  const loadFlagsFor = async (fid, { force = false } = {}) => {
    if (!fid) return;
    const k = keyFor(projectId, fid);
    if (!force && (feedFlags[k]?.loaded || feedFlags[k]?.loading)) return;
    setFeedFlags((m) => ({ ...m, [k]: { ...(m[k] || {}), loading: true } }));
    const f = await getFeedFlagsFromBackend({ projectId, feedId: fid });
    setFeedFlags((m) => ({ ...m, [k]: { ...f, loaded: true, loading: false } }));
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
    persistProjectId(projectId, { persist: true, updateUrl: false });
  }, [projectId]);

  // counts
  const [usersCount, setUsersCount] = useState(null);

  useEffect(() => {
    if (!projectsLoading && !feedsLoading) {
      setBooting(false);
    }
  }, [projectsLoading, feedsLoading]);

  useEffect(() => {
    if (feedId) loadStatsFor(feedId);
    if (feedId) loadFlagsFor(feedId);
  }, [feedId, projectId]); // include projectId

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

      // URL > state/storage > backend default > first
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

  const loadFeeds = useCallback(async () => {
    feedsAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    feedsAbortRef.current = ctrl;

    setFeedsError("");
    setFeedsLoading(true);

    try {
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
        loadFlagsFor(chosen.feed_id);
        if (backendDefault && backendDefault !== chosen.feed_id) loadFlagsFor(backendDefault);
      } else {
        setFeedId("");
        setFeedName("");
        setPosts([]);
        setPostNames({});
      }

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
  }, [setPosts, projectId]);

  // Initial load
  useEffect(() => {
    loadProjects();
    return () => { projectsAbortRef.current?.abort?.(); };
  }, [loadProjects]);

  useEffect(() => {
    if (!projectId) return;
    setFeedStats({});
    setFeedFlags({});
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
    setPostNames(readPostNames(projectId, id) || {});
    loadFlagsFor(id);
  };

  const createNewProject = async () => {
    const id = prompt("New project ID (letters/numbers/underscores):", `proj_${(projects.length || 0) + 1}`);
    if (!id) return;
    const name = prompt("Optional project name:", id) || id;
    const ok = await (createProjectOnBackend?.({ projectId: id, name }).catch(() => true));
    if (!ok) { alert("Failed to create project."); return; }
    setProjects(prev => [{ project_id: id, name }, ...prev]);
    setProjectId(id);
    setProjectName(name);
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
      authorType: "female",

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
      postName: p.postName ?? p.name ?? "",
      authorType: p.authorType ?? (p.adType === "ad" ? "company" : "female"),
    });
  };

  const removePost = (id) => {
    if (!confirm("Delete this post?")) return;
    setPosts((arr) => arr.filter((p) => p.id !== id));
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
      if ("showTime" in clean) delete clean.showTime;

      if (!clean.authorType) {
        clean.authorType = clean.adType === "ad" ? "company" : "female";
      }

      if (clean.postName && !clean.name) clean.name = clean.postName;

      // avatar rules
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

      const nextPosts = idx === -1 ? [...arr, clean] : arr.map((p, i) => (i === idx ? clean : p));

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
    writePostNames(projectId, feedId, {});
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
  title={app === "ig" ? "Instagram Admin Dashboard" : "Facebook Admin Dashboard"}
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
                      setBooting(true);
                      setProjectId(pid);
                      setProjectName(row?.name || pid);
                      persistProjectId(pid, { persist: true, updateUrl: true });
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

          {/* Feeds */}
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

                <button className="btn" onClick={() => loadFeeds()} title="Reload feed registry from backend">
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
                    <th style={{ padding: ".4rem .5rem", minWidth: 520 }}>Actions</th>
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
                      const isLoaded  = f.feed_id === feedId;
                      const stats     = feedStats[keyFor(projectId, f.feed_id)];
                      const rowKey    = keyFor(projectId, f.feed_id);
                      const ff        = feedFlags[rowKey] || {};

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

<div style={{
  display: "flex",
  flexWrap: "wrap",
  gap: ".4rem",
  padding: ".2rem .2rem",
  background: "rgba(0,0,0,0.04)",
  borderRadius: 8
}}>
  <FlagToggle projectId={projectId} feedId={f.feed_id} flag="randomize_times" label="Times" />
  <FlagToggle projectId={projectId} feedId={f.feed_id} flag="randomize_names"   label="Names" />
  <FlagToggle projectId={projectId} feedId={f.feed_id} flag="randomize_avatars" label="Avatars" />
  <FlagToggle projectId={projectId} feedId={f.feed_id} flag="randomize_images"  label="Images" />
  <FlagToggle projectId={projectId} feedId={f.feed_id} flag="randomize_bios"    label="Bios" />
</div>

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
                                          arr.forEach(p => {
                                            if ("showTime" in p) delete p.showTime;
                                            if (!p.authorType) p.authorType = p.adType === "ad" ? "company" : "female";
                                          });
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

          {/* Posts */}
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
                        arr.forEach(p => { 
                          if ("showTime" in p) delete p.showTime; 
                          if (!p.authorType) {
                            p.authorType = p.adType === "ad" ? "company" : "female";
                          }
                        });
                        setPosts(arr);
                        const row = feeds.find(f => f.feed_id === feedId);
                        if (row) setCachedPosts(projectId, feedId, row.checksum, arr);
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
                                    if (next === null) return;
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
                  style={{ display: usersCollapsed ? "none" : "block" }}
                >
                  <AdminUsersPanel embed onCountChange={setUsersCount} />
                </div>
              </div>
            </Section>
          </RoleGate>
        </div>
      </div>

      {/* Editor modal */}
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
          <AdminPostEditor
            editing={editing}
            setEditing={setEditing}
            isNew={isNew}
            projectId={projectId}
            feedId={feedId}
            setUploadingVideo={setUploadingVideo}
            setUploadingPoster={setUploadingPoster}
          />
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