/* =========================== Instagram Utils ============================== */
/* App namespace (force "ig", allow override by URL or window.APP for debug) */
export const getApp = () => {
  const q = new URLSearchParams(window.location.search);
  const fromUrl = (q.get("app") || "").toLowerCase();
  const fromWin = (window.APP || "").toLowerCase();
  return fromUrl === "ig" || fromWin === "ig" ? "ig" : "ig"; // hard default IG
};
export const APP = getApp();

/* ------------------------------ Basics ------------------------------------ */
export const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
export const now = () => Date.now();
export const fmtTime = (ms) => new Date(ms).toISOString();
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const getUrlParam = (key) =>
  new URLSearchParams(window.location.search).get(key || "");

export const abbr =
  (n) =>
    n >= 1e6 ? (n / 1e6).toFixed(1) + "M"
    : n >= 1e3 ? (n / 1e3).toFixed(1) + "K"
    : String(n || 0);

export const nfCompact = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function toCSV(rows, header) {
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [];
  if (header) lines.push(header.map(esc).join(","));
  for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

export const toggleInSet = (setObj, id) => {
  const next = new Set(setObj || []);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
};

/* ======================= Admin User Management APIs ======================= */
/**
 * Backend actions (global – no app scoping needed):
 *  - admin_list_users / admin_create_user / admin_update_user / admin_delete_user
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

/* --------------------- Reactions helpers ---------------------------------- */
// --- Participants: summarizer for roster rows (IG-ready; legacy-safe) ---
export function summarizeRoster(rows = []) {
  const out = {
    counts: { total: 0, completed: 0, completionRate: 0 },
    timing: {
      avgEnterToSubmit: null,
      medEnterToSubmit: null,
      avgEnterToLastInteraction: null,
      medEnterToLastInteraction: null,
    },
    perPost: {}, // id -> { reacted, expandable, expanded, expandRate, commented, saved, reported }
  };

  if (!Array.isArray(rows) || rows.length === 0) return out;

  const enterToSubmit = [];
  const enterToLast = [];

  out.counts.total = rows.length;

  for (const r of rows) {
    // "Completed" if it has a submit timestamp OR a numeric ms_enter_to_submit
    const completed =
      !!r.submitted_at_iso ||
      Number.isFinite(Number(r.ms_enter_to_submit));
    if (completed) out.counts.completed += 1;

    const msSubmit = Number(r.ms_enter_to_submit);
    if (Number.isFinite(msSubmit)) enterToSubmit.push(msSubmit);

    const msLast = Number(r.ms_enter_to_last_interaction);
    if (Number.isFinite(msLast)) enterToLast.push(msLast);

    // ---- Per-post aggregation ----
    try {
      const perPostHash =
        typeof extractPerPostFromRosterRow === "function"
          ? extractPerPostFromRosterRow(r) || {}
          : {};

      for (const [postId, agg] of Object.entries(perPostHash)) {
        if (!out.perPost[postId]) {
          out.perPost[postId] = {
            reacted: 0,
            expandable: 0,
            expanded: 0,
            commented: 0,
            saved: 0,      // IG metric (fallback to shared)
            reported: 0,
            expandRate: null,
          };
        }
        const p = out.perPost[postId];

        const asBool = (v) => Number(v) === 1 || v === true;

        if (asBool(agg.reacted)) p.reacted += 1;
        if (asBool(agg.expandable)) p.expandable += 1;
        if (asBool(agg.expanded)) p.expanded += 1;
        if (asBool(agg.commented)) p.commented += 1;

        if (asBool(agg.saved ?? agg.shared)) p.saved += 1;

        if (asBool(agg.reported ?? agg.reported_misinfo)) p.reported += 1;
      }
    } catch {
      // keep going
    }
  }

  // Completion rate
  out.counts.completionRate =
    out.counts.total > 0 ? out.counts.completed / out.counts.total : 0;

  // Averages / medians
  const avg = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const med = (arr) => {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  };

  out.timing.avgEnterToSubmit = avg(enterToSubmit);
  out.timing.medEnterToSubmit = med(enterToSubmit);
  out.timing.avgEnterToLastInteraction = avg(enterToLast);
  out.timing.medEnterToLastInteraction = med(enterToLast);

  // Compute expandRate per post
  for (const p of Object.values(out.perPost)) {
    p.expandRate = p.expandable > 0 ? p.expanded / p.expandable : null;
  }

  return out;
}

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
  let kind = "comments";
  let count = 0;
  if (typeof a === "string") {
    kind = a;
    count = Number(b) || 0;
  } else {
    count = Number(a) || 0;
    if (typeof b === "string") kind = b;
  }

  const n = Math.max(0, count);
  if (n === 0) return { names: [], remaining: 0 };

  const seed = hashStrToInt_(`${postId}::${kind}::v1`);
  const rnd = mulberry32_(seed);

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

export const GS_ENDPOINT = joinUrl(GAS_PROXY_BASE, GAS_PROXY_PATH);

// NOTE: This token is ONLY for participant logging. Admin actions use admin_token from login.
export const GS_TOKEN = "a38d92c1-48f9-4f2c-bc94-12c72b9f3427";

/* IG-scoped GET URLs (same query strings, just against the proxy) */
const FEEDS_GET_URL         = `${GS_ENDPOINT}?path=feeds&app=${APP}`;
const DEFAULT_FEED_GET_URL  = `${GS_ENDPOINT}?path=default_feed&app=${APP}`;
const POSTS_GET_URL         = `${GS_ENDPOINT}?path=posts&app=${APP}`;
const PARTICIPANTS_GET_URL  = `${GS_ENDPOINT}?path=participants&app=${APP}`;
const WIPE_POLICY_GET_URL   = `${GS_ENDPOINT}?path=wipe_policy`; // global

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
/* Namespaced keys for Instagram so FB admin sessions don’t collide */
const ADMIN_TOKEN_KEY     = "ig_admin_token_v1";
const ADMIN_TOKEN_EXP_KEY = "ig_admin_token_exp_v1";
const ADMIN_ROLE_KEY      = "ig_admin_role_v1";
const ADMIN_EMAIL_KEY     = "ig_admin_email_v1";

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

export function hasAdminRole(minRole = "viewer") {
  const r = (getAdminRole() || "viewer").toLowerCase();
  return (ROLE_RANK[r] || 0) >= (ROLE_RANK[minRole] || 0);
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
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin_logout", admin_token }),
      keepalive: true,
    });
  } catch {}
  return { ok: true };
}

