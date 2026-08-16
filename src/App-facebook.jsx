import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./styles-facebook.css";

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
  pickDeterministic,
  getImagePool,
  getSurveyForFeedFromBackend,
  getSurveyBootFromBackend,
  getSurveyFromBackend,
  sendSurveyResponseToBackend,
  normalizeSurvey as normalizeFrontendSurvey,
  materializePagesFromBlocks,
  makeEmptySurveyResponses,
  validateSurveyResponses,
  getTrackingIdsFromUrl,
  getSurveyBootForFeedFromBackend,
  loadPostByIdFromBackend,
  assignExperimentGroup,
  useParticipantTheme,
  hasCompletedStudyLocally,
  markStudyCompletedLocally,
} from "./utils";

import { Feed as FBFeed } from "./ui-posts";
// Direct file import (not the per-app `./ui-posts` barrel) — this app is
// unambiguously Facebook, and `PageWithRails` below needs the exact same
// seeded-contacts builder + left-rail label lists `Feed`'s own rails use
// (ui-posts-facebook.jsx), so the two "realistic surroundings" renderers
// (this file's `PageWithRails`, the one actually wrapping the live
// participant feed, and `Feed`'s own rails, only reachable when `Feed` is
// mounted standalone e.g. the admin's Feed Preview) can't drift apart.
import {
  buildRailContacts,
  LEFT_RAIL_NAV_ITEMS,
  LEFT_RAIL_SHORTCUT_POOL,
  pickShortcutsForHeight,
  LEFT_RAIL_ICONS,
  LEFT_RAIL_SHORTCUT_ICONS,
  LEFT_RAIL_SHORTCUT_ICON_DEFAULT,
} from "./ui-posts/ui-posts-facebook";
import {
  ParticipantOverlay,
  ThankYouOverlay,
  RouteAwareTopbar,
  SkeletonFeed,
  LoadingOverlay,
  SurveyScreenMobile,
  SurveyScreen,
  SurveyPrefaceFlow,
  reminderPostFetchCache,
  reminderFlagsFetchCache,
  getReminderPostFeedId,
  getReminderApp,
  ParticipantThemeToggle,
} from "./ui-core";

import { AdminEntry } from "./admin/AdminEntry";

/* =========================================================================
   Facebook app with survey support
   Ported from the Instagram survey-enabled app while preserving Facebook styles.
   ========================================================================= */

/* =========================================================================
   Mode & helpers
   ======================================================================= */

const MODE = (
  new URLSearchParams(window.location.search).get("style") ||
  window.CONFIG?.STYLE ||
  "fb"
).toLowerCase();

if (typeof document !== "undefined") {
  document.body.classList.toggle("ig-mode", MODE === "ig");
  document.body.classList.toggle("fb-mode", MODE === "fb");
}

/* ------------------------- debug helpers -------------------------- */

const DEBUG_APP_LOAD = true;

function dbg(...args) {
  if (!DEBUG_APP_LOAD) return;
  console.log("[APP LOAD]", ...args);
}

function dbgWarn(...args) {
  if (!DEBUG_APP_LOAD) return;
  console.warn("[APP LOAD]", ...args);
}

function dbgGroup(label, obj) {
  if (!DEBUG_APP_LOAD) return;
  try {
    console.groupCollapsed(`[APP LOAD] ${label}`);
    console.log(obj);
    console.groupEnd();
  } catch {
    console.log(`[APP LOAD] ${label}`, obj);
  }
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
    // These three postdate this function (added for the opt-in realism
    // features) and have only ever had one name each — no legacy alias to
    // fall back to. Without listing them here explicitly, this whitelist-
    // style normalizer silently drops them even though the backend read
    // path (fetchFeedFlags/normalizeFlagsForRead, utils-backend.js) already
    // returns them correctly — the exact bug that made all three toggles a
    // no-op for real participants despite saving/reading fine in the admin
    // dashboard.
    realistic_engagement: truthy(f.realistic_engagement ?? false),
    realistic_engagement_randomize: truthy(f.realistic_engagement_randomize ?? false),
    realistic_pacing: truthy(f.realistic_pacing ?? false),
    realistic_surroundings: truthy(f.realistic_surroundings ?? false),
    realistic_surroundings_avatars: truthy(f.realistic_surroundings_avatars ?? false),
    // Same postdates-this-function, no-legacy-alias, must-list-explicitly
    // situation as the three realistic_* flags above.
    allow_dark_mode: truthy(f.allow_dark_mode ?? false),
  };
}


function normalizeFeedSequenceIds(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return Array.from(
    new Set(
      (Array.isArray(source) ? source : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

function isSurveyOnlyDeliveryMode(value) {
  return String(value || "").trim().toLowerCase() === "survey_only";
}

function isMultiFeedDeliveryMode(value) {
  return String(value || "").trim().toLowerCase() === "multi_feed_then_survey";
}

function getSurveyIdFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search);
    const hashQ = new URLSearchParams(window.location.hash.split("?")[1] || "");
    return String(
      q.get("survey_id") ||
        q.get("survey") ||
        hashQ.get("survey_id") ||
        hashQ.get("survey") ||
        ""
    ).trim();
  } catch {
    return "";
  }
}

// Survey-only direct-launch boot/definition loads used to be hardcoded GAS
// fetches here (bypassing isSupabaseBackend() entirely — a real gap found
// 2026-08-02, after the Supabase cutover, when a GAS transient error made a
// survey-only link look "broken"). getSurveyBootFromBackend/
// getSurveyFromBackend (utils-backend.js) already do exactly this, backend-
// agnostic, and are used unmodified below — the call sites' own delivery-mode
// normalization (see isSurveyOnlyDeliveryMode branches just below) already
// covers what this file's old normalizeSurveyOnlyRuntimeBoot duplicated.




const EXPERIMENT_GROUP_CACHE_PREFIX = "studyfeed:experiment_group";

// Caches the participant's assigned experiment group locally so a page
// reload doesn't need a fresh round trip. The backend assignment call is
// idempotent regardless (same session_id always gets the same group back),
// so this is purely an optimization, not a correctness requirement.
function experimentGroupCacheKey(projectId, surveyId, participantSeed) {
  return [
    EXPERIMENT_GROUP_CACHE_PREFIX,
    encodeURIComponent(String(projectId || "")),
    encodeURIComponent(String(surveyId || "")),
    encodeURIComponent(String(participantSeed || "")),
  ].join("::");
}

function readExperimentGroupCache(key) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return "";
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeExperimentGroupCache(key, groupId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(key, String(groupId || ""));
  } catch {
    // best-effort cache only
  }
}

const preloadedReminderImages = new Set();

async function preloadReminderImage(src, signal) {
  const url = String(src || "").trim();

  if (
    !url ||
    preloadedReminderImages.has(url) ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return;
  }

  preloadedReminderImages.add(url);

  await new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const img = new Image();
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      img.onload = null;
      img.onerror = null;
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    img.onload = finish;
    img.onerror = finish;
    signal?.addEventListener("abort", finish, { once: true });
    img.src = url;

    if (typeof img.decode === "function") {
      img.decode().then(finish).catch(() => {
        // onload/onerror will still complete the preload.
      });
    }
  });
}

function collectReminderImageUrls(post) {
  if (!post || typeof post !== "object") return [];

  const urls = new Set();
  const imageFieldNames = new Set([
    "avatar",
    "avatar_url",
    "avatarUrl",
    "profile_image",
    "profile_image_url",
    "profileImage",
    "profileImageUrl",
    "profile_photo",
    "profile_photo_url",
    "profilePhoto",
    "profilePhotoUrl",
    "profile_picture",
    "profile_picture_url",
    "profilePicture",
    "profilePictureUrl",
    "author_avatar",
    "author_avatar_url",
    "authorAvatar",
    "authorAvatarUrl",
    "image",
    "image_url",
    "imageUrl",
    "photo",
    "photo_url",
    "photoUrl",
    "thumbnail",
    "thumbnail_url",
    "thumbnailUrl",
    "poster",
    "poster_url",
    "posterUrl",
    "media_url",
    "mediaUrl",
  ]);

  function visit(value, key = "") {
    if (value == null) return;

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }

    if (typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => {
        visit(childValue, childKey);
      });
      return;
    }

    if (typeof value !== "string") return;

    const url = value.trim();
    if (!url) return;

    const looksLikeImageField =
      imageFieldNames.has(key) ||
      /avatar|profile.*(?:image|photo|picture)|image|photo|thumbnail|poster/i.test(
        key
      );

    if (
      looksLikeImageField &&
      (/^https?:\/\//i.test(url) ||
        url.startsWith("/") ||
        url.startsWith("data:image/"))
    ) {
      urls.add(url);
    }
  }

  visit(post);
  return Array.from(urls);
}

