import React, { useEffect, useMemo, useRef, useState } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import "./styles-instagram.css";

import {
  uid, now, fmtTime, clamp,
  loadPostsFromBackend, savePostsToBackend,
  sendToSheet, buildMinimalHeader, buildParticipantRow,
  computeFeedId, getDefaultFeedFromBackend,
  hasAdminSession, adminLogout,
  // ⬇️ new imports for project/feed helpers
  getProjectId as getProjectIdUtil,
  setProjectId as setProjectIdUtil,
  getFeedIdFromUrl,
  setFeedIdInUrl,
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

/* ---------- Rail placeholders (kept compact to avoid rail overflow) ---------- */
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
function RailStack({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%" }}>
      {children}
    </div>
  );
}

function PageWithRails({ children }) {
  const [rightCount, setRightCount] = useState(12);
  useEffect(() => {
    const compute = () => {
      const railGap = 30;
      const railH = (window.innerHeight || 900) - railGap;
      const H_BANNER = 170 + 14;
      const H_TBANNER = 220 + 14;
      const H_BOX = 120 + 14;
      const H_LIST = 110 + 14;
      const fixedTop = H_TBANNER;
      let remaining = Math.max(railH - fixedTop - H_BANNER, 0);
      const patternHeights = [H_BOX, H_LIST, H_BOX];
      let n = 0, acc = 0;
      while (acc + patternHeights[n % patternHeights.length] <= remaining) {
        acc += patternHeights[n % patternHeights.length];
        n += 1;
        if (n > 50) break;
      }
      const safeCount = Math.max(8, Math.min(n, 30));
      setRightCount(safeCount);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return (
    <div
      className="page"
      style={{
        gridTemplateColumns: "minmax(0,2fr) minmax(var(--feed-min), var(--feed-max)) minmax(0,2.25fr)",
        columnGap: "var(--gap)",
      }}
    >
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
          {Array.from({ length: rightCount }).map((_, i) =>
            i % 3 === 1 ? <RailList key={i} rows={4} /> : <RailBox key={i} largeAvatar={i % 5 === 0} />
          )}
          <RailBanner />
        </RailStack>
      </aside>
    </div>
  );
}

export default function App() {
  const sessionIdRef = useRef(uid());
  const t0Ref = useRef(now());
  const enterTsRef = useRef(null);
  const submitTsRef = useRef(null);
  const lastNonScrollTsRef = useRef(null);

  // ✅ project ID (from URL or local storage)
  const [projectId, setProjectIdState] = useState(() => getProjectIdUtil() || "");
  useEffect(() => { setProjectIdUtil(projectId, { persist: true, updateUrl: false }); }, [projectId]);

  // ✅ runSeed (deterministic for this session)
  const [runSeed] = useState(() =>
    (crypto?.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")
      : String(Date.now()) + "-" + Math.random().toString(36).slice(2))
  );

  const onAdmin = typeof window !== "undefined" && window.location.hash.startsWith("#/admin");
  const [activeFeedId, setActiveFeedId] = useState(!onAdmin ? getFeedIdFromUrl() : null);

  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  // ✅ Load default feed if none in URL
  useEffect(() => {
    if (onAdmin || activeFeedId) return;
    let alive = true;
    (async () => {
      const id = await getDefaultFeedFromBackend();
      if (!alive) return;
      setActiveFeedId(id || "feed_1");
      try { setFeedIdInUrl(id, { replace: true }); } catch {}
    })();
    return () => { alive = false; };
  }, [onAdmin, activeFeedId]);

  useEffect(() => {
    if (onAdmin || !activeFeedId) return;
    let alive = true;
    (async () => {
      setLoadingPosts(true);
      try {
        const remote = await loadPostsFromBackend(activeFeedId);
        if (!alive) return;
        setPosts(Array.isArray(remote) ? remote : []);
      } finally {
        if (alive) setLoadingPosts(false);
      }
    })();
    return () => { alive = false; };
  }, [onAdmin, activeFeedId]);

  const [adminAuthed, setAdminAuthed] = useState(false);
  useEffect(() => { if (onAdmin && hasAdminSession()) setAdminAuthed(true); }, [onAdmin]);

  const [randomize, setRandomize] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [toast, setToast] = useState(null);
  const [events, setEvents] = useState([]);

  const orderedPosts = useMemo(() => {
    const arr = posts.map(p => ({ ...p }));
    if (randomize) arr.sort(() => Math.random() - 0.5);
    return arr;
  }, [posts, randomize]);

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
      feed_id: activeFeedId || null,
      project_id: projectId || null,
      ...meta,
    };
    setEvents((prev) => [...prev, rec]);
    if (hasEntered && action !== "scroll" && action !== "feed_submit") {
      lastNonScrollTsRef.current = ts;
    }
    if (action === "share") showToast("Post shared (recorded)");
  };

  useEffect(() => {
    log("session_start", {
      user_agent: navigator.userAgent,
      feed_id: activeFeedId || null,
      project_id: projectId || null,
    });
    const onEnd = () => log("session_end", { total_events: events.length });
    window.addEventListener("beforeunload", onEnd);
    return () => window.removeEventListener("beforeunload", onEnd);
  }, []);

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
              <PageWithRails>
                {(hasEntered && !loadingPosts) ? (
                  <FeedComponent
                    posts={orderedPosts}
                    registerViewRef={registerViewRef}
                    disabled={disabled}
                    log={log}
                    showComposer={showComposer}
                    loading={loadingPosts}
                    app={MODE}
                    projectId={projectId}
                    feedId={activeFeedId}
                    runSeed={runSeed}
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
                      showToast(ok ? "Submitted ✔︎" : "Sync failed. Please try again.");
                      if (ok) setSubmitted(true);
                      setDisabled(false);
                    }}
                  />
                ) : (
                  <SkeletonFeed />
                )}
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
            log("participant_id_entered", { id, feed_id: activeFeedId || null, project_id: projectId || null });
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