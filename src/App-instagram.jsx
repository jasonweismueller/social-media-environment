import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import "./styles-instagram.css";

import {
  uid,
  now,
  fmtTime,
  clamp,
  loadPostsFromBackend,
  savePostsToBackend,
  sendToSheet,
  buildMinimalHeader,
  buildParticipantRow,
  computeFeedId,
  getDefaultFeedFromBackend,
  hasAdminSession,
  adminLogout,
  listFeedsFromBackend,
  getFeedIdFromUrl,
  VIEWPORT_ENTER_FRACTION,
  VIEWPORT_ENTER_FRACTION_IMAGE,
  getProjectId as getProjectIdUtil,
  setProjectId as setProjectIdUtil,
  setFeedIdInUrl,
  APP,
  GS_ENDPOINT,
  fetchFeedFlags,
  getAvatarPool,
  getImagePool,
  getSurveyForFeedFromBackend,
  sendSurveyResponseToBackend,
  normalizeSurvey as normalizeFrontendSurvey,
  makeEmptySurveyResponses,
  validateSurveyResponses,
  getTrackingIdsFromUrl,
  getSurveyBootForFeedFromBackend,
} from "./utils";

import { Feed as IGFeed } from "./ui-posts";
import {
  ParticipantOverlay,
  ThankYouOverlay,
  RouteAwareTopbar,
  SkeletonFeed,
  LoadingOverlay,
  SurveyScreenMobile,
  SurveyScreen,
  SurveyPrefaceFlow,
} from "./ui-core";

import { AdminDashboard } from "./admin/components-admin-dashboard";
import AdminLogin from "./admin/components-admin-login";

/* =========================================================================
   Mode & helpers
   ======================================================================= */

const MODE = (
  new URLSearchParams(window.location.search).get("style") ||
  window.CONFIG?.STYLE ||
  "ig"
).toLowerCase();

if (typeof document !== "undefined") {
  document.body.classList.toggle("ig-mode", MODE === "ig");
}

/* ------------------------- debug helpers ------------------------- */

const DEBUG_APP_LOAD = false;

function dbg(...args) {
  if (!DEBUG_APP_LOAD) return;
  console.log("[APP LOAD]", ...args);
}

function dbgWarn(...args) {
  if (!DEBUG_APP_LOAD) return;
  console.warn("[APP LOAD]", ...args);
}

function timerStart(label, extra = {}) {
  const startedAt = performance.now();
  if (DEBUG_APP_LOAD) {
    console.log(`[APP LOAD] ▶ ${label}`, extra);
  }
  return {
    end(meta = {}) {
      if (!DEBUG_APP_LOAD) return;
      const ms = Math.round(performance.now() - startedAt);
      console.log(`[APP LOAD] ■ ${label}: ${ms}ms`, meta);
    },
    fail(err, meta = {}) {
      if (!DEBUG_APP_LOAD) return;
      const ms = Math.round(performance.now() - startedAt);
      console.warn(`[APP LOAD] ✖ ${label}: ${ms}ms`, {
        error: String(err?.message || err),
        ...meta,
      });
    },
  };
}

function normalizeFlags(raw) {
  let f = raw || {};
  if (typeof f === "string") {
    try {
      f = f.trim() ? JSON.parse(f) : {};
    } catch {
      f = {};
    }
  }

  const truthy = (v) => v === true || v === "true" || v === 1 || v === "1";

  return {
    randomize_times: truthy(
      f.randomize_times ?? f.randomize_time ?? f.random_time ?? false
    ),
    randomize_avatars: truthy(
      f.randomize_avatars ?? f.randomize_avatar ?? f.rand_avatar ?? false
    ),
    randomize_names: truthy(f.randomize_names ?? f.rand_names ?? false),
    randomize_images: truthy(
      f.randomize_images ?? f.randomize_image ?? f.rand_images ?? false
    ),
    randomize_bios: truthy(f.randomize_bios ?? f.rand_bios ?? false),
  };
}

function useIOSInputZoomFix(
  selector = ".participant-overlay input, .participant-overlay .input, .participant-overlay select, .participant-overlay textarea"
) {
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOS = /iP(hone|ad|od)/.test(ua);
    if (!isIOS) return;

    const htmlStyle = document.documentElement.style;
    const prevAdj =
      htmlStyle.webkitTextSizeAdjust || htmlStyle.textSizeAdjust || "";
    htmlStyle.webkitTextSizeAdjust = "100%";
    htmlStyle.textSizeAdjust = "100%";

    const style = document.createElement("style");
    style.setAttribute("data-ios-input-zoom-fix", "1");
    style.textContent = `@supports(-webkit-touch-callout:none){${selector}{font-size:16px!important;line-height:1.2;min-height:40px;}}`;
    document.head.appendChild(style);

    return () => {
      if (style.parentNode) style.parentNode.removeChild(style);
      htmlStyle.webkitTextSizeAdjust = prevAdj;
      htmlStyle.textSizeAdjust = prevAdj;
    };
  }, [selector]);
}

function useIOSViewportGuard({
  overlayActive,
  fieldSelector = ".participant-overlay input",
} = {}) {
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOS = /iP(hone|ad|od)/.test(ua);
    if (!isIOS) return;

    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
      vp = document.createElement("meta");
      vp.setAttribute("name", "viewport");
      document.head.appendChild(vp);
    }

    const BASE = "width=device-width, initial-scale=1, viewport-fit=cover";
    const LOCK =
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover";

    const set = (content) => vp && vp.setAttribute("content", content);
    const nudge = () => {
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        window.dispatchEvent(new Event("resize"));
      });
    };

    const onFocus = (e) => {
      if (e.target?.matches?.(fieldSelector)) set(LOCK);
    };

    const onBlur = (e) => {
      if (e.target?.matches?.(fieldSelector)) {
        set(BASE);
        nudge();
      }
    };

    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", onBlur, true);
    set(overlayActive ? LOCK : BASE);

    return () => {
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", onBlur, true);
      set(BASE);
    };
  }, [overlayActive, fieldSelector]);
}

function getQueryParamEverywhere(key) {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search);
  const hashQ = new URLSearchParams(window.location.hash.split("?")[1] || "");
  return String(q.get(key) || hashQ.get(key) || "").trim();
}

function getSurveyBootCacheKey(projectId, feedId) {
  return `survey_boot::${projectId || ""}::${feedId || ""}`;
}

