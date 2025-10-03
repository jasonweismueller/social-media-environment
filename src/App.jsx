/// App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import "./styles.css";

import {
  uid, now, fmtTime, clamp,
  loadPostsFromBackend, savePostsToBackend,
  sendToSheet, buildMinimalHeader, buildParticipantRow,
  computeFeedId, getDefaultFeedFromBackend,
  hasAdminSession, adminLogout, listFeedsFromBackend, getFeedIdFromUrl
} from "./utils";

// ⬇️ updated imports to use the split files
import { Feed as FBFeed } from "./components-ui-posts";
import {
  ParticipantOverlay, ThankYouOverlay,
  RouteAwareTopbar, SkeletonFeed, LoadingOverlay,
} from "./components-ui-core";

import { AdminDashboard } from "./components-admin-core";
import AdminLogin from "./components-admin-login";

// ---- Mode flag (kept harmless; no IG component is loaded)
const MODE = (new URLSearchParams(location.search).get("style") || window.CONFIG?.STYLE || "fb").toLowerCase();
if (typeof document !== "undefined") {
  document.body.classList.toggle("ig-mode", MODE === "ig");
}

function getCachedPosts(feedId, checksum) {
  try {
    const k = `posts::${feedId}`;
    const meta = JSON.parse(localStorage.getItem(`${k}::meta`) || "null");
    if (!meta || meta.checksum !== checksum) return null;
    const data = JSON.parse(localStorage.getItem(k) || "null");
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}
function setCachedPosts(feedId, checksum, posts) {
  try {
    const k = `posts::${feedId}`;
    localStorage.setItem(k, JSON.stringify(posts || []));
    localStorage.setItem(`${k}::meta`, JSON.stringify({ checksum, t: Date.now() }));
  } catch {}
}

/** Read ?feed=... from the hash (e.g., #/?feed=cond_a) */
function getFeedFromHash() {
  try {
    const h = typeof window !== "undefined" ? window.location.hash : "";
    const m = h.match(/[?&]feed=([^&#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
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

  // Participant feed context: URL ?feed=… wins; else backend default
  const [activeFeedId, setActiveFeedId] = useState(!onAdmin ? getFeedFromHash() : null);

  // Backend is the source of truth
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  // --- Resolve feed from backend default if none provided by URL
useEffect(() => {
  if (onAdmin) return; // admin handles its own feeds
  let alive = true;

  (async () => {
    setLoadingPosts(true);

    // 1) Pull feeds registry + backend default
    const [feedsList, backendDefault] = await Promise.all([
      listFeedsFromBackend(),
      getDefaultFeedFromBackend(),
    ]);

    if (!alive) return;

    // 2) Decide which feed to show: hash ?feed= wins, else backend default, else first
    const urlFeedId = getFeedIdFromUrl() /* or getFeedFromHash() if you prefer */;
    const chosen =
      (Array.isArray(feedsList) ? feedsList : []).find(f => f.feed_id === urlFeedId) ||
      (Array.isArray(feedsList) ? feedsList : []).find(f => f.feed_id === backendDefault) ||
      (Array.isArray(feedsList) ? feedsList : [])[0] ||
      null;

    if (!chosen) {
      setActiveFeedId("feed_1");
      setPosts([]);
      setLoadingPosts(false);
      return;
    }

    setActiveFeedId(chosen.feed_id);

    // 3) Try local cache keyed by checksum, else fetch fresh
    const cached = getCachedPosts(chosen.feed_id, chosen.checksum);
    if (cached) {
      setPosts(cached);
      setLoadingPosts(false);
      return;
    }

    const fresh = await loadPostsFromBackend(chosen.feed_id, { force: true });
    if (!alive) return;

    const arr = Array.isArray(fresh) ? fresh : [];
    setPosts(arr);
    setCachedPosts(chosen.feed_id, chosen.checksum, arr);
    setLoadingPosts(false);
  })();

  return () => { alive = false; };
}, [onAdmin]);

useEffect(() => {
  if (onAdmin) return;
  const onHash = () => {
    const next = getFeedIdFromUrl(); // or getFeedFromHash()
    // forcing the effect above to rerun by clearing activeFeedId
    setActiveFeedId(next || null);
  };
  window.addEventListener("hashchange", onHash);
  return () => window.removeEventListener("hashchange", onHash);
}, [onAdmin]);

  // --- If user lands on /admin with a valid session, show dashboard immediately
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

  // Lock scroll when overlays/skeletons are visible
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    const shouldLock = !onAdmin && (!hasEntered || loadingPosts || submitted);
    el.style.overflow = shouldLock ? "hidden" : "";
    return () => { el.style.overflow = prev; };
  }, [hasEntered, loadingPosts, submitted, onAdmin]);

  const dwell = useRef(new Map());
  const viewRefs = useRef(new Map());
  const elToId = useRef(new WeakMap());
  const registerViewRef = (postId) => (el) => {
    if (el) { viewRefs.current.set(postId, el); elToId.current.set(el, postId); }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1500); };

  const log = (action, meta = {}) => {
    const ts = now();
    const rec = {
      session_id: sessionIdRef.current,
      participant_id: participantId || null,
      timestamp_iso: fmtTime(ts),
      elapsed_ms: ts - t0Ref.current,
      ts_ms: ts,
      action,
      ...meta,
    };
    setEvents((prev) => [...prev, rec]);
    if (hasEntered && action !== "scroll" && action !== "feed_submit") {
      lastNonScrollTsRef.current = ts;
    }
    if (action === "share") showToast("Post shared (recorded)");
  };

  // session start/end
  useEffect(() => {
    log("session_start", {
      user_agent: navigator.userAgent,
      feed_id: activeFeedId || null,
    });
    const onEnd = () => log("session_end", { total_events: events.length });
    window.addEventListener("beforeunload", onEnd);
    return () => window.removeEventListener("beforeunload", onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // scroll logger
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

  // IntersectionObserver for per-post view dwell + pause on hidden/blur
  useEffect(() => {
    if (!hasEntered || loadingPosts || submitted || onAdmin) return;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const postId = elToId.current.get(e.target);
        if (!postId) continue;
        const prev = dwell.current.get(postId) || { visible: false, tStart: 0, total: 0 };
        if (e.isIntersecting && e.intersectionRatio > 0) {
          if (!prev.visible) {
            const next = { ...prev, visible: true, tStart: now() };
            dwell.current.set(postId, next);
            log("view_start", { post_id: postId, ratio: e.intersectionRatio });
          }
        } else if (prev.visible) {
          const dur = clamp(now() - prev.tStart, 0, 1000 * 60 * 60);
          const next = { visible: false, tStart: 0, total: prev.total + dur };
          dwell.current.set(postId, next);
          log("view_end", { post_id: postId, duration_ms: dur, total_ms: next.total });
        }
      }
    }, { root: null, rootMargin: "0px", threshold: [0, 0.2, 0.5, 0.8, 1] });

    for (const [, el] of viewRefs.current) io.observe(el);

    const inViewport = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.right > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
    };

    const pauseVisible = () => {
      const ts = now();
      for (const [postId, rec] of dwell.current) {
        if (rec.visible) {
          const dur = clamp(ts - rec.tStart, 0, 1000 * 60 * 60);
          dwell.current.set(postId, { visible: false, tStart: 0, total: rec.total + dur });
          log("view_end", { post_id: postId, duration_ms: dur, total_ms: rec.total + dur, reason: "page_hidden" });
        }
      }
    };

    const resumeIfVisible = () => {
      const ts = now();
      for (const [postId, el] of viewRefs.current) {
        if (!el) continue;
        const rec = dwell.current.get(postId) || { visible: false, tStart: 0, total: 0 };
        if (!rec.visible && inViewport(el)) {
          dwell.current.set(postId, { visible: true, tStart: ts, total: rec.total });
          log("view_start", { post_id: postId, ratio: 1, reason: "page_visible" });
        }
      }
    };

    const onVis = () => (document.hidden ? pauseVisible() : resumeIfVisible());
    const onBlur = pauseVisible;
    const onFocus = resumeIfVisible;

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedPosts, hasEntered, loadingPosts, submitted, onAdmin]);

  // ✅ Always use the FB feed (no IG component reference)
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
          {/* Participant route */}
          <Route
            path="/"
            element={
              (hasEntered && !loadingPosts) ? (
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

                    if (ok) {
                      setSubmitted(true);
                      showToast("Submitted ✔︎");
                    } else {
                      showToast("Sync failed. Please try again.");
                    }

                    setDisabled(false);
                  }}
                />
              ) : (
                <SkeletonFeed />
              )
            }
          />

          {/* Admin route */}
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
                  resetLog={() => {
                    setEvents([]);
                    dwell.current = new Map();
                    showToast("Event log cleared");
                  }}
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
                    } catch (err) {
                      console.error("Publish error:", err);
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

      {/* Overlays */}
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