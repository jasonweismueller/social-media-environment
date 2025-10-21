// utils-backend.js
// Depends on utils-core exports only (no circulars).
import {
  qProject,
  getProjectId,
  getFeedIdFromUrl,
  injectVideoPreload,
  primeVideoCache,
  DRIVE_RE,
} from "./utils-core";

/* --------------------- App + endpoints ---------------------- */
export const getApp = () => {
  const q = new URLSearchParams(window.location.search);
  const fromUrl = (q.get("app") || "").toLowerCase();
  const fromWin = (window.APP || "").toLowerCase();
  return fromUrl === "fb" || fromWin === "fb" ? "fb" : "fb"; // hard default FB
};
export const APP = getApp();

/* --------------------- Backend config (via API Gateway proxy) ------------- */
export const GAS_PROXY_BASE =
  (window.CONFIG && window.CONFIG.GAS_PROXY_BASE) ||
  "https://qkbi313c2i.execute-api.us-west-1.amazonaws.com";

export const GAS_PROXY_PATH =
  (window.CONFIG && window.CONFIG.GAS_PROXY_PATH) ||
  "/default/gas";

function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

// Prefer a single absolute API_BASE if provided; else fall back to base+path
export const GS_ENDPOINT =
  (window.CONFIG && window.CONFIG.API_BASE) ||
  joinUrl(
    (window.CONFIG && window.CONFIG.GAS_PROXY_BASE) || GAS_PROXY_BASE,
    (window.CONFIG && window.CONFIG.GAS_PROXY_PATH) || GAS_PROXY_PATH
  );

// NOTE: This token is ONLY for participant logging. Admin actions use admin_token from login.
export const GS_TOKEN = "a38d92c1-48f9-4f2c-bc94-12c72b9f3427";

/* ---------------------- Dynamic GET URL builders -------------------------- */
const FEEDS_GET_URL        = () => `${GS_ENDPOINT}?path=feeds&app=${APP}${qProject()}`;
const DEFAULT_FEED_GET_URL = () => `${GS_ENDPOINT}?path=default_feed&app=${APP}${qProject()}`;
const POSTS_GET_URL        = () => `${GS_ENDPOINT}?path=posts&app=${APP}${qProject()}`;
const PARTICIPANTS_GET_URL = () => `${GS_ENDPOINT}?path=participants&app=${APP}${qProject()}`;
const WIPE_POLICY_GET_URL  = `${GS_ENDPOINT}?path=wipe_policy`;

