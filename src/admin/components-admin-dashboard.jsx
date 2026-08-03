//// components-admin-dashboard.jsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  setProjectId as persistProjectId,
  getProjectId,
  APP,
  readPostNames,
  writePostNames,
  fetchFeedFlags,
  setFeedFlagsOnBackend,
  fetchParticipantsStats,
} from "../utils";

import { Routes, Route, Navigate } from "react-router-dom";

import "./ui/tokens.css";
import { Modal, LoadingOverlay } from "../ui-core";
import { AdminUsersPanel } from "./components-admin-users";
import { AdminSurveysPanel } from "./components-admin-surveys";
import { AdminFeedsPanel } from "./components-admin-feeds";
import { randomAvatarByKind } from "../avatar-utils";
import { AdminShell } from "./AdminShell";
import { PageHeader, Badge, RoleGate } from "./ui";

// Dynamically choose correct editor (FB or IG)
import {
  genNeutralAvatarDataUrl as genNeutralAvatarDataUrlFB,
  makeRandomPost as makeRandomPostFB,
} from "./components-admin-editor-facebook";
import { AdminPostEditor as AdminPostEditorFB } from "./components-admin-editor-facebook";
import { AdminPostEditor as AdminPostEditorIG } from "./components-admin-editor-instagram";
import {
  genNeutralAvatarDataUrl as genNeutralAvatarDataUrlAMZ,
  makeRandomPost as makeRandomPostAMZ,
  AdminPostEditor as AdminPostEditorAMZ,
} from "./components-admin-editor-amazon";

// Pick based on current app (set in main-*.jsx or ?app=...)
const app = (
  window.APP ||
  new URLSearchParams(window.location.search).get("app") ||
  "fb"
).toLowerCase();
const AdminPostEditor = app === "ig" ? AdminPostEditorIG : app === "amz" ? AdminPostEditorAMZ : AdminPostEditorFB;
const makeRandomPost = app === "amz" ? makeRandomPostAMZ : makeRandomPostFB;
const genNeutralAvatarDataUrl = app === "amz" ? genNeutralAvatarDataUrlAMZ : genNeutralAvatarDataUrlFB;
const CONTENT_UNIT_LABEL = app === "amz" || app === "amazon" ? "Review" : "Post";
const CONTENT_UNIT_LABEL_PLURAL = app === "amz" || app === "amazon" ? "Reviews" : "Posts";
const APP_LABEL =
  app === "ig" || app === "instagram"
    ? "Instagram"
    : app === "amz" || app === "amazon"
      ? "Amazon"
      : "Facebook";
const DASHBOARD_TITLE = `${APP_LABEL} Admin Dashboard`;
const EXPORT_TITLE = app === "amz" || app === "amazon" ? "Amazon reviews export" : `${APP_LABEL} feed export`;


/* ---------- local backups + snapshots ----------------- */
function saveLocalBackup(projectId, feedId, appName, posts) {
  try {
    const k = `backup::${appName || "fb"}::${projectId || "global"}::${feedId}`;
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
      data: {
        app,
        projectId: projectId || "global",
        feedId,
        ts: new Date().toISOString(),
        posts,
      },
      projectId,
      feedId,
      prefix: `backups/${app}/${projectId || "global"}/${feedId}`,
      filename,
    });
    return cdnUrl;
  } catch (e) {
    console.warn("Backup to S3 failed (continuing):", e);
    return null;
  }
}