function readSurveyBootCache(projectId, feedId) {
  try {
    const raw = localStorage.getItem(getSurveyBootCacheKey(projectId, feedId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSurveyBootCache(projectId, feedId, value) {
  try {
    localStorage.setItem(
      getSurveyBootCacheKey(projectId, feedId),
      JSON.stringify({
        ...(value || {}),
        _cached_at: Date.now(),
      })
    );
  } catch {}
}

function getPostsCacheKey(projectId, feedId) {
  return `posts::${projectId || ""}::${feedId || ""}`;
}

function readPostsCache(projectId, feedId) {
  try {
    const raw = localStorage.getItem(getPostsCacheKey(projectId, feedId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePostsCache(projectId, feedId, posts) {
  try {
    localStorage.setItem(
      getPostsCacheKey(projectId, feedId),
      JSON.stringify(posts)
    );
    localStorage.setItem(
      `${getPostsCacheKey(projectId, feedId)}::meta`,
      JSON.stringify({ t: Date.now() })
    );
  } catch {}
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const s = String(value ?? "").trim();
    if (s) return s;
  }
  return "";
}

function getSurveyCompletionConfig(survey) {
  const mode = firstNonEmptyString(
    survey?.completion_mode,
    survey?.thank_you_mode,
    "overlay"
  ).toLowerCase();

  const redirectUrl = firstNonEmptyString(
    survey?.completion_redirect_url,
    survey?.redirect_url,
    ""
  );

  const title = firstNonEmptyString(
    survey?.completion_title,
    survey?.thank_you_title,
    "Thank you"
  );

  const messageHtml = firstNonEmptyString(
    survey?.completion_message_html,
    survey?.thank_you_message_html,
    "<p>Your response has been recorded.</p>"
  );

  const code = firstNonEmptyString(
    survey?.completion_code,
    survey?.thank_you_code,
    ""
  );

  return {
    mode: mode === "redirect" ? "redirect" : "overlay",
    redirectUrl,
    title,
    messageHtml,
    code,
  };
}

/* ---------- IG rails skeleton ---------- */

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
      <div className="ghost-row">
        <div className="ghost-line w-70" />
      </div>
      <div className="ghost-row">
        <div className="ghost-line w-45" />
      </div>
    </div>
  );
}

function RailBanner({ tall = false }) {
  return (
    <div
      className="ghost-card banner"
      style={{ height: tall ? 220 : 170, borderRadius: 14 }}
    />
  );
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        width: "100%",
      }}
    >
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
      let n = 0;
      let acc = 0;

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
        gridTemplateColumns:
          "minmax(0,2fr) minmax(var(--feed-min), var(--feed-max)) minmax(0,2.25fr)",
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
            i % 3 === 1 ? (
              <RailList key={i} rows={4} />
            ) : (
              <RailBox key={i} largeAvatar={i % 5 === 0} />
            )
          )}
          <RailBanner />
        </RailStack>
      </aside>
    </div>
  );
}

function elementHasImage(el) {
  if (!el) return false;
  if (el.dataset?.hasImage === "1") return true;

  const root = el.matches?.("[data-post-id]")
    ? el
    : el.closest?.("[data-post-id]") || el;

  return !!root.querySelector?.(
    [
      ":scope .image-btn img:not(.avatar-img)",
      ":scope .image-btn svg",
      ":scope [data-kind='image']",
      ":scope .media img:not(.avatar-img)",
      ":scope .media picture",
      ":scope .card-body img:not(.avatar-img)",
      ":scope [data-has-image='1']",
      ":scope video",
    ].join(", ")
  );
}

/* =============================== MAIN APP ================================ */