async function preloadReminderPostAssets(post, signal) {
  const imageUrls = collectReminderImageUrls(post);
  await Promise.allSettled(
    imageUrls.map((url) => preloadReminderImage(url, signal))
  );
}

async function preloadSurveyPostReminders({
  survey,
  fallbackFeedId = "",
  projectId = "",
  participantSeed = "",
  signal,
} = {}) {
  const pages = Array.isArray(survey?.pages) ? survey.pages : [];
  const uniqueTargets = new Map();

  pages.forEach((page) => {
    const questions = Array.isArray(page?.questions) ? page.questions : [];

    questions.forEach((question) => {
      if (String(question?.type || "").trim() !== "post_reminder") return;

      const postId = String(
        question?.post_id ?? question?.meta?.post_id ?? ""
      ).trim();
      // Use the exact same feed-id resolution PostReminderCard (ui-survey.jsx)
      // uses at render time — any divergence here (e.g. the visible_in_feeds
      // fallback it also checks) would prime the caches below under the
      // wrong key, silently making this preload a no-op.
      const feedId = getReminderPostFeedId(question, fallbackFeedId);

      if (!postId || !feedId) return;

      const applyFeedRandomization =
        (question?.apply_feed_randomization ??
          question?.meta?.apply_feed_randomization ??
          true) !== false;

      const key = [
        String(projectId || "").trim(),
        feedId,
        postId,
      ].join("::");

      const existing = uniqueTargets.get(key);
      if (!existing) {
        uniqueTargets.set(key, { feedId, postId, applyFeedRandomization });
      } else if (applyFeedRandomization) {
        existing.applyFeedRandomization = true;
      }
    });
  });

  if (!uniqueTargets.size) return [];

  const resolvedProjectId = projectId || getProjectIdUtil() || "";
  const reminderApp = getReminderApp();
  const runSeed = participantSeed || "survey-reminder-preview";

  return Promise.all(
    Array.from(uniqueTargets.values()).map(
      async ({ feedId, postId, applyFeedRandomization }) => {
        const post = await loadPostByIdFromBackend({
          projectId,
          feedId,
          postId,
          signal,
        });

        if (!post || signal?.aborted) return post;

        // Prime the same cache PostReminderCard reads from on mount, so it
        // skips its own "Loading post…" round trip entirely.
        reminderPostFetchCache.set(
          `${resolvedProjectId}::${feedId || ""}::${postId}`,
          post
        );

        await preloadReminderPostAssets(post, signal);

        if (!applyFeedRandomization || signal?.aborted) return post;

        // Fetch (and cache, under the exact key PostReminderCard reads from
        // on mount) the source feed's randomize flags up front. Without
        // this, PostReminderCard only starts this fetch once the survey
        // page is already visible, so the reminder first renders with
        // unrandomized defaults (e.g. the post's raw stored time, often
        // literally "Just now") and then visibly flips to the correctly
        // randomized version a beat later once that fetch resolves.
        const flagsCacheKey = `${resolvedProjectId}::${feedId || ""}`;
        let flags = reminderFlagsFetchCache.get(flagsCacheKey);
        if (!flags) {
          try {
            flags =
              (await fetchFeedFlags({
                app: reminderApp,
                projectId: resolvedProjectId,
                feedId,
                signal,
              })) || {};
          } catch {
            flags = {};
          }
          if (!signal?.aborted) {
            reminderFlagsFetchCache.set(flagsCacheKey, flags);
          }
        }

        if (signal?.aborted) return post;

        // When there's no stored "displayed post" snapshot to fall back
        // on (e.g. survey_only mode, where the participant never actually
        // viewed the feed), PostReminderCard (ui-survey.jsx) assigns a
        // real pool avatar instead of trusting the post's own (often
        // unset) avatarUrl. That assignment only happens once the survey
        // page renders the reminder, so without preloading the same pick
        // here too, the participant sees a blank/gray avatar circle for
        // as long as that pool-list + image fetch takes. Mirror the exact
        // same seed used there so we preload the same image it will pick.
        if (flags.randomize_avatars ?? flags.randomize_avatar) {
          try {
            const kind =
              post.authorType === "male" || post.authorType === "company"
                ? post.authorType
                : "female";
            const pool = await getAvatarPool(kind);
            const pick = pickDeterministic(pool, [
              runSeed,
              reminderApp || "app",
              resolvedProjectId || "proj",
              feedId || "feed",
              String(post.id ?? postId),
              "reminder-avatar",
            ]);
            if (pick && !signal?.aborted) {
              await preloadReminderImage(pick, signal);
            }
          } catch {
            // Best-effort preload only — the renderer still fetches/picks
            // its own avatar if this fails, just without the head start.
          }
        }

        // Same idea for the post's own content image: PostCard
        // (ui-posts-facebook.jsx) computes a randomized pool image itself,
        // in its own effect, whenever randomize_images is on — that pick
        // was never preloaded before, so the reminder's image visibly
        // loaded from scratch even though every *other* asset was warmed.
        // Mirror PostCard's exact seed shape (its own internal seedParts,
        // not the "reminder-avatar" shape above) so the same URL is picked.
        if (
          flags.randomize_images &&
          post.image &&
          post.imageMode !== "none"
        ) {
          const topic = String(post.topic || post.imageTopic || "").trim();
          if (topic) {
            try {
              const list = await getImagePool(topic);
              const pick = pickDeterministic(list, [
                runSeed,
                reminderApp || "app",
                resolvedProjectId || "proj",
                feedId || "feed",
                String(post.id ?? ""),
                "image",
              ]);
              if (pick && !signal?.aborted) {
                await preloadReminderImage(pick, signal);
              }
            } catch {
              // Best-effort preload only.
            }
          }
        }

        return post;
      }
    )
  );
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

function clearLegacyAppCaches() {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const keysToDelete = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("posts::") || key.startsWith("survey_boot::")) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    });
  } catch {}
}

function getSurveyBootCacheKey(projectId, feedId) {
  return `survey_boot::${projectId || ""}::${feedId || ""}`;
}

function readSurveyBootCache() {
  return null;
}

function writeSurveyBootCache() {}

function getPostsCacheKey(projectId, feedId) {
  return `posts::${projectId || ""}::${feedId || ""}`;
}

function readPostsCache() {
  return null;
}

function writePostsCache() {}

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

/* ---------- IG rails skeleton ----------- */

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