/* --------------------- Logging participants & events ---------------------- */
export async function sendToSheet(header, row, events, feed_id) {
  if (!feed_id) { console.warn("sendToSheet: feed_id required"); return false; }
  const payload = { token: GS_TOKEN, action: "log_participant", app: APP, feed_id, header, row, events };

  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "text/plain;charset=UTF-8" });
    return navigator.sendBeacon(GS_ENDPOINT, blob);
  }
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return res.ok;
  } catch (err) {
    console.warn("sendToSheet failed:", err);
    return false;
  }
}

/* --------------------- Feeds listing (Admin switcher) --------------------- */
export async function listFeedsFromBackend() {
  try {
    const data = await getJsonWithRetry(
      FEEDS_GET_URL + "&_ts=" + Date.now(),
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
      DEFAULT_FEED_GET_URL + "&_ts=" + Date.now(),
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
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_default_feed",
        app: APP,
        feed_id: feedId || "",
        admin_token,
      }),
      keepalive: true,
    });
    if (!res.ok) return false;
    // optional: await res.json().catch(()=>null);
    return true;
  } catch (e) {
    console.warn("setDefaultFeedOnBackend failed:", e);
    return false;
  }
}

export async function deleteFeedOnBackend(feedId) {
  const admin_token = getAdminToken();
  if (!admin_token) {
    return { ok: false, err: "admin auth required" };
  }
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" }, // avoid preflight
      body: JSON.stringify({
        action: "delete_feed",
        app: APP,
        admin_token,
        feed_id: feedId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("deleteFeedOnBackend failed", e);
    return { ok: false, err: String(e.message || e) };
  }
}

/* ------------------------- Video preload helpers -------------------------- */
const DRIVE_RE = /(?:^|\/\/)(?:drive\.google\.com|drive\.usercontent\.google\.com)/i;
const __videoPreloadSet = new Set();

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

/* --- In-view autoplay hook for videos --- */
import { useEffect, useRef, useState } from "react";

export function useInViewAutoplay(threshold = 0.6, opts = {}) {
  const { startMuted = true, unmuteOnFirstGesture = true } = opts;
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  const [didUnmute, setDidUnmute] = useState(false);

  // Observe viewport visibility
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) =>
        setInView(entry.isIntersecting && entry.intersectionRatio >= threshold),
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  // Autoplay/pause based on inView
  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    if (inView) {
      // Autoplay compliance
      v.muted = startMuted || !didUnmute;
      v.playsInline = true;

      v.play().catch(() => {
        // Some mobile browsers might still need a tap before play
      });
    } else {
      v.pause();
    }
  }, [inView, startMuted, didUnmute]);

  // One-time auto-unmute on first user gesture while in view
  useEffect(() => {
    if (!unmuteOnFirstGesture) return;
    let handled = false;

    const handler = () => {
      if (handled) return;
      handled = true;

      const v = ref.current;
      if (!v) return;
      if (!inView) return;

      try {
        v.muted = false;
        setDidUnmute(true);
        const p = v.play();
        if (p && typeof p.then === "function") p.catch(() => {});
      } catch (_) {}
      // remove listener after first gesture
      remove();
    };

    const events = ["pointerdown", "keydown", "touchstart", "mousedown"];
    const add = () => events.forEach(e => window.addEventListener(e, handler, { once: true }));
    const remove = () => events.forEach(e => window.removeEventListener(e, handler, { once: true }));
    add();
    return remove;
  }, [inView, unmuteOnFirstGesture]);

  return ref;
}


