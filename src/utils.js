/* ------------------------------ Basics ------------------------------------ */
export const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
export const now = () => Date.now();
export const fmtTime = (ms) => new Date(ms).toISOString();
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const getUrlParam = (key = "") =>
  getCombinedSearchParams().get(key);

export const abbr =
  (n) =>
    n >= 1e6 ? (n / 1e6).toFixed(1) + "M"
    : n >= 1e3 ? (n / 1e3).toFixed(1) + "K"
    : String(n || 0);

export const nfCompact = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function toCSV(rows, header, headerLabels) {
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const lines = [];
  if (header) {
    // If pretty labels are provided and length matches, use them for the first row
    const firstRow = Array.isArray(headerLabels) && headerLabels.length === header.length
      ? headerLabels
      : header;
    lines.push(firstRow.map(esc).join(","));
  }
  for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

export const toggleInSet = (setObj, id) => {
  const next = new Set(setObj || []);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
};


export const CF_BASE =
  (window.CONFIG && window.CONFIG.CF_BASE) ||
  "https://d2bihrgvtn9bga.cloudfront.net";

/* ============================ Project helpers ============================= */
const PROJECT_KEY = "current_project_id";

/** Get current project_id from URL (?project / ?project_id) or localStorage. */
export function getProjectId() {
  try {
    const sp = getCombinedSearchParams();
    const fromUrl = sp.get("project") || sp.get("project_id");
    if (fromUrl) {
      localStorage.setItem(PROJECT_KEY, fromUrl);
      return fromUrl;
    }
  } catch {}
  try {
    return localStorage.getItem(PROJECT_KEY) || "";
  } catch { return ""; }
}

/** Set current project_id and optionally reflect it in the URL. */
export function setProjectId(projectId, { persist = true, updateUrl = true } = {}) {
  const pid = String(projectId || "");
  if (persist) {
    try { pid ? localStorage.setItem(PROJECT_KEY, pid) : localStorage.removeItem(PROJECT_KEY); } catch {}
  }
  if (updateUrl) {
    try {
      const url = new URL(window.location.href);
      if (pid) url.searchParams.set("project", pid);
      else url.searchParams.delete("project");
      history.replaceState({}, "", url.toString());
    } catch {}
  }
  return pid;
}

/** Query-string fragment for project; empty string if none. */
const qProject = () => {
  const pid = getProjectId();
  return pid ? `&project_id=${encodeURIComponent(pid)}` : "";
};

function getCombinedSearchParams() {
  try {
    const real = new URLSearchParams(window.location.search);
    const hash = window.location.hash || "";
    const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const fromHash = new URLSearchParams(q);

    const merged = new URLSearchParams();
    // search first…
    for (const [k, v] of real) merged.set(k, v);
    // …hash overrides if same key exists
    for (const [k, v] of fromHash) merged.set(k, v);
    return merged;
  } catch {
    return new URLSearchParams();
  }
}

/* ======================= Admin User Management APIs ======================= */
/**
 * Backend is expected to support actions:
 *  - admin_list_users                → { ok: true, users: [{email, role, disabled}] }
 *  - admin_create_user               → { ok: true }
 *  - admin_update_user               → { ok: true }
 *  - admin_delete_user               → { ok: true }
 *
 * All require admin_token (owner level for create/update/delete).
 */

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





// Feed rnadom time helper
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

  // Accept both old and new keys, but always output the short ones for storage
  if (typeof flags.randomize_times !== "undefined" || typeof flags.random_time !== "undefined") {
    out.random_time = !!(flags.randomize_times ?? flags.random_time);
  }
  if (typeof flags.randomize_avatars !== "undefined" || typeof flags.random_avatar !== "undefined") {
    out.random_avatar = !!(flags.randomize_avatars ?? flags.random_avatar);
  }
  if (typeof flags.randomize_names !== "undefined" || typeof flags.random_name !== "undefined") {
    out.random_name = !!(flags.randomize_names ?? flags.random_name);
  }

  return out;
}

export function normalizeFlagsForRead(flags) {
  const out = { ...(flags || {}) };

  // Normalize short keys → long form used by frontend
  out.randomize_times   = !!(out.randomize_times   ?? out.random_time);
  out.randomize_avatars = !!(out.randomize_avatars ?? out.random_avatar);
  out.randomize_names   = !!(out.randomize_names   ?? out.random_name);

  delete out.random_time;
  delete out.random_avatar;
  delete out.random_name;

  return out;
}

