/* ------------------------------ Basics ------------------------------------ */
export const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
export const now = () => Date.now();
export const fmtTime = (ms) => new Date(ms).toISOString();
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

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

/* ============================ Project + URL helpers ============================= */
const PROJECT_KEY = "current_project_id";

function getCombinedSearchParams() {
  try {
    const real = new URLSearchParams(window.location.search);
    const hash = window.location.hash || "";
    const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const fromHash = new URLSearchParams(q);

    const merged = new URLSearchParams();
    for (const [k, v] of real) merged.set(k, v);
    for (const [k, v] of fromHash) merged.set(k, v);
    return merged;
  } catch {
    return new URLSearchParams();
  }
}

export const getUrlParam = (key = "") => getCombinedSearchParams().get(key);

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
export const qProject = () => {
  const pid = getProjectId();
  return pid ? `&project_id=${encodeURIComponent(pid)}` : "";
};

export function getFeedIdFromUrl() {
  try {
    const sp = getCombinedSearchParams();
    return sp.get("feed") || sp.get("feed_id") || null;
  } catch {
    return null;
  }
}

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

export function getAppParam() {
  try {
    const sp = getCombinedSearchParams();
    const fromUrl = (sp.get("app") || "").toLowerCase();
    const fromWin = (window.APP || "").toLowerCase();

    if (fromUrl === "ig" || fromUrl === "instagram") return "ig";
    if (fromUrl === "fb" || fromUrl === "facebook") return "fb";
    if (fromWin === "ig" || fromWin === "instagram") return "ig";
    if (fromWin === "fb" || fromWin === "facebook") return "fb";

    return ""; // default: none
  } catch {
    return "";
  }
}

export function buildFeedShareUrl(feedOrId) {
  const origin = "https://studyfeed.org"; // fixed base
  const fid = typeof feedOrId === "string" ? feedOrId : feedOrId?.feed_id || "";
  const pid = getProjectId();
  const app = getAppParam();

  const qp = new URLSearchParams();

  if (fid) qp.set("feed", fid);
  if (pid) qp.set("project", pid);
  if (app) qp.set("app", app);

  return `${origin}/?${qp.toString()}`;
}

/* ============================ RNG + time display ============================ */
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

/* ------------------------- Bio display helper ------------------------- */
/**
 * displayBioForPost(post, { randomize, seedParts })
 * - deterministic bio randomization
 * - safe fallback to post.bio
 * - consistent with displayTimeForPost
 */
export function displayBioForPost(post, { randomize = false, seedParts = [] } = {}) {
  const bio = post?.bio;
  if (!bio || !randomize) return bio || "";

  const variants = [
    bio, // always include original
    bio.replace(/\./g, "") + " ✨",
    `Life lately: ${bio}`,
    `${bio} | 📍 Somewhere on Earth`,
    `${bio} • sharing moments`,
  ];

  try {
    const picked = pickDeterministic(variants, [...seedParts, "bio"]);
    return picked || bio;
  } catch {
    return bio;
  }
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
  if (remaining > 0) return [...names, `and ${remaining} more`];
  return names;
}

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

/* ---------------------------- Media helpers -------------------------------- */
export const pravatar = (n) => `https://i.pravatar.cc/64?img=${n}`;
export const randomAvatarUrl = () => pravatar(10 + Math.floor(Math.random() * 70));
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

export function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* ------------------------- Video preload helpers -------------------------- */
export const DRIVE_RE = /(?:^|\/\/)(?:drive\.google\.com|drive\.usercontent\.google\.com)/i;
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
export const VIEWPORT_ENTER_FRACTION = 0.8;
export const VIEWPORT_ENTER_FRACTION_IMAGE = 0.6;