function PageWithRails({ children, flags, runSeed, app, projectId, feedId }) {
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

  // This component — not `Feed`'s own internal rails (ui-posts-facebook.jsx)
  // — is what actually wraps the live participant feed (see its call site
  // below), so "Realistic surroundings" has to be implemented here to have
  // any visible effect. `Feed`'s own rails are only reachable when `Feed` is
  // mounted standalone (e.g. the admin's Feed Preview) — both now share the
  // identical `buildRailContacts` generator so they can't drift apart.
  const realisticOn = !!flags?.realistic_surroundings;
  const [contacts, setContacts] = useState([]);

  // The real-content contact/shortcut rows are much shorter than the ghost
  // `RailBox`/`RailList` blocks `rightCount` above was tuned for (a compact
  // one-line-per-row list vs. tall skeleton cards), so reusing `rightCount`
  // directly left real mode visibly not filling the same vertical space the
  // ghost version did. Separate counts, tuned to the real rows' actual
  // ~52px height (bumped up from an earlier, more compact ~46px per direct
  // feedback that rows should be larger/more spaced — see the `.rail-real-
  // item`/`.rail-real-list` CSS), recomputed on the same resize listener.
  // With 12 nav rows now (up from the original 6), the nav block alone can
  // approach or exceed a shorter viewport's full rail height — `.rail--
  // content`'s own overflow-y:auto (styles-facebook.css) is the real safety
  // net against clipping regardless of screen size, but REAL_ROW_H is kept
  // a bit smaller than it could be specifically so at least 2 shortcuts
  // fit without needing to scroll on most ordinary viewport heights too.
  const [realRightCount, setRealRightCount] = useState(16);
  const [realShortcutsCount, setRealShortcutsCount] = useState(3);

  useEffect(() => {
    const compute = () => {
      const railH = (window.innerHeight || 900) - 30;
      const REAL_ROW_H = 52;
      const CONTACTS_HEADER_H = 90; // title + list container padding/border
      const rightN = Math.max(6, Math.min(Math.floor((railH - CONTACTS_HEADER_H) / REAL_ROW_H), 50));
      setRealRightCount(rightN);

      // Left rail's real content = fixed nav block (one row per
      // LEFT_RAIL_NAV_ITEMS entry) + "Your shortcuts" title + a height-
      // filling shortcuts list, capped low (4) so shortcuts stay a small
      // supplement to the nav list rather than dominating it — but always
      // at least 2 (Math.max below), never clipped to fewer/cut off
      // regardless of how little room `leftRemaining` computes to, since
      // the rail itself can now scroll to fit them (see `.rail--content`).
      const NAV_BLOCK_H = LEFT_RAIL_NAV_ITEMS.length * REAL_ROW_H + 24;
      const SHORTCUTS_HEADER_H = 90;
      const leftRemaining = railH - NAV_BLOCK_H - SHORTCUTS_HEADER_H;
      const shortcutsN = Math.max(
        2,
        Math.min(Math.floor(leftRemaining / REAL_ROW_H), LEFT_RAIL_SHORTCUT_POOL.length, 4)
      );
      setRealShortcutsCount(shortcutsN);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  useEffect(() => {
    if (!realisticOn) return undefined;
    let cancelled = false;
    (async () => {
      // "Realistic surroundings avatars" is a separate opt-in sub-toggle —
      // contacts only get a real avatar photo when it's on; off, they fall
      // back to the existing blank-circle placeholder (no pool fetch at
      // all, so turning this off also skips the extra network cost).
      const showAvatars = !!flags?.realistic_surroundings_avatars;
      const [femalePool, malePool] = showAvatars
        ? await Promise.all([getAvatarPool("female"), getAvatarPool("male")])
        : [[], []];
      if (cancelled) return;
      setContacts(buildRailContacts({ femalePool, malePool, runSeed, app, projectId, feedId, count: realRightCount }));
    })();
    return () => {
      cancelled = true;
    };
  }, [realisticOn, realRightCount, runSeed, app, projectId, feedId, flags?.realistic_surroundings_avatars]);

  return (
    <div
      className="page"
      style={{
        gridTemplateColumns:
          "minmax(0,2fr) minmax(var(--feed-min), var(--feed-max)) minmax(0,2.25fr)",
        columnGap: "var(--gap)",
      }}
    >
      {realisticOn ? (
        <aside className="rail rail-left rail--content" aria-hidden="true">
          <div className="rail-real-list">
            {LEFT_RAIL_NAV_ITEMS.map((label) => (
              <div key={label} className="rail-real-item">
                {LEFT_RAIL_ICONS[label]}
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="rail-real-title">Your shortcuts</div>
          <div className="rail-real-list">
            {pickShortcutsForHeight(realShortcutsCount).map((label) => (
              <div key={label} className="rail-real-item">
                {LEFT_RAIL_SHORTCUT_ICONS[label] || LEFT_RAIL_SHORTCUT_ICON_DEFAULT}
                <span>{label}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : (
        <aside className="rail rail-left" aria-hidden="true">
          <RailStack>
            <RailBanner tall />
            <RailBox largeAvatar />
            <RailList rows={5} />
            <RailBox />
            <RailBanner />
          </RailStack>
        </aside>
      )}

      <div className="container feed">{children}</div>

      {realisticOn ? (
        <aside className="rail rail-right rail--content" aria-hidden="true">
          <div className="rail-real-title">Contacts</div>
          <div className="rail-real-list">
            {contacts.map((c) => (
              <div key={c.id} className="rail-real-item">
                <span className="rail-contact-avatar-wrap">
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" className="rail-contact-avatar" loading="lazy" decoding="async" />
                  ) : (
                    <span className="rail-contact-avatar rail-contact-avatar--blank" />
                  )}
                  {c.online && <span className="rail-contact-online-dot" />}
                </span>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : (
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
      )}
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
  const surveyStartTsRef = useRef(null);

  const bootAbortRef = useRef(null);
  const surveyAbortRef = useRef(null);
  const contentAbortRef = useRef(null);
  const displayedPostSnapshotsRef = useRef(new Map());

  const handleDisplayedPostSnapshot = useCallback((snapshot) => {
    if (!snapshot || !snapshot.id) return;
    const key = `${snapshot.__snapshot_feed_id || ""}::${snapshot.id}`;
    displayedPostSnapshotsRef.current.set(key, snapshot);
  }, []);

  const trackingIds = useMemo(() => getTrackingIdsFromUrl(), []);
  const prefilledParticipantId = trackingIds.prolific_pid || "";

  const [isMobileSurvey, setIsMobileSurvey] = useState(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 700px)").matches
      : false
  );

  const [projectId, setProjectIdState] = useState(() => getProjectIdUtil() || "");

  const onAdmin =
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

  const [activeFeedId, setActiveFeedId] = useState(
    !onAdmin ? getFeedIdFromUrl() : null
  );

  const [feedSequenceIds, setFeedSequenceIds] = useState(() =>
    !onAdmin && getFeedIdFromUrl() ? [getFeedIdFromUrl()] : []
  );

  const [activeSurveyId, setActiveSurveyId] = useState(
    !onAdmin ? getSurveyIdFromUrl() : ""
  );

  // Courtesy guard against an honest participant reloading/double-clicking
  // after a successful submit and silently re-entering the whole flow only
  // to hit the real (server-side) duplicate-submission rejection at the very
  // end — see markStudyCompletedLocally's own comment in utils-core.js. Read
  // once, synchronously, from whichever launch param this page actually
  // loaded with.
  const [alreadyCompleted] = useState(() =>
    !onAdmin &&
    hasCompletedStudyLocally({
      app: APP,
      projectId: getProjectIdUtil() || "",
      feedId: getFeedIdFromUrl(),
      surveyId: getSurveyIdFromUrl(),
    })
  );

  const [posts, setPosts] = useState([]);
  const [feedPhase, setFeedPhase] = useState("idle");
  const [feedError, setFeedError] = useState("");

  const [bootPhase, setBootPhase] = useState(onAdmin ? "ready" : "idle");
  const [bootError, setBootError] = useState("");
  // Set when a feed-based launch link's feed_id doesn't match any real feed
  // in the project (2026-08-04, direct user request) — no longer falls back
  // to the project's "default"/first feed, since a stale or mistyped
  // feed_id should read as a broken link, not silently substitute a
  // different feed. Renders the same static 404 index.html itself shows
  // for a launch link missing feed/survey params entirely.
  const [feedNotFound, setFeedNotFound] = useState(false);
  useEffect(() => {
    if (feedNotFound && !alreadyCompleted) document.title = "404 Not Found";
  }, [feedNotFound, alreadyCompleted]);
  useEffect(() => {
    if (alreadyCompleted) document.title = "Already completed";
  }, [alreadyCompleted]);

  const [contentPhase, setContentPhase] = useState("idle");
  const [surveyOnlyPrereqPhase, setSurveyOnlyPrereqPhase] = useState("idle");

  const [surveyBoot, setSurveyBoot] = useState(null);
  const [linkedSurvey, setLinkedSurvey] = useState(null);
  const [surveyPhase, setSurveyPhase] = useState("idle");
  const [surveyResponses, setSurveyResponses] = useState({});
  const [surveyErrors, setSurveyErrors] = useState({});
  const [surveyErrorMsg, setSurveyErrorMsg] = useState("");
  const [prefaceCompleted, setPrefaceCompleted] = useState(false);

  const isDirectSurveyLaunch = !onAdmin && !!String(activeSurveyId || "").trim();

  // A feed accidentally linked to a delivery_mode:"survey_only" survey should
  // still show the feed when reached via the feed's own URL — "survey_only"
  // only means "skip the feed" for the survey's own direct launch link, not
  // for every feed that happens to be linked to it.
  const isSurveyOnlyMode =
    isDirectSurveyLaunch &&
    !!surveyBoot?.has_survey &&
    isSurveyOnlyDeliveryMode(surveyBoot?.delivery_mode);

  const requiresFeedStage = !isSurveyOnlyMode;
  const effectiveSurveyId = String(activeSurveyId || surveyBoot?.survey_id || "").trim();

  const effectiveFeedSequenceIds = useMemo(() => {
    const fromSurvey = normalizeFeedSequenceIds(
      linkedSurvey?.feed_sequence_ids,
      linkedSurvey?.linked_feed_ids
    );
    const fromBoot = normalizeFeedSequenceIds(
      surveyBoot?.feed_sequence_ids,
      surveyBoot?.linked_feed_ids
    );
    const fromState = normalizeFeedSequenceIds(feedSequenceIds);
    const source = fromSurvey.length ? fromSurvey : fromBoot.length ? fromBoot : fromState;
    if (source.length) return source;
    return activeFeedId ? [String(activeFeedId)] : [];
  }, [linkedSurvey, surveyBoot, feedSequenceIds, activeFeedId]);

  const activeFeedIndex = useMemo(() => {
    const idx = effectiveFeedSequenceIds.findIndex(
      (fid) => String(fid) === String(activeFeedId || "")
    );
    return idx < 0 ? 0 : idx;
  }, [effectiveFeedSequenceIds, activeFeedId]);

  const hasNextFeedStage =
    requiresFeedStage &&
    effectiveFeedSequenceIds.length > 1 &&
    activeFeedIndex < effectiveFeedSequenceIds.length - 1;

  const nextFeedIdInSequence = hasNextFeedStage
    ? effectiveFeedSequenceIds[activeFeedIndex + 1]
    : "";

  const completionConfig = useMemo(
    () => getSurveyCompletionConfig(linkedSurvey),
    [linkedSurvey]
  );

  const [completionState, setCompletionState] = useState({
    redirected: false,
  });

  const [feedSubmitted, setFeedSubmitted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Set synchronously the instant Submit is clicked, when we already know
  // (independent of the network write below) that this submit is heading
  // into a linked survey — covers the real gap the "awkward transition"
  // report was about: without this, nothing visually changes between the
  // click and sendToSheet resolving (feedSubmitted/the loading overlay only
  // flip on *after* that write finishes), so a slow write left the
  // participant looking at an inert, merely-disabled feed with no feedback.
  const [submittingToSurvey, setSubmittingToSurvey] = useState(false);

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

  const [randomize, setRandomize] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [toast, setToast] = useState(null);
  const [events, setEvents] = useState([]);
  const [adminAuthed, setAdminAuthed] = useState(false);

  const [vpOff, setVpOff] = useState({ top: 0, bottom: 0 });
  const [showSkeletonLayer, setShowSkeletonLayer] = useState(true);

  const [runSeed] = useState(() =>
    crypto?.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  useEffect(() => () => clearTimeout(minDelayTimerRef.current), []);

  useEffect(() => {
    clearLegacyAppCaches();
  }, []);

  useEffect(() => {
    dbg("state: phases", {
      bootPhase,
      contentPhase,
      surveyOnlyPrereqPhase,
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
    surveyOnlyPrereqPhase,
    feedPhase,
    surveyPhase,
    flagsReady,
    assetsReady,
    minDelayDone,
    hasEntered,
    feedSubmitted,
    submitted,
    activeFeedId,
    effectiveFeedSequenceIds,
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
      const isAdmin = window.location.pathname.startsWith("/admin");
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

  const participantDisplayId = useMemo(() => {
    return (
      getQueryParamEverywhere("PROLIFIC_PID") ||
      getQueryParamEverywhere("participant_id") ||
      ""
    );
  }, [activeFeedId, projectId]);

  const log = useCallback((action, meta = {}) => {
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
  }, [participantId]);

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

  const resolveChosenFeed = useCallback(
    async (signal) => {
      const t = timerStart("resolveChosenFeed", {
        projectId,
        urlFeedId: getFeedIdFromUrl(),
      });

      try {
        const feedsList = await listFeedsFromBackend({ signal });

        if (signal?.aborted) {
          t.end({ aborted: true });
          return null;
        }

        // No more falling back to the project's default/first feed — a
        // feed-based launch link's feed_id is expected to always match a
        // real feed (2026-08-04, direct user request); anything else reads
        // as a broken/stale link, not "just show them something."
        const urlFeedId = getFeedIdFromUrl();
        const chosen = (feedsList || []).find((f) => f.feed_id === urlFeedId) || null;

        t.end({
          feedsCount: (feedsList || []).length,
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

    const t = timerStart("startBoot", { projectId, activeSurveyId });

    bootAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    bootAbortRef.current = ctrl;

    setBootPhase("loading");
    setBootError("");
    setFeedNotFound(false);

    setSurveyBoot(null);
    setFeedSequenceIds([]);
    setLinkedSurvey(null);
    setSurveyPhase("idle");
    setSurveyResponses({});
    setSurveyErrors({});
    setSurveyErrorMsg("");

    setPosts([]);
    setFeedPhase("idle");
    setFeedError("");
    setContentPhase("idle");
    setSurveyOnlyPrereqPhase("idle");
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
      if (isDirectSurveyLaunch) {
        const boot = await getSurveyBootFromBackend(activeSurveyId, {
          projectId: projectId || undefined,
          signal: ctrl.signal,
        });

        if (ctrl.signal.aborted) {
          t.end({ aborted: true });
          return;
        }

        if (!boot || !boot.has_survey) {
          throw new Error("Failed to load the survey.");
        }

        const deliveryMode = String(boot.delivery_mode || "survey_only");
        const rawSequence = normalizeFeedSequenceIds(
          boot.feed_sequence_ids,
          boot.linked_feed_ids
        );
        const sequence = isSurveyOnlyDeliveryMode(deliveryMode) ? [] : rawSequence;
        const firstFeedId = !isSurveyOnlyDeliveryMode(deliveryMode)
          ? (sequence[0] || boot.preferred_feed_id || "")
          : "";

        setFeedSequenceIds(sequence);
        if (firstFeedId) {
          setActiveFeedId(firstFeedId);
          try {
            setFeedIdInUrl(firstFeedId, { replace: true });
          } catch {}
        }

        setSurveyBoot({
          ...boot,
          has_survey: true,
          survey_id: String(boot.survey_id || activeSurveyId || ""),
          trigger: isSurveyOnlyDeliveryMode(deliveryMode)
            ? ""
            : String(boot.trigger || "after_feed_submit"),
          delivery_mode: deliveryMode,
          linked_feed_ids: sequence,
          feed_sequence_ids: sequence,
          preferred_feed_id: firstFeedId || "",
        });
        setBootPhase("ready");
        t.end({ surveyLaunch: true, survey_id: boot.survey_id || activeSurveyId });
        return;
      }

      const chosen = await resolveChosenFeed(ctrl.signal);

      if (ctrl.signal.aborted) {
        t.end({ aborted: true });
        return;
      }

      if (!chosen) {
        setFeedNotFound(true);
        setBootPhase("error");
        t.end({ feedNotFound: true });
        return;
      }

      const chosenFeedId = chosen.feed_id;
      setActiveFeedId(chosenFeedId);
      setFeedSequenceIds([chosenFeedId]);

      try {
        setFeedIdInUrl(chosenFeedId, { replace: true });
      } catch {}

      let nextBoot = {
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
            linked_feed_ids: normalizeFeedSequenceIds(
              freshBoot.linked_feed_ids,
              [chosenFeedId]
            ),
            feed_sequence_ids: normalizeFeedSequenceIds(
              freshBoot.feed_sequence_ids,
              freshBoot.linked_feed_ids || [chosenFeedId]
            ),
            preferred_feed_id: String(freshBoot.preferred_feed_id || chosenFeedId),
          };
          setFeedSequenceIds(nextBoot.feed_sequence_ids || nextBoot.linked_feed_ids || [chosenFeedId]);
          writeSurveyBootCache(projectId, chosenFeedId, nextBoot);
        }
      } catch (e) {
        dbgWarn("survey boot fetch failed, using default boot", e);
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
  }, [onAdmin, projectId, resolveChosenFeed, activeSurveyId, isDirectSurveyLaunch]);

  const ensureSurveyLoaded = useCallback(async () => {
    if (onAdmin) {
      dbg("ensureSurveyLoaded skipped", { reason: "onAdmin" });
      return null;
    }
    if (!surveyBoot?.has_survey && !effectiveSurveyId) {
      dbg("ensureSurveyLoaded skipped", { reason: "no_survey_context" });
      return null;
    }
    if (!isDirectSurveyLaunch && !activeFeedId) {
      dbg("ensureSurveyLoaded skipped", { reason: "no_activeFeedId" });
      return null;
    }
    if (linkedSurvey) {
      dbg("ensureSurveyLoaded skipped", { reason: "linkedSurvey_already_loaded" });
      return linkedSurvey;
    }

    const t = timerStart("ensureSurveyLoaded", {
      projectId,
      activeFeedId,
      effectiveSurveyId,
      isDirectSurveyLaunch,
      surveyBoot,
    });

    

    surveyAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    surveyAbortRef.current = ctrl;

    setSurveyPhase("loading");
    setSurveyErrorMsg("");

    try {
      const surveyDef = isDirectSurveyLaunch
        ? await getSurveyFromBackend(effectiveSurveyId, {
            projectId: projectId || undefined,
            signal: ctrl.signal,
            force: true,
          }).catch(() => null)
        : await getSurveyForFeedFromBackend(activeFeedId, {
            projectId: projectId || undefined,
            signal: ctrl.signal,
            force: true,
            knownLink: surveyBoot?.survey_id
              ? { survey_id: surveyBoot.survey_id, trigger: surveyBoot.trigger }
              : null,
          }).catch(() => null);

      if (ctrl.signal.aborted) {
        t.end({ aborted: true });
        return null;
      }

      const normalizedSurveyRaw = surveyDef
        ? normalizeFrontendSurvey(surveyDef)
        : null;

      const loadedDeliveryMode = String(
        normalizedSurveyRaw?.delivery_mode || surveyBoot?.delivery_mode || ""
      ).trim().toLowerCase();
      const loadedIsSurveyOnly = isSurveyOnlyDeliveryMode(loadedDeliveryMode);

      const normalizedSurveyBase = normalizedSurveyRaw && loadedIsSurveyOnly
        ? {
            ...normalizedSurveyRaw,
            delivery_mode: "survey_only",
            linked_feed_ids: [],
            feed_sequence_ids: [],
            preferred_feed_id: "",
            trigger: "",
          }
        : normalizedSurveyRaw;

      const surveyParticipantSeed =
        participantId || sessionIdRef.current || "";

      const experimentGroups = Array.isArray(
        normalizedSurveyBase?.experiment_groups
      )
        ? normalizedSurveyBase.experiment_groups
        : [];

      let assignedGroupId = "";
      if (normalizedSurveyBase && experimentGroups.length) {
        const groupCacheKey = experimentGroupCacheKey(
          projectId,
          normalizedSurveyBase.survey_id,
          surveyParticipantSeed
        );
        assignedGroupId = readExperimentGroupCache(groupCacheKey);

        if (!assignedGroupId) {
          assignedGroupId =
            (await assignExperimentGroup({
              projectId: projectId || undefined,
              surveyId: normalizedSurveyBase.survey_id,
              sessionId: sessionIdRef.current,
              participantId,
            })) || "";

          if (ctrl.signal.aborted) {
            t.end({ aborted: true });
            return null;
          }

          if (assignedGroupId) {
            writeExperimentGroupCache(groupCacheKey, assignedGroupId);
          }
        }
      }

      // A group can define its own feed_sequence_ids, overriding the
      // survey's default sequence for whichever group a participant lands
      // in — but only for participants who arrived via the plain survey
      // link (no ?feed_id= already pinned); an explicit feed URL always
      // wins, same precedent as the survey_only-linked-feed fix elsewhere
      // in this file. Baked into normalizedSurveyBase itself (not just
      // local state) — the same pattern the survey_only override above
      // already uses — because effectiveFeedSequenceIds (the memo
      // everything downstream keys off: "next feed" UI, submit-time
      // feed_sequence_ids sent to the backend) reads linkedSurvey.
      // feed_sequence_ids/linked_feed_ids first, ahead of any local state.
      const assignedGroupForFeeds = assignedGroupId
        ? experimentGroups.find((g) => String(g?.id) === assignedGroupId)
        : null;
      const groupFeedSequence =
        !loadedIsSurveyOnly && isDirectSurveyLaunch
          ? normalizeFeedSequenceIds(assignedGroupForFeeds?.feed_sequence_ids, [])
          : [];

      const normalizedSurveyForGroup =
        groupFeedSequence.length && normalizedSurveyBase
          ? {
              ...normalizedSurveyBase,
              linked_feed_ids: groupFeedSequence,
              feed_sequence_ids: groupFeedSequence,
            }
          : normalizedSurveyBase;

      const normalizedSurvey = normalizedSurveyForGroup
        ? {
            ...normalizedSurveyForGroup,
            experiment_assigned_group_id: assignedGroupId,
            pages: materializePagesFromBlocks(
              normalizedSurveyForGroup,
              normalizedSurveyForGroup.page_blocks,
              {
                participantSeed: surveyParticipantSeed,
                randomize: true,
                assignedGroupId,
              }
            ),
          }
        : null;

      const normalizedSequence = loadedIsSurveyOnly
        ? []
        : normalizeFeedSequenceIds(
            normalizedSurvey?.feed_sequence_ids,
            normalizedSurvey?.linked_feed_ids
          );
      if (normalizedSequence.length) {
        setFeedSequenceIds(normalizedSequence);
      }

      if (!loadedIsSurveyOnly && isDirectSurveyLaunch && normalizedSequence.length) {
        const nextFirstFeedId = String(normalizedSequence[0] || "");
        // startBoot already guessed a first feed from the survey's default
        // sequence (before the group was known) and rewrote the URL to
        // match; correct both here if the group's sequence picked a
        // different feed. Harmless no-op otherwise (including the
        // no-groups case, where nextFirstFeedId is exactly what startBoot
        // already guessed).
        if (nextFirstFeedId && nextFirstFeedId !== activeFeedId) {
          setActiveFeedId(nextFirstFeedId);
          try {
            setFeedIdInUrl(nextFirstFeedId, { replace: true });
          } catch {}
        }
      }

      if (normalizedSurvey) {
        await preloadSurveyPostReminders({
          survey: normalizedSurvey,
          fallbackFeedId: activeFeedId || "",
          projectId: projectId || undefined,
          participantSeed: surveyParticipantSeed,
          signal: ctrl.signal,
        });

        if (ctrl.signal.aborted) {
          t.end({ aborted: true });
          return null;
        }
      }

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
        pageBlocks: normalizedSurvey?.page_blocks?.length || 0,
        randomizedPageBlocks:
          normalizedSurvey?.page_blocks?.filter(
            (block) => block?.randomize_pages
          ).length || 0,
        surveyParticipantSeed,
      });

      return normalizedSurvey;
    } catch (e) {
      if (e?.name === "AbortError") {
        t.end({ aborted: true });
        return null;
      }
      dbgWarn("Survey load failed:", e);
      setSurveyPhase("error");
      setSurveyErrorMsg(e?.message || "Failed to load the survey.");
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
    projectId,
    effectiveSurveyId,
    isDirectSurveyLaunch,
    participantId,
  ]);

  // Start loading the full survey (survey definition + all post-reminder
  // preloading) as soon as we know one is linked, instead of waiting for the
  // participant to click through participant-information/consent/
  // instructions first. That screen is otherwise dead time from a loading
  // perspective — the participant is reading, not waiting. ensureSurveyLoaded
  // short-circuits once linkedSurvey is set, so this doesn't add an extra
  // fetch: it just moves the same work earlier so it's often already done by
  // the time the participant reaches hasEntered.
  useEffect(() => {
    if (onAdmin || linkedSurvey) return;
    if (bootPhase !== "ready" || !surveyBoot?.has_survey) return;
    ensureSurveyLoaded();
  }, [onAdmin, linkedSurvey, bootPhase, surveyBoot?.has_survey, ensureSurveyLoaded]);

  const preloadSurveyOnlyAssets = useCallback(async () => {
    const t = timerStart("preloadSurveyOnlyAssets", {
      projectId,
      activeFeedId,
      isDirectSurveyLaunch,
    });

    try {
      setSurveyOnlyPrereqPhase("loading");
      setContentPhase("loading");

      // Survey-only mode should not hidden-load the full feed.
      // Reminder posts are preloaded while ensureSurveyLoaded prepares the survey.
      setFlagsReady(true);
      setAssetsReady(true);
      setMinDelayDone(true);
      setContentPhase("ready");
      setSurveyOnlyPrereqPhase("ready");

      t.end({ skippedHiddenFeedPreload: true });
      return true;
    } catch (e) {
      if (e?.name === "AbortError") {
        t.end({ aborted: true });
        return false;
      }
      dbgWarn("Survey-only preparation failed:", e);
      setSurveyOnlyPrereqPhase("error");
      setContentPhase("error");
      t.fail(e);
      return false;
    }
  }, [projectId, activeFeedId, isDirectSurveyLaunch]);

  const loadStudyContent = useCallback(async (feedIdOverride = null) => {
    const targetFeedId = String(feedIdOverride || activeFeedId || "").trim();
    if (onAdmin || !targetFeedId) return;
    if (contentPhase === "loading") return;

    const t = timerStart("loadStudyContent", {
      projectId,
      activeFeedId: targetFeedId,
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
      const postsPromise = (async () => {
        const tp = timerStart("content.posts", {
          activeFeedId: targetFeedId,
          source: "backend_only",
        });
        try {
          const result = await loadPostsFromBackend(targetFeedId, {
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
          activeFeedId: targetFeedId,
          projectId,
        });
        try {
          const result = await fetchFeedFlags({
            app: APP,
            projectId: projectId || undefined,
            feedId: targetFeedId || undefined,
            project_id: projectId || undefined,
            feed_id: targetFeedId || undefined,
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
      const sid = getSurveyIdFromUrl();
      const pid = getProjectIdUtil();

      dbg("URL changed", {
        fid,
        sid,
        pid,
        activeFeedId,
        activeSurveyId,
      });

      if (pid) {
        setProjectIdUtil(pid, { persist: true, updateUrl: false });
      }

      const feedChanged = String(fid || "") !== String(activeFeedId || "");
      const surveyChanged = String(sid || "") !== String(activeSurveyId || "");

      if (feedChanged) {
        setActiveFeedId(fid || null);
      }
      if (surveyChanged) {
        setActiveSurveyId(sid || "");
      }
      if (feedChanged || surveyChanged) {
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
  }, [activeFeedId, activeSurveyId, startBoot]);

  useEffect(() => {
    if (onAdmin && hasAdminSession()) setAdminAuthed(true);
  }, [onAdmin]);

  const shouldShowPreface =
    !onAdmin &&
    bootPhase === "ready" &&
    !hasEntered &&
    !feedSubmitted &&
    !!surveyBoot?.has_survey &&
    !!surveyBoot?.has_preface &&
    !prefaceCompleted;

  const shouldSkipParticipantOverlay =
    !onAdmin &&
    bootPhase === "ready" &&
    !!surveyBoot?.has_survey;

  const shouldShowParticipantOverlay =
    !onAdmin &&
    bootPhase === "ready" &&
    !hasEntered &&
    !prefaceCompleted &&
    !shouldShowPreface &&
    !shouldSkipParticipantOverlay;

  useEffect(() => {
    if (shouldShowPreface && !enterTsRef.current) {
      enterTsRef.current = now();
    }
  }, [shouldShowPreface]);

  useEffect(() => {
    if (!shouldSkipParticipantOverlay || hasEntered || shouldShowPreface) return;

    const id = prefilledParticipantId || "";
    const ts = now();

    if (isSurveyOnlyMode) {
      setSurveyPhase((prev) =>
        prev === "ready" || prev === "submitting" || prev === "error"
          ? prev
          : "loading"
      );
      setSurveyOnlyPrereqPhase((prev) =>
        prev === "ready" || prev === "error" ? prev : "loading"
      );
      setContentPhase((prev) =>
        prev === "ready" || prev === "error" ? prev : "loading"
      );
    } else {
      setContentPhase("loading");
      setFeedPhase("loading");
      setFeedError("");
      setFlagsReady(false);
      setAssetsReady(false);
    }

    setParticipantId(id);
    setHasEntered(true);
    enterTsRef.current = ts;
    lastNonScrollTsRef.current = null;

    log("participant_id_auto_entered", {
      id,
      feed_id: activeFeedId || null,
      project_id: projectId || null,
      reason: "survey_present_no_overlay",
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

    let cancelled = false;

    (async () => {
      if (isSurveyOnlyMode) {
        const [loadedSurvey, preloadOk] = await Promise.all([
          ensureSurveyLoaded(),
          preloadSurveyOnlyAssets(),
        ]);

        if (cancelled) return;

        if (!loadedSurvey) {
          setSurveyPhase("error");
          setSurveyErrorMsg("Failed to load the survey.");
        } else if (!preloadOk) {
          setSurveyPhase("error");
          setSurveyErrorMsg("Failed to prepare the survey content.");
        } else {
          scrollSurveyViewToTop();
        }
      } else {
        await loadStudyContent();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    shouldSkipParticipantOverlay,
    hasEntered,
    shouldShowPreface,
    prefilledParticipantId,
    isSurveyOnlyMode,
    activeFeedId,
    projectId,
    ensureSurveyLoaded,
    preloadSurveyOnlyAssets,
    loadStudyContent,
    log,
    scrollSurveyViewToTop,
  ]);

  const surveyOnlyReady =
    isSurveyOnlyMode &&
    !!linkedSurvey &&
    surveyPhase === "ready" &&
    surveyOnlyPrereqPhase === "ready";

  const shouldShowSurvey =
    !onAdmin &&
    hasEntered &&
    !submitted &&
    !!linkedSurvey &&
    (
      isSurveyOnlyMode
        ? surveyOnlyReady ||
          surveyPhase === "submitting" ||
          surveyPhase === "error"
        : feedSubmitted
    ) &&
    (surveyPhase === "ready" ||
      surveyPhase === "submitting" ||
      surveyPhase === "error");

  useEffect(() => {
  surveyStartTsRef.current = null;
}, [linkedSurvey?.survey_id, activeFeedId, hasEntered]);

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

  // Dark mode is opt-in per stage: the feed's own allow_dark_mode flag
  // while browsing the feed, the linked survey's own allow_dark_mode flag
  // once on a preface/question page — the survey's setting always wins for
  // what actually renders there, regardless of what the feed allowed.
  // useParticipantTheme keeps a participant's chosen preference around
  // underneath this gate, so a choice made during the feed reappears
  // automatically on a survey that also allows dark mode, with no extra
  // click needed.
  const stageAllowsDark =
    !onAdmin &&
    ((shouldShowSurvey || shouldShowPreface)
      ? !!linkedSurvey?.allow_dark_mode
      : !!flags.allow_dark_mode);
  const { isDark: participantIsDark, toggle: toggleParticipantTheme } = useParticipantTheme(stageAllowsDark);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("dark-mode", participantIsDark);
    return () => {
      document.body.classList.remove("dark-mode");
    };
  }, [participantIsDark]);

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
        surveyPhase === "loading" ||
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

  useEffect(() => {
  if (shouldShowSurvey && !surveyStartTsRef.current) {
    surveyStartTsRef.current = Date.now();
  }
}, [shouldShowSurvey]);


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
      markStudyCompletedLocally({
        app: APP,
        projectId,
        feedId: activeFeedId,
        surveyId: activeSurveyId,
      });
      setSubmitted(true);
    }
  }, [feedSubmitted, linkedSurvey, surveyPhase, projectId, activeFeedId, activeSurveyId]);

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

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
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
    markStudyCompletedLocally({
      app: APP,
      projectId,
      feedId: activeFeedId,
      surveyId: activeSurveyId,
    });

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
  }, [linkedSurvey, completionConfig, projectId, activeFeedId, activeSurveyId]);

  const handleSurveySubmit = useCallback(async () => {
    if (!linkedSurvey) return;

    const t = timerStart("handleSurveySubmit", {
      surveyId: linkedSurvey.survey_id,
      feedId: activeFeedId,
      projectId,
    });

    const validation = validateSurveyResponses(linkedSurvey, surveyResponses, { feedId: activeFeedId });

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
      const submittedAtIso = new Date().toISOString();
      const submittedAtMs = Date.now();
      const enteredAtMs = enterTsRef.current || surveyStartTsRef.current || null;
      const durationMs =
        enteredAtMs && submittedAtMs >= enteredAtMs
          ? submittedAtMs - enteredAtMs
          : 0;

      const ok = await sendSurveyResponseToBackend({
        survey_id: linkedSurvey.survey_id,
        feed_id: (effectiveFeedSequenceIds[effectiveFeedSequenceIds.length - 1] || activeFeedId || ""),
        project_id: projectId || "",
        session_id: sessionIdRef.current,
        participant_id: participantId || "",
        responses: surveyResponses,
        entered_at_iso: enteredAtMs ? fmtTime(enteredAtMs) : "",
        submitted_at_iso: submittedAtIso,
        duration_ms: durationMs,
        experiment_group_id: linkedSurvey.experiment_assigned_group_id || "",
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


  const advanceToNextFeed = useCallback(async (nextFeedId) => {
    const fid = String(nextFeedId || "").trim();
    if (!fid) return false;

    setEvents([]);
    setPosts([]);
    setFeedPhase("loading");
    setContentPhase("loading");
    setFeedError("");
    setFlagsReady(false);
    setAssetsReady(false);
    setMinDelayDone(true);
    minDelayStartedRef.current = false;
    clearTimeout(minDelayTimerRef.current);

    setActiveFeedId(fid);
    try {
      setFeedIdInUrl(fid, { replace: true });
    } catch {}

    submitTsRef.current = null;
    lastNonScrollTsRef.current = null;
    viewRefs.current?.clear?.();

    await loadStudyContent(fid);
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("resize"));
    });
    return true;
  }, [loadStudyContent]);

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
    log,
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

  // Covers the gap between clicking Submit and sendToSheet resolving —
  // submittingToSurvey is set synchronously on click (before that network
  // write), so this overlay appears with zero delay instead of leaving the
  // participant looking at a merely-disabled feed until the write finishes
  // and loadingNextStageOverlay (below) takes over.
  const submittingToSurveyOverlay =
    !onAdmin && !feedSubmitted && submittingToSurvey;

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

  const showSurveyOnlyLoadingOverlay =
    !onAdmin &&
    hasEntered &&
    isSurveyOnlyMode &&
    !submitted &&
    !shouldShowSurvey &&
    !shouldShowPreface &&
    (surveyPhase === "loading" ||
      surveyOnlyPrereqPhase === "loading" ||
      !linkedSurvey ||
      surveyOnlyPrereqPhase !== "ready");

  const shouldBlurShell =
    !onAdmin &&
    !shouldShowSurvey &&
    !shouldShowPreface &&
    !showSurveyOnlyLoadingOverlay &&
    (bootPhase === "loading" ||
      !hasEntered ||
      (requiresFeedStage && contentPhase === "loading") ||
      (requiresFeedStage && feedPhase !== "ready") ||
      surveyPhase === "loading" ||
      submitted ||
      (requiresFeedStage && !flagsReady) ||
      (requiresFeedStage && !assetsReady) ||
      (requiresFeedStage && !minDelayDone));

  useEffect(() => {
    dbgGroup("overlay selectors", {
      loadingStudyOverlay,
      showBootError,
      shouldShowParticipantOverlay,
      shouldShowPreface,
      showSurveyOnlyLoadingOverlay,
      preparingFeedOverlay,
      loadingNextStageOverlay,
      submittingToSurveyOverlay,
      shouldShowSurvey,
      shouldBlurShell,
      canShowFeed,
      gateOpen,
      showSkeletonLayer,
    });
  }, [
    loadingStudyOverlay,
    showBootError,
    shouldShowParticipantOverlay,
    shouldShowPreface,
    showSurveyOnlyLoadingOverlay,
    preparingFeedOverlay,
    loadingNextStageOverlay,
    submittingToSurveyOverlay,
    shouldShowSurvey,
    shouldBlurShell,
    canShowFeed,
    gateOpen,
    showSkeletonLayer,
  ]);

  useEffect(() => {
    let routeBranch = "none";
    if (shouldShowSurvey) routeBranch = "survey";
    else if (shouldShowPreface) routeBranch = "preface";
    else if (showSurveyOnlyLoadingOverlay) routeBranch = "survey_only_loading";
    else if (requiresFeedStage) routeBranch = "feed_stage";
    dbg("route branch", { routeBranch });
  }, [
    shouldShowSurvey,
    shouldShowPreface,
    showSurveyOnlyLoadingOverlay,
    requiresFeedStage,
  ]);

  const activeLoadingOverlay =
    loadingStudyOverlay ? { title: "Loading study…", subtitle: "Checking the study setup" } :
    showSurveyOnlyLoadingOverlay ? { title: "Loading questions…", subtitle: "Preparing the survey" } :
    preparingFeedOverlay ? {
      title: "Preparing your feed…",
      subtitle:
        flags.randomize_avatars || flags.randomize_images
          ? "Almost ready..."
          : "Loading the feed.",
    } :
    // Both quiet — this whole click-to-survey transition often resolves in
    // well under a second, and a title/subtitle overlay just flashes there
    // unreadably (see LoadingOverlay's `quiet` prop / .quiet-transition-
    // backdrop CSS for the full rationale).
    loadingNextStageOverlay ? { quiet: true } :
    submittingToSurveyOverlay ? { quiet: true } :
    null;

  // A courtesy guard, not the real security boundary (that's server-side —
  // see markStudyCompletedLocally's comment in utils-core.js): this browser
  // already completed this exact launch link once. Checked (and rendered)
  // before feedNotFound below, deliberately — if a feed is ever deleted
  // *after* a participant completed it, they should still see "already
  // completed," not a confusing 404. (The boot fetch itself still runs in
  // the background either way — not worth threading this into that async
  // chain just to skip one wasted request for a rare edge case.)
  if (!onAdmin && alreadyCompleted) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
          color: "#444",
          textAlign: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>Already completed</h1>
          <p style={{ fontSize: 15, margin: 0, color: "#777" }}>
            It looks like you've already completed this study on this device. If you believe
            this is a mistake, please contact the researcher.
          </p>
        </div>
      </div>
    );
  }

  // A feed-based launch link whose feed_id doesn't match any real feed in
  // the project — same static 404 index.html's own bootstrap script shows
  // for a launch link missing feed/survey params entirely (see index.html),
  // reproduced here since that check runs before this app bundle even
  // loads and can't see per-project feed data. Replaces the whole app
  // shell, not a dialog over it — this isn't "something went wrong," it's
  // "this isn't a valid page."
  if (!onAdmin && feedNotFound) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
          color: "#444",
          textAlign: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>404</h1>
          <p style={{ fontSize: 15, margin: 0, color: "#777" }}>This page could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className={`app-shell ${shouldBlurShell ? "blurred" : ""}`}>
        <RouteAwareTopbar flags={flags} />

        {stageAllowsDark && (
          <ParticipantThemeToggle isDark={participantIsDark} onToggle={toggleParticipantTheme} />
        )}

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
                      projectId={projectId}
                      flags={flags}
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
                      projectId={projectId}
                      flags={flags}
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
                      onComplete={() => {
                        dbg("preface onComplete fired", {
                          isSurveyOnlyMode,
                          surveyPhaseBefore: surveyPhase,
                          prereqPhaseBefore: surveyOnlyPrereqPhase,
                          hasLinkedSurveyBefore: !!linkedSurvey,
                        });

                        if (!enterTsRef.current) {
                          enterTsRef.current = now();
                        }
                        setPrefaceCompleted(true);
                        scrollSurveyViewToTop();
                      }}
                    />
                  ) : (
                    <LoadingOverlay
                      title="Loading study…"
                      subtitle="Preparing the first page"
                    />
                  )}
                </div>
              ) : requiresFeedStage ? (
                <PageWithRails flags={flags} runSeed={runSeed} app={APP} projectId={projectId} feedId={activeFeedId}>
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
                        <FBFeed
                          posts={orderedPosts}
                          registerViewRef={registerViewRef}
                          disabled={disabled}
                          log={log}
                          showComposer={false}
                          loading={false}
                          // PageWithRails (above) already renders the real
                          // left/right rails — Feed's own internal copy is
                          // only meant for when it's mounted standalone
                          // (the admin's Feed Preview). Without this, Feed
                          // still renders its own rail-left/rail-right
                          // nested inside PageWithRails' narrow feed column,
                          // a real second copy of the whole nav/shortcuts/
                          // contacts list, not just a CSS sizing detail.
                          showRails={false}
                          flags={flags}
                          runSeed={runSeed}
                          app={APP}
                          projectId={projectId}
                          submitButtonLabel={
                            hasNextFeedStage
                              ? `Submit Feed ${activeFeedIndex + 1} & Continue to Feed ${activeFeedIndex + 2}`
                              : surveyBoot?.has_survey
                                ? "Submit Feed & Continue to Questions"
                                : "Submit Feed"
                          }
                          feedId={activeFeedId}
                          avatarPools={avatarPools}
                          participantSeed={participantId || sessionIdRef.current}
                          onDisplayedPostSnapshot={handleDisplayedPostSnapshot}
                          onSubmit={async () => {
                            if (feedSubmitted || submitted || disabled) return;

                            const t = timerStart("feedSubmit", {
                              activeFeedId,
                              projectId,
                              postsCount: posts.length,
                              eventsCount: events.length,
                            });

                            setDisabled(true);

                            // Known synchronously, independent of the
                            // network write below — used to show a loading
                            // overlay immediately on click instead of only
                            // once sendToSheet resolves. Covers BOTH forward
                            // transitions (to the next feed in a multi-feed
                            // sequence, or on to the survey) — originally
                            // this only covered the to-survey case, leaving
                            // a real dead gap (submit button just disabled,
                            // nothing visibly happening) during the network
                            // write on every non-final feed of a multi-feed
                            // study. submittingToSurveyOverlay/loadingNextStageOverlay
                            // below don't care which destination triggered
                            // them, so no new overlay state was needed.
                            const willAdvanceToNextFeed =
                              hasNextFeedStage && !!nextFeedIdInSequence;
                            const willAdvanceToSurvey =
                              !willAdvanceToNextFeed && !!surveyBoot?.has_survey;
                            if (willAdvanceToNextFeed || willAdvanceToSurvey) {
                              setSubmittingToSurvey(true);
                            }

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
                              survey_id: linkedSurvey?.survey_id || "",
                            });

                            const displayedPostSnapshots = orderedPosts
                              .map((post) =>
                                displayedPostSnapshotsRef.current.get(`${feed_id || ""}::${post.id}`)
                              )
                              .filter(Boolean);
                            row.displayed_posts_json = JSON.stringify(displayedPostSnapshots);
                            row.experiment_group_id =
                              linkedSurvey?.experiment_assigned_group_id || "";

                            const header = buildMinimalHeader(posts);
                            if (!header.includes("displayed_posts_json")) {
                              header.push("displayed_posts_json");
                            }
                            if (!header.includes("experiment_group_id")) {
                              header.push("experiment_group_id");
                            }

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

                            if (!ok) {
                              showToast("Sync failed. Please try again.");
                              setSubmittingToSurvey(false);
                            } else if (hasNextFeedStage && nextFeedIdInSequence) {
                              // No toast here either, same reasoning as the
                              // to-survey branch just below: the overlay
                              // (already showing, via submittingToSurvey,
                              // then preparingFeedOverlay once
                              // advanceToNextFeed flips feedPhase/contentPhase
                              // to "loading") already communicates progress —
                              // a "Feed submitted ✔︎ Loading next feed…" toast
                              // on top of that read as redundant, and (worse)
                              // could still be visible/fading when the next
                              // feed's own real content is already showing.
                              await advanceToNextFeed(nextFeedIdInSequence);
                            } else if (surveyBoot?.has_survey) {
                              // No "Submitted ✔︎" toast here — the
                              // participant isn't actually done yet (a
                              // survey still follows), and pairing that
                              // toast with the loading overlay's own
                              // "Loading questions…" text read as
                              // contradictory. The overlay (already showing,
                              // via submittingToSurvey/loadingNextStageOverlay)
                              // communicates progress on its own.
                              setFeedSubmitted(true);
                              const loadedSurvey = await ensureSurveyLoaded();

                              dbg("feed submit survey load result", {
                                loadedSurvey: !!loadedSurvey,
                              });

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
                              showToast("Submitted ✔︎");
                              setFeedSubmitted(true);
                              scrollSurveyViewToTop();
                            }

                            setSubmittingToSurvey(false);
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
              ) : null
            }
          />

          <Route
            path="/admin/*"
            element={
              <AdminEntry
                adminAuthed={adminAuthed}
                onAuth={() => setAdminAuthed(true)}
                currentApp="fb"
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
                  // Real path nav (not a hash change, now that this app uses
                  // BrowserRouter) done imperatively via the History API, since this
                  // callback runs outside any component that could call useNavigate().
                  window.history.pushState(null, "", "/admin");
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
              />
            }
          />
        </Routes>

        {toast && <div className="toast">{toast}</div>}
      </div>

      {activeLoadingOverlay && (
        <LoadingOverlay
          title={activeLoadingOverlay.title}
          subtitle={activeLoadingOverlay.subtitle}
          quiet={!!activeLoadingOverlay.quiet}
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

            if (isSurveyOnlyMode) {
              setSurveyPhase((prev) =>
                prev === "ready" || prev === "submitting" || prev === "error"
                  ? prev
                  : "loading"
              );
              setSurveyOnlyPrereqPhase((prev) =>
                prev === "ready" || prev === "error" ? prev : "loading"
              );
              setContentPhase((prev) =>
                prev === "ready" || prev === "error" ? prev : "loading"
              );
            } else {
              setContentPhase("loading");
              setFeedPhase("loading");
              setFeedError("");
              setFlagsReady(false);
              setAssetsReady(false);
            }

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

            dbg("participantOverlaySubmit start", {
              isSurveyOnlyMode,
              surveyPhaseBefore: surveyPhase,
              prereqPhaseBefore: surveyOnlyPrereqPhase,
              hasLinkedSurveyBefore: !!linkedSurvey,
            });

            if (isSurveyOnlyMode) {
              const [loadedSurvey, preloadOk] = await Promise.all([
                ensureSurveyLoaded(),
                preloadSurveyOnlyAssets(),
              ]);

              dbg("participantOverlaySubmit resolved", {
                loadedSurvey: !!loadedSurvey,
                preloadOk,
              });

              if (!loadedSurvey) {
                setSurveyPhase("error");
                setSurveyErrorMsg("Failed to load the survey.");
              } else if (!preloadOk) {
                setSurveyPhase("error");
                setSurveyErrorMsg("Failed to prepare the survey content.");
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