/* ------------------------ Feed PDF / Word export helpers ------------------- */
function escapeHtml(value = "") {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(value = "") {
  const div = document.createElement("div");
  div.innerHTML = String(value || "");
  return div.textContent || div.innerText || "";
}

function getPostDisplayName(post, postNames = {}) {
  const friendly = String(post?.name || postNames?.[post?.id] || "").trim();
  if (friendly) return friendly;
  if (app === "amz") {
    return String(post?.review_title || post?.title || post?.reviewer || post?.reviewer_name || post?.author || "Review");
  }
  return String(post?.author || "Post");
}

function getPostImageUrl(post) {
  if (!post || post.videoMode !== "none") return "";
  if (post.image && typeof post.image === "object" && post.image.url) return String(post.image.url);
  if (Array.isArray(post.images) && post.images.length && post.images[0]?.url) return String(post.images[0].url);
  return "";
}

function getPostAvatarUrl(post) {
  if (!post) return "";
  if (post.avatarUrl) return String(post.avatarUrl);
  if (post.avatarMode === "neutral") return genNeutralAvatarDataUrl(64);
  if (post.avatarMode === "random") {
    return randomAvatarByKind(
      post.avatarRandomKind || "any",
      post.id || post.author || "seed",
      post.author || "",
      randomAvatarUrl
    );
  }
  return "";
}

function normalizeFeedExportPosts(posts = [], postNames = {}) {
  return (Array.isArray(posts) ? posts : []).map((post, idx) => {
    const resolved = { ...(post || {}) };
    resolved.__displayName = getPostDisplayName(resolved, postNames);
    resolved.__avatarUrl = getPostAvatarUrl(resolved);
    resolved.__imageUrl = getPostImageUrl(resolved);
    resolved.__number = idx + 1;
    return resolved;
  });
}

function buildRenderedFeedExportHtml({
  posts = [],
  appName = "fb",
  projectId = "",
  feedId = "",
  feedName = "",
  postNames = {},
}) {
  const normalized = normalizeFeedExportPosts(posts, postNames);
  const appKey = String(appName || app || "fb").toLowerCase();
  const title = appKey === "amz" || appKey === "amazon"
    ? "Amazon reviews export"
    : `${appKey === "ig" || appKey === "instagram" ? "Instagram" : "Facebook"} feed export`;
  const exportedAt = new Date().toLocaleString();

  const postCards = normalized
    .map((post) => {
      const text = escapeHtml(post.text || "").replace(/\n/g, "<br/>");
      const avatar = post.__avatarUrl
        ? `<img class="avatar" src="${escapeHtml(post.__avatarUrl)}" alt=""/>`
        : `<div class="avatar avatar-placeholder"></div>`;
      const media = post.__imageUrl
        ? `<img class="post-image" src="${escapeHtml(post.__imageUrl)}" alt="${escapeHtml(post.image?.alt || "")}"/>`
        : post.videoMode !== "none"
          ? `<div class="video-placeholder">Video post: ${escapeHtml(post.video?.url || post.videoPosterUrl || "")}</div>`
          : "";

      const adBlock =
        post.adType === "news"
          ? `<div class="ad-block">
              <div class="ad-sub">${escapeHtml(post.newsDomain || post.adDomain || "")}</div>
              <div class="ad-head">${escapeHtml(post.newsHeadline || post.adHeadline || "")}</div>
              ${(post.newsDescription || post.adSubheadline) ? `<div class="ad-sub">${escapeHtml(post.newsDescription || post.adSubheadline || "")}</div>` : ""}
            </div>`
          : post.adType && post.adType !== "none"
            ? `<div class="ad-block">
                <div class="ad-sub">${escapeHtml(post.adSubheadline || post.adDomain || "")}</div>
                <div class="ad-head">${escapeHtml(post.adHeadline || "")}</div>
                ${post.adButtonText ? `<div class="ad-btn">${escapeHtml(post.adButtonText)}</div>` : ""}
              </div>`
            : "";

      const note =
        post.interventionType && post.interventionType !== "none" && post.noteText
          ? `<div class="note"><strong>Context note</strong><br/>${escapeHtml(post.noteText).replace(/\n/g, "<br/>")}</div>`
          : "";

      return `
        <article class="post-card">
          <div class="post-export-label">Post ${post.__number}: ${escapeHtml(post.__displayName)}</div>
          <header class="post-head">
            ${avatar}
            <div class="post-meta">
              <div class="author">${escapeHtml(post.author || "Author")}${post.badge ? " ✓" : ""}</div>
              <div class="time">${escapeHtml(post.time || "")}${post.topic ? ` · ${escapeHtml(post.topic)}` : ""}</div>
            </div>
          </header>
          ${text ? `<div class="post-text">${text}</div>` : ""}
          ${media}
          ${adBlock}
          ${note}
          <footer class="post-footer">
            ${isIG ? "Like · Comment · Share · Save" : "Like · Comment · Share"}
          </footer>
        </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)} - ${escapeHtml(feedId || "feed")}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 14px;
    background: #f3f4f6;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    font-size: 10px;
    line-height: 1.28;
  }
  .export-shell {
    max-width: ${isIG ? "620px" : "880px"};
    margin: 0 auto;
  }
  .doc-head {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }
  .doc-head h1 {
    margin: 0 0 4px;
    font-size: 17px;
  }
  .doc-meta {
    color: #4b5563;
    font-size: 11px;
  }
  .post-card {
    width: 100%;
    max-width: ${isIG ? "360px" : "620px"};
    margin: 0 auto 9px;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: ${isIG ? "10px" : "8px"};
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    box-shadow: 0 1px 2px rgba(0,0,0,.05);
  }
  .post-export-label {
    padding: 5px 9px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    color: #374151;
    font-weight: 600;
    font-size: 10px;
  }
  .post-head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 9px 4px;
  }
  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    object-fit: cover;
    flex: 0 0 auto;
    background: #e5e7eb;
  }
  .avatar-placeholder { border: 1px solid #d1d5db; }
  .author { font-weight: 700; }
  .time { color: #6b7280; font-size: 10px; }
  .post-text {
    padding: 2px 9px 7px;
    white-space: normal;
  }
  .post-image {
    display: block;
    width: 100%;
    max-height: ${isIG ? "360px" : "260px"};
    object-fit: cover;
    background: #e5e7eb;
  }
  .video-placeholder {
    padding: 28px 10px;
    text-align: center;
    background: #111827;
    color: #fff;
    word-break: break-all;
  }
  .ad-block {
    margin: 0;
    padding: 7px 9px;
    background: #f3f4f6;
    border-top: 1px solid #e5e7eb;
  }
  .ad-sub { color: #6b7280; font-size: 12px; }
  .ad-head { font-weight: 700; margin-top: 2px; }
  .ad-btn {
    display: inline-block;
    margin-top: 4px;
    padding: 4px 7px;
    border-radius: 6px;
    background: #e5e7eb;
    font-weight: 700;
    font-size: 10px;
  }
  .note {
    margin: 7px 9px;
    padding: 6px 8px;
    border-radius: 10px;
    background: #f9fafb;
    border: 1px solid #d1d5db;
  }
  .post-footer {
    padding: 6px 9px;
    border-top: 1px solid #e5e7eb;
    color: #4b5563;
    font-weight: 600;
    font-size: 11px;
  }
  @media print {
    @page { size: A4; margin: 8mm; }
    body { background: #fff; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .export-shell { max-width: none; }
    .doc-head, .post-card { box-shadow: none; }
    .post-card { max-width: ${isIG ? "350px" : "610px"}; }
  }
</style>
</head>
<body>
  <main class="export-shell">
    <section class="doc-head">
      <h1>${escapeHtml(title)}</h1>
      <div class="doc-meta">
        <div><strong>Project:</strong> ${escapeHtml(projectId || "global")}</div>
        <div><strong>Feed:</strong> ${escapeHtml(feedName || feedId || "selected feed")}</div>
        <div><strong>App:</strong> ${escapeHtml(String(appName || "").toUpperCase())}</div>
        <div><strong>Exported:</strong> ${escapeHtml(exportedAt)}</div>
        <div><strong>${CONTENT_UNIT_LABEL_PLURAL}:</strong> ${normalized.length}</div>
      </div>
    </section>
    ${postCards || `<p>No ${CONTENT_UNIT_LABEL_PLURAL.toLowerCase()} available for this feed.</p>`}
  </main>
</body>
</html>`;
}

function exportFeedAsPdf(args) {
  const html = buildRenderedFeedExportHtml(args);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      try { iframe.remove(); } catch {}
    }, 1500);
  };

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    alert("Could not create the printable feed document.");
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error("Feed PDF export failed:", err);
      alert("Could not open the print dialog. Please try again.");
    } finally {
      cleanup();
    }
  };

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {}
  }, 700);
}

