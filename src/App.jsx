import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import "./styles.css";

import {
  uid, now, fmtTime, clamp,
  loadPostsFromBackend, savePostsToBackend,
  sendToSheet, buildMinimalHeader, buildParticipantRow,
  computeFeedId, getDefaultFeedFromBackend,
  hasAdminSession, adminLogout, listFeedsFromBackend,
  getFeedIdFromUrl, VIEWPORT_ENTER_FRACTION,
  VIEWPORT_ENTER_FRACTION_IMAGE,
  // ⬇️ use the project helpers from utils so URLs include ?project_id
  getProjectId as getProjectIdUtil,
  setProjectId as setProjectIdUtil,
} from "./utils";

import { Feed as FBFeed } from "./components-ui-posts";
import {
  ParticipantOverlay, ThankYouOverlay,
  RouteAwareTopbar, SkeletonFeed, LoadingOverlay,
} from "./components-ui-core";

import { AdminDashboard } from "./components-admin-core";
import AdminLogin from "./components-admin-login";

// ---- Mode flag ----
const MODE = (new URLSearchParams(location.search).get("style") || window.CONFIG?.STYLE || "fb").toLowerCase();
if (typeof document !== "undefined") {
  document.body.classList.toggle("ig-mode", MODE === "ig");
}

/* ===== unified URL flag reader (search + hash query) ===== */
function getUrlFlag(key) {
  try {
    const searchVal = new URLSearchParams(window.location.search).get(key);
    const hashQuery = (window.location.hash.split("?")[1] || "");
    const hashVal = new URLSearchParams(hashQuery).get(key);
    return searchVal ?? hashVal;
  } catch { return null; }
}

/* Helper: inline image detection */
function elementHasImage(el) {
  if (!el) return false;
  if (el.dataset?.hasImage === "1") return true;
  const root = el.matches?.("[data-post-id]") ? el : el.closest?.("[data-post-id]") || el;
  return !!root.querySelector?.(
    [
      ":scope .image-btn img:not(.avatar-img)",
      ":scope .image-btn svg",
      ":scope [data-kind='image']",
      ":scope .media img:not(.avatar-img)",
      ":scope .media picture",
      ":scope .card-body img:not(.avatar-img)",
      ":scope [data-has-image='1']"
    ].join(", ")
  );
}