export async function tryEnterFullscreen(target) {
  const el = target || document.documentElement;
  try {
    if (document.fullscreenElement) return true;

    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    // Safari prefixes
    const anyEl = /** @type {*} */ (el);
    if (anyEl.webkitRequestFullscreen) {
      anyEl.webkitRequestFullscreen();
      return true;
    }
  } catch (_) {}

  // iOS <= 15: only <video> can go fullscreen programmatically
  try {
    const v = document.querySelector('video');
    const anyVid = /** @type {*} */ (v);
    if (v && anyVid?.webkitEnterFullscreen) {
      anyVid.webkitEnterFullscreen();
      return true;
    }
  } catch (_) {}

  return false;
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
    const anyDoc = /** @type {*} */ (document);
    if (anyDoc.webkitExitFullscreen) anyDoc.webkitExitFullscreen();
  } catch (_) {}
}
/* ------------------------- POSTS API (multi-feed + cache) ----------------- */
/* Cache is namespaced by app to avoid cross-app contamination */
const __postsCache = new Map(); // key: `${APP}::${feedId||''}` -> { at, data }
const POSTS_STALE_MS = 60_000;

function __cacheKey(feedId) { return `${APP}::${feedId || ""}`; }
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
  __postsCache.delete(__cacheKey(feedId));
}

/**
 * loadPostsFromBackend(feedId?, opts?)
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
      POSTS_GET_URL +
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
 * Validate, sanitize, and save posts to backend.
 * savePostsToBackend(posts, { feedId, name, app } = {})
 */
export async function savePostsToBackend(rawPosts, ctx = {}) {
  const { feedId = null, name = null, app = (typeof APP !== "undefined" ? APP : "ig") } = ctx || {};
  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("savePostsToBackend: missing admin_token");
    return false;
  }

  // 1) Block any lingering data: URLs (these blow up payload size & CORS)
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

  // 2) Sanitize (remove editor-only properties / reduce payload bloat)
  const posts = (rawPosts || []).map((p) => {
    const q = { ...p };
    // remove any transient/admin preview bits if you have them
    delete q._localMyCommentText;
    delete q._tempUpload;
    // Ensure only {url, alt, focalX, focalY} shape for images
    if (q.image && q.image.svg && q.image.url) {
      // Prefer URL if present; or drop svg if you never need to persist it
      delete q.image.svg;
    }
    return q;
  });

  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      // IMPORTANT: no 'no-cors', no 'keepalive'
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "publish_posts",
        app,
        posts,
        feed_id: feedId,
        name,
        admin_token,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("savePostsToBackend: HTTP error", res.status, text);
      alert(`Save failed: HTTP ${res.status}${text ? ` — ${text}` : ""}`);
      return false;
    }

    // Apps Script often returns JSON; try to parse but don’t require it
    const out = await res.json().catch(() => null);
    if (out && out.error) {
      alert(`Save failed: ${out.error}`);
      return false;
    }

    // success
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
 * Upload via your local signer (unchanged)
 */
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