/* --------------------- Fetch helpers (timeout + retry) -------------------- */
async function fetchWithTimeout(url, opts = {}, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: opts.signal || ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function getJsonWithRetry(url, opts = {}, { retries = 1, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, opts, { timeoutMs });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr;
}

/* ======================= Admin User Management APIs ======================= */
export async function adminListUsers() {
  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action: "admin_list_users", admin_token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, err: data?.err || `HTTP ${res.status}` };
    return { ok: true, users: Array.isArray(data.users) ? data.users : [] };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

export async function adminCreateUser(email, password, role = "viewer") {
  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        action: "admin_create_user",
        admin_token,
        email,
        password,
        role,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, err: data?.err || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

export async function adminUpdateUser({ email, role, password, disabled }) {
  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };
  try {
    const payload = { action: "admin_update_user", admin_token, email };
    if (role != null) payload.role = role;
    if (password != null) payload.password = password;
    if (typeof disabled === "boolean") payload.disabled = !!disabled;

    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, err: data?.err || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

export async function adminDeleteUser(email) {
  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        action: "admin_delete_user",
        admin_token,
        email,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, err: data?.err || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

/* ======================= Flags (backend) ======================= */
export async function fetchFeedFlags({ app, projectId, feedId, endpoint }) {
  const qp = new URLSearchParams({ path: "get_feed_flags", app });
  if (projectId) qp.append("project_id", projectId);
  if (feedId) qp.append("feed_id", feedId);
  const res = await fetch(`${endpoint}?${qp.toString()}`, { credentials: "omit" });
  const j = await res.json().catch(() => ({}));
  const raw = (j && j.flags) ? j.flags : { random_time: false };
  return normalizeFlagsForRead(raw);
}

export function normalizeFlagsForStore(flags) {
  const out = {};
  if (!flags) return out;
  if (typeof flags.randomize_times !== "undefined" || typeof flags.random_time !== "undefined") {
    out.random_time = !!(flags.randomize_times ?? flags.random_time);
  }
  if (typeof flags.randomize_avatars !== "undefined" || typeof flags.random_avatar !== "undefined") {
    out.random_avatar = !!(flags.randomize_avatars ?? flags.random_avatar);
  }
  if (typeof flags.randomize_names !== "undefined" || typeof flags.random_name !== "undefined") {
    out.random_name = !!(flags.randomize_names ?? flags.random_name);
  }
  if (typeof flags.randomize_images !== "undefined" || typeof flags.random_image !== "undefined") {
    out.random_image = !!(flags.randomize_images ?? flags.random_image);
  }

  return out;
}

export function normalizeFlagsForRead(flags) {
  const out = { ...(flags || {}) };
  out.randomize_times   = !!(out.randomize_times   ?? out.random_time);
  out.randomize_avatars = !!(out.randomize_avatars ?? out.random_avatar);
  out.randomize_names   = !!(out.randomize_names   ?? out.random_name);
  out.randomize_images  = !!(out.randomize_images  ?? out.random_image);
  delete out.random_time;
  delete out.random_avatar;
  delete out.random_name;
  delete out.random_image;
  return out;
}

/* ====================== Admin auth (session token + role/email) ============ */
const ADMIN_TOKEN_KEY     = `${APP}_admin_token_v1`;
const ADMIN_TOKEN_EXP_KEY = `${APP}_admin_token_exp_v1`;
const ADMIN_ROLE_KEY      = `${APP}_admin_role_v1`;
const ADMIN_EMAIL_KEY     = `${APP}_admin_email_v1`;

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

export function hasAdminRole(minRole = "viewer") {
  const r = (getAdminRole() || "viewer").toLowerCase();
  return (ROLE_RANK[r] || 0) >= (ROLE_RANK[minRole] || 0);
}

export async function touchAdminSession() {
  const admin_token = getAdminToken();
  if (!admin_token) return { ok:false, err:"admin auth required" };

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action: "admin_touch", admin_token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok:false, err: data?.err || `HTTP ${res.status}` };

    if (data.ttl_s && data.ttl_s > 0) {
      setAdminSession({
        token: admin_token,
        ttlSec: Number(data.ttl_s),
        role: data.role || getAdminRole(),
        email: data.email || getAdminEmail(),
      });
    }
    return { ok:true, ttl_s: Number(data.ttl_s || 0), role: data.role, email: data.email };
  } catch (e) {
    return { ok:false, err: String(e?.message || e) };
  }
}

export function getAdminExpiryMs() {
  try {
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (!exp) return null;
    if (Date.now() > exp) { clearAdminSession(); return null; }
    return exp;
  } catch { return null; }
}

export function getAdminSecondsLeft() {
  const exp = getAdminExpiryMs();
  if (!exp) return null;
  return Math.max(0, Math.floor((exp - Date.now()) / 1000));
}

export function startSessionWatch({ warnAtSec = 120, tickMs = 1000, onExpiring, onExpired } = {}) {
  let firedExpired = false;

  const tick = () => {
    const left = getAdminSecondsLeft();
    if (left == null) {
      if (!firedExpired) { firedExpired = true; onExpired?.(); }
      return;
    }
    if (left <= 0) {
      if (!firedExpired) { firedExpired = true; onExpired?.(); }
    } else if (left <= warnAtSec) {
      onExpiring?.(left);
    }
  };

  const id = setInterval(tick, tickMs);
  tick();
  return () => clearInterval(id);
}

export function setAdminSession({ token, ttlSec, role, email } = {}) {
  try {
    if (!token) { clearAdminSession(); return; }
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    if (Number.isFinite(Number(ttlSec)) && ttlSec > 0) {
      localStorage.setItem(ADMIN_TOKEN_EXP_KEY, String(Date.now() + Number(ttlSec) * 1000));
    } else {
      localStorage.removeItem(ADMIN_TOKEN_EXP_KEY);
    }
    if (role)  localStorage.setItem(ADMIN_ROLE_KEY, String(role));
    if (email) localStorage.setItem(ADMIN_EMAIL_KEY, String(email));
  } catch {}
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_EXP_KEY);
  localStorage.removeItem(ADMIN_ROLE_KEY);
  localStorage.removeItem(ADMIN_EMAIL_KEY);
}

export function getAdminToken() {
  try {
    const t = localStorage.getItem(ADMIN_TOKEN_KEY);
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (!t || !t.trim()) return null;
    if (exp && Date.now() > exp) { clearAdminSession(); return null; }
    return t;
  } catch { return null; }
}

export function getAdminRole() {
  try {
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (exp && Date.now() > exp) { clearAdminSession(); return "viewer"; }
    return (localStorage.getItem(ADMIN_ROLE_KEY) || "viewer").toLowerCase();
  } catch { return "viewer"; }
}

export function getAdminEmail() {
  try {
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (exp && Date.now() > exp) { clearAdminSession(); return null; }
    return localStorage.getItem(ADMIN_EMAIL_KEY) || null;
  } catch { return null; }
}

export function hasAdminSession() {
  return !!getAdminToken();
}

export async function adminLogin(password) {
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action: "admin_login", password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && data.admin_token) {
      setAdminSession({
        token: data.admin_token,
        ttlSec: data.ttl_s || data.ttl_sec || null,
        role: data.role || "owner",
        email: data.email || "owner",
      });
      return { ok: true };
    }
    return { ok: false, err: data?.err || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function adminLoginUser(email, password) {
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action: "admin_login_user", email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && data.admin_token) {
      setAdminSession({
        token: data.admin_token,
        ttlSec: data.ttl_s || data.ttl_sec || null,
        role: data.role || "viewer",
        email: data.email || email,
      });
      return { ok: true };
    }
    return { ok: false, err: data?.err || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
}

export async function adminLogout() {
  const admin_token = getAdminToken();
  clearAdminSession();
  if (!admin_token) return { ok: true };
  try {
    await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ action: "admin_logout", admin_token }),
      keepalive: true,
    });
  } catch {}
  return { ok: true };
}