export default function App() {
  const sessionIdRef = useRef(uid());
  const t0Ref = useRef(now());
  const enterTsRef = useRef(null);
  const submitTsRef = useRef(null);
  const lastNonScrollTsRef = useRef(null);

  // === Project ID: source of truth comes from utils (reads URL/localStorage)
  const [projectId, setProjectIdState] = useState(() => getProjectIdUtil() || "");

  // keep utils' project in sync (so utils adds ?project_id to requests)
  useEffect(() => {
    setProjectIdUtil(projectId, { persist: true, updateUrl: false });
  }, [projectId]);

  // also watch URL for changes to ?project / ?project_id and reflect in state
  useEffect(() => {
    const syncFromUrl = () => {
      const p = getUrlFlag("project_id") || getUrlFlag("project");
      if (p != null && String(p) !== projectId) {
        setProjectIdState(String(p));
        setProjectIdUtil(String(p), { persist: true, updateUrl: false });
      }
    };
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener("hashchange", syncFromUrl);
    syncFromUrl();
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener("hashchange", syncFromUrl);
    };
  }, [projectId]);

  const [randomize, setRandomize] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);

  const onAdmin = typeof window !== "undefined" && window.location.hash.startsWith("#/admin");

  const [activeFeedId, setActiveFeedId] = useState(!onAdmin ? getFeedIdFromUrl() : null);
  const [posts, setPosts] = useState([]);

  const [feedPhase, setFeedPhase] = useState("idle");
  const [feedError, setFeedError] = useState("");
  const feedAbortRef = useRef(null);

  // Debug viewport flag
  useEffect(() => {
    const apply = () => {
      const on = getUrlFlag("debugvp") === "1";
      document.body.classList.toggle("debug-vp", on);
    };
    apply();
    window.addEventListener("popstate", apply);
    window.addEventListener("hashchange", apply);
    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener("hashchange", apply);
    };
  }, []);

  // ===== Effective viewport offsets (sticky rails) =====
  const [vpOff, setVpOff] = useState({ top: 0, bottom: 0 });

  useEffect(() => {
    const readOffsets = () => {
      const topEl =
        document.querySelector(".top-rail-placeholder") ||
        document.querySelector(".topbar") || null;
      const top = topEl ? Math.ceil(topEl.getBoundingClientRect().height || topEl.offsetHeight || 0) : 0;

      const bottomEl = null;
      const bottom = bottomEl ? Math.ceil(bottomEl.getBoundingClientRect().height || bottomEl.offsetHeight || 0) : 0;

      setVpOff({ top, bottom });
      document.documentElement.style.setProperty("--vp-top", `${top}px`);
      document.documentElement.style.setProperty("--vp-bottom", `${bottom}px`);
    };

    readOffsets();
    window.addEventListener("resize", readOffsets);
    window.addEventListener("orientationchange", readOffsets);
    window.addEventListener("load", readOffsets);
    const id = setInterval(readOffsets, 300);
    return () => {
      window.removeEventListener("resize", readOffsets);
      window.removeEventListener("orientationchange", readOffsets);
      window.removeEventListener("load", readOffsets);
      clearInterval(id);
    };
  }, []);

  // ---------- Centralized, abortable feed loader with retry ----------
  const startLoadFeed = useCallback(async () => {
    if (onAdmin) return;

    feedAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    feedAbortRef.current = ctrl;

    setFeedPhase("loading");
    setFeedError("");

    try {
      // list/default use utils → utils reads current project from its own store
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

      // cache BY PROJECT + FEED to avoid collisions across projects
      let cached = null;
      try {
        const k = `posts::${projectId || ""}::${chosen.feed_id}`;
        const meta = JSON.parse(localStorage.getItem(`${k}::meta`) || "null");
        if (meta?.checksum === chosen.checksum) {
          const data = JSON.parse(localStorage.getItem(k) || "null");
          if (Array.isArray(data)) cached = data;
        }
      } catch {}

      if (cached) {
        setPosts(cached);
        setFeedPhase("ready");
        return;
      }

      // load posts (utils will include ?project_id automatically)
      const fresh = await loadPostsFromBackend(chosen.feed_id, { force: true, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;

      const arr = Array.isArray(fresh) ? fresh : [];
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

  // Initial load + cleanup (reload when projectId changes)
  useEffect(() => {
    if (!onAdmin) startLoadFeed();
    return () => feedAbortRef.current?.abort?.();
  }, [onAdmin, startLoadFeed, projectId]);

  // --- Auto-login for admin
  useEffect(() => {
    if (onAdmin && hasAdminSession()) setAdminAuthed(true);
  }, [onAdmin]);

  const [disabled, setDisabled] = useState(false);
  const [toast, setToast] = useState(null);
  const [events, setEvents] = useState([]);

  const orderedPosts = useMemo(() => {
    const arr = posts.map(p => ({ ...p }));
    if (randomize) arr.sort(() => Math.random() - 0.5);
    return arr;
  }, [posts, randomize]);

  // Lock scroll during overlays
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    const shouldLock = !onAdmin && (!hasEntered || feedPhase !== "ready" || submitted);
    el.style.overflow = shouldLock ? "hidden" : "";
    return () => { el.style.overflow = prev; };
  }, [hasEntered, feedPhase, submitted, onAdmin]);

  // ===== IO infrastructure =====
  const ioRef = useRef(null);
  const viewRefs = useRef(new Map());
  const elToId = useRef(new WeakMap());

  const registerViewRef = (postId) => (el) => {
    const prev = viewRefs.current.get(postId);
    if (prev && ioRef.current) {
      try { ioRef.current.unobserve(prev); } catch {}
    }
    if (el) {
      viewRefs.current.set(postId, el);
      elToId.current.set(el, postId);
      if (ioRef.current) {
        try { ioRef.current.observe(el); } catch {}
      }
    } else {
      viewRefs.current.delete(postId);
    }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1500); };

  // Respect sticky rails in the visibility math so it matches IO
  const measureVis = (post_id) => {
    const el = viewRefs.current.get(post_id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    const topBound = vpOff.top;
    const bottomBound = vh - vpOff.bottom;
    const effectiveVH = Math.max(0, bottomBound - topBound);

    const post_h_px = Math.max(0, Math.round(r.height || 0));
    const visH = Math.max(0, Math.min(r.bottom, bottomBound) - Math.max(r.top, topBound));
    const vis_frac = post_h_px ? Number((visH / post_h_px).toFixed(4)) : 0;
    return { vis_frac, post_h_px, viewport_h_px: effectiveVH, el };
  };

  const log = (action, meta = {}) => {
    const ts = now();
    setEvents((prev) => [
      ...prev,
      {
        session_id: sessionIdRef.current,
        participant_id: participantId || null,
        timestamp_iso: fmtTime(ts),
        elapsed_ms: ts - t0Ref.current,
        ts_ms: ts,
        action,
        ...meta,
      },
    ]);
  };

  // scroll + session tracking
  useEffect(() => {
    log("session_start", { user_agent: navigator.userAgent, feed_id: activeFeedId || null, project_id: projectId || null });
    const onEnd = () => log("session_end", { total_events: events.length });
    window.addEventListener("beforeunload", onEnd);
    return () => window.removeEventListener("beforeunload", onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dir = y > lastY ? "down" : y < lastY ? "up" : "none";
      lastY = y;
      log("scroll", { y, direction: dir });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===================== VIEWPORT TRACKING =====================
  useEffect(() => {
    if (!hasEntered || feedPhase !== "ready" || submitted || onAdmin) return;

    const DEBUG_VP = getUrlFlag("debugvp") === "1";
    const ENTER_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION))
      ? clamp(Number(VIEWPORT_ENTER_FRACTION), 0, 1)
      : 0.5;
    const IMG_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION_IMAGE))
      ? clamp(Number(VIEWPORT_ENTER_FRACTION_IMAGE), 0, 1)
      : ENTER_FRAC;

    const enteredSet = new Set();
    const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
    const rootMargin = `${-vpOff.top}px 0px ${-vpOff.bottom}px 0px`;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const postId = elToId.current.get(e.target);
          if (!postId) continue;
          const el = e.target;

          const m = measureVis(postId);
          const vis_frac = m ? m.vis_frac : Number((e.intersectionRatio || 0).toFixed(4));

          const isImg = elementHasImage(el);
          const TH = isImg ? IMG_FRAC : ENTER_FRAC;

          const nowIn = e.isIntersecting && vis_frac >= TH;
          const wasIn = enteredSet.has(postId);

          if (DEBUG_VP) {
            el.dataset.vis = `${Math.round(vis_frac * 100)}%`;
            el.dataset.state = nowIn ? "IN" : "OUT";
            el.dataset.th = `${Math.round(TH * 100)}%`;
            el.classList.toggle("__vp-in", nowIn);
            el.classList.toggle("__vp-out", !nowIn);
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
      { root: null, rootMargin, threshold: thresholds }
    );

    ioRef.current = io;
    for (const [, el] of viewRefs.current) if (el) io.observe(el);

    const onHide = () => {
      enteredSet.forEach((id) => log("vp_exit", { post_id: id, reason: "page_hide", feed_id: activeFeedId || null }));
      enteredSet.clear();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);

    return () => {
      try { io.disconnect(); } catch {}
      ioRef.current = null;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [orderedPosts, hasEntered, feedPhase, submitted, onAdmin, vpOff.top, vpOff.bottom, activeFeedId]);
  // ===================================================================

  const FeedComponent = FBFeed;

  return (
    <Router>
      <div
        className={`app-shell ${
          (!onAdmin && (!hasEntered || feedPhase !== "ready" || submitted)) ? "blurred" : ""
        }`}
      >
        <RouteAwareTopbar />
        <Routes>
          <Route
            path="/"
            element={
              hasEntered && feedPhase === "ready" ? (
                <FeedComponent
                  posts={orderedPosts}
                  registerViewRef={registerViewRef}
                  disabled={disabled}
                  log={log}
                  showComposer={showComposer}
                  loading={false}
                  onSubmit={async () => {
                    if (submitted || disabled) return;
                    setDisabled(true);

                    const ENTER_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION))
                      ? clamp(Number(VIEWPORT_ENTER_FRACTION), 0, 1)
                      : 0.5;
                    const IMG_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION_IMAGE))
                      ? clamp(Number(VIEWPORT_ENTER_FRACTION_IMAGE), 0, 1)
                      : ENTER_FRAC;
                    const DEBUG_VP = getUrlFlag("debugvp") === "1";

                    for (const [post_id, elNode] of viewRefs.current) {
                      const m = measureVis(post_id);
                      if (!m) continue;
                      const { vis_frac, el } = m;
                      const isImg = elementHasImage(elNode || el);
                      const TH = isImg ? IMG_FRAC : ENTER_FRAC;

                      if (vis_frac >= TH) {
                        if (DEBUG_VP && el) {
                          el.dataset.vis = `${Math.round(vis_frac * 100)}%`;
                          el.dataset.state = "OUT";
                          el.dataset.th = `${Math.round(TH * 100)}%`;
                          el.classList.remove("__vp-in");
                          el.classList.add("__vp-out");
                        }
                        log("vp_exit", { post_id, vis_frac, reason: "submit", feed_id: activeFeedId || null });
                      }
                    }

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
                    const row = buildParticipantRow({
                      session_id: sessionIdRef.current,
                      participant_id: participantId,
                      events: eventsWithSubmit,
                      posts,
                      feed_id,
                      feed_checksum,
                    });
                    const header = buildMinimalHeader(posts);
                    const ok = await sendToSheet(header, row, eventsWithSubmit, feed_id);
                    if (ok) setSubmitted(true);
                    showToast(ok ? "Submitted ✔︎" : "Sync failed. Please try again.");
                    setDisabled(false);
                  }}
                />
              ) : (
                <SkeletonFeed />
              )
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
                      // utils uses current project from its own store; we already synced it
                      const ok = await savePostsToBackend(nextPosts, ctx);
                      if (ok) {
                        const fresh = await loadPostsFromBackend(ctx?.feedId);
                        setPosts(fresh || []);
                        showToast("Feed saved to backend");
                      } else {
                        showToast("Publish failed");
                      }
                    } catch {
                      showToast("Publish failed");
                    }
                  }}
                  onLogout={async () => {
                    try { await adminLogout(); } catch {}
                    setAdminAuthed(false);
                    window.location.hash = "#/admin";
                  }}
                />
              ) : (
                <AdminLogin onAuth={() => setAdminAuthed(true)} />
              )
            }
          />
        </Routes>
        {toast && <div className="toast">{toast}</div>}
      </div>

      {!onAdmin && !hasEntered && (
        <ParticipantOverlay
          onSubmit={(id) => {
            const ts = now();
            setParticipantId(id);
            setHasEntered(true);
            enterTsRef.current = ts;
            lastNonScrollTsRef.current = null;
            log("participant_id_entered", { id, feed_id: activeFeedId || null, project_id: projectId || null });
          }}
        />
      )}

      {!onAdmin && hasEntered && !submitted && feedPhase === "loading" && (
        <LoadingOverlay title="Preparing your feed…" subtitle="Fetching posts and setting things up." />
      )}

      {!onAdmin && hasEntered && !submitted && feedPhase === "error" && (
        <div className="modal-backdrop modal-backdrop-dim" role="dialog" aria-modal="true" aria-live="assertive">
          <div className="modal modal-compact" style={{ textAlign: "center", paddingTop: 24 }}>
            <div className="spinner-ring" aria-hidden="true" style={{ display: "none" }} />
            <h3 style={{ margin: "0 0 6px" }}>Couldn’t load your feed</h3>
            <div style={{ color: "var(--muted)", fontSize: ".95rem", marginBottom: 12 }}>
              {feedError || "Network error or service unavailable."}
            </div>
            <div>
              <button className="btn" onClick={startLoadFeed}>Try again</button>
            </div>
          </div>
        </div>
      )}

      {submitted && <ThankYouOverlay />}
    </Router>
  );
}