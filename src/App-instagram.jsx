import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import "./styles-instagram.css";

import {
  uid, now, fmtTime, clamp,
  loadPostsFromBackend, savePostsToBackend,
  sendToSheet, buildMinimalHeader, buildParticipantRow,
  computeFeedId, getDefaultFeedFromBackend,
  hasAdminSession, adminLogout, listFeedsFromBackend,
  getFeedIdFromUrl, VIEWPORT_ENTER_FRACTION, VIEWPORT_ENTER_FRACTION_IMAGE,
  // project/feed helpers so URLs include ?project_id
  getProjectId as getProjectIdUtil,
  setProjectId as setProjectIdUtil,
  setFeedIdInUrl,
  // ⬇️ flags + asset helpers (shared with FB)
  APP, GS_ENDPOINT, fetchFeedFlags,
  getAvatarPool,
  getImagePool,
} from "./utils";

import { Feed as IGFeed } from "./ui-posts";
import {
  ParticipantOverlay, ThankYouOverlay,
  RouteAwareTopbar, SkeletonFeed, LoadingOverlay,
} from "./ui-core";

import { AdminDashboard } from "./admin/components-admin-dashboard";
import AdminLogin from "./admin/components-admin-login";

/* ======================================================================
   Mode & helpers
   ====================================================================== */
const MODE = (new URLSearchParams(window.location.search).get("style") || window.CONFIG?.STYLE || "ig").toLowerCase();
if (typeof document !== "undefined") {
  document.body.classList.toggle("ig-mode", MODE === "ig");
}

// Normalize truthy flag shapes coming back from Apps Script / sheet
function normalizeFlags(raw) {
  let f = raw || {};
  if (typeof f === "string") { try { f = f.trim() ? JSON.parse(f) : {}; } catch { f = {}; } }
  const truthy = (v) => v === true || v === "true" || v === 1 || v === "1";
  const randomize_times    = truthy(f.randomize_times  ?? f.randomize_time  ?? f.random_time   ?? false);
  const randomize_avatars  = truthy(f.randomize_avatars?? f.randomize_avatar?? f.rand_avatar    ?? false);
  const randomize_names    = truthy(f.randomize_names  ?? f.rand_names      ?? false);
  const randomize_images   = truthy(f.randomize_images ?? f.randomize_image ?? f.rand_images    ?? false);
  return { randomize_times, randomize_avatars, randomize_names, randomize_images };
}

/* iOS UX guards (same behavior as FB) */
function useIOSInputZoomFix(selector = ".participant-overlay input, .participant-overlay .input, .participant-overlay select, .participant-overlay textarea") {
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOS = /iP(hone|ad|od)/.test(ua);
    if (!isIOS) return;
    const htmlStyle = document.documentElement.style;
    const prevAdj = htmlStyle.webkitTextSizeAdjust || htmlStyle.textSizeAdjust || "";
    htmlStyle.webkitTextSizeAdjust = "100%";
    htmlStyle.textSizeAdjust = "100%";
    const style = document.createElement("style");
    style.setAttribute("data-ios-input-zoom-fix", "1");
    style.textContent = `@supports(-webkit-touch-callout:none){${selector}{font-size:16px!important;line-height:1.2;min-height:40px;}}`;
    document.head.appendChild(style);
    return () => { if (style.parentNode) style.parentNode.removeChild(style); htmlStyle.webkitTextSizeAdjust = prevAdj; htmlStyle.textSizeAdjust = prevAdj; };
  }, [selector]);
}
function useIOSViewportGuard({ overlayActive, fieldSelector = ".participant-overlay input" } = {}) {
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOS = /iP(hone|ad|od)/.test(ua);
    if (!isIOS) return;
    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) { vp = document.createElement("meta"); vp.setAttribute("name", "viewport"); document.head.appendChild(vp); }
    const BASE = "width=device-width, initial-scale=1, viewport-fit=cover";
    const LOCK = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover";
    const set = (content) => vp && vp.setAttribute("content", content);
    const nudge = () => { requestAnimationFrame(() => { window.scrollTo(0,0); window.dispatchEvent(new Event("resize")); }); };
    const onFocus = (e) => { if (e.target?.matches?.(fieldSelector)) set(LOCK); };
    const onBlur  = (e) => { if (e.target?.matches?.(fieldSelector)) { set(BASE); nudge(); } };
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", onBlur, true);
    set(overlayActive ? LOCK : BASE);
    return () => { document.removeEventListener("focusin", onFocus, true); document.removeEventListener("focusout", onBlur, true); set(BASE); };
  }, [overlayActive, fieldSelector]);
}