export function startViewportTracker({
  root = null,
  postSelector = "[data-post-id]",
  threshold = VIEWPORT_ENTER_FRACTION,
  thresholdImage = VIEWPORT_ENTER_FRACTION_IMAGE,
  getPostId = (el) => el?.dataset?.postId || null,
  hasImage,
  thresholdFor,
  onEvent,
} = {}) {
  if (typeof IntersectionObserver !== "function") {
    console.warn("IntersectionObserver not supported; dwell tracking disabled.");
    return () => {};
  }

  const TH_BASE = clamp(Number(threshold) || VIEWPORT_ENTER_FRACTION, 0, 1);
  const TH_IMG  = clamp(Number(thresholdImage) || VIEWPORT_ENTER_FRACTION_IMAGE, 0, 1);

  const defaultHasImage = (el) => {
    if (!el) return false;
    if (el.dataset && el.dataset.hasImage === "1") return true;
    return !!el.querySelector?.(
      ".image-btn img, .image-btn svg, [data-kind='image'], .media img, .media svg"
    );
  };
  const isImagePost = (el) => (typeof hasImage === "function" ? !!hasImage(el) : defaultHasImage(el));

  const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
  const live = new Map();

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
      `${id}_reaction_type`,
      `${id}_expandable`,
      `${id}_expanded`,
      `${id}_commented`,
      `${id}_comment_texts`,

      `${id}_reported_misinfo`,
      `${id}_dwell_s`,

      /* IG additions */
      `${id}_saved`,

  `${id}_shared`,
  `${id}_share_target`,
  `${id}_share_text`,
  `${id}_cta_clicked`,
  `${id}_bio_opened`,
  `${id}_bio_url_clicked`
    );
  });

  return [...base, ...perPost];
}

/* ---- DICE-style dwell aggregation (multi-visit + height-normalized) ------- */
export function computePostDwellFromEvents(events = []) {
  const open = new Map();
  const total = new Map();
  const maxH = new Map();

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

  const dwellAgg = computePostDwellFromEvents(events);


  
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
        saved: false,
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
  /* EXISTING FACEBOOK */
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

case "save":
    p.saved = true;
    break;



  /* -------------------------------------------
   * IG-ONLY EVENTS (SAFE ADDITIONS)
   * ------------------------------------------- */


  // When user picks a target → we count this as a real share
case "share_target":
  const friendList =
  typeof e.friends === "string" && e.friends.trim()
    ? e.friends.trim()
    : e.friend
    ? String(e.friend)
    : "";

  p.share_target = friendList;
  p.share_text   = e.message ? String(e.message) : "";
  break;

// CTA click is participant-level behavior only
case "cta_click":
  p.cta_clicked = true;
  break;

case "bio_open":
  p.bio_opened = true;
  break;

case "bio_url_click":
  p.bio_url_clicked = true;
  break;


  /* IG desktop/mobile menu report */
  case "report":
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
    row[`${id}_reaction_type`] = agg.reaction_type;
    row[`${id}_reported_misinfo`]  = agg.reported_misinfo ? 1 : "";

    row[`${id}_expandable`] = agg.expandable ? 1 : "";
    row[`${id}_expanded`]   = agg.expanded ? 1 : "";
    row[`${id}_commented`] = agg.commented ? 1 : "";
    row[`${id}_comment_texts`] = agg.comment_texts.length
      ? agg.comment_texts.join(" | ")
      : "";

    row[`${id}_saved`] = agg.saved ? 1 : "";

// IG: shared fields (clean)
const shareTargetClean = String(agg.share_target || "").trim();
const hasTarget = shareTargetClean !== "";

row[`${id}_shared`]        = hasTarget ? 1 : "";
row[`${id}_share_target`]  = hasTarget ? shareTargetClean : "";
row[`${id}_share_text`]    = agg.share_text || "";
row[`${id}_cta_clicked`] = agg.cta_clicked ? 1 : "";
row[`${id}_bio_opened`]     = agg.bio_opened ? 1 : "";
row[`${id}_bio_url_clicked`] = agg.bio_url_clicked ? 1 : "";

    const aggD = dwellAgg.get(id);
    row[`${id}_dwell_s`]         = aggD ? aggD.dwell_s : 0;
  }

  return row;
}