export async function uploadImageToS3(file, { app = "ig" } = {}) {
  const base = window.CONFIG?.API_BASE;
  const admin = getAdminToken();
  if (!base || !admin) throw new Error("Missing API_BASE or admin token");

  // Ask backend to sign an upload. Your video flow likely uses a very similar route.
  // Return shape A (PUT): { kind:"put", upload_url:"...", public_url:"...", headers:{...} }
  // Return shape B (POST): { kind:"post", url:"...", fields:{...}, public_url:"..." }
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const mime = file.type || (ext === "png" ? "image/png" : "image/jpeg");
  const signUrl =
    `${base}?path=sign_upload&kind=image&ext=${encodeURIComponent(ext)}&app=${encodeURIComponent(app)}&admin_token=${encodeURIComponent(admin)}`;

  const sigRes = await fetch(signUrl);
  if (!sigRes.ok) throw new Error(`Sign failed: ${sigRes.status}`);
  const sig = await sigRes.json();

  if (sig.kind === "put") {
    // Presigned PUT
    const putRes = await fetch(sig.upload_url, {
      method: "PUT",
      headers: { "Content-Type": mime, ...(sig.headers || {}) },
      body: file,
    });
    if (!putRes.ok) throw new Error(`Upload PUT failed: ${putRes.status}`);
    return sig.public_url; // <- store this in your post.image.url
  }

  if (sig.kind === "post") {
    // Presigned POST (multipart/form-data)
    const form = new FormData();
    Object.entries(sig.fields || {}).forEach(([k, v]) => form.append(k, v));
    form.append("Content-Type", mime);
    form.append("file", file);
    const postRes = await fetch(sig.url, { method: "POST", body: form });
    if (!postRes.ok) throw new Error(`Upload POST failed: ${postRes.status}`);
    return sig.public_url;
  }

  throw new Error("Unknown signing response from backend");
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
      `${id}_reactions`,
      `${id}_reaction_type`,
      `${id}_expandable`,
      `${id}_expanded`,
      `${id}_commented`,
      `${id}_comment_texts`,
      `${id}_shared`,
      `${id}_reported_misinfo`,
      `${id}_dwell_s`
    );
  });

  return [...base, ...perPost];
}

export function computePostDwellSecondsFromEvents(events) {
  const open = new Map();
  const totalMs = new Map();

  for (const e of events) {
    if (!e || !e.action || !e.post_id) continue;
    const { action, post_id, ts_ms } = e;

    if (action === "view_start") {
      if (!open.has(post_id)) open.set(post_id, ts_ms);
    } else if (action === "view_end") {
      const t0 = open.get(post_id);
      if (t0 != null) {
        const dur = Math.max(0, (ts_ms ?? 0) - t0);
        totalMs.set(post_id, (totalMs.get(post_id) || 0) + dur);
        open.delete(post_id);
      }
    }
  }

  const lastTs = events.length ? events[events.length - 1].ts_ms : 0;
  for (const [post_id, t0] of open) {
    const dur = Math.max(0, lastTs - t0);
    totalMs.set(post_id, (totalMs.get(post_id) || 0) + dur);
  }

  const totalSec = new Map();
  for (const [post_id, ms] of totalMs) {
    totalSec.set(post_id, Math.round(ms / 1000));
  }
  return totalSec;
}

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

  const dwellSecMap = computePostDwellSecondsFromEvents(events);

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

    const reactedFlag = agg.reaction_type ? 1 : 0;
    row[`${id}_reacted`]       = reactedFlag ? 1 : "";
    row[`${id}_reactions`]     = reactedFlag ? 1 : "";
    row[`${id}_reaction_type`] = agg.reaction_type;

    row[`${id}_expandable`] = agg.expandable ? 1 : "";
    row[`${id}_expanded`]   = agg.expanded ? 1 : "";

    row[`${id}_commented`] = agg.commented ? 1 : "";
    row[`${id}_comment_texts`] = agg.comment_texts.length
      ? agg.comment_texts.join(" | ")
      : "—";

    row[`${id}_shared`]            = agg.shared ? 1 : "";
    row[`${id}_reported_misinfo`]  = agg.reported_misinfo ? 1 : "";

    row[`${id}_dwell_s`] = dwellSecMap.get(id) ?? 0;
  }

  return row;
}