// fetchParticipantsStats / getFeedFlagsFromBackend / setFeedFlagsOnBackend
// used to be defined locally here, hardcoded to GAS — found and ported to
// utils-backend.js during a full audit for unported functions, 2026-08-02
// (see CLAUDE.md "Backend migration"). getFeedFlagsFromBackend duplicated
// the already-ported fetchFeedFlags exactly (same normalized return shape),
// so that one's gone entirely, not just moved — fetchFeedFlags (imported
// above) is used directly at its one call site instead.

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


/* ----------------------------- Admin Dashboard ------------------------------ */
export function AdminDashboard({
  posts,
  setPosts,
  randomize,
  setRandomize,
  showComposer,
  setShowComposer,
  resetLog,
  onPublishPosts,
  onLogout,
}) {
  const pidForBackend = (pid) => (pid && pid !== "global" ? pid : undefined);

  const [sessExpiringSec, setSessExpiringSec] = useState(null);
  const [sessExpired, setSessExpired] = useState(false);
  const [touching, setTouching] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ppOpen, setPpOpen] = useState(true);
  const [feedStats, setFeedStats] = useState({});
  const [postNames, setPostNames] = useState({});
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

  // counts
  const [usersCount, setUsersCount] = useState(null);

  // UX overlay control
  const showOverlay =
    isSaving ||
    (booting && !projectsError && !feedsError) ||
    (!booting && feedsLoading && !feedsError);
  const showBlur = showOverlay;

  const keyFor = (pid, fid) => `${pid || "global"}::${fid}`;

  const loadStatsFor = async (id) => {
    if (!id) return;
    const k = keyFor(projectId, id);
    if (feedStats[k]) return;
    const s = await fetchParticipantsStats(projectId, id);
    setFeedStats((m) => ({
      ...m,
      [k]: s || { total: 0, submitted: 0, avg_ms_enter_to_submit: null },
    }));
  };

  const loadFlagsFor = async (fid, { force = false } = {}) => {
    if (!fid) return;
    const k = keyFor(projectId, fid);
    if (!force && (feedFlags[k]?.loaded || feedFlags[k]?.loading)) return;
    setFeedFlags((m) => ({ ...m, [k]: { ...(m[k] || {}), loading: true } }));
    const f = await fetchFeedFlags({ app: APP, projectId, feedId: fid });
    setFeedFlags((m) => ({ ...m, [k]: { ...f, loaded: true, loading: false } }));
  };

  // Replaces 5 hand-duplicated per-flag toggle handlers. Also fixes an
  // existing bug where each handler's mutual-exclusion guard only checked
  // some of its 5 sibling `saving*` flags (inconsistently, 3-of-5 to 5-of-5)
  // instead of all of them.
  const FLAG_KINDS = {
    time: { backendField: "random_time", savingKey: "saving", readKeys: ["randomize_times", "random_time"], label: "Time" },
    avatar: { backendField: "random_avatar", savingKey: "savingAv", readKeys: ["randomize_avatars", "random_avatar"], label: "Avatar" },
    image: { backendField: "random_image", savingKey: "savingImg", readKeys: ["randomize_images", "random_image"], label: "Image" },
    name: { backendField: "random_name", savingKey: "savingNm", readKeys: ["randomize_names", "random_name"], label: "Name" },
    bio: { backendField: "random_bio", savingKey: "savingBio", readKeys: ["randomize_bios", "random_bio"], label: "Bio" },
  };
  const ALL_SAVING_KEYS = Object.values(FLAG_KINDS).map((k) => k.savingKey);

  const readFlagValue = (ff, kind) => {
    const { readKeys } = FLAG_KINDS[kind];
    return !!(ff?.[readKeys[0]] ?? ff?.[readKeys[1]]);
  };

  const toggleFlag = async (targetFeedId, kind) => {
    const rowKey = keyFor(projectId, targetFeedId);
    const { backendField, savingKey } = FLAG_KINDS[kind];

    if (!feedFlags[rowKey]?.loaded && !feedFlags[rowKey]?.loading) {
      await loadFlagsFor(targetFeedId);
    }

    const cur = feedFlags[rowKey] || {};
    if (ALL_SAVING_KEYS.some((k) => cur[k])) return;

    const curVal = readFlagValue(cur, kind);
    setFeedFlags((m) => ({ ...m, [rowKey]: { ...(m[rowKey] || {}), [savingKey]: true } }));

    try {
      const res = await setFeedFlagsOnBackend({
        projectId,
        feedId: targetFeedId,
        patch: { [backendField]: !curVal },
      });
      if (!res?.ok) {
        throw new Error(res?.err || "Failed to update feed flag.");
      }
      await loadFlagsFor(targetFeedId, { force: true });
    } catch (e) {
      alert(e.message || "Failed to update feed flag. Please re-login and try again.");
    } finally {
      setFeedFlags((m) => ({ ...m, [rowKey]: { ...(m[rowKey] || {}), [savingKey]: false } }));
    }
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

  useEffect(() => {
    if (!projectsLoading && !feedsLoading) {
      setBooting(false);
    }
  }, [projectsLoading, feedsLoading]);

  useEffect(() => {
    if (feedId) loadStatsFor(feedId);
    if (feedId) loadFlagsFor(feedId);
  }, [feedId, projectId]);

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
      onExpired: () => {
        setSessExpired(true);
        setSessExpiringSec(0);
      },
    });
    return stop;
  }, []);

  // Silently keep the locally-tracked expiry in sync with Supabase's own
  // background token refresh (supabase-js auto-refreshes the access token
  // well before it expires, but nothing previously re-read that renewed
  // session — so the "session expiring"/"expired" UI below was firing on a
  // schedule tied to the *original* login, regardless of how much the real
  // session had already been silently extended underneath it). Doing this
  // proactively, on a timer, rather than waiting for the visible warning
  // banner to prompt a manual click, means an actively-open admin tab
  // effectively never sees the expiry flow at all — matching how most
  // dashboards keep a session alive for as long as it's actually in use.
  useEffect(() => {
    let cancelled = false;

    const silentRefresh = async () => {
      try {
        const res = await touchAdminSession();
        if (cancelled || !res?.ok) return;
        const left = getAdminSecondsLeft();
        if (left != null && left > 120) setSessExpiringSec(null);
        setSessExpired(false);
      } catch {
        // Best-effort — if this fails repeatedly because the session is
        // genuinely gone (signed out elsewhere, disabled, refresh token
        // finally expired), the existing tick-based watch above still
        // catches that from the last-known real expiry and surfaces the
        // warning/expired UI normally.
      }
    };

    silentRefresh();
    const id = setInterval(silentRefresh, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
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
        listProjectsFromBackend({ signal: ctrl.signal }).catch(() => [
          { project_id: "global", name: "Global" },
        ]),
        getDefaultProjectFromBackend({ signal: ctrl.signal }).catch(() => "global"),
      ]);

      if (ctrl.signal.aborted) return;

      const projList =
        Array.isArray(list) && list.length ? list : [{ project_id: "global", name: "Global" }];
      setProjects(projList);
      setDefaultProjectId(backendDefault || null);

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

      const chosen = projList.find((p) => p.project_id === desired) || projList[0];
      const chosenId = chosen?.project_id || "global";
      setProjectId(chosenId);
      persistProjectId(chosenId, { persist: true, updateUrl: false });
      setProjectName(chosen?.name || chosenId || "Global");
    } catch (e) {
      const isAbort = e?.name === "AbortError";
      setProjectsError(
        isAbort
          ? "Project loading was interrupted. You can try again."
          : "Failed to load projects from the backend. Please try again."
      );
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
        feedsList.find((f) => f.feed_id === backendDefault) || feedsList[0] || null;

      if (chosen) {
        setFeedId(chosen.feed_id);
        setFeedName(chosen.name || chosen.feed_id);

        const cached = getCachedPosts(projectId, chosen.feed_id, chosen.checksum);
        if (cached) {
          setPosts(cached);
        } else {
          const fresh = await loadPostsFromBackend(chosen.feed_id, {
            projectId: pidForBackend(projectId),
            force: true,
            signal: ctrl.signal,
          });
          if (ctrl.signal.aborted) return;
          const arr = Array.isArray(fresh) ? fresh : [];
          arr.forEach((p) => {
            if ("showTime" in p) delete p.showTime;
            if (!p.authorType) {
              p.authorType = (p.adType === "ad" || p.adType === "news") ? "company" : "female";
            }
          });
          setPosts(arr);
          setCachedPosts(projectId, chosen.feed_id, chosen.checksum, arr);
        }

        setPostNames(readPostNames(projectId, chosen.feed_id) || {});
        loadFlagsFor(chosen.feed_id);
        if (backendDefault && backendDefault !== chosen.feed_id) {
          loadFlagsFor(backendDefault);
        }
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
      setFeedsError(
        isAbort
          ? "Feed loading was interrupted. You can try again."
          : "Failed to load feeds from the backend. Please try again."
      );
    } finally {
      if (feedsAbortRef.current === ctrl) feedsAbortRef.current = null;
      setFeedsLoading(false);
    }
  }, [setPosts, projectId]);

  const loadFeedPostsForSurveys = useCallback(
    async (targetFeedId) => {
      const fresh = await loadPostsFromBackend(targetFeedId, {
        projectId: pidForBackend(projectId),
        force: true,
      });

      const arr = Array.isArray(fresh) ? fresh : [];
      arr.forEach((p) => {
        if ("showTime" in p) delete p.showTime;
        if (!p.authorType) {
          p.authorType = (p.adType === "ad" || p.adType === "news") ? "company" : "female";
        }
      });

      return arr;
    },
    [projectId]
  );

  // Initial load
  useEffect(() => {
    loadProjects();
    return () => {
      projectsAbortRef.current?.abort?.();
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!projectId) return;
    setFeedStats({});
    setFeedFlags({});
    loadFeeds();
    return () => {
      feedsAbortRef.current?.abort?.();
    };
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
    const row = feeds.find((f) => String(f.feed_id) === String(id));
    setFeedId(id);
    setFeedName(row?.name || id);

    const cached = row ? getCachedPosts(projectId, id, row.checksum) : null;
    if (cached) {
      setPosts(cached);
    } else {
      const fresh = await loadPostsFromBackend(id, {
        projectId: pidForBackend(projectId),
        force: true,
      });
      const arr = Array.isArray(fresh) ? fresh : [];
      arr.forEach((p) => {
        if ("showTime" in p) delete p.showTime;
        if (!p.authorType) {
          p.authorType = (p.adType === "ad" || p.adType === "news") ? "company" : "female";
        }
      });
      setPosts(arr);
      if (row) setCachedPosts(projectId, id, row.checksum, arr);
    }

    setPostNames(readPostNames(projectId, id) || {});
    loadFlagsFor(id);
  };

  const createNewFeed = () => {
    const id = prompt(
      "New feed ID (letters/numbers/underscores):",
      `feed_${(feeds.length || 0) + 1}`
    );
    if (!id) return;
    const name = prompt("Optional feed name (shown in admin):", id) || id;
    setFeedId(id);
    setFeedName(name);
    setPosts([]);
    setPostNames({});
    setFeeds((prev) => {
      const exists = prev.some((f) => String(f.feed_id) === String(id));
      return exists ? prev : [{ feed_id: id, name, checksum: "", updated_at: "" }, ...prev];
    });
  };

  // Duplicates the currently-selected feed's posts into a new feed, the same
  // way real studies build Control/Treatment variants from a shared template
  // (see the posts.id migration notes — sharing bare post ids across feeds
  // is an intentional, supported pattern, not an edge case, so the copied
  // posts deliberately keep their original ids). Like `createNewFeed`, the
  // new feed is pure local editor state until "Save" is clicked — no
  // separate backend call needed.
  const copyFeed = () => {
    if (!feedId) return;
    const id = prompt("New feed ID (letters/numbers/underscores):", `${feedId}_copy`);
    if (!id) return;
    if (feeds.some((f) => String(f.feed_id) === String(id))) {
      alert("A feed with that ID already exists.");
      return;
    }
    const name =
      prompt("Optional feed name (shown in admin):", `${feedName || feedId} (Copy)`) || id;

    const copiedPosts = JSON.parse(JSON.stringify(posts));
    const copiedPostNames = { ...postNames };

    setFeedId(id);
    setFeedName(name);
    setPosts(copiedPosts);
    setPostNames(copiedPostNames);
    setFeeds((prev) => [{ feed_id: id, name, checksum: "", updated_at: "" }, ...prev]);
    writePostNames(projectId, id, copiedPostNames);
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
      showBio: false,
      bio_text: "",
      bio_url: "",
      bio_posts: 0,
      bio_followers: 0,
      bio_following: 0,

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
      adUrl: "",
      newsDomain: "",
      newsHeadline: "",
      newsDescription: "",
      newsUrl: "",
    });
  };

  const openEdit = (p) => {
    setIsNew(false);
    setEditing({
      ...p,
      postName: p.postName ?? p.name ?? "",
      authorType: p.authorType ?? ((p.adType === "ad" || p.adType === "news") ? "company" : "female"),
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
    if (!editing.author?.trim() && app !== "amz" && app !== "amazon") {
      alert("Author is required.");
      return;
    }
    if (!editing.text?.trim()) {
      alert(`${CONTENT_UNIT_LABEL} text is required.`);
      return;
    }

    setPosts((arr) => {
      const idx = arr.findIndex((p) => p.id === editing.id);
      const clean = { ...editing };
      if ("showTime" in clean) delete clean.showTime;

      if (!clean.authorType) {
        clean.authorType = (clean.adType === "ad" || clean.adType === "news") ? "company" : "female";
      }

      if (clean.postName && !clean.name) clean.name = clean.postName;

      if (clean.avatarMode === "random" && !clean.avatarUrl) {
        clean.avatarUrl = randomAvatarByKind(
          clean.avatarRandomKind || "any",
          clean.id || clean.author || "seed",
          clean.author || "",
          randomAvatarUrl
        );
      }
      if (clean.avatarMode === "random" && clean.avatarRandomKind === "company") {
        clean.avatarUrl = randomAvatarByKind(
          "company",
          clean.id || clean.author || "seed",
          clean.author || ""
        );
      }
      if (clean.avatarMode === "neutral") {
        clean.avatarUrl = genNeutralAvatarDataUrl(64);
      }

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

  // Extracted from the old flat Feeds-table row actions / Posts-page toolbar
  // for the AdminFeedsPanel master-detail conversion — same logic, just
  // named and passed down as props instead of inline JSX closures.
  //
  // handleSaveFeed previously supported saving the current editor's posts
  // into a DIFFERENT feed than the one loaded (with a confirm() guard) — a
  // cross-save escape hatch that only made sense in a flat table where Posts
  // wasn't scoped to any one row. In a one-feed-at-a-time detail view, Save
  // unambiguously targets the selected feed only (confirmed with the user).
  const handleSaveFeed = async () => {
    if (!feedId) return;
    setIsSaving(true);
    try {
      saveLocalBackup(projectId, feedId, APP, posts);
      await snapshotToS3({ posts, projectId, feedId, app: APP });
      const row = feeds.find((f) => f.feed_id === feedId);
      const ok = await savePostsToBackend(posts, {
        projectId: pidForBackend(projectId),
        feedId,
        name: row?.name || feedId,
        app: APP,
      });

      if (ok) {
        const list = await listFeedsFromBackend({ projectId: pidForBackend(projectId) });
        const nextFeeds = Array.isArray(list) ? list : [];
        setFeeds(nextFeeds);
        const nextRow = nextFeeds.find((x) => x.feed_id === feedId);
        if (nextRow) {
          const fresh = await loadPostsFromBackend(feedId, {
            projectId: pidForBackend(projectId),
            force: true,
          });
          const arr = Array.isArray(fresh) ? fresh : [];
          arr.forEach((p) => {
            if ("showTime" in p) delete p.showTime;
            if (!p.authorType) {
              p.authorType = (p.adType === "ad" || p.adType === "news") ? "company" : "female";
            }
          });
          setPosts(arr);
          setCachedPosts(projectId, feedId, nextRow.checksum, arr);
        }
        alert("Feed saved (snapshot created).");
      } else {
        alert("Failed to save feed. A local snapshot was still created.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefaultFeed = async (fid) => {
    const ok = await setDefaultFeedOnBackend(fid);
    if (ok) setDefaultFeedId(fid);
  };

  const handleCopyParticipantLink = async (f) => {
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
  };

  const handleDeleteFeed = async (f) => {
    const okGo = confirm(
      `Delete feed "${f.name || f.feed_id}"?\n\nThis removes posts, participants, and cannot be undone.`
    );
    if (!okGo) return;
    const ok = await deleteFeedOnBackend(f.feed_id);
    if (ok) {
      if (f.feed_id === feedId) {
        const next = feeds.filter((x) => x.feed_id !== f.feed_id);
        const nextSel = next[0] || null;
        setFeeds(next);
        if (nextSel) {
          await selectFeed(nextSel.feed_id);
        } else {
          setFeedId("");
          setFeedName("");
          setPosts([]);
        }
      } else {
        setFeeds((prev) => prev.filter((x) => x.feed_id !== f.feed_id));
      }
      if (defaultFeedId === f.feed_id) setDefaultFeedId(null);
      alert("Feed deleted.");
    } else {
      alert("Failed to delete feed. Please re-login and try again.");
    }
  };

  const handleSetWipePolicy = async () => {
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
  };

  const handleRefreshPosts = async () => {
    const fresh = await loadPostsFromBackend(feedId, {
      projectId: pidForBackend(projectId),
      force: true,
    });
    const arr = Array.isArray(fresh) ? fresh : [];
    arr.forEach((p) => {
      if ("showTime" in p) delete p.showTime;
      if (!p.authorType) {
        p.authorType = (p.adType === "ad" || p.adType === "news") ? "company" : "female";
      }
    });
    setPosts(arr);
    const row = feeds.find((f) => f.feed_id === feedId);
    if (row) setCachedPosts(projectId, feedId, row.checksum, arr);
    setPostNames(readPostNames(projectId, feedId) || {});
  };

  const handleExportPostsJson = () => {
    const payload = {
      app: APP,
      projectId: projectId || "global",
      feedId,
      ts: new Date().toISOString(),
      posts: posts.map((p) => ({
        ...p,
        name: (p.name ?? postNames?.[p.id] ?? "").trim() || undefined,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectId || "global"}-${feedId}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportFeedPdf = () => {
    const row = feeds.find((f) => f.feed_id === feedId);
    exportFeedAsPdf({
      posts,
      appName: APP,
      projectId: projectId || "global",
      feedId,
      feedName: row?.name || feedId,
      postNames,
    });
  };

  const handleImportPostsJson = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = Array.isArray(parsed) ? parsed : parsed.posts || [];
      if (!Array.isArray(imported)) {
        alert("This file doesn't look like a posts backup.");
        return;
      }
      if (
        !confirm(
          `Replace current editor posts (${posts.length}) with imported posts (${imported.length})?`
        )
      ) {
        return;
      }
      setPosts(imported);
      alert("Imported. Remember to Save to publish back to the backend.");
    } catch (err) {
      console.error(err);
      alert("Failed to import JSON.");
    }
  };

  const handleRenamePost = (id) => {
    const cur = postNames[id] || "";
    const next = prompt("Post name (used in CSV headers):", cur ?? "");
    if (next === null) return;
    const name = (next || "").trim();
    const map = { ...(postNames || {}) };
    if (name) map[id] = name;
    else delete map[id];
    setPostNames(map);
    writePostNames(projectId, feedId, map);
  };

  const handleOpenRandomPost = () => {
    const p = makeRandomPost();
    setIsNew(true);
    setEditing(p);
  };

  return (
    <div className="admin-shell" style={{ display: "grid", gap: "1rem" }}>
      {sessExpiringSec != null && !sessExpired && (
        <div role="status" className="admin-banner">
          <div className="title">
            <span>Admin session is expiring</span>
            <span className="subtle">
              (~{Math.max(0, Math.floor(sessExpiringSec / 60))}m{" "}
              {String(sessExpiringSec % 60).padStart(2, "0")}s left)
            </span>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => setSessExpiringSec(null)}>
              Dismiss
            </button>
            <button className="btn" onClick={keepAlive} disabled={touching}>
              {touching ? "Refreshing…" : "Stay signed in"}
            </button>
          </div>
        </div>
      )}

      {showOverlay && (
        <LoadingOverlay
          title={isSaving ? "Saving feed…" : "Loading dashboard…"}
          subtitle={
            isSaving
              ? "Creating snapshot & publishing your changes"
              : "Fetching projects, feeds and posts from backend"
          }
        />
      )}

      {!feedsLoading && !!feedsError && (
        <div aria-live="assertive" className="admin-expired-backdrop">
          <div className="admin-expired-dialog">
            <h3>Feed loading failed</h3>
            <p className="subtle">{feedsError}</p>
            <div className="admin-expired-actions">
              <button className="btn" onClick={() => loadFeeds()}>
                Try again
              </button>
              <button className="btn ghost" onClick={() => setFeedsError("")}>
                Dismiss
              </button>
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
        <AdminShell
          title={DASHBOARD_TITLE}
          subtitle={`Signed in as ${getAdminEmail() || "unknown"} · role: ${getAdminRole() || "viewer"}`}
          onLogout={onLogout}
          showUsersNav={hasAdminRole("owner")}
          backTo="/admin"
          backLabel="← Switch project / platform"
          projectSwitcher={
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--admin-muted)",
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                Project
              </div>
              {/* Full name shown here (not truncated by a narrow sidebar) —
                  switching project/platform now happens on a dedicated page
                  (AdminProjectPicker/AdminPlatformPicker) via the back link
                  above, so this is just an identity readout. */}
              <div
                title={projectName || projectId || ""}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--admin-text)",
                  wordBreak: "break-word",
                  marginTop: 4,
                }}
              >
                {projectName || projectId || "—"}
                {projectId === defaultProjectId && (
                  <Badge tone="accent" style={{ marginLeft: 6 }}>
                    default
                  </Badge>
                )}
              </div>
            </div>
          }
        >
          <Routes>
            <Route index element={<Navigate to="/admin/dashboard/feeds" replace />} />

            <Route
              path="feeds"
              element={
                <AdminFeedsPanel
                  projectId={projectId}
                  feeds={feeds}
                  feedsLoading={feedsLoading}
                  selectedFeedId={feedId}
                  selectedFeedName={feedName}
                  defaultFeedId={defaultFeedId}
                  feedStats={feedStats}
                  feedFlags={feedFlags}
                  flagKinds={FLAG_KINDS}
                  allSavingKeys={ALL_SAVING_KEYS}
                  readFlagValue={readFlagValue}
                  wipeOnChange={wipeOnChange}
                  updatingWipe={updatingWipe}
                  isSaving={isSaving}
                  posts={posts}
                  postNames={postNames}
                  randomize={randomize}
                  contentUnitLabel={CONTENT_UNIT_LABEL}
                  contentUnitLabelPlural={CONTENT_UNIT_LABEL_PLURAL}
                  onSelectFeed={selectFeed}
                  onCreateFeed={createNewFeed}
                  onCopyFeed={copyFeed}
                  onRefreshFeeds={loadFeeds}
                  onLoadStats={loadStatsFor}
                  onLoadFlags={loadFlagsFor}
                  onToggleFlag={toggleFlag}
                  onSetDefaultFeed={handleSetDefaultFeed}
                  onDeleteFeed={handleDeleteFeed}
                  onSetWipePolicy={handleSetWipePolicy}
                  onCopyParticipantLink={handleCopyParticipantLink}
                  onSaveFeed={handleSaveFeed}
                  onSetRandomize={setRandomize}
                  onRefreshPosts={handleRefreshPosts}
                  onExportPostsJson={handleExportPostsJson}
                  onExportFeedPdf={handleExportFeedPdf}
                  onImportPostsJson={handleImportPostsJson}
                  onOpenNewPost={openNew}
                  onOpenRandomPost={handleOpenRandomPost}
                  onEditPost={openEdit}
                  onRenamePost={handleRenamePost}
                  onRemovePost={removePost}
                  onClearFeed={clearFeed}
                  onLogout={onLogout}
                />
              }
            />

            <Route
              path="surveys"
              element={
                <>
                  <PageHeader
                    title="Surveys"
                    subtitle="Create post-feed surveys and link one survey to one or more feeds in this project."
                  />
                  <AdminSurveysPanel
                    projectId={projectId}
                    feedId={feedId}
                    feeds={feeds}
                    loadFeedPosts={loadFeedPostsForSurveys}
                  />
                </>
              }
            />

            {/* Old top-level Posts/Participants routes are now tabs nested
                under a selected feed/survey (AdminFeedsPanel / AdminSurveysPanel) —
                explicit redirects so stale bookmarks/back-nav land somewhere
                sensible instead of only relying on the wildcard below. */}
            <Route path="posts" element={<Navigate to="/admin/dashboard/feeds" replace />} />
            <Route path="participants" element={<Navigate to="/admin/dashboard/feeds" replace />} />
            <Route path="participants/feed" element={<Navigate to="/admin/dashboard/feeds" replace />} />
            <Route path="participants/survey" element={<Navigate to="/admin/dashboard/surveys" replace />} />

            <Route
              path="users"
              element={
                <RoleGate min="owner">
                  <PageHeader
                    title={`Users${usersCount != null ? ` (${usersCount})` : ""}`}
                    subtitle="Manage admin users & roles."
                  />
                  <AdminUsersPanel embed onCountChange={setUsersCount} />
                </RoleGate>
              }
            />

            <Route path="*" element={<Navigate to="/admin/dashboard/feeds" replace />} />
          </Routes>
        </AdminShell>
      </div>

      {/* Editor modal */}
      {editing && (
        <Modal
          title={isNew ? `Add ${CONTENT_UNIT_LABEL}` : `Edit ${CONTENT_UNIT_LABEL}`}
          onClose={() => setEditing(null)}
          wide
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <RoleGate
                min="editor"
                elseRender={
                  <button className="btn" disabled title="Viewer mode">
                    Save
                  </button>
                }
              >
                <button className="btn primary" onClick={saveEditing}>
                  {isNew ? "Add" : "Save"}
                </button>
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
            <p className="subtle">
              Your admin token has expired. Please re-authenticate to continue.
            </p>
            <div className="admin-expired-actions">
              <button className="btn ghost" onClick={keepAlive} disabled={touching}>
                {touching ? "Trying…" : "Try to refresh"}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setSessExpired(false);
                  onLogout?.();
                }}
              >
                Go to login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}