/* ---------------------- Participants (admin panels) ----------------------- */
export function extractPerPostFromRosterRow(row) {
  if (!row || typeof row !== "object") return {};

  const blob = row.per_post_json || row.per_post || row.perPostJson || null;

  /* =========================================================================
   * 1) JSON-BASED PER_POST (preferred path)
   * ========================================================================= */
  if (blob) {
    try {
      const parsed = typeof blob === "string" ? JSON.parse(blob) : blob;
      const clean = {};

      const outEnsure = (id) => {
        if (!clean[id]) {
          clean[id] = {
            reacted: 0,
            commented: 0,
            shared: 0,
            reported: 0,
            expandable: 0,
            expanded: 0,
            saved: 0,
            reactions: [],
            reaction_types: [],
            reaction_type: "",
            comment_text: "",
            comment_count: 0,
            dwell_s: 0,
            share_target: "",
            share_text: "",
            cta_clicked: 0,
            bio_opened: 0,
            bio_url_clicked: 0,
            
          };
        }
        return clean[id];
      };

      // Parse JSON fields
      for (const [id, agg] of Object.entries(parsed || {})) {
        const rx = agg?.reactions || agg?.reaction_types || [];
        const rxArr = Array.isArray(rx)
          ? rx
          : typeof rx === "string"
          ? rx.split(",").map(s => s.trim()).filter(Boolean)
          : [];

        const cText = String(
          agg?.comment_text ||
          (Array.isArray(agg?.comment_texts)
            ? agg.comment_texts.join(" | ")
            : agg?.comment_texts || "")
        ).trim();

        const obj = outEnsure(id);
        obj.reactions = rxArr;
        obj.reaction_types = rxArr;
        obj.reaction_type = (agg?.reaction_type || rxArr[0] || "").trim();
        obj.reacted = obj.reaction_type ? 1 : 0;

        obj.comment_text = cText;
        obj.commented = cText ? 1 : 0;
        obj.comment_count = cText ? 1 : 0;

        obj.expandable = Number(agg?.expandable || 0);
        obj.expanded = Number(agg?.expanded || 0);
        obj.saved = Number(agg?.saved || 0);

        obj.shared = Number(agg?.shared || 0);
        obj.reported = Number(agg?.reported || agg?.reported_misinfo || 0);

        obj.share_target = String(agg?.share_target || "").trim();
        obj.share_text = String(agg?.share_text || "").trim();
        if (obj.share_target) obj.shared = 1;

        obj.cta_clicked = Number(agg?.cta_clicked || 0);

        obj.bio_opened = Number(agg?.bio_opened || 0);
obj.bio_url_clicked = Number(agg?.bio_url_clicked || 0);

        obj.dwell_s = Number.isFinite(agg?.dwell_s)
          ? agg.dwell_s
          : Number.isFinite(agg?.dwell_ms)
          ? Math.round(agg.dwell_ms / 1000)
          : 0;
      }

      // Additional per-row overrides (if any)
      for (const [key, val] of Object.entries(row)) {
        let m;

        // --- commented fallback ---
        m = /^(.+?)_commented$/.exec(key);
        if (m) {
          const obj = outEnsure(m[1]);
          obj.commented = Number(val || 0);
          continue;
        }

        // --- comment texts fallback ---
        m = /^(.+?)_comment_texts$/.exec(key);
        if (m) {
          const obj = outEnsure(m[1]);
          const txt = String(val || "").trim();
          obj.comment_text = txt;
          if (txt) {
            obj.commented = 1;
            obj.comment_count = 1;
          }
          continue;
        }

        // --- IG share target ---
        m = /^(.+?)_share_target$/.exec(key);
        if (m) {
          const obj = outEnsure(m[1]);
          const t = String(val || "").trim();
          obj.share_target = t;
          if (t) obj.shared = 1;
          continue;
        }

        // --- IG share text ---
        m = /^(.+?)_share_text$/.exec(key);
        if (m) {
          outEnsure(m[1]).share_text = String(val || "").trim();
          continue;
        }

        // --- IG CTA ---
        m = /^(.+?)_cta_clicked$/.exec(key);
        if (m) {
          outEnsure(m[1]).cta_clicked = Number(val || 0);
          continue;
        }

        // --- reaction type fallback ---
        m = /^(.+?)_reaction_type$/.exec(key);
        if (m) {
          const obj = outEnsure(m[1]);
          const t = String(val || "").trim();
          obj.reaction_type = t;
          obj.reactions = t ? [t] : [];
          obj.reaction_types = obj.reactions;
          obj.reacted = t ? 1 : 0;
          continue;
        }
      }

      return clean;
    } catch {}
  }

  /* =========================================================================
   * 2) FALLBACK PARSER (no JSON)
   * ========================================================================= */

  const out = {};
  const ensure = (id) => {
    if (!out[id]) {
      out[id] = {
        reacted: 0, commented: 0, shared: 0, reported: 0,
        expandable: 0, expanded: 0,
        saved: 0,
        reactions: [], reaction_types: [], reaction_type: "",
        comment_text: "", comment_count: 0,
        share_target: "", share_text: "",
        cta_clicked: 0,
        dwell_s: 0,
        bio_opened: 0,
        bio_url_clicked: 0
      };
    }
    return out[id];
  };

  for (const [key, val] of Object.entries(row)) {
    let m;

    // boolean fields
   m = /^(.+?)_(reacted|commented|shared|saved|reported_misinfo|expanded|expandable|bio_opened|bio_url_clicked)$/.exec(key);
if (m) {
  const obj = ensure(m[1]);
  const metric = m[2];
  const num = Number(val || 0);
  if (metric === "reported_misinfo") obj.reported = num;
  else obj[metric] = num;
  continue;
}

    // IG share target
    m = /^(.+?)_share_target$/.exec(key);
    if (m) {
      const obj = ensure(m[1]);
      const t = String(val || "").trim();
      obj.share_target = t;
      if (t) obj.shared = 1;
      continue;
    }

    // IG share text
    m = /^(.+?)_share_text$/.exec(key);
    if (m) {
      ensure(m[1]).share_text = String(val || "").trim();
      continue;
    }

    // IG CTA
    m = /^(.+?)_cta_clicked$/.exec(key);
    if (m) {
      ensure(m[1]).cta_clicked = Number(val || 0);
      continue;
    }

    // reaction type
    m = /^(.+?)_reaction_type$/.exec(key);
    if (m) {
      const obj = ensure(m[1]);
      const t = String(val || "").trim();
      obj.reaction_type = t;
      obj.reactions = t ? [t] : [];
      obj.reaction_types = obj.reactions;
      obj.reacted = t ? 1 : 0;
      continue;
    }

    // comment text
    m = /^(.+?)_comment_texts$/.exec(key);
    if (m) {
      const obj = ensure(m[1]);
      const txt = String(val || "").trim();
      obj.comment_text = txt;
      if (txt) {
        obj.commented = 1;
        obj.comment_count = 1;
      }
      continue;
    }

    // dwell
    m = /^(.+?)_dwell_s$/.exec(key);
    if (m) {
      ensure(m[1]).dwell_s = Number(val || 0);
      continue;
    }

    m = /^(.+?)_dwell_ms$/.exec(key);
    if (m) {
      const obj = ensure(m[1]);
      if (!obj.dwell_s) obj.dwell_s = Math.round(Number(val || 0) / 1000);
      continue;
    }
  }

  return out;
}