/* ---------------------- Participants (admin panels) ----------------------- */
export function extractPerPostFromRosterRow(row) {
  if (!row || typeof row !== "object") return {};
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

          reactions: rxArr,
          reaction_types: rxArr,
          reaction_type: (agg?.reaction_type || rxArr[0] || "").trim(),

          comment_text: cText,
          comment_count: Number(agg?.comment_count || (cText ? 1 : 0)),

          dwell_s,
        };
      }

      for (const [key, val] of Object.entries(row)) {
        let m = /^(.+?)_commented$/.exec(key);
        if (m) {
          const id = m[1];
          if (!clean[id]) clean[id] = {};
          clean[id].commented = Number(val || 0);
          continue;
        }
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
    } catch { /* fall through */ }
  }

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
    {
      const ct = /^(.+?)_comment_texts$/.exec(key);
      if (ct) {
        const [, postId] = ct;
        const obj = ensure(postId);
        const raw = String(val || "").trim();
        const text = (!raw || raw === "—" || raw === "-" || /^[-—\s]+$/.test(raw)) ? "" : raw;
        obj.comment_text = text;
        obj.commented = obj.commented || (text ? 1 : 0);
        obj.comment_count = obj.comment_count || (text ? 1 : 0);
        continue;
      }
    }
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
 * Load participants roster (IG-scoped)
 */
export async function loadParticipantsRoster(arg1, arg2) {
  let feedId = null;
  let opts = {};
  if (typeof arg1 === "string") {
    feedId = arg1 || null;
    opts = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    opts = arg1;
  }

  const admin_token = getAdminToken();
  if (!admin_token) {
    console.warn("loadParticipantsRoster: missing admin_token");
    return [];
  }

  try {
    const qFeed = feedId ? `&feed_id=${encodeURIComponent(feedId)}` : "";
    const qAdmin = `&admin_token=${encodeURIComponent(admin_token)}`;
    const url = PARTICIPANTS_GET_URL + qFeed + qAdmin + "&_ts=" + Date.now();
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

// --- Admin: wipe participants for a feed (IG-scoped)
export async function wipeParticipantsOnBackend(feedId) {
  const admin_token = getAdminToken();
  if (!admin_token) {
    return { ok: false, err: "admin auth required" };
  }
  try {
    const res = await fetch(GS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        action: "wipe_participants",
        app: APP,
        admin_token,
        feed_id: feedId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, err: data?.err || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("wipeParticipantsOnBackend failed", e);
    return { ok: false, err: String(e.message || e) };
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
        wipe_on_change: !!wipeOnChange, // global, not app-scoped
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

/* ========================= S3 Upload via Presigner ========================= */
export const CF_BASE =
  (window.CONFIG && window.CONFIG.CF_BASE) ||
  "https://d2bihrgvtn9bga.cloudfront.net";

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

export async function uploadFileToS3ViaSigner({ file, feedId, onProgress, prefix = "videos" }) {
  if (!file) throw new Error("No file selected");
  if (!feedId) throw new Error("Missing feedId");

  const { contentType, ext, nameNoExt } = sniffFileMeta(file);
  const ts = Date.now();
  const base = sanitizeName(nameNoExt) || `file_${ts}`;
  const key = `${prefix}/${feedId}/${ts}_${base}.${ext}`;

  const { uploadUrl, fileUrl } = await getPresignedPutUrl({ key, contentType });
  await putToS3({ file, signedPutUrl: uploadUrl, onProgress, contentType });

  const cdnUrl = fileUrl || `${String(CF_BASE).replace(/\/+$/, "")}/${encodePathKeepSlashes(key)}`;
  return { key, cdnUrl };
}