export default function App() {
  const sessionIdRef = useRef(uid());
  const t0Ref = useRef(now());
  const enterTsRef = useRef(null);
  const submitTsRef = useRef(null);
  const lastNonScrollTsRef = useRef(null);
  

  const bootAbortRef = useRef(null);
  const surveyAbortRef = useRef(null);
  const contentAbortRef = useRef(null);

  const trackingIds = useMemo(() => getTrackingIdsFromUrl(), []);
  const prefilledParticipantId = trackingIds.prolific_pid || "";

  const [isMobileSurvey, setIsMobileSurvey] = useState(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 700px)").matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 700px)");
    const onChange = (e) => setIsMobileSurvey(e.matches);

    setIsMobileSurvey(mq.matches);
    mq.addEventListener?.("change", onChange);
    mq.addListener?.(onChange);

    return () => {
      mq.removeEventListener?.("change", onChange);
      mq.removeListener?.(onChange);
    };
  }, []);

  const [projectId, setProjectIdState] = useState(() => getProjectIdUtil() || "");

  useEffect(() => {
    setProjectIdUtil(projectId, { persist: true, updateUrl: false });
  }, [projectId]);

  useEffect(() => {
    const syncFromUrl = () => {
      const q = new URLSearchParams(window.location.search);
      const hashQuery = window.location.hash.split("?")[1] || "";
      const getFlag = (key) =>
        q.get(key) ?? new URLSearchParams(hashQuery).get(key);
      const p = getFlag("project_id") || getFlag("project");

      if (p != null && String(p) !== projectId) {
        dbg("project sync from URL", { old: projectId, next: String(p) });
        setProjectIdState(String(p));
        setProjectIdUtil(String(p), { persist: true, updateUrl: false });
      }
    };

    window.addEventListener("hashchange", syncFromUrl);
    window.addEventListener("popstate", syncFromUrl);
    syncFromUrl();

    return () => {
      window.removeEventListener("hashchange", syncFromUrl);
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [projectId]);

  const [runSeed] = useState(() =>
    crypto?.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const onAdmin =
    typeof window !== "undefined" && window.location.hash.startsWith("#/admin");

  const [activeFeedId, setActiveFeedId] = useState(
    !onAdmin ? getFeedIdFromUrl() : null
  );

  const [posts, setPosts] = useState([]);
  const [feedPhase, setFeedPhase] = useState("idle");
  const [feedError, setFeedError] = useState("");

  const [bootPhase, setBootPhase] = useState(onAdmin ? "ready" : "idle");
  const [bootError, setBootError] = useState("");

  const [contentPhase, setContentPhase] = useState("idle");

  const [surveyBoot, setSurveyBoot] = useState(null);
  const [linkedSurvey, setLinkedSurvey] = useState(null);
  const [surveyPhase, setSurveyPhase] = useState("idle");
  const [surveyResponses, setSurveyResponses] = useState({});
  const [surveyErrors, setSurveyErrors] = useState({});
  const [surveyErrorMsg, setSurveyErrorMsg] = useState("");
  const [prefaceCompleted, setPrefaceCompleted] = useState(false);

  

  const isSurveyOnlyMode =
    !!surveyBoot?.has_survey &&
    String(surveyBoot?.delivery_mode || "feed_then_survey") === "survey_only";

  const requiresFeedStage = !isSurveyOnlyMode;

  const completionConfig = useMemo(
    () => getSurveyCompletionConfig(linkedSurvey),
    [linkedSurvey]
  );

  const [completionState, setCompletionState] = useState({
    redirected: false,
  });

  const [feedSubmitted, setFeedSubmitted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [flags, setFlags] = useState({
    randomize_times: false,
    randomize_avatars: false,
    randomize_names: false,
    randomize_images: false,
    randomize_bios: false,
  });

  const [avatarPools, setAvatarPools] = useState(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [flagsReady, setFlagsReady] = useState(false);

  const [minDelayDone, setMinDelayDone] = useState(true);
  const minDelayStartedRef = useRef(false);
  const minDelayTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(minDelayTimerRef.current), []);

  useEffect(() => {
    dbg("state: phases", {
      bootPhase,
      contentPhase,
      feedPhase,
      surveyPhase,
      flagsReady,
      assetsReady,
      minDelayDone,
      hasEntered,
      feedSubmitted,
      submitted,
      activeFeedId,
      projectId,
      surveyBoot,
      hasLinkedSurvey: !!linkedSurvey,
      postsCount: posts.length,
    });
  }, [
    bootPhase,
    contentPhase,
    feedPhase,
    surveyPhase,
    flagsReady,
    assetsReady,
    minDelayDone,
    activeFeedId,
    projectId,
    surveyBoot,
    linkedSurvey,
    posts.length,
  ]);

  if (typeof document !== "undefined") {
    document.body.classList.remove("debug-vp");
  }

  useEffect(() => {
    const apply = () => {
      const isAdmin = window.location.hash.startsWith("#/admin");
      if (isAdmin) {
        document.body.classList.remove("debug-vp");
        return;
      }

      const q = new URLSearchParams(window.location.search);
      const hashQ = new URLSearchParams(window.location.hash.split("?")[1] || "");
      const debugParam = q.get("debugvp") || hashQ.get("debugvp");
      const udebugParam = q.get("udebug") || hashQ.get("udebug");

      const shouldEnable = debugParam === "1" || udebugParam === "vp";

      if (shouldEnable) {
        document.body.classList.add("debug-vp");
      } else {
        document.body.classList.remove("debug-vp");
      }
    };

    apply();
    window.addEventListener("popstate", apply);
    window.addEventListener("hashchange", apply);
    window.addEventListener("load", apply);

    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener("hashchange", apply);
      window.removeEventListener("load", apply);
    };
  }, []);

  const [vpOff, setVpOff] = useState({ top: 0, bottom: 0 });

  useEffect(() => {
    const readOffsets = () => {
      const topEl =
        document.querySelector(".top-rail-placeholder") ||
        document.querySelector(".topbar") ||
        null;

      const top = topEl
        ? Math.ceil(
            topEl.getBoundingClientRect().height || topEl.offsetHeight || 0
          )
        : 0;

      const bottom = 0;

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

  const scrollSurveyViewToTop = useCallback(() => {
    if (typeof window === "undefined") return;

    const run = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      const surveyPageEl = document.querySelector(".survey-page");
      if (surveyPageEl) {
        surveyPageEl.scrollTop = 0;
      }
    };

    run();
    requestAnimationFrame(run);
    setTimeout(run, 0);
    setTimeout(run, 80);
  }, []);

  const resolveChosenFeed = useCallback(
    async (signal) => {
      const t = timerStart("resolveChosenFeed", {
        projectId,
        urlFeedId: getFeedIdFromUrl(),
      });

      try {
        const [feedsList, backendDefault] = await Promise.all([
          listFeedsFromBackend({ signal }),
          getDefaultFeedFromBackend({ signal }),
        ]);

        if (signal?.aborted) {
          t.end({ aborted: true });
          return null;
        }

        const urlFeedId = getFeedIdFromUrl();
        const chosen =
          (feedsList || []).find((f) => f.feed_id === urlFeedId) ||
          (feedsList || []).find(
            (f) => f.feed_id === (backendDefault?.feed_id || backendDefault)
          ) ||
          (feedsList || [])[0] ||
          null;

        t.end({
          feedsCount: (feedsList || []).length,
          backendDefault,
          chosenFeedId: chosen?.feed_id || null,
        });

        return chosen;
      } catch (e) {
        t.fail(e);
        throw e;
      }
    },
    [projectId]
  );

  const startBoot = useCallback(async () => {
    if (onAdmin) return;

    const t = timerStart("startBoot", { projectId });

    bootAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    bootAbortRef.current = ctrl;

    setBootPhase("loading");
    setBootError("");

    setSurveyBoot(null);
    setLinkedSurvey(null);
    setSurveyPhase("idle");
    setSurveyResponses({});
    setSurveyErrors({});
    setSurveyErrorMsg("");

    setPosts([]);
    setFeedPhase("idle");
    setFeedError("");
    setContentPhase("idle");
    setFlagsReady(false);
    setAssetsReady(false);

    setFeedSubmitted(false);
    setSubmitted(false);
    setPrefaceCompleted(false);
    setCompletionState({ redirected: false });

    clearTimeout(minDelayTimerRef.current);
    minDelayStartedRef.current = false;
    setMinDelayDone(true);

    try {
      const chosen = await resolveChosenFeed(ctrl.signal);

      if (ctrl.signal.aborted) {
        t.end({ aborted: true });
        return;
      }

      if (!chosen) {
        throw new Error("No feeds are available.");
      }

      const chosenFeedId = chosen.feed_id;
      setActiveFeedId(chosenFeedId);

      try {
        setFeedIdInUrl(chosenFeedId, { replace: true });
      } catch {}

      const cachedBoot = readSurveyBootCache(projectId, chosenFeedId);

      dbg("boot cache", {
        projectId,
        feedId: chosenFeedId,
        cachedBoot,
      });

      let nextBoot = cachedBoot || {
        has_survey: false,
        survey_id: "",
        has_preface: false,
        preface: {
          participant_information: false,
          consent: false,
          instructions: false,
        },
        participant_information_title: "Participant Information",
        participant_information_html: "",
        consent_title: "Consent",
        consent_text_html: "",
        consent_decline_message_html:
          "<p>You cannot proceed because you did not provide consent.</p>",
        instructions_title: "Instructions",
        instructions_html: "",
        pre_feed_button_label: "Go to feed",
        trigger: "after_feed_submit",
        delivery_mode: "feed_then_survey",
      };

      try {
        const tb = timerStart("fetchSurveyBootForFeed", {
          projectId,
          feedId: chosenFeedId,
        });

        const freshBoot = await getSurveyBootForFeedFromBackend(chosenFeedId, {
          projectId: projectId || undefined,
          signal: ctrl.signal,
        });

        if (ctrl.signal.aborted) {
          tb.end({ aborted: true });
          return;
        }

        tb.end({ freshBoot });

        if (freshBoot && typeof freshBoot === "object") {
          nextBoot = {
            ...freshBoot,
            has_survey: !!freshBoot.has_survey,
            survey_id: String(freshBoot.survey_id || ""),
            has_preface: !!freshBoot.has_preface,
            preface: freshBoot.preface || {
              participant_information: !!String(
                freshBoot.participant_information_html || ""
              ).trim(),
              consent: !!String(freshBoot.consent_text_html || "").trim(),
              instructions: !!String(
                freshBoot.instructions_html || ""
              ).trim(),
            },
            trigger: String(freshBoot.trigger || "after_feed_submit"),
            participant_information_title: String(
              freshBoot.participant_information_title ||
                "Participant Information"
            ),
            participant_information_html: String(
              freshBoot.participant_information_html || ""
            ),
            consent_title: String(freshBoot.consent_title || "Consent"),
            consent_text_html: String(freshBoot.consent_text_html || ""),
            consent_decline_message_html: String(
              freshBoot.consent_decline_message_html ||
                "<p>You cannot proceed because you did not provide consent.</p>"
            ),
            instructions_title: String(
              freshBoot.instructions_title || "Instructions"
            ),
            instructions_html: String(freshBoot.instructions_html || ""),
            pre_feed_button_label: String(
              freshBoot.pre_feed_button_label || "Go to feed"
            ),
            delivery_mode: String(
              freshBoot.delivery_mode || "feed_then_survey"
            ),
          };
          writeSurveyBootCache(projectId, chosenFeedId, nextBoot);
        }
      } catch (e) {
        dbgWarn("survey boot fetch failed, using cached/default boot", e);
      }

      setSurveyBoot(nextBoot);
      setBootPhase("ready");
      t.end({
        chosenFeedId,
        nextBoot,
      });
    } catch (e) {
      if (e?.name === "AbortError") {
        t.end({ aborted: true });
        return;
      }
      dbgWarn("Boot load failed:", e);
      setBootError(e?.message || "Failed to start the study.");
      setBootPhase("error");
      t.fail(e);
    } finally {
      if (bootAbortRef.current === ctrl) {
        bootAbortRef.current = null;
      }
    }
  }, [onAdmin, projectId, resolveChosenFeed]);

  const ensureSurveyLoaded = useCallback(async () => {
    if (onAdmin) return null;
    if (!activeFeedId) return null;
    if (!surveyBoot?.has_survey) return null;
    if (linkedSurvey) return linkedSurvey;
    if (surveyPhase === "loading") return null;

    const t = timerStart("ensureSurveyLoaded", {
      projectId,
      activeFeedId,
      surveyBoot,
    });

    surveyAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    surveyAbortRef.current = ctrl;

    setSurveyPhase("loading");
    setSurveyErrorMsg("");

    try {
      const surveyDef = await getSurveyForFeedFromBackend(activeFeedId, {
        projectId: projectId || undefined,
        signal: ctrl.signal,
        force: true,
      }).catch(() => null);

      if (ctrl.signal.aborted) {
        t.end({ aborted: true });
        return null;
      }

      const normalizedSurvey = surveyDef
        ? normalizeFrontendSurvey(surveyDef)
        : null;

      setLinkedSurvey(normalizedSurvey);
      setSurveyResponses(
        normalizedSurvey ? makeEmptySurveyResponses(normalizedSurvey) : {}
      );
      setSurveyErrors({});
      setSurveyErrorMsg("");
      setSurveyPhase(normalizedSurvey ? "ready" : "idle");

      t.end({
        hasSurveyDef: !!surveyDef,
        hasNormalizedSurvey: !!normalizedSurvey,
        pages: normalizedSurvey?.pages?.length || 0,
      });

      return normalizedSurvey;
    } catch (e) {
      if (e?.name === "AbortError") {
        t.end({ aborted: true });
        return null;
      }
      dbgWarn("Survey load failed:", e);
      setSurveyPhase("error");
      setSurveyErrorMsg("Failed to load the survey.");
      t.fail(e);
      return null;
    } finally {
      if (surveyAbortRef.current === ctrl) {
        surveyAbortRef.current = null;
      }
    }
  }, [
    onAdmin,
    activeFeedId,
    surveyBoot,
    linkedSurvey,
    surveyPhase,
    projectId,
  ]);

  const loadStudyContent = useCallback(async () => {
    if (onAdmin || !activeFeedId) return;
    if (contentPhase === "loading") return;

    const t = timerStart("loadStudyContent", {
      projectId,
      activeFeedId,
      hasSurvey: !!surveyBoot?.has_survey,
      hasLinkedSurveyAlready: !!linkedSurvey,
    });

    contentAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    contentAbortRef.current = ctrl;

    setContentPhase("loading");
    setFeedPhase("loading");
    setFeedError("");
    setFlagsReady(false);
    setAssetsReady(false);

    try {
      const cachedPosts = readPostsCache(projectId, activeFeedId);
      dbg("posts cache", {
        projectId,
        activeFeedId,
        cachedPostsCount: cachedPosts?.length || 0,
      });

      const postsPromise = (async () => {
        const tp = timerStart("content.posts", {
          cached: !!cachedPosts,
          activeFeedId,
        });
        try {
          const result = cachedPosts
            ? cachedPosts
           : await loadPostsFromBackend(activeFeedId, {
    force: true,
    signal: ctrl.signal,
    projectId,
  });
          tp.end({ count: Array.isArray(result) ? result.length : 0 });
          return result;
        } catch (e) {
          tp.fail(e);
          throw e;
        }
      })();

      const flagsPromise = (async () => {
        const tf = timerStart("content.flags", {
          activeFeedId,
          projectId,
        });
        try {
          const result = await fetchFeedFlags({
            app: APP,
            projectId: projectId || undefined,
            feedId: activeFeedId || undefined,
            project_id: projectId || undefined,
            feed_id: activeFeedId || undefined,
            endpoint: GS_ENDPOINT,
            signal: ctrl.signal,
          }).catch(() => ({}));
          tf.end({ result });
          return result;
        } catch (e) {
          tf.fail(e);
          throw e;
        }
      })();

      const [rawPosts, resFlags] = await Promise.all([
        postsPromise,
        flagsPromise,
      ]);

      if (ctrl.signal.aborted) {
        t.end({ aborted: true });
        return;
      }

      const arr = Array.isArray(rawPosts) ? rawPosts : [];
      const nextFlags = normalizeFlags(resFlags);

      setPosts(arr);
      setFlags(nextFlags);
      setFlagsReady(true);

      if (!cachedPosts && Array.isArray(arr) && arr.length > 0) {
  writePostsCache(projectId, activeFeedId, arr);
}

      if (!surveyBoot?.has_survey) {
        setLinkedSurvey(null);
        setSurveyResponses({});
        setSurveyErrors({});
        setSurveyErrorMsg("");
        setSurveyPhase("idle");
      }

      setFeedPhase("ready");
      setContentPhase("ready");

      t.end({
        postsCount: arr.length,
        nextFlags,
        surveyPhaseAfter: surveyPhase,
      });
    } catch (e) {
      if (e?.name === "AbortError") {
        t.end({ aborted: true });
        return;
      }
      dbgWarn("Content load failed:", e);
      setFeedError(e?.message || "Failed to load the feed. Please try again.");
      setFeedPhase("error");
      setContentPhase("error");
      t.fail(e);
    } finally {
      if (contentAbortRef.current === ctrl) {
        contentAbortRef.current = null;
      }
    }
  }, [
    onAdmin,
    activeFeedId,
    contentPhase,
    projectId,
    surveyBoot,
    linkedSurvey,
    surveyPhase,
  ]);

  useEffect(() => {
    if (!onAdmin) startBoot();

    return () => {
      bootAbortRef.current?.abort?.();
      surveyAbortRef.current?.abort?.();
      contentAbortRef.current?.abort?.();
    };
  }, [onAdmin, startBoot, projectId]);

  useEffect(() => {
    const onUrlChange = () => {
      const fid = getFeedIdFromUrl();
      const pid = getProjectIdUtil();

      dbg("URL changed", {
        fid,
        pid,
        activeFeedId,
      });

      if (pid) {
        setProjectIdUtil(pid, { persist: true, updateUrl: false });
      }

      if (fid && fid !== activeFeedId) {
        setFeedIdInUrl(fid, { replace: true });
        setActiveFeedId(fid);
        startBoot();
      }
    };

    onUrlChange();
    window.addEventListener("hashchange", onUrlChange);
    window.addEventListener("popstate", onUrlChange);

    return () => {
      window.removeEventListener("hashchange", onUrlChange);
      window.removeEventListener("popstate", onUrlChange);
    };
  }, [activeFeedId, startBoot]);

  const [adminAuthed, setAdminAuthed] = useState(false);

  useEffect(() => {
    if (onAdmin && hasAdminSession()) setAdminAuthed(true);
  }, [onAdmin]);

  const [randomize, setRandomize] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [toast, setToast] = useState(null);
  const [events, setEvents] = useState([]);

  const participantDisplayId = useMemo(() => {
    return (
      getQueryParamEverywhere("PROLIFIC_PID") ||
      getQueryParamEverywhere("participant_id") ||
      ""
    );
  }, [activeFeedId, projectId]);

  const shouldShowSurvey =
    !onAdmin &&
    hasEntered &&
    !submitted &&
    !!linkedSurvey &&
    (isSurveyOnlyMode || feedSubmitted) &&
    (surveyPhase === "ready" ||
      surveyPhase === "submitting" ||
      surveyPhase === "error");

  const shouldShowPreface =
    !onAdmin &&
    bootPhase === "ready" &&
    !hasEntered &&
    !feedSubmitted &&
    !!surveyBoot?.has_survey &&
    !!surveyBoot?.has_preface &&
    !prefaceCompleted;

  const shouldShowParticipantOverlay =
    !onAdmin &&
    bootPhase === "ready" &&
    !hasEntered &&
    !shouldShowPreface;

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (shouldShowSurvey || shouldShowPreface) {
      document.body.classList.add("survey-mode");
    } else {
      document.body.classList.remove("survey-mode");
    }

    return () => {
      document.body.classList.remove("survey-mode");
    };
  }, [shouldShowSurvey, shouldShowPreface]);

  useEffect(() => {
    if (!shouldShowSurvey && !shouldShowPreface) return;
    scrollSurveyViewToTop();
  }, [shouldShowSurvey, shouldShowPreface, scrollSurveyViewToTop]);

  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;

    const shouldLock =
  !onAdmin &&
  (bootPhase === "loading" ||
    !hasEntered ||
    (requiresFeedStage && contentPhase === "loading") ||
    (requiresFeedStage && feedPhase !== "ready") ||
    (surveyPhase === "loading" && !isSurveyOnlySurveyLoading) ||
    submitted ||
    (requiresFeedStage && !flagsReady) ||
    (requiresFeedStage && !assetsReady) ||
    (requiresFeedStage && !minDelayDone));

    el.style.overflow = shouldLock ? "hidden" : "";

    return () => {
      el.style.overflow = prev;
    };
  }, [
    bootPhase,
    hasEntered,
    contentPhase,
    feedPhase,
    surveyPhase,
    submitted,
    onAdmin,
    flagsReady,
    assetsReady,
    minDelayDone,
    requiresFeedStage,
  ]);

  const overlayActive = !onAdmin && (!hasEntered || shouldShowPreface);

  useIOSInputZoomFix(
    ".participant-overlay input, .participant-overlay .input, .participant-overlay select, .participant-overlay textarea, .comment-sheet input, .comment-sheet textarea, .share-sheet input, .share-sheet textarea, .survey-shell input, .survey-shell textarea, .survey-shell select"
  );

  useIOSViewportGuard({
    overlayActive,
    fieldSelector:
      ".participant-overlay input, .comment-sheet input, .comment-sheet textarea, .share-sheet input, .share-sheet textarea, .survey-shell input, .survey-shell textarea, .survey-shell select",
  });

  const orderedPosts = useMemo(() => {
    const arr = posts.map((p) => ({ ...p }));
    if (randomize) arr.sort(() => Math.random() - 0.5);
    return arr;
  }, [posts, randomize]);

  useEffect(() => {
    if (
      onAdmin ||
      isSurveyOnlyMode ||
      !hasEntered ||
      feedPhase !== "ready" ||
      submitted
    ) {
      return;
    }

    const randOn = !!flags?.randomize_avatars || !!flags?.randomize_images;

    if (randOn && !minDelayStartedRef.current) {
      minDelayStartedRef.current = true;
      setMinDelayDone(false);
      clearTimeout(minDelayTimerRef.current);

      const t = timerStart("minArtificialDelay", {
        randomizeAvatars: !!flags?.randomize_avatars,
        randomizeImages: !!flags?.randomize_images,
      });

      minDelayTimerRef.current = setTimeout(() => {
        setMinDelayDone(true);
        t.end();
      }, 1500);
    }

    if (!randOn) {
      clearTimeout(minDelayTimerRef.current);
      setMinDelayDone(true);
    }
  }, [
    onAdmin,
    isSurveyOnlyMode,
    hasEntered,
    feedPhase,
    submitted,
    flags?.randomize_avatars,
    flags?.randomize_images,
  ]);

  useEffect(() => {
    if (!feedSubmitted) return;
    if (surveyPhase === "loading") return;

    if (linkedSurvey && surveyPhase === "ready") {
      setSubmitted(false);
      return;
    }

    if (!linkedSurvey && surveyPhase === "idle") {
      setSubmitted(true);
    }
  }, [feedSubmitted, linkedSurvey, surveyPhase]);

  useEffect(() => {
    if (
      onAdmin ||
      isSurveyOnlyMode ||
      !hasEntered ||
      feedPhase !== "ready" ||
      submitted
    ) {
      return;
    }

    const randAvOn = !!flags?.randomize_avatars;
    const randImgOn = !!flags?.randomize_images;

    if (!randAvOn && !randImgOn) {
      dbg("asset preload skipped", { randAvOn, randImgOn });
      setAvatarPools(null);
      setAssetsReady(true);
      return;
    }

    const types = new Set(
      posts.map((p) =>
        p?.authorType === "male" || p?.authorType === "company"
          ? p.authorType
          : "female"
      )
    );

    if (types.size === 0) {
      dbg("asset preload skipped: no author types");
      setAvatarPools(null);
      setAssetsReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const t = timerStart("assetPreload", {
        randAvOn,
        randImgOn,
        postsCount: posts.length,
      });

      try {
        const jobs = [];

        if (randAvOn) {
          const typesArr = Array.from(types);
          dbg("avatar preload types", typesArr);

          jobs.push(
            Promise.all(
              typesArr.map(async (tName) => {
                const single = timerStart(`avatarPool:${tName}`);
                try {
                  const pool = await getAvatarPool(tName);
                  single.end({
                    poolSize: Array.isArray(pool) ? pool.length : undefined,
                  });
                  return [tName, pool];
                } catch (e) {
                  single.fail(e);
                  throw e;
                }
              })
            ).then((entries) => {
              if (!cancelled) {
                setAvatarPools(Object.fromEntries(entries));
              }
            })
          );
        } else {
          setAvatarPools(null);
        }

        if (randImgOn) {
          const topics = Array.from(
            new Set(
              posts
                .filter((p) => p?.image && p?.imageMode !== "none")
                .map((p) => String(p?.topic || p?.imageTopic || "").trim())
                .filter(Boolean)
                .map((v) => v.toLowerCase())
            )
          );

          dbg("image preload topics", topics);

          if (topics.length) {
            jobs.push(
              Promise.allSettled(
                topics.map(async (topic) => {
                  const single = timerStart(`imagePool:${topic}`);
                  try {
                    const pool = await getImagePool(topic);
                    single.end({
                      poolSize: Array.isArray(pool) ? pool.length : undefined,
                    });
                    return pool;
                  } catch (e) {
                    single.fail(e);
                    throw e;
                  }
                })
              )
            );
          }
        }

        await Promise.allSettled(jobs);

        if (!cancelled) {
          setAssetsReady(true);
        }

        t.end();
      } catch (err) {
        if (!cancelled) {
          dbgWarn("[asset preload error]", err);
          setAvatarPools(null);
          setAssetsReady(true);
        }
        t.fail(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onAdmin, isSurveyOnlyMode, hasEntered, feedPhase, submitted, posts, flags]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
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

  useEffect(() => {
    dbg("session_start effect mounted");
    log("session_start", {
      user_agent: navigator.userAgent,
      feed_id: activeFeedId || null,
      project_id: projectId || null,
    });

    const onEnd = () => log("session_end", { total_events: events.length });
    window.addEventListener("beforeunload", onEnd);
    return () => window.removeEventListener("beforeunload", onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSurveyResponseChange = useCallback((questionId, value) => {
    setSurveyResponses((prev) => ({
      ...prev,
      [questionId]: value,
    }));

    setSurveyErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }, []);

  const handleSurveyPageValidationFail = useCallback((pageErrors, message) => {
    setSurveyErrors((prev) => ({
      ...prev,
      ...(pageErrors || {}),
    }));
    setSurveyErrorMsg(message || "Please complete the highlighted questions.");
  }, []);

  const clearSurveyBanner = useCallback(() => {
    setSurveyErrorMsg("");
  }, []);

  const finalizeStudyCompletion = useCallback(() => {
    const shouldRedirect =
      linkedSurvey &&
      completionConfig.mode === "redirect" &&
      completionConfig.redirectUrl;

    dbg("finalizeStudyCompletion", {
      shouldRedirect,
      redirectUrl: completionConfig.redirectUrl,
    });

    if (shouldRedirect) {
      setCompletionState({ redirected: true });
      window.location.assign(completionConfig.redirectUrl);
      return;
    }

    setSubmitted(true);
  }, [linkedSurvey, completionConfig]);

  const handleSurveySubmit = useCallback(async () => {
    if (!linkedSurvey) return;

    const t = timerStart("handleSurveySubmit", {
      surveyId: linkedSurvey.survey_id,
      feedId: activeFeedId,
      projectId,
    });

    const validation = validateSurveyResponses(linkedSurvey, surveyResponses);

    if (!validation.ok) {
      setSurveyErrors(validation.errors || {});
      setSurveyErrorMsg("Please complete the highlighted questions.");
      t.end({
        validationOk: false,
        errorCount: Object.keys(validation.errors || {}).length,
      });
      return;
    }

    setSurveyPhase("submitting");
    setSurveyErrors({});
    setSurveyErrorMsg("");

    try {
      const ok = await sendSurveyResponseToBackend({
        survey_id: linkedSurvey.survey_id,
        feed_id: activeFeedId || "",
        project_id: projectId || "",
        session_id: sessionIdRef.current,
        participant_id: participantId || "",
        responses: surveyResponses,
        submitted_at_iso: new Date().toISOString(),
      });

      if (!ok) {
        setSurveyPhase("error");
        setSurveyErrorMsg("Failed to submit the survey. Please try again.");
        t.end({ ok: false });
        return;
      }

      setSurveyPhase("done");
      t.end({ ok: true });
      finalizeStudyCompletion();
    } catch (e) {
      dbgWarn("Survey submission failed:", e);
      setSurveyPhase("error");
      setSurveyErrorMsg("Failed to submit the survey. Please try again.");
      t.fail(e);
    }
  }, [
    linkedSurvey,
    surveyResponses,
    activeFeedId,
    projectId,
    participantId,
    finalizeStudyCompletion,
  ]);

  const ioRef = useRef(null);
  const viewRefs = useRef(new Map());
  const elToId = useRef(new WeakMap());

  const registerViewRef = (postId) => (el) => {
    const prev = viewRefs.current.get(postId);

    if (prev && ioRef.current) {
      try {
        ioRef.current.unobserve(prev);
      } catch {}
    }

    if (el) {
      viewRefs.current.set(postId, el);
      elToId.current.set(el, postId);
      if (ioRef.current) {
        try {
          ioRef.current.observe(el);
        } catch {}
      }
    } else {
      viewRefs.current.delete(postId);
    }
  };

  const measureVis = (post_id) => {
    const el = viewRefs.current.get(post_id);
    if (!el) return null;

    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const topBound = vpOff.top;
    const bottomBound = vh - vpOff.bottom;
    const effectiveVH = Math.max(0, bottomBound - topBound);
    const post_h_px = Math.max(0, Math.round(r.height || 0));
    const visH = Math.max(
      0,
      Math.min(r.bottom, bottomBound) - Math.max(r.top, topBound)
    );
    const vis_frac = post_h_px
      ? Number((visH / post_h_px).toFixed(4))
      : 0;

    return { vis_frac, post_h_px, viewport_h_px: effectiveVH, el };
  };

  const canShowFeed =
    hasEntered &&
    requiresFeedStage &&
    feedPhase === "ready" &&
    !feedSubmitted;

  const gateOpen = canShowFeed && flagsReady && assetsReady && minDelayDone;
  const [showSkeletonLayer, setShowSkeletonLayer] = useState(true);

  useEffect(() => {
    if (canShowFeed) setShowSkeletonLayer(true);
  }, [canShowFeed]);

  useEffect(() => {
    if (gateOpen) {
      const t = setTimeout(() => setShowSkeletonLayer(false), 320);
      return () => clearTimeout(t);
    }
    setShowSkeletonLayer(true);
  }, [gateOpen]);

  useEffect(() => {
    if (onAdmin && hasAdminSession()) setAdminAuthed(true);
  }, [onAdmin]);

  useEffect(() => {
    if (
      isSurveyOnlyMode ||
      !hasEntered ||
      feedPhase !== "ready" ||
      submitted ||
      onAdmin ||
      shouldShowSurvey ||
      feedSubmitted
    ) {
      return;
    }

    const DEBUG_VP =
      new URLSearchParams(window.location.search).get("debugvp") === "1" ||
      (window.location.hash.split("?")[1] &&
        new URLSearchParams(window.location.hash.split("?")[1]).get("debugvp") ===
          "1");

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
          const vis_frac = m
            ? m.vis_frac
            : Number((e.intersectionRatio || 0).toFixed(4));

          const isImg = elementHasImage(el);
          const TH = isImg ? IMG_FRAC : ENTER_FRAC;

          const nowIn = e.isIntersecting && vis_frac >= TH;
          const wasIn = enteredSet.has(postId);

          if (DEBUG_VP) {
            el.dataset.vis = `${Math.round(vis_frac * 100)}%`;
            el.dataset.state = nowIn ? "IN" : "OUT";
            el.dataset.th = `${Math.round(TH * 100)}%`;

            const wrap = el.closest?.("[data-post-id]") || el;
            wrap.classList.toggle("__vp-in", nowIn);
            wrap.classList.toggle("__vp-out", !nowIn);
          }

          if (nowIn && !wasIn) {
            enteredSet.add(postId);
            log("vp_enter", {
              post_id: postId,
              vis_frac,
              feed_id: activeFeedId || null,
            });
          } else if (!nowIn && wasIn) {
            enteredSet.delete(postId);
            log("vp_exit", {
              post_id: postId,
              vis_frac,
              feed_id: activeFeedId || null,
            });
          }
        }
      },
      { root: null, rootMargin, threshold: thresholds }
    );

    ioRef.current = io;

    for (const [, el] of viewRefs.current) {
      if (el) io.observe(el);
    }

    const onHide = () => {
      enteredSet.forEach((id) =>
        log("vp_exit", {
          post_id: id,
          reason: "page_hide",
          feed_id: activeFeedId || null,
        })
      );
      enteredSet.clear();
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);

    return () => {
      try {
        io.disconnect();
      } catch {}
      ioRef.current = null;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [
    isSurveyOnlyMode,
    orderedPosts,
    hasEntered,
    feedPhase,
    submitted,
    onAdmin,
    vpOff.top,
    vpOff.bottom,
    activeFeedId,
    shouldShowSurvey,
    feedSubmitted,
  ]);

  const loadingStudyOverlay = !onAdmin && bootPhase === "loading";

  const preparingFeedOverlay =
    !onAdmin &&
    requiresFeedStage &&
    hasEntered &&
    !feedSubmitted &&
    !shouldShowPreface &&
    (contentPhase === "loading" ||
      feedPhase === "loading" ||
      !flagsReady ||
      !assetsReady ||
      !minDelayDone);

  const loadingNextStageOverlay =
  !onAdmin &&
  hasEntered &&
  !submitted &&
  !!surveyBoot?.has_survey &&
  !isSurveyOnlyMode &&
  feedSubmitted &&
  surveyPhase === "loading" &&
  !shouldShowSurvey;

  const showBootError =
    !onAdmin && bootPhase === "error" && !hasEntered && !shouldShowPreface;

  const isSurveyOnlySurveyLoading =
  isSurveyOnlyMode &&
  hasEntered &&
  !submitted &&
  surveyPhase === "loading" &&
  !linkedSurvey &&
  !shouldShowSurvey &&
  !shouldShowPreface;

  return (
    <Router>
      <div
        className={`app-shell ${
  !onAdmin &&
  !shouldShowSurvey &&
  !shouldShowPreface &&
  (bootPhase === "loading" ||
    !hasEntered ||
    (requiresFeedStage && contentPhase === "loading") ||
    (requiresFeedStage && feedPhase !== "ready") ||
    (surveyPhase === "loading" && !isSurveyOnlySurveyLoading) ||
    submitted ||
    (requiresFeedStage && !flagsReady) ||
    (requiresFeedStage && !assetsReady) ||
    (requiresFeedStage && !minDelayDone))
    ? "blurred"
    : ""
}`}
      >
        <RouteAwareTopbar />

        <Routes>
          <Route
            path="/"
            element={
  shouldShowSurvey ? (
    <div className="survey-page">
      {isMobileSurvey ? (
        <SurveyScreenMobile
          survey={linkedSurvey}
          posts={orderedPosts}
          responses={surveyResponses}
          errors={surveyErrors}
          errorMsg={surveyErrorMsg}
          participantSeed={participantId || sessionIdRef.current}
          feedId={activeFeedId}
          onChange={handleSurveyResponseChange}
          onSubmit={handleSurveySubmit}
          onPageValidationFail={handleSurveyPageValidationFail}
          onClearBanner={clearSurveyBanner}
          submitting={surveyPhase === "submitting"}
        />
      ) : (
        <SurveyScreen
          survey={linkedSurvey}
          posts={orderedPosts}
          responses={surveyResponses}
          errors={surveyErrors}
          errorMsg={surveyErrorMsg}
          participantSeed={participantId || sessionIdRef.current}
          feedId={activeFeedId}
          onChange={handleSurveyResponseChange}
          onSubmit={handleSurveySubmit}
          onPageValidationFail={handleSurveyPageValidationFail}
          onClearBanner={clearSurveyBanner}
          submitting={surveyPhase === "submitting"}
        />
      )}
    </div>
  ) : shouldShowPreface ? (
    <div className="survey-page">
      {surveyBoot ? (
        <SurveyPrefaceFlow
          survey={surveyBoot}
          participantDisplayId={participantDisplayId}
          onComplete={async () => {
            setPrefaceCompleted(true);

            if (isSurveyOnlyMode) {
              setSurveyPhase("loading");
              const loadedSurvey = await ensureSurveyLoaded();

              if (!loadedSurvey) {
                setSurveyPhase("error");
                setSurveyErrorMsg("Failed to load the survey.");
              } else {
                scrollSurveyViewToTop();
              }
            } else {
              scrollSurveyViewToTop();
            }
          }}
        />
      ) : (
        <LoadingOverlay
          title="Loading study…"
          subtitle="Preparing the first page"
        />
      )}
    </div>
  ) : isSurveyOnlySurveyLoading ? (
    <LoadingOverlay
      title="Loading questions…"
      subtitle="Preparing the survey"
    />
  ) : (
                <PageWithRails>
                  <div
                    style={{
                      position: "relative",
                      minHeight: "calc(100vh - var(--vp-top, 0px))",
                    }}
                  >
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
                          registerViewRef={registerViewRef}
                          disabled={disabled}
                          log={log}
                          showComposer={false}
                          loading={false}
                          flags={flags}
                          runSeed={runSeed}
                          app={APP}
                          projectId={projectId}
                          submitButtonLabel={
                            surveyBoot?.has_survey
                              ? "Submit Feed & Continue to Questions"
                              : "Submit Feed"
                          }
                          feedId={activeFeedId}
                          avatarPools={avatarPools}
                          onSubmit={async () => {
                            if (feedSubmitted || submitted || disabled) return;

                            const t = timerStart("feedSubmit", {
                              activeFeedId,
                              projectId,
                              postsCount: posts.length,
                              eventsCount: events.length,
                            });

                            setDisabled(true);

                            const ENTER_FRAC = Number.isFinite(
                              Number(VIEWPORT_ENTER_FRACTION)
                            )
                              ? clamp(Number(VIEWPORT_ENTER_FRACTION), 0, 1)
                              : 0.5;

                            const IMG_FRAC = Number.isFinite(
                              Number(VIEWPORT_ENTER_FRACTION_IMAGE)
                            )
                              ? clamp(Number(VIEWPORT_ENTER_FRACTION_IMAGE), 0, 1)
                              : ENTER_FRAC;

                            for (const [post_id, elNode] of viewRefs.current) {
                              const m = measureVis(post_id);
                              if (!m) continue;

                              const { vis_frac } = m;
                              const isImg = elementHasImage(elNode);
                              const TH = isImg ? IMG_FRAC : ENTER_FRAC;

                              if (vis_frac >= TH) {
                                log("vp_exit", {
                                  post_id,
                                  vis_frac,
                                  reason: "submit",
                                  feed_id: activeFeedId || null,
                                });
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

                            const sendTimer = timerStart("sendToSheet", {
                              feed_id,
                              headerLength: header.length,
                            });

                            const ok = await sendToSheet(
                              header,
                              row,
                              eventsWithSubmit,
                              feed_id
                            );

                            sendTimer.end({ ok });

                            showToast(
                              ok ? "Submitted ✔︎" : "Sync failed. Please try again."
                            );

                            if (ok) {
                              if (surveyBoot?.has_survey) {
                                setFeedSubmitted(true);
                                setSurveyPhase("loading");
                                const loadedSurvey = await ensureSurveyLoaded();

                                if (loadedSurvey) {
                                  scrollSurveyViewToTop();
                                } else {
                                  setSurveyPhase("error");
                                  setSurveyErrorMsg("Failed to load the survey.");
                                  showToast(
                                    "Feed submitted, but the survey could not be loaded."
                                  );
                                }
                              } else {
                                setFeedSubmitted(true);
                                scrollSurveyViewToTop();
                              }
                            }

                            setDisabled(false);
                            t.end({ ok });
                          }}
                        />
                      ) : null}
                    </div>

                    {showSkeletonLayer &&
  !isSurveyOnlyMode &&
  !feedSubmitted &&
  !shouldShowSurvey &&
  !shouldShowPreface && (
                        <div
                          aria-hidden={gateOpen}
                          style={{
                            position: "relative",
                            zIndex: 2,
                            opacity: gateOpen ? 0 : 1,
                            transition: "opacity 320ms ease",
                          }}
                        >
                          <SkeletonFeed />
                        </div>
                      )}
                  </div>
                </PageWithRails>
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
                  resetLog={() => {
                    setEvents([]);
                    showToast("Event log cleared");
                  }}
                  onPublishPosts={async (nextPosts, ctx = {}) => {
                    try {
                      const ok = await savePostsToBackend(nextPosts, ctx);
                      if (ok) {
                        const fresh = await loadPostsFromBackend(ctx?.feedId, {
  projectId: ctx?.projectId || projectId,
  force: true,
});
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
                    try {
                      await adminLogout();
                    } catch {}
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

      {loadingStudyOverlay && (
        <LoadingOverlay
          title="Loading study…"
          subtitle="Checking the study setup"
        />
      )}

      {showBootError && (
        <div
          className="modal-backdrop modal-backdrop-dim"
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
        >
          <div
            className="modal modal-compact"
            style={{ textAlign: "center", paddingTop: 24 }}
          >
            <h3 style={{ margin: "0 0 6px" }}>Couldn’t start the study</h3>
            <div
              style={{
                color: "var(--muted)",
                fontSize: ".95rem",
                marginBottom: 12,
              }}
            >
              {bootError || "Network error or service unavailable."}
            </div>
            <div>
              <button className="btn" onClick={startBoot}>
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldShowParticipantOverlay && (
        <ParticipantOverlay
          initialValue={prefilledParticipantId}
          onSubmit={async (id) => {
            const t = timerStart("participantOverlaySubmit", {
              activeFeedId,
              projectId,
              surveyBoot,
            });

            const ts = now();
            setParticipantId(id);
            setHasEntered(true);
            enterTsRef.current = ts;
            lastNonScrollTsRef.current = null;

            log("participant_id_entered", {
              id,
              feed_id: activeFeedId || null,
              project_id: projectId || null,
            });

            const vp = document.querySelector('meta[name="viewport"]');
            if (vp) {
              vp.setAttribute(
                "content",
                "width=device-width, initial-scale=1, viewport-fit=cover"
              );
            }

            requestAnimationFrame(() => {
              window.scrollTo(0, 0);
              window.dispatchEvent(new Event("resize"));
            });

            if (isSurveyOnlyMode) {
              setSurveyPhase("loading");
              const loadedSurvey = await ensureSurveyLoaded();

              if (!loadedSurvey) {
                setSurveyPhase("error");
                setSurveyErrorMsg("Failed to load the survey.");
              } else {
                scrollSurveyViewToTop();
              }
            } else {
              await loadStudyContent();
            }

            t.end();
          }}
        />
      )}

      {preparingFeedOverlay && (
        <LoadingOverlay
          title="Preparing your feed…"
          subtitle={
            flags.randomize_avatars || flags.randomize_images
              ? "Almost ready..."
              : "Loading the feed."
          }
        />
      )}

      {loadingNextStageOverlay && (
        <LoadingOverlay
          title="Loading questions…"
          subtitle="Preparing the next stage"
        />
      )}

      {!onAdmin &&
        requiresFeedStage &&
        hasEntered &&
        !feedSubmitted &&
        !shouldShowPreface &&
        feedPhase === "error" && (
          <div
            className="modal-backdrop modal-backdrop-dim"
            role="dialog"
            aria-modal="true"
            aria-live="assertive"
          >
            <div
              className="modal modal-compact"
              style={{ textAlign: "center", paddingTop: 24 }}
            >
              <div
                className="spinner-ring"
                aria-hidden="true"
                style={{ display: "none" }}
              />
              <h3 style={{ margin: "0 0 6px" }}>Couldn’t load your feed</h3>
              <div
                style={{
                  color: "var(--muted)",
                  fontSize: ".95rem",
                  marginBottom: 12,
                }}
              >
                {feedError || "Network error or service unavailable."}
              </div>
              <div>
                <button className="btn" onClick={loadStudyContent}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

      {submitted && !completionState.redirected && (
        <ThankYouOverlay
          sessionId={sessionIdRef.current}
          title={linkedSurvey ? completionConfig.title : undefined}
          messageHtml={linkedSurvey ? completionConfig.messageHtml : undefined}
          completionCode={linkedSurvey ? completionConfig.code : undefined}
          hideSessionId={!!linkedSurvey}
        />
      )}
    </Router>
  );
}