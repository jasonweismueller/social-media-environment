import React, { useEffect, useMemo, useRef, useState } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import "./styles.css";

import {
  uid, now, fmtTime, clamp,
  loadPostsFromBackend, savePostsToBackend,
  sendToSheet, buildMinimalHeader, buildParticipantRow,
  computeFeedId, getDefaultFeedFromBackend,
  hasAdminSession, adminLogout, listFeedsFromBackend,
  getFeedIdFromUrl, VIEWPORT_ENTER_FRACTION,
  VIEWPORT_ENTER_FRACTION_IMAGE,                 // ⬅️ NEW: per-image threshold
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

// Helper: does a post element contain an inline image/media?
function elementHasImage(el) {
  if (!el) return false;
  if (el.dataset?.hasImage === "1") return true; // allow explicit opt-in from markup
  return !!el.querySelector?.(
    // broadened selectors; tweak to your DOM
    "img, picture, video, [data-kind='image'], .media img, .media picture, .image, [data-has-image='1']"
  );
}

export default function App() {
  const sessionIdRef = useRef(uid());
  const t0Ref = useRef(now());
  const enterTsRef = useRef(null);
  const submitTsRef = useRef(null);
  const lastNonScrollTsRef = useRef(null);

  const [randomize, setRandomize] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);

  // Route context
  const onAdmin = typeof window !== "undefined" && window.location.hash.startsWith("#/admin");

  // Feed
  const [activeFeedId, setActiveFeedId] = useState(!onAdmin ? getFeedIdFromUrl() : null);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  // --- Debug viewport flag: exactly like per-post debug (search + hash)
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

      const bottomEl = null; // placeholder for sticky bottom rail if you add one
      const bottom = bottomEl ? Math.ceil(bottomEl.getBoundingClientRect().height || bottomEl.offsetHeight || 0) : 0;

      setVpOff({ top, bottom });

      // expose to CSS so the red debug frame matches effective viewport
      document.documentElement.style.setProperty("--vp-top", `${top}px`);
      document.documentElement.style.setProperty("--vp-bottom", `${bottom}px`);
    };

    readOffsets();
    window.addEventListener("resize", readOffsets);
    window.addEventListener("orientationchange", readOffsets);
    window.addEventListener("load", readOffsets);
    const id = setInterval(readOffsets, 300); // guard against late layout shifts
    return () => {
      window.removeEventListener("resize", readOffsets);
      window.removeEventListener("orientationchange", readOffsets);
      window.removeEventListener("load", readOffsets);
      clearInterval(id);
    };
  }, []);

  // --- Resolve feed from backend default if none provided
  useEffect(() => {
    if (onAdmin) return;
    let alive = true;

    (async () => {
      setLoadingPosts(true);
      const [feedsList, backendDefault] = await Promise.all([
        listFeedsFromBackend(),
        getDefaultFeedFromBackend(),
      ]);

      if (!alive) return;

      const urlFeedId = getFeedIdFromUrl();
      const chosen =
        (feedsList || []).find(f => f.feed_id === urlFeedId) ||
        (feedsList || []).find(f => f.feed_id === backendDefault) ||
        (feedsList || [])[0] || null;

      if (!chosen) {
        setActiveFeedId("feed_1");
        setPosts([]);
        setLoadingPosts(false);
        return;
      }

      setActiveFeedId(chosen.feed_id);

      const cached = (() => {
        try {
          const k = `posts::${chosen.feed_id}`;
          const meta = JSON.parse(localStorage.getItem(`${k}::meta`) || "null");
          if (!meta || meta.checksum !== chosen.checksum) return null;
          const data = JSON.parse(localStorage.getItem(k) || "null");
          return Array.isArray(data) ? data : null;
        } catch { return null; }
      })();

      if (cached) {
        setPosts(cached);
        setLoadingPosts(false);
        return;
      }

      const fresh = await loadPostsFromBackend(chosen.feed_id, { force: true });
      if (!alive) return;
      const arr = Array.isArray(fresh) ? fresh : [];
      setPosts(arr);
      try {
        const k = `posts::${chosen.feed_id}`;
        localStorage.setItem(k, JSON.stringify(arr));
        localStorage.setItem(`${k}::meta`, JSON.stringify({ checksum: chosen.checksum, t: Date.now() }));
      } catch {}
      setLoadingPosts(false);
    })();

    return () => { alive = false; };
  }, [onAdmin]);

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
    const shouldLock = !onAdmin && (!hasEntered || loadingPosts || submitted);
    el.style.overflow = shouldLock ? "hidden" : "";
    return () => { el.style.overflow = prev; };
  }, [hasEntered, loadingPosts, submitted, onAdmin]);

  // ===== IO infrastructure (observe new posts immediately) =====
  const ioRef = useRef(null); // active IntersectionObserver
  const viewRefs = useRef(new Map()); // post_id -> element
  const elToId = useRef(new WeakMap()); // element -> post_id

  const registerViewRef = (postId) => (el) => {
    // unobserve previous element for this id
    const prev = viewRefs.current.get(postId);
    if (prev && ioRef.current) {
      try { ioRef.current.unobserve(prev); } catch {}
    }

    if (el) {
      viewRefs.current.set(postId, el);
      elToId.current.set(el, postId);
      // observe immediately if IO exists (covers newly mounted posts later)
      if (ioRef.current) {
        try { ioRef.current.observe(el); } catch {}
      }
    } else {
      // element unmounted
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
    log("session_start", { user_agent: navigator.userAgent, feed_id: activeFeedId || null });
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
    if (!hasEntered || loadingPosts || submitted || onAdmin) return;

    const DEBUG_VP = getUrlFlag("debugvp") === "1";
    const ENTER_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION))
      ? clamp(Number(VIEWPORT_ENTER_FRACTION), 0, 1)
      : 0.5;
    const IMG_FRAC = Number.isFinite(Number(VIEWPORT_ENTER_FRACTION_IMAGE))
      ? clamp(Number(VIEWPORT_ENTER_FRACTION_IMAGE), 0, 1)
      : ENTER_FRAC;

    const enteredSet = new Set();
    const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);

    // Shift the effective viewport by sticky rails
    const rootMargin = `${-vpOff.top}px 0px ${-vpOff.bottom}px 0px`;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const postId = elToId.current.get(e.target);
          if (!postId) continue;
          const el = e.target;

          // Recompute vis_frac with the same math as measureVis (matches IO)
          const m = measureVis(postId);
          const vis_frac = m ? m.vis_frac : Number((e.intersectionRatio || 0).toFixed(4));

          // Per-post threshold (image vs non-image)
          const isImg = elementHasImage(el);
          const TH = isImg ? IMG_FRAC : ENTER_FRAC;

          const nowIn = e.isIntersecting && vis_frac >= TH;
          const wasIn = enteredSet.has(postId);

          if (DEBUG_VP) {
            el.dataset.vis = `${Math.round(vis_frac * 100)}%`;
            el.dataset.state = nowIn ? "IN" : "OUT";
            el.dataset.th = `${Math.round(TH * 100)}%`; // optional, for debugging which threshold applied
            el.classList.toggle("__vp-in", nowIn);
            el.classList.toggle("__vp-out", !nowIn);
          }

          if (nowIn && !wasIn) {
            enteredSet.add(postId);
            log("vp_enter", { post_id: postId, vis_frac });
          } else if (!nowIn && wasIn) {
            enteredSet.delete(postId);
            log("vp_exit", { post_id: postId, vis_frac });
          }
        }
      },
      { root: null, rootMargin, threshold: thresholds }
    );

    // expose the live IO so registerViewRef can observe future nodes
    ioRef.current = io;

    // observe anything already mounted
    for (const [, el] of viewRefs.current) if (el) io.observe(el);

    const onHide = () => {
      enteredSet.forEach((id) => log("vp_exit", { post_id: id, reason: "page_hide" }));
      enteredSet.clear();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);

    return () => {
      try { io.disconnect(); } catch {}
      ioRef.current = null; // avoid observing on a dead IO
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [orderedPosts, hasEntered, loadingPosts, submitted, onAdmin, vpOff.top, vpOff.bottom]);
  // ===================================================================

  const FeedComponent = FBFeed;

  return (
    <Router>
      <div
        className={`app-shell ${
          (!onAdmin && (!hasEntered || loadingPosts || submitted)) ? "blurred" : ""
        }`}
      >
        <RouteAwareTopbar />
        <Routes>
          <Route
            path="/"
            element={
              hasEntered && !loadingPosts ? (
                <FeedComponent
                  posts={orderedPosts}
                  registerViewRef={registerViewRef}
                  disabled={disabled}
                  log={log}
                  showComposer={showComposer}
                  loading={loadingPosts}
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

                      // use the same per-post threshold
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
                        log("vp_exit", { post_id, vis_frac, reason: "submit" });
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
                      const ok = await savePostsToBackend(nextPosts, ctx);
                      if (ok) {
                        const fresh = await loadPostsFromBackend(ctx?.feedId);
                        setPosts(fresh || []);
                        showToast("Feed saved to backend");
                      } else showToast("Publish failed");
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
            log("participant_id_entered", { id, feed_id: activeFeedId || null });
          }}
        />
      )}

      {!onAdmin && hasEntered && !submitted && loadingPosts && (
        <LoadingOverlay
          title="Preparing your feed…"
          subtitle="Fetching posts and setting things up."
        />
      )}

      {submitted && <ThankYouOverlay />}
    </Router>
  );
}