// utils.js
function seedToInt(s){
  let h = 2166136261 >>> 0; // FNV-ish
  const str = String(s||"");
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rng(seed){
  let x = (seedToInt(seed) || 1) >>> 0;
  return () => { x ^= x<<13; x ^= x>>>17; x ^= x<<5; return (x>>>0)/4294967296; };
}

export function displayTimeForPost(post, { randomize, seedParts=[] } = {}){
  if (!randomize) return post?.time || "";
  const seed = [...seedParts, post?.id ?? ""].join("::");
  const r = rng(seed);
  const hours = 1 + Math.floor(r() * 23); // 1..23
  return `${hours}h`;
}


/* --------------------- Reactions helpers ---------------------------------- */
export const REACTION_META = {
  like:  { emoji: "👍", label: "Like"  },
  love:  { emoji: "❤️", label: "Love"  },
  care:  { emoji: "🤗", label: "Care"  },
  haha:  { emoji: "😆", label: "Haha"  },
  wow:   { emoji: "😮", label: "Wow"   },
  sad:   { emoji: "😢", label: "Sad"   },
  angry: { emoji: "😡", label: "Angry" },
};

export const sumSelectedReactions = (reactions = {}, selected = []) =>
  selected.reduce((acc, k) => acc + (Number(reactions[k]) || 0), 0);

export function topReactions(reactions = {}, selected = [], N = 3) {
  return selected
    .map((k) => ({ key: k, count: Number(reactions[k]) || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, N);
}

/* ---- Fake names + deterministic picker (for hover peeks) ---- */
const NAME_POOL = [
  "Alex Chen","Maya Patel","Jordan Li","Samir Khan","Nora Williams","Diego Santos","Hana Suzuki","Ava Johnson",
  "Ethan Brown","Isabella Garcia","Leo Müller","Zoe Martin","Ibrahim Ali","Priya Nair","Luca Rossi","Omar Haddad",
  "Fatima Noor","Sofia Ribeiro","Jin Park","Amara Okafor","Kai Nguyen","Elena Petrova","Noah Wilson","Aria Thompson",
  "Mateo Alvarez","Yara Hassan","Oliver Smith","Mila Novak","Theo Laurent","Liam O'Connor","Mina Rahman","Ravi Gupta",
  "Sara Lindström","Jonas Becker","Chloe Evans","Giulia Bianchi","Kenji Watanabe","Tariq Aziz","Aline Costa","Rhea Singh",
];

function mulberry32_(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStrToInt_(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministically pick up to N unique names for a post + metric kind.
 * New API: fakeNamesFor(postId, kind, count, maxShow)
 * Back-compat: fakeNamesFor(postId, count, kind, maxShow)
 * Returns { names: string[], remaining: number }
 */
export function fakeNamesFor(postId, a, b, maxShow = 5) {
  // argument normalization
  let kind = "comments";
  let count = 0;
  if (typeof a === "string") {
    // (postId, kind, count)
    kind = a;
    count = Number(b) || 0;
  } else {
    // (postId, count, kind?)
    count = Number(a) || 0;
    if (typeof b === "string") kind = b;
  }

  const n = Math.max(0, count);
  if (n === 0) return { names: [], remaining: 0 };

  const seed = hashStrToInt_(`${postId}::${kind}::v1`);
  const rnd = mulberry32_(seed);

  // Fisher–Yates shuffle over indices (deterministic by seed)
  const idx = NAME_POOL.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }

  const uniqueCount = Math.min(n, NAME_POOL.length);
  const chosen = idx.slice(0, uniqueCount).map(i => NAME_POOL[i]);
  const names = chosen.slice(0, Math.min(maxShow, chosen.length));
  const remaining = Math.max(0, n - names.length);
  return { names, remaining };
}

/**
 * Legacy helper… (returns names list w/ “and X more”)
 */
export function fakeNamesList(postId, kindOrCount, countMaybe, maxShow = 5) {
  let kind = "comments";
  let count = 0;
  if (typeof kindOrCount === "string") {
    kind = kindOrCount;
    count = Number(countMaybe) || 0;
  } else {
    count = Number(kindOrCount) || 0;
  }
  const { names, remaining } = fakeNamesFor(postId, kind, count, maxShow);
  if (remaining > 0) {
    return [...names, `and ${remaining} more`];
  }
  return names;
}

// utils.js (add)
export function neutralAvatarDataUrl(seed = "") {
  const s = String(seed || "");
  const palette = ["#0ea5e9","#22c55e","#a855f7","#f59e0b","#ef4444","#06b6d4","#84cc16","#6366f1"];
  let h = 0; for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i))|0;
  const bg = palette[Math.abs(h) % palette.length];

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}" />
      <stop offset="100%" stop-color="#111827" stop-opacity=".25" />
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="32" fill="url(#g)"/>
  <circle cx="32" cy="26.5" r="10" fill="#f3f4f6"/>
  <path d="M16 54c3-10 10-15 16-15s13 5 16 15" fill="#e5e7eb"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const getApp = () => {
  const q = new URLSearchParams(window.location.search);
  const fromUrl = (q.get("app") || "").toLowerCase();
  const fromWin = (window.APP || "").toLowerCase();
  return fromUrl === "fb" || fromWin === "fb" ? "fb" : "fb"; // hard default FB
};
export const APP = getApp();

/* --------------------- Backend config ------------------------------------- */
/* --------------------- Backend config (via API Gateway proxy) ------------- */
// If you set these in window.CONFIG they will override the defaults:
export const GAS_PROXY_BASE =
  (window.CONFIG && window.CONFIG.GAS_PROXY_BASE) ||
  "https://qkbi313c2i.execute-api.us-west-1.amazonaws.com";

export const GAS_PROXY_PATH =
  (window.CONFIG && window.CONFIG.GAS_PROXY_PATH) ||
  "/default/gas";

// Final Apps Script endpoint (proxied through API Gateway -> Lambda)
function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

// Prefer a single absolute API_BASE if provided; else fall back to base+path
export const GS_ENDPOINT =
  (window.CONFIG && window.CONFIG.API_BASE) ||
  joinUrl(
    (window.CONFIG && window.CONFIG.GAS_PROXY_BASE) ||
      "https://qkbi313c2i.execute-api.us-west-1.amazonaws.com",
    (window.CONFIG && window.CONFIG.GAS_PROXY_PATH) || "/default/gas"
  );

// NOTE: This token is ONLY for participant logging. Admin actions use admin_token from login.
export const GS_TOKEN = "a38d92c1-48f9-4f2c-bc94-12c72b9f3427";

/* ---------------------- Dynamic GET URL builders -------------------------- */
const FEEDS_GET_URL        = () => `${GS_ENDPOINT}?path=feeds&app=${APP}${qProject()}`;
const DEFAULT_FEED_GET_URL = () => `${GS_ENDPOINT}?path=default_feed&app=${APP}${qProject()}`;
const POSTS_GET_URL        = () => `${GS_ENDPOINT}?path=posts&app=${APP}${qProject()}`;
const PARTICIPANTS_GET_URL = () => `${GS_ENDPOINT}?path=participants&app=${APP}${qProject()}`;
const WIPE_POLICY_GET_URL  = `${GS_ENDPOINT}?path=wipe_policy`; // remains global

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

/* --------------------- Admin auth (session token + role/email) ------------ */
const ADMIN_TOKEN_KEY     = `${APP}_admin_token_v1`;
const ADMIN_TOKEN_EXP_KEY = `${APP}_admin_token_exp_v1`;
const ADMIN_ROLE_KEY      = `${APP}_admin_role_v1`;
const ADMIN_EMAIL_KEY     = `${APP}_admin_email_v1`;

// role rank helper
const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

export function hasAdminRole(minRole = "viewer") {
  const r = (getAdminRole() || "viewer").toLowerCase();
  return (ROLE_RANK[r] || 0) >= (ROLE_RANK[minRole] || 0);
}

/** Ping backend to refresh the admin session TTL. */
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

    // refresh local expiry using the new ttl (if provided)
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

/** Returns ms timestamp when the admin token expires, or null if unknown. */
export function getAdminExpiryMs() {
  try {
    const exp = Number(localStorage.getItem(ADMIN_TOKEN_EXP_KEY) || "");
    if (!exp) return null;
    if (Date.now() > exp) { clearAdminSession(); return null; }
    return exp;
  } catch { return null; }
}

/** Seconds left until expiry (floored), or null if no session. */
export function getAdminSecondsLeft() {
  const exp = getAdminExpiryMs();
  if (!exp) return null;
  return Math.max(0, Math.floor((exp - Date.now()) / 1000));
}

/**
 * Start a lightweight interval that notifies when the session is near expiry or expired.
 * - onExpiring(leftSec) fires whenever leftSec <= warnAtSec (repeats every tick).
 * - onExpired() fires once when time hits 0.
 * Returns a cleanup() function to stop the watcher.
 */
export function startSessionWatch({ warnAtSec = 120, tickMs = 1000, onExpiring, onExpired } = {}) {
  let firedExpired = false;

  const tick = () => {
    const left = getAdminSecondsLeft();
    if (left == null) { // no session
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
  tick(); // run immediately
  return () => clearInterval(id);
}

/** Save admin session returned by backend. Shape: { token, ttlSec, role, email } */
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

  // Backend ignores `events`, so omit it to keep payload tiny.
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

  // Try Beacon only when safely under the ~64KB keepalive limit.
  // (body.length is close enough for UTF-8 here since content is mostly ASCII.)
  if (navigator.sendBeacon && body.length < 60000) {
    try {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      const ok = navigator.sendBeacon(GS_ENDPOINT, blob);
      if (ok) return true;
    } catch (e) {
      // fall through to fetch
    }
  }

  // Fallback: regular fetch (no keepalive), text/plain to avoid preflight.
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

/* ------------------------- Video preload helpers -------------------------- */
const DRIVE_RE = /(?:^|\/\/)(?:drive\.google\.com|drive\.usercontent\.google\.com)/i;
const __videoPreloadSet = new Set();

/** Add a <link rel="preload" as="video"> to speed up first play (non-Drive only). */
export function injectVideoPreload(url, mime = "video/mp4") {
  if (!url || DRIVE_RE.test(url)) return;
  if (__videoPreloadSet.has(url)) return;

  const exists = Array.from(document.querySelectorAll('link[rel="preload"][as="video"]'))
    .some(l => l.href === url);
  if (exists) { __videoPreloadSet.add(url); return; }

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "video";
  link.href = url;
  link.crossOrigin = "anonymous";
  if (mime) link.type = mime;
  document.head.appendChild(link);
  __videoPreloadSet.add(url);
}

/** Create a hidden <video> to warm the cache (non-Drive only). */
export function primeVideoCache(url) {
  if (!url || DRIVE_RE.test(url)) return;
  if (__videoPreloadSet.has(`prime:${url}`)) return;

  const v = document.createElement("video");
  v.src = url;
  v.preload = "auto";
  v.muted = true;
  v.playsInline = true;
  v.crossOrigin = "anonymous";
  try { v.load(); } catch {}
  __videoPreloadSet.add(`prime:${url}`);

  setTimeout(() => { try { v.src = ""; } catch {} }, 30000);
}

/* ------------------------- POSTS API (multi-feed + cache) ----------------- */
/* cache key now includes project_id */
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
  // clear all entries for this feed across projects to be safe
  const fid = String(feedId || "");
  for (const k of __postsCache.keys()) {
    if (k.endsWith(`::${fid}`)) __postsCache.delete(k);
  }
}

/**
 * loadPostsFromBackend(feedId?, opts?)
 *  - loadPostsFromBackend("feed_a")
 *  - loadPostsFromBackend("feed_a", { force: true })
 *  - loadPostsFromBackend({ force: true })
 *
 * Now also preloads streamable video URLs (non-Drive) for faster playback.
 */
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
    seedNamesFromPosts(arr, { feedId });

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
 */
export async function savePostsToBackend(rawPosts, ctx = {}) {
  const { feedId = null, name = null } = ctx || {};
  const admin_token = getAdminToken();
  if (!admin_token) { console.warn("savePostsToBackend: missing admin_token"); return false; }
  // Pull friendly name map so we can inject names even if post objects lack them
 const nameMap = readPostNames(getProjectId() || undefined, feedId) || {};

  // Optional but recommended: block data: URLs to avoid huge payloads & CORS issues
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
    await res.json().catch(()=>null); // Apps Script often returns JSON
    invalidatePostsCache(feedId);
    return true;
  } catch (err) {
    console.warn("Publish failed:", err);
    alert(`Save failed: ${String(err?.message || err)}`);
    return false;
  }
}

/* ---------------------------- Media helpers -------------------------------- */
export const pravatar = (n) => `https://i.pravatar.cc/64?img=${n}`;
export const randomAvatarUrl = () =>
  pravatar(10 + Math.floor(Math.random() * 70));
export const randomSVG = (title = "Image") => {
  const c1 = ["#fde68a", "#a7f3d0", "#e2f3e6", "#bfdbfe", "#fca5a5"][Math.floor(Math.random()*5)];
  const c2 = ["#fca5a5", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa"][Math.floor(Math.random()*5)];
  return {
    alt: title,
    svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 420'>
      <defs><linearGradient id='g' x1='0' x2='1'>
        <stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/>
      </linearGradient></defs>
      <rect width='800' height='420' fill='url(#g)'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
        font-size='28' fill='#1f2937' font-family='system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'>${title}</text>
    </svg>`
  };
};

/* --------------------------- File helpers ---------------------------------- */
export function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// utils.js

/***
 * Upload a File/Blob to S3 using your local signer (AWS SDK v2).
 * Returns the public file URL to save on the post (post.video.url).
 *
 * @param {File|Blob|string} fileOrDataUrl  - File, Blob, or dataURL string
 * @param {string} filename                  - desired filename (e.g., "clip.mp4")
 * @param {string} mime                      - e.g., "video/mp4"
 * @param {string} signerBase                - e.g., "http://localhost:4000"
 */
export async function uploadVideoToBackend(fileOrDataUrl, filename, mime = "video/mp4", signerBase = "http://localhost:4000") {
  // 1) Normalize to a Blob
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

  // 2) Ask your signer for a presigned PUT URL
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

  // 3) PUT the file directly to S3
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: blob,
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    throw new Error(`S3 PUT failed: HTTP ${putRes.status} ${txt}`);
  }

  // 4) Return the public URL (ensure your bucket policy/CORS are set for reads)
  return fileUrl;
}

/* --------------------------- Feed ID helper -------------------------------- */
export function computeFeedId(posts = []) {
  const src = posts.map(p =>
    `${p.id}|${(p.text || '').length}|${p.imageMode || ''}|${p.interventionType || ''}`
  ).join('~');
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) | 0;
  return 'feed_' + (h >>> 0).toString(36);
}

/* --------- Viewport tracker (DICE-style enter/exit with threshold) --------- */
/**
 * startViewportTracker({
 *   root: element or null (defaults to viewport),
 *   postSelector: CSS selector for post roots (must have data-post-id),
 *   threshold: fraction (0..1) for non-image posts,
 *   thresholdImage: fraction (0..1) for image posts,
 *   getPostId: (el)=>string,
 *   hasImage: (el)=>boolean   // optional: custom detector for "image posts"
 *   thresholdFor: (el, postId)=>number // optional: per-post override
 *   onEvent: (evt)=>void,
 * })
 *
 * Emits:
 *  { action:"vp_enter"|"vp_exit", post_id, ts_ms, timestamp_iso, vis_frac, post_h_px, viewport_h_px, scroll_y }
 */
export const VIEWPORT_ENTER_FRACTION = 0.8;          // default for non-image posts
export const VIEWPORT_ENTER_FRACTION_IMAGE = 0.6;    // default for image posts (tune as needed)

export function startViewportTracker({
  root = null,
  postSelector = "[data-post-id]",
  threshold = VIEWPORT_ENTER_FRACTION,
  thresholdImage = VIEWPORT_ENTER_FRACTION_IMAGE,
  getPostId = (el) => el?.dataset?.postId || null,
  hasImage,            // optional override
  thresholdFor,        // optional override per element/post
  onEvent,
} = {}) {
  if (typeof IntersectionObserver !== "function") {
    console.warn("IntersectionObserver not supported; dwell tracking disabled.");
    return () => {};
  }

  const TH_BASE = clamp(Number(threshold) || VIEWPORT_ENTER_FRACTION, 0, 1);
  const TH_IMG  = clamp(Number(thresholdImage) || VIEWPORT_ENTER_FRACTION_IMAGE, 0, 1);

  // Default image detector (DOM-based). You can override with hasImage option.
  const defaultHasImage = (el) => {
    if (!el) return false;
    if (el.dataset && el.dataset.hasImage === "1") return true;
    // common hooks in your UI:
    return !!el.querySelector?.(
      ".image-btn img, .image-btn svg, [data-kind='image'], .media img, .media svg"
    );
  };
  const isImagePost = (el) => (typeof hasImage === "function" ? !!hasImage(el) : defaultHasImage(el));

  // We use a dense threshold list so per-element thresholds still trigger.
  const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
  const live = new Map(); // post_id -> { entered: true }

  const emit = (action, post_id, entry) => {
    if (!post_id) return;
    const el = entry?.target || document.querySelector(`${postSelector}[data-post-id="${post_id}"]`);
    const rect = el ? el.getBoundingClientRect() : null;
    const post_h_px = Math.max(0, Math.round(rect?.height || 0));
    const viewport_h_px = window.innerHeight || (document.documentElement?.clientHeight || 0);
    const vis_frac = entry ? entry.intersectionRatio : 0;
    const ts_ms = Date.now();

    onEvent?.({
      action,
      post_id,
      ts_ms,
      timestamp_iso: new Date(ts_ms).toISOString(),
      vis_frac: Number((vis_frac || 0).toFixed(4)),
      post_h_px,
      viewport_h_px,
      scroll_y: window.scrollY || window.pageYOffset || 0,
    });
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target;
        const id = getPostId(el);
        if (!id) continue;

        // Decide threshold for THIS element
        const th =
          typeof thresholdFor === "function"
            ? clamp(Number(thresholdFor(el, id)) || TH_BASE, 0, 1)
            : (isImagePost(el) ? TH_IMG : TH_BASE);

        const wasIn = !!live.get(id)?.entered;
        const nowIn = (e.intersectionRatio || 0) >= th;

        if (!wasIn && nowIn) {
          live.set(id, { entered: true });
          emit("vp_enter", id, e);
        } else if (wasIn && !nowIn) {
          live.delete(id);
          emit("vp_exit", id, e);
        }
      }
    },
    { root, rootMargin: "0px", threshold: thresholds }
  );

  const observeAll = () => {
    document.querySelectorAll(postSelector).forEach((el) => io.observe(el));
  };
  observeAll();

  const onHide = () => {
    for (const [post_id] of live) emit("vp_exit", post_id, null);
    live.clear();
  };
  document.addEventListener("visibilitychange", onHide, { passive: true });
  window.addEventListener("beforeunload", onHide, { passive: true });
  window.addEventListener("pagehide", onHide, { passive: true });

  const cleanup = () => {
    try { io.disconnect(); } catch {}
    onHide();
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("beforeunload", onHide);
    window.removeEventListener("pagehide", onHide);
  };

  return Object.assign(cleanup, { observeNew: observeAll });
}

/* -------- participant row/header builders (client) ------------------------ */
export function buildMinimalHeader(posts) {
  const base = [
    "session_id",
    "participant_id",
    "entered_at_iso",
    "submitted_at_iso",
    "ms_enter_to_submit",
    "ms_enter_to_last_interaction",
    "feed_id",
  ];

  const perPost = [];
  posts.forEach((p) => {
    const id = p.id || "unknown";
    perPost.push(
      `${id}_reacted`,
      `${id}_reaction_type`,    // spelled-out ("like", "care", …)
      `${id}_expandable`,
      `${id}_expanded`,
      `${id}_commented`,        // boolean (blank if false)
      `${id}_comment_texts`,    // em dash if none
      `${id}_shared`,
      `${id}_reported_misinfo`,
      `${id}_dwell_s`,          // compat (rounded seconds)
    );
  });

  return [...base, ...perPost];
}

/* ---- DICE-style dwell aggregation (multi-visit + height-normalized) ------ */
export function computePostDwellFromEvents(events = []) {
  const open = new Map();   // post_id -> { t0 }
  const total = new Map();  // post_id -> dwell_ms
  const maxH = new Map();   // post_id -> max observed height

  const isEnter = (a) => a === "vp_enter" || a === "view_start";
  const isExit  = (a) => a === "vp_exit"  || a === "view_end";

  const flush = (post_id, t1) => {
    const rec = open.get(post_id);
    if (!rec) return;
    const dur = Math.max(0, (t1 ?? Date.now()) - rec.t0);
    total.set(post_id, (total.get(post_id) || 0) + dur);
    open.delete(post_id);
  };

  for (const e of events) {
    if (!e || !e.action || !e.post_id) continue;
    const { action, post_id } = e;
    const ts = Number(e.ts_ms ?? Date.now());
    const h  = Number(e.post_h_px ?? 0);
    if (Number.isFinite(h) && h > 0) {
      maxH.set(post_id, Math.max(h, maxH.get(post_id) || 0));
    }

    if (isEnter(action)) {
      if (!open.has(post_id)) open.set(post_id, { t0: ts });
    } else if (isExit(action)) {
      flush(post_id, ts);
    }
  }

  const lastTs = events.length ? Number(events[events.length - 1].ts_ms) || Date.now() : Date.now();
  for (const [post_id] of open) flush(post_id, lastTs);

  const out = new Map();
  for (const [post_id, ms] of total) {
    const h_px = Math.max(0, Number(maxH.get(post_id) || 0));
    const dwell_ms = Math.max(0, Math.round(ms));
    out.set(post_id, {
      dwell_ms,
      dwell_s: Math.round(dwell_ms / 1000),
      post_h_px_max: h_px,
      dwell_ms_per_px: h_px > 0 ? dwell_ms / h_px : null,
    });
  }
  return out;
}

function isoToMs(iso) { try { return new Date(iso).getTime(); } catch { return null; } }

export function buildParticipantRow({
  session_id,
  participant_id,
  events,
  posts,
  feed_id,
  feed_checksum,
}) {
  const entered   = events.find(e => e.action === "participant_id_entered");
  const submitted = events.find(e => e.action === "feed_submit");

  const entered_at_iso   = entered?.timestamp_iso || null;
  const submitted_at_iso = submitted?.timestamp_iso || null;

  const ms_enter_to_submit =
    entered && submitted ? Math.max(0, submitted.ts_ms - entered.ts_ms) : null;

  const nonScroll = events.filter(
    e => e.action !== "scroll" && e.action !== "session_start" && e.action !== "session_end"
  );
  const lastInteractionAfterEnter = entered
    ? nonScroll.filter(e => e.ts_ms >= entered.ts_ms).at(-1)
    : nonScroll.at(-1);

  const ms_enter_to_last_interaction =
    entered && lastInteractionAfterEnter
      ? Math.max(0, lastInteractionAfterEnter.ts_ms - entered.ts_ms)
      : null;

  // NEW: DICE-style dwell aggregator (supports vp_* and legacy view_* events)
  const dwellAgg = computePostDwellFromEvents(events);

  // per-post aggregation (single reaction + single comment allowed)
  const per = new Map();
  const ensure = (id) => {
    if (!per.has(id)) {
      per.set(id, {
        reaction_type: "",
        expandable: false,
        expanded: false,
        commented: false,
        comment_texts: [],
        shared: false,
        reported_misinfo: false,
      });
    }
    return per.get(id);
  };

  for (const e of events) {
    const { action, post_id } = e || {};
    if (!post_id) continue;
    const p = ensure(post_id);

    switch (action) {
      case "react_pick":
        p.reaction_type = (e.type || "").trim() || "like";
        break;
      case "react_clear":
        if (!e.type || (p.reaction_type && p.reaction_type === e.type)) {
          p.reaction_type = "";
        }
        break;
      case "text_clamped":
        p.expandable = true;
        break;
      case "expand_text":
        p.expanded = true;
        break;
      case "comment_submit":
        p.commented = true;
        if (e.text) p.comment_texts = [String(e.text)];
        break;
      case "share":
        p.shared = true;
        break;
      case "report_misinformation_click":
        p.reported_misinfo = true;
        break;
      default:
        break;
    }
  }

  const row = {
    session_id,
    participant_id: participant_id || null,
    entered_at_iso,
    submitted_at_iso,
    ms_enter_to_submit,
    ms_enter_to_last_interaction,
    feed_id: feed_id || null,
    feed_checksum: feed_checksum || null,
  };

  for (const p of posts) {
    const id = p.id || "unknown";
    const agg = per.get(id) || {
      reaction_type: "",
      expandable: false,
      expanded: false,
      commented: false,
      comment_texts: [],
      shared: false,
      reported_misinfo: false,
    };

    // REACTIONS
    const reactedFlag = agg.reaction_type ? 1 : 0;
    row[`${id}_reacted`]       = reactedFlag ? 1 : "";   // blank → UI shows "—"
    row[`${id}_reaction_type`] = agg.reaction_type;      // spelled-out or ""

    // EXPAND/COMMENTS/SHARE/REPORT
    row[`${id}_expandable`] = agg.expandable ? 1 : "";
    row[`${id}_expanded`]   = agg.expanded ? 1 : "";
    row[`${id}_commented`] = agg.commented ? 1 : "";
    row[`${id}_comment_texts`] = agg.comment_texts.length
      ? agg.comment_texts.join(" | ")
      : "";

    row[`${id}_shared`]            = agg.shared ? 1 : "";
    row[`${id}_reported_misinfo`]  = agg.reported_misinfo ? 1 : "";

    // DWELL + HEIGHT (new)
    const aggD = dwellAgg.get(id);
    row[`${id}_dwell_s`]         = aggD ? aggD.dwell_s : 0;
  }

  return row;
}

/* ---------------------- Participants (admin panels) ----------------------- */
export function extractPerPostFromRosterRow(row) {
  if (!row || typeof row !== "object") return {};

  // If backend returns a JSON blob, parse it first
  const blob = row.per_post_json || row.per_post || row.perPostJson || null;
  if (blob) {
    try {
      const parsed = typeof blob === "string" ? JSON.parse(blob) : blob;
      const clean = {};
      for (const [id, agg] of Object.entries(parsed || {})) {
        const rx = agg?.reactions || agg?.reaction_types || [];
        const rxArr = Array.isArray(rx)
          ? rx
          : typeof rx === "string"
          ? rx.split(",").map(s => s.trim()).filter(Boolean)
          : [];

        // comment text (string); prefer explicit text, else join array
        const cTextRaw = (() => {
          const t = agg?.comment_text ?? agg?.comment ?? null;
          const arr = agg?.comment_texts;
          if (typeof t === "string") return t;
          if (Array.isArray(arr)) return arr.map(String).join(" | ");
          if (typeof arr === "string") return arr;
          return "";
        })();
        const cText = (() => {
          const s = String(cTextRaw || "").trim();
          return (!s || s === "—" || s === "-" || /^[-—\s]+$/.test(s)) ? "" : s;
        })();

        // dwell seconds preferred; else convert ms → s
        const dwell_s = Number.isFinite(agg?.dwell_s)
          ? Number(agg.dwell_s)
          : Number.isFinite(agg?.dwell_ms)
          ? Math.round(Number(agg.dwell_ms) / 1000)
          : 0;

        clean[id] = {
          reacted: Number(agg?.reacted || (rxArr.length ? 1 : 0)),
          commented: Number(agg?.commented || (cText ? 1 : 0) || (Number(agg?.comment_count) > 0 ? 1 : 0)),
          shared: Number(agg?.shared || 0),
          reported: Number(agg?.reported ?? agg?.reported_misinfo ?? 0),
          expandable: Number(agg?.expandable || 0),
          expanded: Number(agg?.expanded || 0),

          // reactions
          reactions: rxArr,
          reaction_types: rxArr,
          reaction_type: (agg?.reaction_type || rxArr[0] || "").trim(),

          // comments
          comment_text: cText,
          comment_count: Number(agg?.comment_count || (cText ? 1 : 0)),

          // dwell
          dwell_s,
        };
      }

      // ⬇️ Overlay flat columns if present (prefer explicit flat values)
      for (const [key, val] of Object.entries(row)) {
        // *_commented → overwrite boolean
        let m = /^(.+?)_commented$/.exec(key);
        if (m) {
          const id = m[1];
          if (!clean[id]) clean[id] = {};
          clean[id].commented = Number(val || 0);
          continue;
        }
        // *_comment_texts → attach the actual text (also flips commented)
        m = /^(.+?)_comment_texts$/.exec(key);
        if (m) {
          const id = m[1];
          if (!clean[id]) clean[id] = {};
          const text = String(val || "").trim();
          clean[id].comment_text = text;
          if (text) {
            clean[id].commented = 1;
            clean[id].comment_count = clean[id].comment_count || 1;
          }
        }
        // spelled-out single reaction from flat columns (if provided)
        m = /^(.+?)_reaction_type$/.exec(key);
        if (m) {
          const id = m[1];
          if (!clean[id]) clean[id] = {};
          const t = String(val || "").trim();
          clean[id].reaction_type = t;
          clean[id].reactions = t ? [t] : [];
          clean[id].reaction_types = clean[id].reactions;
          if (t) clean[id].reacted = 1;
        }
      }

      return clean;
    } catch {
      /* fall through to flat-columns parsing */
    }
  }

  // Otherwise parse flat columns
  const out = {};
  const ensure = (id) => {
    if (!out[id]) {
      out[id] = {
        reacted: 0, commented: 0, shared: 0, reported: 0,
        expandable: 0, expanded: 0,
        reactions: [], reaction_types: [], reaction_type: "",
        comment_text: "", comment_count: 0,
        dwell_s: 0,
      };
    }
    return out[id];
  };

  for (const [key, val] of Object.entries(row)) {
    // booleans (as numbers/blanks)
    {
      const m = /^(.+?)_(reacted|commented|shared|reported_misinfo|expanded|expandable)$/.exec(key);
      if (m) {
        const [, postId, metric] = m;
        const obj = ensure(postId);
        const num = Number(val || 0);
        if (metric === "reported_misinfo") obj.reported = num;
        else if (metric === "expanded")    obj.expanded = num;
        else if (metric === "expandable")  obj.expandable = num;
        else obj[metric] = num;
        continue;
      }
    }

    // spelled-out single reaction
    {
      const r1 = /^(.+?)_reaction_type$/.exec(key);
      if (r1) {
        const [, postId] = r1;
        const obj = ensure(postId);
        const t = String(val || "").trim();
        obj.reaction_type = t;
        obj.reactions = t ? [t] : [];
        obj.reaction_types = obj.reactions;
        obj.reacted = obj.reacted || (t ? 1 : 0);
        continue;
      }
    }

    // legacy reactions list
    {
      const r2 = /^(.+?)_(reactions|reaction_types)$/.exec(key);
      if (r2) {
        const [, postId] = r2;
        const obj = ensure(postId);
        const arr = String(val || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);
        obj.reactions = arr;
        obj.reaction_types = arr;
        obj.reaction_type = obj.reaction_type || (arr[0] || "");
        obj.reacted = obj.reacted || (arr.length ? 1 : 0);
        continue;
      }
    }

    // comment TEXT (preferred for participant detail UI)
    {
      const ct = /^(.+?)_comment_texts$/.exec(key);
      if (ct) {
        const [, postId] = ct;
        const obj = ensure(postId);

        // treat em dashes, hyphens, and whitespace as "no comment"
        const raw = String(val || "").trim();
        const text = (!raw || raw === "—" || raw === "-" || /^[-—\s]+$/.test(raw)) ? "" : raw;

        obj.comment_text = text;
        obj.commented = obj.commented || (text ? 1 : 0);
        obj.comment_count = obj.comment_count || (text ? 1 : 0);
        continue;
      }
    }

    // dwell (s then ms→s)
    {
      const ds = /^(.+?)_dwell_s$/.exec(key);
      if (ds) { const [, postId] = ds; ensure(postId).dwell_s = Number(val || 0); continue; }
      const dm = /^(.+?)_dwell_ms$/.exec(key);
      if (dm) { const [, postId] = dm; const o = ensure(postId); if (!o.dwell_s) o.dwell_s = Math.round(Number(val || 0) / 1000); continue; }
    }
  }
  return out;
}

/**
 * Load participants roster…
/**
 * loadParticipantsRoster(feedIdOrOpts?, opts?)
 * - If called with string → treat as feedId.
 * - If called with object → { feedId?, projectId?, signal? }.
 * Always includes admin_token, project_id, and app in the request.
 */
export async function loadParticipantsRoster(arg1, arg2) {
  let feedId = null;
  let opts = {};
  if (typeof arg1 === "string") {
    feedId = arg1 || null;
    opts = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    // support { feedId, projectId, signal }
    feedId = arg1.feedId || null;
    opts = arg1;
  }

  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("loadParticipantsRoster: missing admin_token");
    return [];
  }

  // Project scoping (fallback to utils’ current project)
  const projectId = opts.projectId || getProjectId(); // <- your utils getter
  const app = typeof APP !== "undefined" ? APP : "";  // optional, if you route by app

  try {
    const params = new URLSearchParams();
    params.set("path", "participants");            // if your proxy expects it; otherwise remove
    if (app)        params.set("app", app);
    if (projectId)  params.set("project_id", projectId);
    if (feedId)     params.set("feed_id", feedId);
    params.set("admin_token", admin_token);
    params.set("_ts", String(Date.now()));         // bust caches

    // If PARTICIPANTS_GET_URL() already returns a URL with some params, this will append safely.
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

// --- Admin: wipe participants for a feed
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
    // expected shape: { ok: true, wipe_on_change: boolean }
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
      mode: "cors", // or "no-cors" if you prefer, but "cors" + text/plain is fine
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        action: "set_wipe_policy",
        admin_token,
        wipe_on_change: !!wipeOnChange,
      }),
      keepalive: true,
    });

    // If you keep mode:"no-cors", you can't read the body; with "cors" you can:
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }
    return { ok: true, wipe_on_change: !!data.wipe_on_change };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

// ---- dashboard math helpers ----
const median = (arr) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};
const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null);

export function summarizeRoster(rows) {
  const total = rows.length;
  const completedRows = rows.filter(r => r.submitted_at_iso && String(r.submitted_at_iso).trim());
  const completed = completedRows.length;

  const toNum = (v) => (v === "" || v == null ? null : Number(v));
  const submitTimes = completedRows.map(r => toNum(r.ms_enter_to_submit)).filter(Number.isFinite);
  const lastInteractionTimes = completedRows.map(r => toNum(r.ms_enter_to_last_interaction)).filter(Number.isFinite);

  const postKeys = new Set();
  rows.forEach(r => {
    Object.keys(r).forEach(k => {
      if (/_reacted$|_expandable$|_expanded$|_commented$|_shared$|_reported_misinfo$/.test(k)) {
        const base = k.replace(/_(reacted|expandable|expanded|commented|shared|reported_misinfo)$/, "");
        postKeys.add(base);
      }
    });
  });

  const perPost = {};
  for (const base of postKeys) {
    const reacted    = rows.reduce((acc, r) => acc + (Number(r[`${base}_reacted`]) || 0), 0);
    const expandable = rows.reduce((a, r)   => a + (Number(r[`${base}_expandable`]) || 0), 0);
    const expanded   = rows.reduce((acc, r) => acc + (Number(r[`${base}_expanded`]) || 0), 0);
    const commented  = rows.reduce((acc, r) => acc + (Number(r[`${base}_commented`]) || 0), 0);
    const shared     = rows.reduce((acc, r) => acc + (Number(r[`${base}_shared`]) || 0), 0);
    const reported   = rows.reduce((acc, r) => acc + (Number(r[`${base}_reported_misinfo`]) || 0), 0);
    const expandRate = expandable > 0 ? expanded / expandable : null;
    const dwellSArr = rows
      .map(r => {
        const s = Number(r[`${base}_dwell_s`]);
        if (Number.isFinite(s)) return s;
        const ms = Number(r[`${base}_dwell_ms`]);
        return Number.isFinite(ms) ? Math.round(ms / 1000) : null;
      })
      .filter(n => Number.isFinite(n));
    const avgDwellS = dwellSArr.length ? dwellSArr.reduce((a,b)=>a+b,0) / dwellSArr.length : null;

    perPost[base] = { reacted, expandable, expanded, expandRate, commented, shared, reported, avgDwellS };
  }

  return {
    counts: { total, completed, completionRate: total ? completed / total : 0 },
    timing: {
      avgEnterToSubmit: avg(submitTimes),
      medEnterToSubmit: median(submitTimes),
      avgEnterToLastInteraction: avg(lastInteractionTimes),
      medEnterToLastInteraction: median(lastInteractionTimes),
    },
    perPost,
  };
}


// ------- Avatar Randomization ----- //
// ---- Avatar pools (from S3 manifests) ----
export const AVATAR_POOLS_ENDPOINTS = {
  female: `${CF_BASE.replace(/\/+$/,'')}/avatars/female/index.json`,
  male:   `${CF_BASE.replace(/\/+$/,'')}/avatars/male/index.json`,
  company:`${CF_BASE.replace(/\/+$/,'')}/avatars/company/index.json`,
};

const __avatarPoolCache = new Map(); // kind -> Promise<string[]>

export async function getAvatarPool(kind = "female") {
  const k = String(kind);
  if (__avatarPoolCache.has(k)) return __avatarPoolCache.get(k);
  const p = (async () => {
    const url = AVATAR_POOLS_ENDPOINTS[k];
    if (!url) return [];
    try {
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      const list = await res.json().catch(() => []);
      const base = CF_BASE.replace(/\/+$/,'');
      return (Array.isArray(list) ? list : [])
        .filter(Boolean)
        .map(u => u.startsWith("http") ? u : `${base}/${String(u).replace(/^\/+/, "")}`);
    } catch { return []; }
  })();
  __avatarPoolCache.set(k, p);
  return p;
}

// ---- Random pick helpers (deterministic to a seed) ----
export function pickDeterministic(array, seedParts = []) {
  const arr = Array.isArray(array) ? array : [];
  if (!arr.length) return null;
  const seed = String(seedParts.join("::"));
  const r = rng(seed);
  const idx = Math.floor(r() * arr.length);
  return arr[idx];
}



/* ========================= S3 Upload via Presigner ========================= */
// ---- S3 Upload via Presigner (GET, no preflight) ----



export const SIGNER_BASE =
  (window.CONFIG && window.CONFIG.SIGNER_BASE) ||
  "https://qkbi313c2i.execute-api.us-west-1.amazonaws.com";

export const SIGNER_PATH =
  (window.CONFIG && window.CONFIG.SIGNER_PATH) ||
  "/default/presign-upload"; // this is your working route

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

// Ask your signer for a presigned PUT URL via GET (no custom headers → no preflight)
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

// PUT file with progress
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

// High-level helper used by Admin editor
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

  const cdnUrl =
    fileUrl ||
    `${String(CF_BASE).replace(/\/+$/, "")}/${encodePathKeepSlashes(key)}`;

  try { console.log("[S3] uploaded", { key, cdnUrl }); } catch {}

  if (typeof onProgress === "function") onProgress(100);
  return { key, cdnUrl };
}

export async function uploadJsonToS3ViaSigner({ data, feedId, prefix = "backups", filename, onProgress }) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const file = new File([blob], filename || "backup.json", { type: blob.type });
  return uploadFileToS3ViaSigner({ file, feedId, prefix, onProgress });
}

export function getFeedIdFromUrl() {
  try {
    const sp = getCombinedSearchParams();
    return sp.get("feed") || sp.get("feed_id") || null;
  } catch {
    return null;
  }
}

// ----- Post name storage (scoped by app + project + feed) -------------------
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

/** Helper to display either a saved friendly name or fall back to the id */
export function labelForPostId(
  postId,
  { projectId = getProjectId(), feedId = getFeedIdFromUrl(), fallback = postId } = {}
) {
  if (!postId) return fallback;
  const m = readPostNames(projectId, feedId);
  return (m && m[postId]) || fallback;
}

/** Display name for a post: prefer .name from backend, else saved label, else id */
export function postDisplayName(p, { projectId = getProjectId(), feedId = getFeedIdFromUrl() } = {}) {
  const id = p?.id || "";
  const nm = (p?.name || "").trim();
  if (nm) return nm;
  const saved = readPostNames(projectId, feedId);
  return (saved && saved[id]) || id;
}

/** Build pretty header labels from id-based keys like "<id>_reacted" */
export function headerLabelsForKeys(keys, posts, { projectId = getProjectId(), feedId = getFeedIdFromUrl() } = {}) {
  // id → display label map
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

/** Seed storage from loaded posts that already carry a .name field */
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

// If you keep it for public UI buttons, keep it search-only:
export function setFeedIdInUrl(feedId, { replace = false } = {}) {
  try {
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    if (!feedId) sp.delete("feed");
    else sp.set("feed", String(feedId));
    url.search = sp.toString();
    const next = url.toString();
    replace ? history.replaceState({}, "", next) : history.pushState({}, "", next);
  } catch {}
}

export function buildFeedShareUrl(feedOrId) {
  const origin = "https://studyfeed.org"; // fixed base
  const fid = typeof feedOrId === "string" ? feedOrId : feedOrId?.feed_id || "";
  const pid = getProjectId();
  const qp = new URLSearchParams();
  if (fid) qp.set("feed", fid);
  if (pid) qp.set("project", pid);
  return `${origin}/?${qp.toString()}`;
}

/* ============================ Project helpers (backend) ============================ */

// Base API (same as feeds)
const PROJECTS_GET_URL = () => `${GS_ENDPOINT}?path=projects&app=${APP}${qProject()}`;

/** List projects from backend */
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

/** Default project handling (client side) */
const DEFAULT_PROJECT_KEY = "DEFAULT_PROJECT_ID";

export async function getDefaultProjectFromBackend() {
  return localStorage.getItem(DEFAULT_PROJECT_KEY) || "global";
}

export async function setDefaultProjectOnBackend(projectId) {
  localStorage.setItem(DEFAULT_PROJECT_KEY, projectId || "global");
  return true;
}

/** Create a project on backend */
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

/** Delete a project on backend */
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