/* ---- dashboard math helpers ---- */
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
    if (/_reacted$|_expandable$|_expanded$|_commented$|_shared$|_saved$|_reported_misinfo$|_bio_opened$|_bio_url_clicked$/.test(k)) {
      const base = k.replace(/_(reacted|expandable|expanded|commented|shared|saved|reported_misinfo|bio_opened|bio_url_clicked)$/, "");
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
    const saved      = rows.reduce((acc, r) => acc + (Number(r[`${base}_saved`]) || 0), 0);
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

    perPost[base] = { reacted, expandable, expanded, expandRate, commented, saved, shared, reported, avgDwellS };
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

/* ------- Avatar pools (from S3 manifests) ------- */
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
      const res = await fetch(url, { mode: "cors", cache: "no-cache" });
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

export function pickDeterministic(array, seedParts = []) {
  const arr = Array.isArray(array) ? array : [];
  if (!arr.length) return null;
  const seed = String(seedParts.join("::"));
  const r = rng(seed);
  const idx = Math.floor(r() * arr.length);
  return arr[idx];
}

/* ------- Image pools by topic (from S3 manifests) ------- */
// Legacy: lowercase, trim, spaces→_, strip parens, keep [-_a-z0-9.]
export function topicToFolder(topic = "") {
  return String(topic || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

// Case-preserving, spaces→_ variant (legacy fallback)
function sanitizeFolderCasePreserving(topic = "") {
  return String(topic || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

// New: keep spaces & case; strip parens; allow spaces and [-_.A-Za-z0-9]
function sanitizeKeepSpacesCaseful(topic = "") {
  return String(topic || "")
    .trim()
    .replace(/[()]/g, "")
    .replace(/[^A-Za-z0-9._\-\s]/g, "");
}

// New: Title Case with spaces (preferred)
function titleCaseKeepSpaces(topic = "") {
  const cleaned = sanitizeKeepSpacesCaseful(topic);
  return cleaned
    .split(/\s+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// Build the index.json URL for a given topic folder
export function imagePoolIndexUrl(folder) {
  const base = CF_BASE.replace(/\/+$/, "");
  return `${base}/images/${encodeURIComponent(folder)}/index.json`;
}

// Normalize index entries (strings or {url}) to absolute URLs
function normalizeImageIndex(list, folder) {
  const base = CF_BASE.replace(/\/+$/, "");
  const prefix = `${base}/images/${encodeURIComponent(folder)}/`;
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((item) => {
      const u = typeof item === "string" ? item : item && item.url;
      if (!u) return null;
      if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return prefix + u;
      return /^https?:\/\//i.test(u) ? u : `${base}/${String(u).replace(/^\/+/, "")}`;
    })
    .filter(Boolean);
}

const __imagePoolCache = new Map(); // key: folder -> Promise<string[]>

/**
 * getImagePool(topic)
 * Order of attempts:
 *   1) Title Case with spaces (preferred):  "animals" → "Animals", "social media" → "Social Media"
 *   2) As-typed, spaces kept, case preserved
 *   3) Case-preserving with underscores      "Social Media" → "Social_Media"
 *   4) Lowercase with underscores (legacy)   "social_media"
 */
export async function getImagePool(topic = "") {
  const preferred = titleCaseKeepSpaces(topic);
  const asTyped  = sanitizeKeepSpacesCaseful(topic);
  const caseUnd  = sanitizeFolderCasePreserving(topic);
  const lowerUnd = topicToFolder(topic);

  // De-dup while preserving order
  const candidates = Array.from(new Set([preferred, asTyped, caseUnd, lowerUnd].filter(Boolean)));

  for (const folder of candidates) {
    const key = `img::${folder}`;
    if (!__imagePoolCache.has(key)) {
      __imagePoolCache.set(
        key,
        (async () => {
          try {
            const url = imagePoolIndexUrl(folder);
            const res = await fetch(url, { mode: "cors", cache: "no-cache" });
            if (!res.ok) return [];
            const list = await res.json().catch(() => []);
            return normalizeImageIndex(list, folder);
          } catch {
            return [];
          }
        })()
      );
    }
    const list = await __imagePoolCache.get(key).catch(() => []);
    if (Array.isArray(list) && list.length) return list; // stop at first hit
  }

  return [];
}