/* ---------- IG rails skeleton (unchanged visuals) ---------- */
function RailBox({ largeAvatar = false }) {
  return (
    <div className="ghost-card box" style={{ padding: ".8rem", borderRadius: 14 }}>
      <div className="ghost-profile" style={{ padding: 0 }}>
        <div className={`ghost-avatar ${largeAvatar ? "xl online" : ""}`} />
        <div className="ghost-lines" style={{ flex: 1 }}>
          <div className="ghost-line w-60" />
          <div className="ghost-line w-35" />
        </div>
      </div>
      <div className="ghost-row"><div className="ghost-line w-70" /></div>
      <div className="ghost-row"><div className="ghost-line w-45" /></div>
    </div>
  );
}
function RailBanner({ tall = false }) {
  return <div className="ghost-card banner" style={{ height: tall ? 220 : 170, borderRadius: 14 }} />;
}
function RailList({ rows = 4 }) {
  return (
    <div className="ghost-list" style={{ borderRadius: 14, padding: ".55rem" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ghost-item icon">
          <div className="ghost-icon" />
          <div className="ghost-title" />
        </div>
      ))}
    </div>
  );
}
function RailStack({ children }) { return (<div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%" }}>{children}</div>); }
function PageWithRails({ children }) {
  const [rightCount, setRightCount] = useState(12);
  useEffect(() => {
    const compute = () => {
      const railGap = 30;
      const railH = (window.innerHeight || 900) - railGap;
      const H_BANNER = 170 + 14; const H_TBANNER = 220 + 14; const H_BOX = 120 + 14; const H_LIST = 110 + 14;
      const fixedTop = H_TBANNER; let remaining = Math.max(railH - fixedTop - H_BANNER, 0);
      const patternHeights = [H_BOX, H_LIST, H_BOX]; let n = 0, acc = 0;
      while (acc + patternHeights[n % patternHeights.length] <= remaining) { acc += patternHeights[n % patternHeights.length]; n += 1; if (n > 50) break; }
      const safeCount = Math.max(8, Math.min(n, 30)); setRightCount(safeCount);
    };
    compute(); window.addEventListener("resize", compute); return () => window.removeEventListener("resize", compute);
  }, []);
  return (
    <div className="page" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(var(--feed-min), var(--feed-max)) minmax(0,2.25fr)", columnGap: "var(--gap)" }}>
      <aside className="rail rail-left" aria-hidden="true">
        <RailStack>
          <RailBanner tall />
          <RailBox largeAvatar />
          <RailList rows={5} />
          <RailBox />
          <RailBanner />
        </RailStack>
      </aside>
      <div className="container feed">{children}</div>
      <aside className="rail rail-right" aria-hidden="true">
        <RailStack>
          <RailBanner tall />
          {Array.from({ length: rightCount }).map((_, i) => (i % 3 === 1 ? <RailList key={i} rows={4} /> : <RailBox key={i} largeAvatar={i % 5 === 0} />))}
          <RailBanner />
        </RailStack>
      </aside>
    </div>
  );
}

/* =============================== MAIN APP ================================ */
export default function App() {
  const sessionIdRef = useRef(uid());
  const t0Ref = useRef(now());
  const enterTsRef = useRef(null);
  const submitTsRef = useRef(null);

  // === Project ID: source of truth from utils (URL/localStorage)
  const [projectId, setProjectIdState] = useState(() => getProjectIdUtil() || "");
  useEffect(() => { setProjectIdUtil(projectId, { persist: true, updateUrl: false }); }, [projectId]);

  // Watch URL for project changes (deep-link friendly)
  useEffect(() => {
    const syncFromUrl = () => {
      const q = new URLSearchParams(window.location.search);
      const hashQuery = (window.location.hash.split("?")[1] || "");
      const getFlag = (key) => q.get(key) ?? new URLSearchParams(hashQuery).get(key);
      const p = getFlag("project_id") || getFlag("project");
      if (p != null && String(p) !== projectId) { setProjectIdState(String(p)); setProjectIdUtil(String(p), { persist: true, updateUrl: false }); }
    };
    window.addEventListener("hashchange", syncFromUrl); window.addEventListener("popstate", syncFromUrl);
    syncFromUrl();
    return () => { window.removeEventListener("hashchange", syncFromUrl); window.removeEventListener("popstate", syncFromUrl); };
  }, [projectId]);

  const [runSeed] = useState(() => (crypto?.getRandomValues ? Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-") : String(Date.now()) + "-" + Math.random().toString(36).slice(2)));
  const onAdmin = typeof window !== "undefined" && window.location.hash.startsWith("#/admin");

  const [activeFeedId, setActiveFeedId] = useState(!onAdmin ? getFeedIdFromUrl() : null);
  const [posts, setPosts] = useState([]);
  const [feedPhase, setFeedPhase] = useState("idle");
  const [feedError, setFeedError] = useState("");
  const feedAbortRef = useRef(null);

  // Flags + assets readiness (parity with FB)
  const [flags, setFlags] = useState({ randomize_times: false, randomize_avatars: false, randomize_names: false, randomize_images: false });
  const [avatarPools, setAvatarPools] = useState(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [flagsReady, setFlagsReady] = useState(false);

  // Minimum delay gate when randomization implies background preloading
  const [minDelayDone, setMinDelayDone] = useState(true);
  const minDelayStartedRef = useRef(false);
  const minDelayTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(minDelayTimerRef.current), []);

  // Debug viewport overlay support
  useEffect(() => {
    const apply = () => {
      const on = new URLSearchParams(window.location.search).get("debugvp") === "1" || (window.location.hash.split("?")[1] && new URLSearchParams(window.location.hash.split("?")[1]).get("debugvp") === "1");
      document.body.classList.toggle("debug-vp", on);
    };
    apply(); window.addEventListener("popstate", apply); window.addEventListener("hashchange", apply);
    return () => { window.removeEventListener("popstate", apply); window.removeEventListener("hashchange", apply); };
  }, []);

  // ---------- Centralized, abortable feed loader with caching + flags ----------
  const startLoadFeed = useCallback(async () => {
    if (onAdmin) return;
    feedAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    feedAbortRef.current = ctrl;

    setFeedPhase("loading");
    setFeedError("");
    setFlagsReady(false);
    setAssetsReady(false);
    clearTimeout(minDelayTimerRef.current);
    minDelayStartedRef.current = false;
    setMinDelayDone(true);

    try {
      const [feedsList, backendDefault] = await Promise.all([
        listFeedsFromBackend({ signal: ctrl.signal }),
        getDefaultFeedFromBackend({ signal: ctrl.signal }),
      ]);
      if (ctrl.signal.aborted) return;

      const urlFeedId = getFeedIdFromUrl();
      const chosen =
        (feedsList || []).find(f => f.feed_id === urlFeedId) ||
        (feedsList || []).find(f => f.feed_id === (backendDefault?.feed_id || backendDefault)) ||
        (feedsList || [])[0] || null;
      if (!chosen) throw new Error("No feeds are available.");

      setActiveFeedId(chosen.feed_id);
      try { setFeedIdInUrl(chosen.feed_id, { replace: true }); } catch {}

      // Try local cache keyed by project+feed and checksum
      let cached = null;
      try {
        const k = `posts::${projectId || ""}::${chosen.feed_id}`;
        const meta = JSON.parse(localStorage.getItem(`${k}::meta`) || "null");
        if (meta?.checksum === chosen.checksum) {
          const data = JSON.parse(localStorage.getItem(k) || "null");
          if (Array.isArray(data)) cached = data;
        }
      } catch {}

      const flagsPromise = fetchFeedFlags({
        app: APP,
        projectId: projectId || undefined,
        feedId: chosen.feed_id || undefined,
        project_id: projectId || undefined,
        feed_id: chosen.feed_id || undefined,
        endpoint: GS_ENDPOINT,
        signal: ctrl.signal,
      }).catch(() => ({}));

      if (cached) {
        const resFlags = await flagsPromise;
        if (ctrl.signal.aborted) return;
        const nextFlags = normalizeFlags(resFlags);
        setFlags(nextFlags);
        setFlagsReady(true);
        setPosts(cached);
        setFeedPhase("ready");
        return;
      }

      const [fresh, resFlags] = await Promise.all([
        loadPostsFromBackend(chosen.feed_id, { force: true, signal: ctrl.signal }),
        flagsPromise,
      ]);
      if (ctrl.signal.aborted) return;

      const arr = Array.isArray(fresh) ? fresh : [];
      const nextFlags = normalizeFlags(resFlags);
      setFlags(nextFlags);
      setFlagsReady(true);
      setPosts(arr);

      try {
        const k = `posts::${projectId || ""}::${chosen.feed_id}`;
        localStorage.setItem(k, JSON.stringify(arr));
        localStorage.setItem(`${k}::meta`, JSON.stringify({ checksum: chosen.checksum, t: Date.now() }));
      } catch {}

      setFeedPhase("ready");
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.warn("Feed load failed:", e);
      setFeedError(e?.message || "Failed to load the feed. Please try again.");
      setFeedPhase("error");
    } finally {
      if (feedAbortRef.current === ctrl) feedAbortRef.current = null;
    }
  }, [onAdmin, projectId]);

  // Watch URL for feed/project changes and react
  useEffect(() => {
    const onUrlChange = () => {
      const fid = getFeedIdFromUrl();
      const pid = getProjectIdUtil();
      if (pid) setProjectIdUtil(pid, { persist: true, updateUrl: false });
      if (fid && fid !== activeFeedId) { setFeedIdInUrl(fid, { replace: true }); setActiveFeedId(fid); startLoadFeed(); }
    };
    onUrlChange();
    window.addEventListener("hashchange", onUrlChange);
    window.addEventListener("popstate", onUrlChange);
    return () => { window.removeEventListener("hashchange", onUrlChange); window.removeEventListener("popstate", onUrlChange); };
  }, [activeFeedId, startLoadFeed]);

  useEffect(() => { if (!onAdmin) startLoadFeed(); return () => feedAbortRef.current?.abort?.(); }, [onAdmin, startLoadFeed, projectId]);

  // Admin session autodetect
  const [adminAuthed, setAdminAuthed] = useState(false);
  useEffect(() => { if (onAdmin && hasAdminSession()) setAdminAuthed(true); }, [onAdmin]);

  // Local UI toggles
  const [randomize, setRandomize] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [toast, setToast] = useState(null);
  const [events, setEvents] = useState([]);

  // Effective viewport lock (account for overlays + readiness gates)
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    const shouldLock = !onAdmin && (!hasEntered || feedPhase !== "ready" || submitted || !flagsReady || !assetsReady || !minDelayDone);
    el.style.overflow = shouldLock ? "hidden" : "";
    return () => { el.style.overflow = prev; };
  }, [hasEntered, feedPhase, submitted, onAdmin, flagsReady, assetsReady, minDelayDone]);

  // iOS zoom + viewport guards
  const overlayActive = !onAdmin && !hasEntered;
  useIOSInputZoomFix();
  useIOSViewportGuard({ overlayActive, fieldSelector: ".participant-overlay input" });

  // Random order toggle affects visual sequence only (not IDs)
  const orderedPosts = useMemo(() => {
    const arr = posts.map(p => ({ ...p }));
    if (randomize) arr.sort(() => Math.random() - 0.5);
    return arr;
  }, [posts, randomize]);

  // Minimum delay when assets will be randomized (gives pools time to warm)
  useEffect(() => {
    if (onAdmin || !hasEntered || feedPhase !== "ready" || submitted) return;
    const randOn = !!flags?.randomize_avatars || !!flags?.randomize_images;
    if (randOn && !minDelayStartedRef.current) {
      minDelayStartedRef.current = true;
      setMinDelayDone(false);
      clearTimeout(minDelayTimerRef.current);
      // keep slightly shorter than FB if desired; align to 1500ms for parity
      minDelayTimerRef.current = setTimeout(() => setMinDelayDone(true), 1500);
    }
    if (!randOn) { clearTimeout(minDelayTimerRef.current); setMinDelayDone(true); }
  }, [onAdmin, hasEntered, feedPhase, submitted, flags?.randomize_avatars, flags?.randomize_images]);

  // Preload avatar/image pools (deterministic picks happen inside ui-posts via pickDeterministic)
  useEffect(() => {
    if (onAdmin || !hasEntered || feedPhase !== "ready" || submitted) return;
    const randAvOn  = !!(flags?.randomize_avatars);
    const randImgOn = !!(flags?.randomize_images);
    if (!randAvOn && !randImgOn) { setAvatarPools(null); setAssetsReady(true); return; }

    const types = new Set(posts.map(p => (p?.authorType === "male" || p?.authorType === "company") ? p.authorType : "female"));
    if (types.size === 0) { setAvatarPools(null); setAssetsReady(true); return; }

    let cancelled = false;
    (async () => {
      try {
        const jobs = [];
        if (randAvOn) {
          const typesArr = Array.from(types);
          jobs.push(Promise.all(typesArr.map(async (t) => [t, await getAvatarPool(t)])).then((entries) => { if (!cancelled) setAvatarPools(Object.fromEntries(entries)); }));
        } else {
          setAvatarPools(null);
        }
        if (randImgOn) {
          const topics = Array.from(new Set(
            posts
              .filter(p => p?.image && p?.imageMode !== "none")
              .map(p => String(p?.topic || p?.imageTopic || "").trim())
              .filter(Boolean)
              .map(t => t.toLowerCase())
          ));
          if (topics.length) jobs.push(Promise.allSettled(topics.map((t) => getImagePool(t))));
        }
        await Promise.allSettled(jobs);
        if (!cancelled) setAssetsReady(true);
      } catch (err) {
        if (!cancelled) { console.debug("[asset preload error]", err); setAvatarPools(null); setAssetsReady(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [onAdmin, hasEntered, feedPhase, submitted, posts, flags]);

  // Logging infra
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1500); };
  const log = (action, meta = {}) => {
    const ts = now();
    setEvents((prev) => ([...prev, {
      session_id: sessionIdRef.current,
      participant_id: participantId || null,
      timestamp_iso: fmtTime(ts),
      elapsed_ms: ts - t0Ref.current,
      ts_ms: ts,
      action,
      ...meta,
    }]));
  };

  useEffect(() => {
    log("session_start", { user_agent: navigator.userAgent, feed_id: activeFeedId || null, project_id: projectId || null });
    const onEnd = () => log("session_end", { total_events: events.length });
    window.addEventListener("beforeunload", onEnd);
    return () => window.removeEventListener("beforeunload", onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Feed mount & cross-fade gate (parity with FB) =====
  const canShowFeed = hasEntered && feedPhase === "ready";
  const gateOpen    = canShowFeed && flagsReady && assetsReady && minDelayDone;
  const [showSkeletonLayer, setShowSkeletonLayer] = useState(true);
  useEffect(() => { if (canShowFeed) setShowSkeletonLayer(true); }, [canShowFeed]);
  useEffect(() => { if (gateOpen) { const t = setTimeout(() => setShowSkeletonLayer(false), 320); return () => clearTimeout(t); } else { setShowSkeletonLayer(true); } }, [gateOpen]);

  // ===== Admin login state =====
  useEffect(() => { if (onAdmin && hasAdminSession()) setAdminAuthed(true); }, [onAdmin]);

  // ✅ Viewport tracking (copy this block here)
useEffect(() => {
  if (!hasEntered || feedPhase !== "ready" || submitted || onAdmin) return;

  const DEBUG_VP = new URLSearchParams(window.location.search).get("debugvp") === "1";
  const ENTER_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION))
    ? clamp(Number(VIEWPORT_ENTER_FRACTION), 0, 1)
    : 0.5;
  const IMG_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION_IMAGE))
    ? clamp(Number(VIEWPORT_ENTER_FRACTION_IMAGE), 0, 1)
    : ENTER_FRAC;

  const enteredSet = new Set();
  const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
  const rootMargin = "0px 0px 0px 0px";

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const postId = e.target.dataset.postId;
        if (!postId) continue;
        const vis_frac = Number((e.intersectionRatio || 0).toFixed(4));
        const isImg = e.target.querySelector("img, video");
        const TH = isImg ? IMG_FRAC : ENTER_FRAC;

        const nowIn = e.isIntersecting && vis_frac >= TH;
        const wasIn = enteredSet.has(postId);

        if (DEBUG_VP) {
          e.target.dataset.vis = `${Math.round(vis_frac * 100)}%`;
          e.target.dataset.state = nowIn ? "IN" : "OUT";
        }

        if (nowIn && !wasIn) {
          enteredSet.add(postId);
          log("vp_enter", { post_id: postId, vis_frac, feed_id: activeFeedId || null });
        } else if (!nowIn && wasIn) {
          enteredSet.delete(postId);
          log("vp_exit", { post_id: postId, vis_frac, feed_id: activeFeedId || null });
        }
      }
    },
    { threshold: thresholds, rootMargin }
  );

  document.querySelectorAll("[data-post-id]").forEach((el) => io.observe(el));

  const onHide = () => {
    enteredSet.forEach((id) =>
      log("vp_exit", { post_id: id, reason: "page_hide", feed_id: activeFeedId || null })
    );
    enteredSet.clear();
  };

  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("beforeunload", onHide);

  return () => {
    try { io.disconnect(); } catch {}
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("beforeunload", onHide);
  };
}, [hasEntered, feedPhase, submitted, onAdmin, activeFeedId, log]);

  return (
    <Router>
      <div className={`app-shell ${(!onAdmin && (!hasEntered || feedPhase !== "ready" || submitted || !flagsReady || !assetsReady || !minDelayDone)) ? "blurred" : ""}`}>
        <RouteAwareTopbar />

        <Routes>
          <Route
            path="/"
            element={
              <PageWithRails>
                {/* Layered container: skeleton + feed cross-fade under the overlay */}
                <div style={{ position: "relative", minHeight: "calc(100vh - var(--vp-top, 0px))" }}>
                  {/* Feed layer mounts as soon as API says ready so assets start loading */}
                  <div
                    aria-hidden={!canShowFeed}
                    style={{
                      opacity: canShowFeed ? (gateOpen ? 1 : 0) : 0,
                      pointerEvents: gateOpen ? "auto" : "none",
                      transition: "opacity 320ms ease",
                      position: showSkeletonLayer ? "absolute" : "relative",
                      inset: showSkeletonLayer ? 0 : "auto",
                      zIndex: 1,
                    }}
                  >
                    {canShowFeed ? (
                      <IGFeed
                        posts={orderedPosts}
                        registerViewRef={() => () => {}}
                        disabled={disabled}
                        log={log}
                        showComposer={false}
                        loading={false}
                        /* 🔑 Randomization + determinism props */
                        flags={flags}
                        runSeed={runSeed}
                        app={APP}
                        projectId={projectId}
                        feedId={activeFeedId}
                        avatarPools={avatarPools}
                        onSubmit={async () => {
                          if (submitted || disabled) return;
                          setDisabled(true);

                          // viewport exit logging parity
                          const ENTER_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION)) ? clamp(Number(VIEWPORT_ENTER_FRACTION), 0, 1) : 0.5;
                          const IMG_FRAC   = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION_IMAGE)) ? clamp(Number(VIEWPORT_ENTER_FRACTION_IMAGE), 0, 1) : ENTER_FRAC;
                          const DEBUG_VP   = (new URLSearchParams(window.location.search).get("debugvp") === "1") || (window.location.hash.split("?")[1] && new URLSearchParams(window.location.hash.split("?")[1]).get("debugvp") === "1");
                          // (IG layout uses lazy registerViewRef noop; if you wire it later, mirror FB submit exits)

                          const ts = now();
                          submitTsRef.current = ts;
                          const submitEvent = {
                            session_id: sessionIdRef.current,
                            participant_id: participantId || null,
                            timestamp_iso: fmtTime(ts),
                            elapsed_ms: ts - t0Ref.current,
                            ts_ms: ts,
                            action: "feed_submit",
                            feed_id: activeFeedId || null,
                            project_id: projectId || null,
                          };
                          const eventsWithSubmit = [...events, submitEvent];
                          const feed_id = activeFeedId || null;
                          const feed_checksum = computeFeedId(posts);
                          const row = buildParticipantRow({ session_id: sessionIdRef.current, participant_id: participantId, events: eventsWithSubmit, posts, feed_id, feed_checksum });
                          const header = buildMinimalHeader(posts);
                          const ok = await sendToSheet(header, row, eventsWithSubmit, feed_id);
                          showToast(ok ? "Submitted ✔︎" : "Sync failed. Please try again.");
                          if (ok) setSubmitted(true);
                          setDisabled(false);
                        }}
                      />
                    ) : null}
                  </div>

                  {/* Skeleton layer: shows until feed is mountable, then fades out */}
                  {showSkeletonLayer && (
                    <div aria-hidden={gateOpen} style={{ position: "relative", zIndex: 2, opacity: gateOpen ? 0 : 1, transition: "opacity 320ms ease" }}>
                      <SkeletonFeed />
                    </div>
                  )}
                </div>
              </PageWithRails>
            }
          />

          <Route
            path="/admin"
            element={
              adminAuthed ? (
                <AdminDashboard
                  posts={posts}
                  setPosts={setPosts}
                  randomize={randomize}
                  setRandomize={setRandomize}
                  showComposer={showComposer}
                  setShowComposer={setShowComposer}
                  resetLog={() => { setEvents([]); showToast("Event log cleared"); }}
                  onPublishPosts={async (nextPosts, ctx = {}) => {
                    try {
                      const ok = await savePostsToBackend(nextPosts, ctx);
                      if (ok) {
                        const fresh = await loadPostsFromBackend(ctx?.feedId);
                        setPosts(fresh || []);
                        showToast("Feed saved to backend");
                      } else {
                        showToast("Publish failed");
                      }
                    } catch { showToast("Publish failed"); }
                  }}
                  onLogout={async () => { try { await adminLogout(); } catch {} setAdminAuthed(false); window.location.hash = "#/admin"; }}
                />
              ) : (
                <AdminLogin onAuth={() => setAdminAuthed(true)} />
              )
            }
          />
        </Routes>

        {toast && <div className="toast">{toast}</div>}
      </div>

      {/* Overlays */}
      {!onAdmin && !hasEntered && (
        <ParticipantOverlay
          onSubmit={(id) => {
            const ts = now();
            setParticipantId(id);
            setHasEntered(true);
            enterTsRef.current = ts;
            log("participant_id_entered", { id, feed_id: activeFeedId || null, project_id: projectId || null });
          }}
        />
      )}

      {!onAdmin && hasEntered && !submitted && (feedPhase === "loading" || !flagsReady || !assetsReady || !minDelayDone) && (
        <LoadingOverlay
          title="Preparing your feed…"
          subtitle={(flags.randomize_avatars || flags.randomize_images) ? "Almost ready..." : "Fetching posts and setting things up."}
        />
      )}

      {!onAdmin && hasEntered && !submitted && feedPhase === "error" && (
        <div className="modal-backdrop modal-backdrop-dim" role="dialog" aria-modal="true" aria-live="assertive">
          <div className="modal modal-compact" style={{ textAlign: "center", paddingTop: 24 }}>
            <div className="spinner-ring" aria-hidden="true" style={{ display: "none" }} />
            <h3 style={{ margin: "0 0 6px" }}>Couldn’t load your feed</h3>
            <div style={{ color: "var(--muted)", fontSize: ".95rem", marginBottom: 12 }}>{feedError || "Network error or service unavailable."}</div>
            <div><button className="btn" onClick={startLoadFeed}>Try again</button></div>
          </div>
        </div>
      )}

      {submitted && <ThankYouOverlay />}
    </Router>
  );
}