/* --------------------- Logging participants & events ---------------------- */
export async function sendToSheet(header, row, _events, feed_id) {
  if (!feed_id) { console.warn("sendToSheet: feed_id required"); return false; }

  const payload = {
    token: GS_TOKEN,
    action: "log_participant",
    app: APP,
    feed_id,
    header,
    row,
    project_id: getProjectId() || undefined,
  };

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon && body.length < 60000) {
    try {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      const ok = navigator.sendBeacon(GS_ENDPOINT, blob);
      if (ok) return true;
    } catch {}
  }

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
    });
    return res.ok;
  } catch (err) {
    console.warn("sendToSheet(fetch) failed:", err);
    return false;
  }
}

/* --------------------- Feeds listing (Admin switcher) --------------------- */
export async function listFeedsFromBackend() {
  try {
    const data = await getJsonWithRetry(
      FEEDS_GET_URL() + "&_ts=" + Date.now(),
      { method: "GET", mode: "cors", cache: "no-store" },
      { retries: 1, timeoutMs: 8000 }
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("listFeedsFromBackend failed:", e);
    return [];
  }
}

/* -------- default feed helpers (persisted on backend) --------------------- */
export async function getDefaultFeedFromBackend() {
  try {
    const data = await getJsonWithRetry(
      DEFAULT_FEED_GET_URL() + "&_ts=" + Date.now(),
      { method: "GET", mode: "cors", cache: "no-store" },
      { retries: 1, timeoutMs: 8000 }
    );
    return (data && typeof data === "object") ? (data.feed_id || null) : null;
  } catch (e) {
    console.warn("getDefaultFeedFromBackend failed:", e);
    return null;
  }
}

export async function setDefaultFeedOnBackend(feedId) {
  const admin_token = getAdminToken();
  if (!admin_token) { console.warn("setDefaultFeedOnBackend: missing admin_token"); return false; }
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_default_feed",
        app: APP,
        feed_id: feedId || "",
        admin_token,
        project_id: getProjectId() || undefined,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn("setDefaultFeedOnBackend failed:", e);
    return false;
  }
}

export async function deleteFeedOnBackend(feedId) {
  const admin_token = getAdminToken();
  if (!admin_token) return false;
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_feed",
        app: APP,
        admin_token,
        feed_id: feedId,
        project_id: getProjectId() || undefined,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("deleteFeedOnBackend failed", e);
    return false;
  }
}

/* ------------------------- POSTS API (multi-feed + cache) ----------------- */
const __postsCache = new Map(); // key: `${APP}::${projectId}::${feedId||''}` -> { at, data }
const POSTS_STALE_MS = 60_000;

function __cacheKey(feedId) {
  const pid = getProjectId() || "";
  return `${APP}::${pid}::${feedId || ""}`;
}
function __getCachedPosts(feedId) {
  const rec = __postsCache.get(__cacheKey(feedId));
  if (!rec) return null;
  if (Date.now() - rec.at > POSTS_STALE_MS) return null;
  return rec.data;
}
function __setCachedPosts(feedId, data) {
  __postsCache.set(__cacheKey(feedId), { at: Date.now(), data });
}
export function invalidatePostsCache(feedId = null) {
  const fid = String(feedId || "");
  for (const k of __postsCache.keys()) {
    if (k.endsWith(`::${fid}`)) __postsCache.delete(k);
  }
}

export async function loadPostsFromBackend(arg1, arg2) {
  let feedId = null;
  let force = false;

  if (typeof arg1 === "string") {
    feedId = arg1 || null;
    if (arg2 && typeof arg2 === "object") force = !!arg2.force;
  } else if (arg1 && typeof arg1 === "object") {
    force = !!arg1.force;
  }

  if (!feedId) {
    feedId = await getDefaultFeedFromBackend();
  }

  if (!force) {
    const cached = __getCachedPosts(feedId);
    if (cached) return cached;
  }

  try {
    const url =
      POSTS_GET_URL() +
      (feedId ? `&feed_id=${encodeURIComponent(feedId)}` : "") +
      "&_ts=" + Date.now();

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store" },
      { retries: 1, timeoutMs: 8000 }
    );
    const arr = Array.isArray(data) ? data : [];

    // Preload streamable video URLs (skip Drive/iframe)
    arr
      .filter(p => p?.videoMode !== "none" && p?.video?.url && !DRIVE_RE.test(p.video.url))
      .forEach(p => {
        injectVideoPreload(p.video.url, p.video?.mime || "video/mp4");
        primeVideoCache(p.video.url);
      });

    __setCachedPosts(feedId, arr);
    return arr;
  } catch (e) {
    console.warn("loadPostsFromBackend failed:", e);
    const cached = __getCachedPosts(feedId);
    return cached || [];
  }
}

/**
 * savePostsToBackend(posts, { feedId, name } = {})
 * (includes friendly-name injection from local storage)
 */
export async function savePostsToBackend(rawPosts, ctx = {}) {
  const { feedId = null, name = null } = ctx || {};
  const admin_token = getAdminToken();
  if (!admin_token) { console.warn("savePostsToBackend: missing admin_token"); return false; }

  const nameMap = readPostNames(getProjectId() || undefined, feedId) || {};

  const offenders = [];
  (rawPosts || []).forEach((p) => {
    const id = p?.id || "(no id)";
    if (p?.image?.url?.startsWith?.("data:")) offenders.push({ id, field: "image.url" });
    if (p?.video?.url?.startsWith?.("data:")) offenders.push({ id, field: "video.url" });
    if (p?.videoPosterUrl?.startsWith?.("data:")) offenders.push({ id, field: "videoPosterUrl" });
  });
  if (offenders.length) {
    const lines = offenders.map(o => `• Post ${o.id}: ${o.field}`).join("\n");
    alert(
      "One or more posts still contain local data URLs.\n\n" +
      "Please upload images/videos so they use https URLs, then try saving again.\n\n" +
      lines
    );
    return false;
  }

  const posts = (rawPosts || []).map((p) => {
    const q = { ...p };
    delete q._localMyCommentText;
    delete q._tempUpload;
    if (q.image && q.image.svg && q.image.url) delete q.image.svg;
    const nm = (q.postName ?? nameMap[q.id] ?? q.name ?? "").trim();
    if (nm) q.name = nm;
    return q;
  });

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "publish_posts",
        app: APP,
        posts,
        feed_id: feedId,
        name,
        admin_token,
        project_id: getProjectId() || undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(()=> "");
      console.warn("savePostsToBackend: HTTP error", res.status, text);
      alert(`Save failed: HTTP ${res.status}${text ? ` — ${text}` : ""}`);
      return false;
    }
    await res.json().catch(()=>null);
    invalidatePostsCache(feedId);
    return true;
  } catch (err) {
    console.warn("Publish failed:", err);
    alert(`Save failed: ${String(err?.message || err)}`);
    return false;
  }
}

/* --------------------------- File upload: local signer (legacy) ------------ */
export async function uploadVideoToBackend(fileOrDataUrl, filename, mime = "video/mp4", signerBase = "http://localhost:4000") {
  let blob;
  if (typeof fileOrDataUrl === "string" && fileOrDataUrl.startsWith("data:")) {
    const base64 = fileOrDataUrl.split(",")[1] || "";
    const binStr = atob(base64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else if (fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob) {
    blob = fileOrDataUrl;
    mime = blob.type || mime;
    if (!filename && fileOrDataUrl instanceof File) filename = fileOrDataUrl.name;
  } else {
    throw new Error("uploadVideoToBackend: expected File/Blob or dataURL");
  }

  const q = new URLSearchParams({
    filename: filename || `video-${Date.now()}.mp4`,
    type: mime || "video/mp4",
  });
  const signRes = await fetch(`${signerBase}/sign-upload?${q.toString()}`);
  if (!signRes.ok) {
    const txt = await signRes.text().catch(() => "");
    throw new Error(`Signer failed: HTTP ${signRes.status} ${txt}`);
  }
  const { uploadUrl, fileUrl, error } = await signRes.json();
  if (!uploadUrl || !fileUrl || error) {
    throw new Error(error || "Signer did not return uploadUrl/fileUrl");
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: blob,
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    throw new Error(`S3 PUT failed: HTTP ${putRes.status} ${txt}`);
  }

  return fileUrl;
}

/* ========================= S3 Upload via Presigner ========================= */
export const SIGNER_BASE =
  (window.CONFIG && window.CONFIG.SIGNER_BASE) ||
  "https://qkbi313c2i.execute-api.us-west-1.amazonaws.com";

export const SIGNER_PATH =
  (window.CONFIG && window.CONFIG.SIGNER_PATH) ||
  "/default/presign-upload";

export function encodePathKeepSlashes(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

export function sanitizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

function sniffFileMeta(file) {
  const contentType = file.type || "application/octet-stream";
  const ext =
    (file.name.split(".").pop() || "").toLowerCase() ||
    (contentType.startsWith("video/") ? "mp4" : "bin");
  const nameNoExt = (file.name || "").replace(/\.[^.]+$/, "");
  return { contentType, ext, nameNoExt };
}

export async function getPresignedPutUrl({ key, contentType, timeoutMs = 15000 }) {
  const url = new URL(joinUrl(SIGNER_BASE, SIGNER_PATH));
  url.searchParams.set("key", key);
  url.searchParams.set("contentType", contentType);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} ${txt}`.trim());
    }
    const j = await res.json();
    const uploadUrl = j.url || j.uploadUrl;
    const fileUrl = j.cdnUrl || j.fileUrl || null;
    if (!uploadUrl) throw new Error("presigner response missing URL");
    return { uploadUrl, fileUrl };
  } finally {
    clearTimeout(t);
  }
}

export async function putToS3({ file, signedPutUrl, onProgress, contentType }) {
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedPutUrl);
    xhr.timeout = 120000;
    xhr.setRequestHeader("Content-Type", contentType || file.type || "application/octet-stream");

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`S3 PUT ${xhr.status}: ${xhr.responseText || xhr.statusText}`));

    xhr.onerror = () => reject(new Error("Network error during S3 upload"));
    xhr.ontimeout = () => reject(new Error("S3 upload timed out"));
    xhr.send(file);
  });
}

export async function uploadFileToS3ViaSigner({
  file,
  feedId,
  projectId,
  onProgress,
  prefix = "images",
}) {
  if (!file) throw new Error("No file selected");
  if (!feedId) throw new Error("Missing feedId");

  const { contentType, ext, nameNoExt } = sniffFileMeta(file);
  const ts = Date.now();
  const base = sanitizeName(nameNoExt) || `file_${ts}`;
  const proj = sanitizeName(projectId || "global");
  const key = `${prefix}/${proj}/${feedId}/${ts}_${base}.${ext}`;

  const { uploadUrl, fileUrl } = await getPresignedPutUrl({ key, contentType });
  if (typeof onProgress === "function") onProgress(0);
  await putToS3({ file, signedPutUrl: uploadUrl, onProgress, contentType });

  // CF_BASE is defined in utils-core; we avoid importing it to keep backend small.
  // If your presigner returns a CDN URL, use that; otherwise use the fileUrl it returns.
  const cdnUrl = fileUrl;

  try { console.log("[S3] uploaded", { key, cdnUrl }); } catch {}

  if (typeof onProgress === "function") onProgress(100);
  return { key, cdnUrl };
}

export async function uploadJsonToS3ViaSigner({ data, feedId, prefix = "backups", filename, onProgress }) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const file = new File([blob], filename || "backup.json", { type: blob.type });
  return uploadFileToS3ViaSigner({ file, feedId, prefix, onProgress });
}

/* --------------------- Participants (admin panels & roster) ---------------- */
export async function loadParticipantsRoster(arg1, arg2) {
  let feedId = null;
  let opts = {};
  if (typeof arg1 === "string") {
    feedId = arg1 || null;
    opts = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    feedId = arg1.feedId || null;
    opts = arg1;
  }

  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("loadParticipantsRoster: missing admin_token");
    return [];
  }

  const projectId = opts.projectId || getProjectId();
  const app = typeof APP !== "undefined" ? APP : "";

  try {
    const params = new URLSearchParams();
    params.set("path", "participants");
    if (app)        params.set("app", app);
    if (projectId)  params.set("project_id", projectId);
    if (feedId)     params.set("feed_id", feedId);
    params.set("admin_token", admin_token);
    params.set("_ts", String(Date.now()));

    const base = PARTICIPANTS_GET_URL();
    const url = base.includes("?") ? `${base}&${params}` : `${base}?${params}`;

    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store", signal: opts.signal },
      { retries: 1, timeoutMs: 8000 }
    );

    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("loadParticipantsRoster failed:", e);
    return [];
  }
}

export async function wipeParticipantsOnBackend(feedId) {
  const admin_token = getAdminToken();
  if (!admin_token || !feedId) return false;

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        action: "wipe_participants",
        app: APP,
        feed_id: feedId,
        admin_token,
        project_id: getProjectId() || undefined,
      }),
      keepalive: true,
    });

    const data = await res.json().catch(() => ({}));
    return !!(res.ok && data.ok !== false);
  } catch {
    return false;
  }
}

export async function getWipePolicyFromBackend() {
  const admin_token = getAdminToken();
  if (!admin_token) return null;
  try {
    const url = `${WIPE_POLICY_GET_URL}&admin_token=${encodeURIComponent(admin_token)}&_ts=${Date.now()}`;
    const data = await getJsonWithRetry(
      url,
      { method: "GET", mode: "cors", cache: "no-store" },
      { retries: 1, timeoutMs: 8000 }
    );
    if (data && data.ok !== false && typeof data.wipe_on_change !== "undefined") {
      return !!data.wipe_on_change;
    }
    return null;
  } catch (e) {
    console.warn("getWipePolicyFromBackend failed:", e);
    return null;
  }
}

export async function setWipePolicyOnBackend(wipeOnChange) {
  const admin_token = getAdminToken();
  if (!admin_token) return { ok: false, err: "admin auth required" };

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        action: "set_wipe_policy",
        admin_token,
        wipe_on_change: !!wipeOnChange,
      }),
      keepalive: true,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }
    return { ok: true, wipe_on_change: !!data.wipe_on_change };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

/* ============================ Project helpers (backend) ============================ */
const PROJECTS_GET_URL = () => `${GS_ENDPOINT}?path=projects&app=${APP}${qProject()}`;

export async function listProjectsFromBackend({ signal } = {}) {
  try {
    const data = await getJsonWithRetry(
      PROJECTS_GET_URL() + "&_ts=" + Date.now(),
      { method: "GET", mode: "cors", cache: "no-store", signal },
      { retries: 1, timeoutMs: 8000 }
    );
    if (!Array.isArray(data) || data.length === 0) {
      return [{ project_id: "global", name: "Global" }];
    }
    return data;
  } catch (e) {
    console.warn("listProjectsFromBackend failed:", e);
    return [{ project_id: "global", name: "Global" }];
  }
}

/** Default project handling (client side, stored locally) */
const DEFAULT_PROJECT_KEY = "DEFAULT_PROJECT_ID";

export async function getDefaultProjectFromBackend() {
  return localStorage.getItem(DEFAULT_PROJECT_KEY) || "global";
}

export async function setDefaultProjectOnBackend(projectId) {
  localStorage.setItem(DEFAULT_PROJECT_KEY, projectId || "global");
  return true;
}

export async function createProjectOnBackend({ projectId, name, notes } = {}) {
  const admin_token = getAdminToken();
  if (!admin_token) return false;

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "project_create",
        admin_token,
        project_id: projectId,
        name,
        notes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return !!json?.ok;
  } catch (e) {
    console.warn("createProjectOnBackend failed:", e);
    return false;
  }
}

export async function deleteProjectOnBackend(projectId) {
  const admin_token = getAdminToken();
  if (!admin_token) return false;

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "project_delete",
        admin_token,
        project_id: projectId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return !!json?.ok;
  } catch (e) {
    console.warn("deleteProjectOnBackend failed:", e);
    return false;
  }
}

/* --------------------- Post-name storage (scoped by app+project+feed) ------ */
const POST_NAMES_KEY = (projectId, feedId) =>
  `${APP}::${projectId || "global"}::${feedId || ""}::post_names_v1`;

export function readPostNames(projectId = getProjectId(), feedId = getFeedIdFromUrl()) {
  try {
    const raw = localStorage.getItem(POST_NAMES_KEY(projectId, feedId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function writePostNames(projectId = getProjectId(), feedId = getFeedIdFromUrl(), map = {}) {
  try {
    localStorage.setItem(POST_NAMES_KEY(projectId, feedId), JSON.stringify(map || {}));
  } catch {}
}

export function labelForPostId(
  postId,
  { projectId = getProjectId(), feedId = getFeedIdFromUrl(), fallback = postId } = {}
) {
  if (!postId) return fallback;
  const m = readPostNames(projectId, feedId);
  return (m && m[postId]) || fallback;
}

export function postDisplayName(p, { projectId = getProjectId(), feedId = getFeedIdFromUrl() } = {}) {
  const id = p?.id || "";
  const nm = (p?.name || "").trim();
  if (nm) return nm;
  const saved = readPostNames(projectId, feedId);
  return (saved && saved[id]) || id;
}

export function headerLabelsForKeys(keys, posts, { projectId = getProjectId(), feedId = getFeedIdFromUrl() } = {}) {
  const nameMap = {};
  (posts || []).forEach(p => {
    const id = p?.id;
    if (!id) return;
    nameMap[id] = postDisplayName(p, { projectId, feedId });
  });

  return keys.map(k => {
    const m = /^(.+?)_(.+)$/.exec(k);
    if (!m) return nameMap[k] || k;
    const [, id, suffix] = m;
    const base = nameMap[id] || id;
    return `${base}_${suffix}`;
  });
}

export function seedNamesFromPosts(posts, { projectId = getProjectId(), feedId = getFeedIdFromUrl() } = {}) {
  if (!Array.isArray(posts)) return;
  const map = readPostNames(projectId, feedId);
  let changed = false;
  for (const p of posts) {
    const id = p?.id;
    const nm = (p?.name || "").trim();
    if (id && nm && !map[id]) { map[id] = nm; changed = true; }
  }
  if (changed) writePostNames(projectId, feedId, map);
}