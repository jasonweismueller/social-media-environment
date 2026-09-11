import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SURVEY_QUESTION_TYPES,
  isQuestionVisible,
  getRenderedQuestion,
  getProjectId,
  loadPostByIdFromBackend,
  fetchFeedFlags,
  getAvatarPool,
  getAvatarPoolForPost,
  pickDeterministic,
  applyPostInteractionEvent,
  makeEmptyPostInteractionAggregate,
  buildRecallReminderOptions,
  trackElementDwellMs,
  resolveNoteReaderGroupSize,
  getTextNumericRangeError,
  findScreenerFailure,
  getOtherChoice,
  otherSpecifyResponseKey,
  resolvePostAuthorType,
} from "../utils";

import { PostCard } from "../ui-posts";
import { FB_FEMALE_NAMES, FB_MALE_NAMES, FB_COMPANY_NAMES } from "../ui-posts/names";

const DISPLAYED_POST_SNAPSHOT_PREFIX = "studyfeed:displayed_post_snapshot";
const DISPLAYED_POST_SNAPSHOT_LATEST_PREFIX = "studyfeed:displayed_post_snapshot_latest";

function snapshotKeyPart_(value) {
  return encodeURIComponent(String(value == null ? "" : value));
}

function displayedPostSnapshotKey({ projectId = "", feedId = "", postId = "", participantSeed = "" } = {}) {
  return [
    DISPLAYED_POST_SNAPSHOT_PREFIX,
    snapshotKeyPart_(projectId),
    snapshotKeyPart_(participantSeed),
    snapshotKeyPart_(feedId),
    snapshotKeyPart_(postId),
  ].join("::");
}

function displayedPostSnapshotLatestKey({ projectId = "", feedId = "", postId = "" } = {}) {
  return [
    DISPLAYED_POST_SNAPSHOT_LATEST_PREFIX,
    snapshotKeyPart_(projectId),
    snapshotKeyPart_(feedId),
    snapshotKeyPart_(postId),
  ].join("::");
}

function safeLocalStorageGet_(key) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Module-level cache for reminder posts fetched via loadPostByIdFromBackend.
// Keyed by "projectId::feedId::postId". This avoids re-fetching over the
// network every time a PostReminderCard remounts (e.g. the participant
// navigates back to a previous survey page and returns to it later), which
// otherwise re-shows the "Loading post..." state and adds a network round
// trip each time.
// Exported so the participant-facing App-*.jsx preload pass (which runs
// while the "Loading questions…" overlay is up) can warm these same caches
// ahead of time — otherwise PostReminderCard only starts fetching the post
// and its feed's randomize flags once the survey page has already mounted
// and become visible, which is what causes a reminder post to render with
// stale/default values for a moment (e.g. unrandomized "Just now" time, or
// the wrong avatar/image) before flipping to the correct randomized version
// a beat later.
export const reminderPostFetchCache = new Map();

// Module-level cache for the source feed's randomize flags, keyed by
// "projectId::feedId". A post_reminder question always knows which feed its
// post came from (question.post_feed_id) independently of whichever feed the
// participant is currently on — that's the only feed-scoped `flags` the app
// otherwise loads (and in survey_only delivery mode no feed is ever loaded at
// all, so that `flags` stays at its all-false default). Without fetching the
// reminder's own feed flags here, a non-snapshot reminder post renders
// unrandomized even when its source feed has randomization enabled.
export const reminderFlagsFetchCache = new Map();

function isDisplayedPostSnapshot(post) {
  return !!(post && post.__studyfeed_displayed_snapshot);
}

function getDisplayedPostSnapshot({
  projectId = "",
  feedId = "",
  postId = "",
  participantSeed = "",
} = {}) {
  const cleanPostId = String(postId || "").trim();
  const cleanFeedId = String(feedId || "").trim();
  if (!cleanPostId || !cleanFeedId) return null;

  const keys = [];
  if (participantSeed) {
    keys.push(displayedPostSnapshotKey({
      projectId,
      feedId: cleanFeedId,
      postId: cleanPostId,
      participantSeed,
    }));
  }
  keys.push(displayedPostSnapshotLatestKey({
    projectId,
    feedId: cleanFeedId,
    postId: cleanPostId,
  }));

  for (const key of keys) {
    const raw = safeLocalStorageGet_(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && String(parsed.id || parsed.__snapshot_post_id || "") === cleanPostId) {
        return parsed;
      }
    } catch {}
  }

  return null;
}


function makeBipolarScalePoints(min, max) {
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : 1;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : 7;

  if (safeMax < safeMin) return [];
  return Array.from({ length: safeMax - safeMin + 1 }, (_, i) => safeMin + i);
}

function scrollSurveyPageToTop() {
  if (typeof window === "undefined") return;

  const run = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const surveyPageEl = document.querySelector(".survey-page");
    if (surveyPageEl) surveyPageEl.scrollTop = 0;

    const surveyShellEl = document.querySelector(".survey-shell");
    if (surveyShellEl) surveyShellEl.scrollTop = 0;
  };

  run();
  requestAnimationFrame(run);
  setTimeout(run, 0);
  setTimeout(run, 80);
}

function normalizePageDelaySeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function isRenderableQuestion(question) {
  return question?.type !== SURVEY_QUESTION_TYPES.PAGE_BREAK;
}

function isNumberedQuestion(question) {
  return (
    question?.type !== SURVEY_QUESTION_TYPES.INFO &&
    question?.type !== SURVEY_QUESTION_TYPES.POST_REMINDER &&
    question?.type !== SURVEY_QUESTION_TYPES.PAGE_BREAK
  );
}

function isEmptyRequiredValue(question, value, responses) {
  if (!question || !question.required) return false;

  if (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return true;
  }

  if (
    (question.type === SURVEY_QUESTION_TYPES.SINGLE ||
      question.type === SURVEY_QUESTION_TYPES.DROPDOWN) &&
    responses
  ) {
    const otherChoice = getOtherChoice(question);
    if (otherChoice && value === otherChoice.value) {
      return String(responses[otherSpecifyResponseKey(question.id)] ?? "").trim() === "";
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    if (question.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE) {
      const rows = Array.isArray(question.rows) ? question.rows : [];
      return rows.some((row, rowIndex) => {
        const rowKey = row?.value || row?.label || `row_${rowIndex + 1}`;
        return String(value[rowKey] ?? "").trim() === "";
      });
    }

    if (question.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI) {
      const rows = Array.isArray(question.rows) ? question.rows : [];
      return rows.some((row, rowIndex) => {
        const rowKey = row?.value || row?.label || `row_${rowIndex + 1}`;
        return !Array.isArray(value[rowKey]) || value[rowKey].length === 0;
      });
    }

    if (question.type === SURVEY_QUESTION_TYPES.BIPOLAR) {
      const rows = Array.isArray(question.rows) ? question.rows : [];
      return rows.some((row, rowIndex) => {
        const rowKey = row?.value || row?.label || `row_${rowIndex + 1}`;
        return String(value[rowKey] ?? "").trim() === "";
      });
    }

    // A recall post_reminder's response object gets `dwell_ms`/`dwell_s`
    // populated purely from viewport dwell tracking, before the participant
    // has actually picked an option — the generic "any keys at all" check
    // below would wrongly call that "answered". Match utils-survey.js's
    // isQuestionAnswered exactly: only `selected_option` counts.
    if (question.type === SURVEY_QUESTION_TYPES.POST_REMINDER) {
      return !value.selected_option;
    }

    return Object.keys(value).length === 0;
  }

  return false;
}

function getPostId(post = {}) {
  return String(
    post?.id ??
      post?.post_id ??
      post?.postId ??
      post?.meta?.post_id ??
      ""
  ).trim();
}

function getQuestionReminderPost(question, posts = []) {
  const snapshot = question?.meta?.post_snapshot;
  const targetPostId = String(question?.post_id || "").trim();

  if (snapshot && typeof snapshot === "object") {
    return snapshot;
  }

  if (!targetPostId || !Array.isArray(posts)) return null;

  return posts.find((p) => getPostId(p) === targetPostId) || null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function replaceParticipantTokens(html = "", participantDisplayId = "") {
  const replacement = String(participantDisplayId || "").trim();
  const fallback = replacement || "your Prolific ID";

  return String(html || "")
    .replace(/\$\{e:\/\/Field\/PROLIFIC_PID\}/g, fallback)
    .replace(/\{\{PARTICIPANT_ID\}\}/g, fallback)
    .replace(/\[\[PARTICIPANT_ID\]\]/g, fallback);
}

function getSurveyPrefaceContent(survey = {}, participantDisplayId = "") {
  const participantInformationTitle = firstNonEmpty(
    survey?.participant_information_title,
    "Participant Information"
  );

  const participantInformationHtml = replaceParticipantTokens(
    firstNonEmpty(survey?.participant_information_html, ""),
    participantDisplayId
  );

  const consentTitle = firstNonEmpty(survey?.consent_title, "Consent");

  const consentTextHtml = replaceParticipantTokens(
    firstNonEmpty(survey?.consent_text_html, ""),
    participantDisplayId
  );

  const consentDeclineMessageHtml = replaceParticipantTokens(
    firstNonEmpty(
      survey?.consent_decline_message_html,
      "<p>You cannot proceed because you did not provide consent.</p>"
    ),
    participantDisplayId
  );

  const instructionsTitle = firstNonEmpty(
    survey?.instructions_title,
    "Instructions"
  );

  const instructionsHtml = replaceParticipantTokens(
    firstNonEmpty(survey?.instructions_html, ""),
    participantDisplayId
  );

  const preFeedButtonLabel = firstNonEmpty(
    survey?.pre_feed_button_label,
    "Go to feed"
  );

  return {
    participantInformationTitle,
    participantInformationHtml,
    consentTitle,
    consentTextHtml,
    consentDeclineMessageHtml,
    instructionsTitle,
    instructionsHtml,
    preFeedButtonLabel,
  };
}

function shallowEqualArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function shallowEqualObject(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    const aVal = a[key];
    const bVal = b[key];

    if (Array.isArray(aVal) || Array.isArray(bVal)) {
      if (!shallowEqualArray(aVal, bVal)) return false;
    } else if (aVal !== bVal) {
      return false;
    }
  }

  return true;
}

export function getReminderPostFeedId(question = {}, fallbackFeedId = "") {
  const visibleFeedFallback = Array.isArray(question?.visible_in_feeds)
    ? question.visible_in_feeds.find((feedId) => String(feedId || "").trim())
    : "";

  return firstNonEmpty(
    question?.post_feed_id,
    question?.meta?.post_feed_id,
    visibleFeedFallback,
    fallbackFeedId
  );
}

export function getReminderApp() {
  if (typeof window === "undefined") return "fb";
  const raw = String(
    window.APP ||
      new URLSearchParams(window.location.search).get("app") ||
      "fb"
  ).toLowerCase();
  if (raw === "ig" || raw === "instagram") return "ig";
  if (raw === "x" || raw === "twitter") return "x";
  return "fb";
}

export function surveyHasPreface(survey = {}) {
  const hasParticipantInfo = !!String(
    survey?.participant_information_html || ""
  ).trim();

  const hasConsent = !!String(survey?.consent_text_html || "").trim();

  const hasInstructions = !!String(survey?.instructions_html || "").trim();

  return hasParticipantInfo || hasConsent || hasInstructions;
}

export function SurveyPrefaceFlow({
  survey,
  participantDisplayId = "",
  onComplete,
}) {
  const content = useMemo(
    () => getSurveyPrefaceContent(survey, participantDisplayId),
    [survey, participantDisplayId]
  );

  const steps = useMemo(() => {
    const out = [];

    if (content.participantInformationHtml) {
      out.push({
        id: "participant_information",
        title: content.participantInformationTitle,
        html: content.participantInformationHtml,
      });
    }

    if (content.consentTextHtml) {
      out.push({
        id: "consent",
        title: content.consentTitle,
        html: content.consentTextHtml,
      });
    }

    if (content.instructionsHtml) {
      out.push({
        id: "instructions",
        title: content.instructionsTitle,
        html: content.instructionsHtml,
      });
    }

    return out;
  }, [content]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [consentChoice, setConsentChoice] = useState("");
  const [consentError, setConsentError] = useState("");
  const [showDeclineOverlay, setShowDeclineOverlay] = useState(false);

  useEffect(() => {
    setCurrentStepIndex(0);
    setConsentChoice("");
    setConsentError("");
    setShowDeclineOverlay(false);
  }, [survey?.survey_id]);

  useLayoutEffect(() => {
    scrollSurveyPageToTop();
  }, [currentStepIndex]);

  const currentStep = steps[currentStepIndex] || null;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const goBack = useCallback(() => {
    setConsentError("");
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goNext = useCallback(() => {
    if (!currentStep) return;

    if (currentStep.id === "consent") {
      if (!consentChoice) {
        setConsentError("Please select Yes or No before continuing.");
        return;
      }

      if (consentChoice === "no") {
        setShowDeclineOverlay(true);
        return;
      }
    }

    setConsentError("");

    if (isLastStep) {
      onComplete?.();
      return;
    }

    setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  }, [currentStep, consentChoice, isLastStep, onComplete, steps.length]);

  if (!steps.length) {
    return null;
  }

  return (
    <div className="survey-shell">
      <div className="survey-card">
        <div className="survey-body survey-body-standalone">
          {steps.length > 1 && (
            <>
              <div className="survey-page-meta">
                <div className="survey-page-title-wrap">
                  <h2 className="survey-page-title">{currentStep?.title || ""}</h2>
                </div>

                <div className="survey-page-count">
                  Page {currentStepIndex + 1} of {steps.length}
                </div>
              </div>

              <div className="survey-progress" aria-hidden="true">
                {steps.map((step, idx) => (
                  <div
                    key={step.id || idx}
                    className={`survey-progress-step ${
                      idx < currentStepIndex
                        ? "is-complete"
                        : idx === currentStepIndex
                          ? "is-current"
                          : "is-upcoming"
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          {steps.length <= 1 && currentStep?.title ? (
            <div
              className="survey-page-title-wrap"
              style={{ marginBottom: 18 }}
            >
              <h2 className="survey-page-title">{currentStep.title}</h2>
            </div>
          ) : null}

          <div className="survey-question">
            <div
              className="survey-preface-content-html"
              dangerouslySetInnerHTML={{ __html: currentStep?.html || "" }}
            />
          </div>

          {currentStep?.id === "consent" && (
            <div className="survey-question" style={{ marginTop: 14 }}>
              <div className="survey-options">
                <label className="survey-option">
                  <input
                    type="radio"
                    name="survey_consent_choice"
                    checked={consentChoice === "yes"}
                    onChange={() => {
                      setConsentChoice("yes");
                      setConsentError("");
                    }}
                  />
                  <span>Yes, I consent to participate.</span>
                </label>

                <label className="survey-option">
                  <input
                    type="radio"
                    name="survey_consent_choice"
                    checked={consentChoice === "no"}
                    onChange={() => {
                      setConsentChoice("no");
                      setConsentError("");
                    }}
                  />
                  <span>No, I do not consent.</span>
                </label>
              </div>

              {consentError ? (
                <div className="survey-error">{consentError}</div>
              ) : null}
            </div>
          )}

          <div className="survey-nav">
            <div className="survey-nav-left">
              {!isFirstStep ? (
                <button
                  type="button"
                  className="survey-nav-btn"
                  onClick={goBack}
                >
                  Back
                </button>
              ) : (
                <div />
              )}
            </div>

            <div className="survey-nav-right">
              <button
                type="button"
                className="survey-nav-btn survey-nav-btn-primary"
                onClick={goNext}
              >
                {isLastStep ? content.preFeedButtonLabel : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDeclineOverlay && (
        <div
          className="modal-backdrop modal-backdrop-dim"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal modal-compact"
            style={{ textAlign: "center", paddingTop: 24 }}
          >
            <h3 style={{ margin: "0 0 10px" }}>Consent required</h3>
            <div
              style={{
                color: "var(--muted)",
                fontSize: ".95rem",
                marginBottom: 16,
              }}
              dangerouslySetInnerHTML={{
                __html: content.consentDeclineMessageHtml,
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => setShowDeclineOverlay(false)}
            >
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


const SURVEY_REMINDER_POST_STYLE = `
.survey-post-reminder-block {
  width: 100%;
}

.survey-post-reminder-outer {
  width: 100%;
}

.survey-post-reminder-frame {
  width: 100%;
  margin: 0 auto;
}

.survey-post-reminder-card {
  width: 100%;
  margin: 0 auto;
}

/* Facebook reminder posts should read like Facebook feed cards:
   wide, landscape-oriented media, and not IG-portrait constrained. */
.survey-post-reminder-block.fb-reminder-post .survey-post-reminder-frame,
.survey-post-reminder-block.fb-reminder-post .survey-post-reminder-card {
  width: 100% !important;
  max-width: min(var(--feed-max, 700px), 100%) !important;
}

.survey-post-reminder-block.fb-reminder-post .post-card,
.survey-post-reminder-block.fb-reminder-post [class*="post-card"],
.survey-post-reminder-block.fb-reminder-post [class*="PostCard"],
.survey-post-reminder-block.fb-reminder-post article {
  width: 100% !important;
  max-width: 100% !important;
}

/* Common media wrappers/classes used across the FB/IG post components. */
.survey-post-reminder-block.fb-reminder-post img,
.survey-post-reminder-block.fb-reminder-post video {
  max-width: 100% !important;
}

.survey-post-reminder-block.fb-reminder-post [class*="image"],
.survey-post-reminder-block.fb-reminder-post [class*="Image"],
.survey-post-reminder-block.fb-reminder-post [class*="media"],
.survey-post-reminder-block.fb-reminder-post [class*="Media"],
.survey-post-reminder-block.fb-reminder-post [class*="video"],
.survey-post-reminder-block.fb-reminder-post [class*="Video"] {
  max-width: 100% !important;
}

.survey-post-reminder-block.fb-reminder-post .image-btn,
.survey-post-reminder-block.fb-reminder-post .video-wrap,
.survey-post-reminder-block.fb-reminder-post .video-el,
.survey-post-reminder-block.fb-reminder-post [class*="imageWrap"],
.survey-post-reminder-block.fb-reminder-post [class*="image-wrap"],
.survey-post-reminder-block.fb-reminder-post [class*="mediaWrap"],
.survey-post-reminder-block.fb-reminder-post [class*="media-wrap"],
.survey-post-reminder-block.fb-reminder-post [class*="videoWrap"],
.survey-post-reminder-block.fb-reminder-post [class*="video-wrap"] {
  width: 100% !important;
  max-width: 100% !important;
  aspect-ratio: 16 / 9 !important;
  max-height: 420px !important;
  overflow: hidden;
}

.survey-post-reminder-block.fb-reminder-post .image-btn img,
.survey-post-reminder-block.fb-reminder-post .video-wrap video,
.survey-post-reminder-block.fb-reminder-post .video-el,
.survey-post-reminder-block.fb-reminder-post [class*="imageWrap"] img,
.survey-post-reminder-block.fb-reminder-post [class*="image-wrap"] img,
.survey-post-reminder-block.fb-reminder-post [class*="mediaWrap"] img,
.survey-post-reminder-block.fb-reminder-post [class*="media-wrap"] img,
.survey-post-reminder-block.fb-reminder-post [class*="videoWrap"] video,
.survey-post-reminder-block.fb-reminder-post [class*="video-wrap"] video {
  width: 100% !important;
  height: 100% !important;
  max-height: 420px !important;
  object-fit: cover !important;
}

/* Keep Instagram/mobile reminders narrower and closer to portrait-feed sizing. */
.survey-post-reminder-block.ig-reminder-post .survey-post-reminder-frame,
.survey-post-reminder-block.ig-reminder-post .survey-post-reminder-card {
  max-width: min(520px, 100%) !important;
}

@media (max-width: 640px) {
  .survey-post-reminder-block.fb-reminder-post .survey-post-reminder-frame,
  .survey-post-reminder-block.fb-reminder-post .survey-post-reminder-card {
    max-width: 100% !important;
  }

  .survey-post-reminder-block.fb-reminder-post .image-btn,
  .survey-post-reminder-block.fb-reminder-post .video-wrap,
  .survey-post-reminder-block.fb-reminder-post .video-el,
  .survey-post-reminder-block.fb-reminder-post [class*="imageWrap"],
  .survey-post-reminder-block.fb-reminder-post [class*="image-wrap"],
  .survey-post-reminder-block.fb-reminder-post [class*="mediaWrap"],
  .survey-post-reminder-block.fb-reminder-post [class*="media-wrap"],
  .survey-post-reminder-block.fb-reminder-post [class*="videoWrap"],
  .survey-post-reminder-block.fb-reminder-post [class*="video-wrap"] {
    aspect-ratio: 16 / 10 !important;
    max-height: 360px !important;
  }
}

/* "Recall" post-reminder: 3 candidate posts stacked, each a radio option.
   Uses translucent/theme-independent colors rather than any app's
   --survey-*/--ig-* tokens (Instagram doesn't have the --survey-* bridge at
   all — see CLAUDE.md), so this reads correctly in both light and dark
   mode without needing per-app wiring. */
.survey-recall-options {
  display: grid;
  gap: 14px;
  width: 100%;
}

.survey-recall-option {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 10px;
  align-items: start;
  width: 100%;
  padding: 10px;
  border-radius: 14px;
  border: 2px solid rgba(120, 120, 120, 0.28);
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}

.survey-recall-option:hover {
  border-color: rgba(37, 99, 235, 0.55);
}

.survey-recall-option-selected {
  border-color: #2563eb;
  background: rgba(37, 99, 235, 0.08);
}

.survey-recall-option-radio {
  margin-top: 14px;
  accent-color: #2563eb;
  cursor: pointer;
}

.survey-recall-option .survey-post-reminder-frame,
.survey-recall-option .survey-post-reminder-card {
  margin: 0;
  pointer-events: none;
}
`;

function SurveyReminderPostStyle() {
  return <style>{SURVEY_REMINDER_POST_STYLE}</style>;
}

const ReminderPostInner = memo(function ReminderPostInner({
  post,
  app,
  projectId,
  feedId,
  flags,
  participantSeed,
  assignedAvatarUrl,
  assignedAuthor,
  interactive,
  value,
  onChange,
  // Set only by RecallOptionCard — see PostCard's own comment
  // (ui-posts-facebook.jsx) for why a recall picker's 3 simultaneous
  // PostCard instances must not each write "what was displayed" under the
  // same post/feed/participant key.
  suppressDisplayedSnapshot = false,
}) {
  const noopAction = useCallback(() => {}, []);
  const noopRegisterViewRef = useCallback(() => undefined, []);
  const effectiveFlags = isDisplayedPostSnapshot(post)
    ? {
        ...(flags || {}),
        randomize_times: false,
        randomize_avatars: false,
        randomize_names: false,
        randomize_images: false,
        randomize_bios: false,
      }
    : (flags || {});

  // Only reached when the question's "Interactivity" toggle is on — every
  // like/comment/share/report click here reuses the exact same aggregation
  // logic the real feed uses (applyPostInteractionEvent, utils-core.js), so
  // "what does a report click mean" stays defined in exactly one place.
  const handleInteractiveAction = useCallback(
    (action, meta = {}) => {
      const next = applyPostInteractionEvent(value, {
        action,
        post_id: post?.id,
        ...meta,
      });
      onChange?.(next);
    },
    [value, onChange, post?.id]
  );

  return (
    <PostCard
      post={post}
      onAction={interactive ? handleInteractiveAction : noopAction}
      disabled={!interactive}
      alwaysExpandText={!interactive}
      registerViewRef={noopRegisterViewRef}
      app={app}
      projectId={projectId}
      feedId={feedId}
      runSeed={participantSeed || "survey-reminder-preview"}
      // PostCard's `runSeed` (above) and `participantSeed` (here) are two
      // genuinely separate props — runSeed drives avatar/name/time
      // randomization, participantSeed is what InterventionBlock's own
      // "rated as helpful by N readers" range randomization
      // (resolveNoteReaderGroupSize, utils-core.js) actually reads. Real
      // feed rendering (Feed, ui-posts-facebook.jsx) already passes both;
      // this call site used to only pass runSeed, silently leaving
      // PostCard's participantSeed prop undefined here — which
      // resolveNoteReaderGroupSize's own default param then turned into an
      // empty string, collapsing its seed hash to a fixed, non-varying
      // value regardless of the real participant/session. That's the exact
      // "reminder shows the same reader-group numbers every time, but the
      // real feed varies correctly" bug this fixes.
      participantSeed={participantSeed || "survey-reminder-preview"}
      flags={effectiveFlags}
      assignedAvatarUrl={assignedAvatarUrl || null}
      assignedAuthor={assignedAuthor || null}
      suppressDisplayedSnapshot={suppressDisplayedSnapshot}
    />
  );
}, (prev, next) => {
  return (
    prev.post === next.post &&
    prev.app === next.app &&
    prev.projectId === next.projectId &&
    prev.feedId === next.feedId &&
    prev.flags === next.flags &&
    prev.participantSeed === next.participantSeed &&
    prev.assignedAvatarUrl === next.assignedAvatarUrl &&
    prev.assignedAuthor === next.assignedAuthor &&
    prev.interactive === next.interactive &&
    prev.value === next.value &&
    prev.suppressDisplayedSnapshot === next.suppressDisplayedSnapshot
  );
});

// One candidate in a "recall" post-reminder's 3-option picker — a plain
// static (non-interactive) rendering of the post via the same
// ReminderPostInner every static reminder already uses, wrapped in a
// selectable radio row so the whole card (not just a small dot) is
// clickable.
function RecallOptionCard({
  option,
  app,
  projectId,
  feedId,
  flags,
  participantSeed,
  assignedAvatarUrl,
  assignedAuthor,
  questionId,
  selected,
  onSelect,
}) {
  const noopChange = useCallback(() => {}, []);
  return (
    <label
      className={`survey-recall-option${selected ? " survey-recall-option-selected" : ""}`}
    >
      <input
        type="radio"
        name={`${questionId}-recall`}
        checked={selected}
        onChange={() => onSelect(option.key, option.correct)}
        className="survey-recall-option-radio"
      />
      {/* Reuses the plain reminder's own frame/card classes (not new CSS)
          so this gets the exact same per-app width constraints. */}
      <div className={`survey-post-reminder-frame ${app === "ig" ? "ig-reminder-frame" : "fb-reminder-frame"}`}>
        <div className={`survey-post-reminder-card ${app === "ig" ? "ig-reminder-card" : "fb-reminder-card"}`}>
          <ReminderPostInner
            post={option.post}
            app={app}
            projectId={projectId}
            feedId={feedId}
            flags={flags}
            participantSeed={participantSeed}
            assignedAvatarUrl={assignedAvatarUrl}
            assignedAuthor={assignedAuthor}
            interactive={false}
            value={undefined}
            onChange={noopChange}
            suppressDisplayedSnapshot
          />
        </div>
      </div>
    </label>
  );
}

const PostReminderCard = memo(function PostReminderCard({
  question,
  posts = [],
  projectId,
  feedId,
  flags,
  participantSeed,
  value,
  onChange,
  // Set only by SurveyPreviewModal (via SurveyScreen/-Mobile) — a preview
  // has no real live feed a participant actually viewed, so there's no
  // "what they saw" to freeze. Without this, PostCard's own "displayed post
  // snapshot" localStorage write (real participants' actual mechanism,
  // reused here since preview renders the real PostCard) would capture the
  // *first* resolved name/avatar the preview ever showed for a given
  // (project, "preview" participantSeed, feed, post) tuple and then keep
  // replaying that frozen snapshot for every other experiment group whose
  // reminder happens to reference the same underlying feed+post — exactly
  // the "shared template post across Control/Treatment/PL/PS variants"
  // shape this codebase already has a name for — making randomization look
  // broken across groups in the preview even once it's genuinely fixed.
  disableReminderSnapshot = false,
}) {
  const reminderFeedId = getReminderPostFeedId(question, feedId);
  const targetPostId = String(question?.post_id || "").trim();
  const resolvedProjectId = projectId || getProjectId() || "";
  const app = getReminderApp();
  // A recall reminder is always a static comparison, never interactive —
  // same rule the admin editor enforces when the toggle is turned on.
  const interactive = !!question?.reminder_interactive && !question?.recall_enabled;
  const questionId = question?.id;
  const handleInteractiveChange = useCallback(
    (nextValue) => onChange?.(questionId, nextValue),
    [onChange, questionId]
  );
  const handleRecallSelect = useCallback(
    (optionKey, correct) => onChange?.(questionId, { selected_option: optionKey, correct: !!correct }),
    [onChange, questionId]
  );

  // Per-question editor toggle: when off, the reminder always shows the
  // original, unrandomized post (same for every participant) instead of
  // whatever randomized version this participant actually saw on the feed.
  const applyFeedRandomization = question?.apply_feed_randomization !== false;

  const storedSnapshot = useMemo(() => {
    if (disableReminderSnapshot) return null;
    if (!applyFeedRandomization) return null;
    if (!targetPostId || !reminderFeedId) return null;
    return getDisplayedPostSnapshot({
      projectId: resolvedProjectId,
      feedId: reminderFeedId,
      postId: targetPostId,
      participantSeed,
    });
  }, [disableReminderSnapshot, applyFeedRandomization, resolvedProjectId, reminderFeedId, targetPostId, participantSeed]);

  const reminderFlagsCacheKey = `${resolvedProjectId}::${reminderFeedId || ""}`;
  const [reminderFlags, setReminderFlags] = useState(() =>
    reminderFlagsFetchCache.has(reminderFlagsCacheKey)
      ? reminderFlagsFetchCache.get(reminderFlagsCacheKey)
      : null
  );

  useEffect(() => {
    // storedSnapshot already carries randomization baked into its literal
    // field values, so no flags are needed to render it correctly. Same when
    // the editor toggle turns randomization off for this reminder entirely.
    if (!applyFeedRandomization || storedSnapshot || !reminderFeedId) return;

    if (reminderFlagsFetchCache.has(reminderFlagsCacheKey)) {
      setReminderFlags(reminderFlagsFetchCache.get(reminderFlagsCacheKey));
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const result = await fetchFeedFlags({
          app,
          projectId: resolvedProjectId,
          feedId: reminderFeedId,
          signal: controller.signal,
        });
        const next = result || {};
        reminderFlagsFetchCache.set(reminderFlagsCacheKey, next);
        if (!cancelled) setReminderFlags(next);
      } catch {
        if (!cancelled) setReminderFlags((prev) => prev || {});
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [applyFeedRandomization, storedSnapshot, reminderFeedId, reminderFlagsCacheKey, app, resolvedProjectId]);

  const inlinePost = useMemo(
    () => getQuestionReminderPost(question, posts),
    [question, posts]
  );

  const [lazyPost, setLazyPost] = useState(null);
  const [lazyStatus, setLazyStatus] = useState("idle");
  const [lazyError, setLazyError] = useState("");
  const requestKeyRef = useRef("");
  const requestKey = `${resolvedProjectId}::${reminderFeedId || ""}::${targetPostId}`;

  useEffect(() => {
    const nextInlinePost = getQuestionReminderPost(question, posts);

    if (storedSnapshot) {
      setLazyPost(null);
      setLazyStatus("ready");
      setLazyError("");
      requestKeyRef.current = requestKey;
      return;
    }

    if (nextInlinePost) {
      setLazyPost(null);
      setLazyStatus("ready");
      setLazyError("");
      requestKeyRef.current = requestKey;
      return;
    }

    if (!targetPostId) {
      setLazyPost(null);
      setLazyStatus("idle");
      setLazyError("");
      requestKeyRef.current = requestKey;
      return;
    }

    if (!reminderFeedId) {
      setLazyPost(null);
      setLazyStatus("error");
      setLazyError("This reminder post does not have a source feed yet.");
      requestKeyRef.current = requestKey;
      return;
    }

    if (reminderPostFetchCache.has(requestKey)) {
      const cached = reminderPostFetchCache.get(requestKey);
      setLazyPost(cached);
      setLazyStatus(cached ? "ready" : "error");
      setLazyError(cached ? "" : "The reminder post could not be loaded.");
      requestKeyRef.current = requestKey;
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLazyPost(null);
    setLazyStatus("loading");
    setLazyError("");
    requestKeyRef.current = requestKey;

    (async () => {
      try {
        const fetched = await loadPostByIdFromBackend({
          projectId: resolvedProjectId,
          feedId: reminderFeedId,
          postId: targetPostId,
          signal: controller.signal,
        });

        if (cancelled || requestKeyRef.current !== requestKey) return;

        reminderPostFetchCache.set(requestKey, fetched || null);

        if (fetched) {
          setLazyPost(fetched);
          setLazyStatus("ready");
          setLazyError("");
        } else {
          setLazyPost(null);
          setLazyStatus("error");
          setLazyError("The reminder post could not be loaded.");
        }
      } catch {
        if (cancelled || requestKeyRef.current !== requestKey) return;
        setLazyPost(null);
        setLazyStatus("error");
        setLazyError("The reminder post could not be loaded.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    question,
    posts,
    resolvedProjectId,
    reminderFeedId,
    targetPostId,
    storedSnapshot,
    requestKey,
  ]);

  const post = storedSnapshot || inlinePost || lazyPost;

  // [] whenever recall isn't on, the post hasn't resolved yet, or either
  // decoy text is still blank — see buildRecallReminderOptions for the
  // exact fallback contract.
  const recallOptions = useMemo(
    () => buildRecallReminderOptions(post, question, participantSeed),
    [post, question, participantSeed]
  );

  // No stored snapshot means the participant never actually viewed this exact
  // post in a feed, so there's no "real" randomized avatar to recover — the
  // pool assignment feeds normally use is keyed by a per-page-load runSeed
  // that only exists in memory during that feed render and can't be
  // recovered here. Rather than falling back to the post's raw stored
  // avatarUrl (often an unused placeholder never meant to be shown — e.g. a
  // wide, non-square source image that crops badly into the avatar circle),
  // deterministically assign a real pool avatar so the reminder always shows
  // something properly cropped.
  const [assignedAvatarUrl, setAssignedAvatarUrl] = useState(null);

  useEffect(() => {
    const nonSnapshotPost = inlinePost || lazyPost;

    if (!applyFeedRandomization || storedSnapshot || !nonSnapshotPost) {
      setAssignedAvatarUrl(null);
      return;
    }

    // "random" Author Type (per-post gender randomization) resolves here
    // with the same seed shape as everywhere else it's preloaded/rendered —
    // see resolvePostAuthorType's own comment for the rationale.
    const kind = resolvePostAuthorType(nonSnapshotPost, [
      participantSeed || "survey-reminder-preview",
      app || "app",
      resolvedProjectId || "proj",
      reminderFeedId || "feed",
      String(nonSnapshotPost.id ?? targetPostId),
    ]);

    let cancelled = false;

    (async () => {
      try {
        const pool = await getAvatarPoolForPost(kind, !!nonSnapshotPost?.isMisinformation);
        if (cancelled) return;
        const pick = pickDeterministic(pool, [
          participantSeed || "survey-reminder-preview",
          app || "app",
          resolvedProjectId || "proj",
          reminderFeedId || "feed",
          String(nonSnapshotPost.id ?? targetPostId),
          "reminder-avatar",
        ]);
        setAssignedAvatarUrl(pick || null);
      } catch {
        if (!cancelled) setAssignedAvatarUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyFeedRandomization,
    storedSnapshot,
    inlinePost,
    lazyPost,
    participantSeed,
    app,
    resolvedProjectId,
    reminderFeedId,
    targetPostId,
  ]);

  // Same idea as assignedAvatarUrl above, but for the author name.
  // PostCard (Facebook/X) has no fallback of its own for this the way
  // Instagram's does (which always picks its own name internally,
  // regardless of any assignedAuthor prop) — without an externally-supplied
  // assignedAuthor, Facebook/X's PostCard silently falls back to the post's
  // raw stored `author` field even with randomize_names on, so every
  // reminder without a live-feed snapshot (survey-only delivery, an admin
  // preview, or a reminder targeting a feed/post the participant never
  // actually visited) showed the same un-randomized name regardless of the
  // feed's real flag. Name pools are plain in-memory arrays (unlike the
  // avatar pool, no network fetch needed), so this is a synchronous memo.
  const assignedAuthor = useMemo(() => {
    const nonSnapshotPost = inlinePost || lazyPost;
    if (!applyFeedRandomization || storedSnapshot || !nonSnapshotPost) return null;

    const seedParts = [
      participantSeed || "survey-reminder-preview",
      app || "app",
      resolvedProjectId || "proj",
      reminderFeedId || "feed",
      String(nonSnapshotPost.id ?? targetPostId),
    ];
    const kind = resolvePostAuthorType(nonSnapshotPost, seedParts);
    const pool =
      kind === "male" ? FB_MALE_NAMES : kind === "company" ? FB_COMPANY_NAMES : FB_FEMALE_NAMES;
    return pickDeterministic(pool, [...seedParts, "reminder-name"]) || null;
  }, [
    applyFeedRandomization,
    storedSnapshot,
    inlinePost,
    lazyPost,
    participantSeed,
    app,
    resolvedProjectId,
    reminderFeedId,
    targetPostId,
  ]);

  // Dwell time — how long this reminder card was actually visible in the
  // participant's viewport while the survey page was open, same
  // IntersectionObserver-based "vp_enter/vp_exit" concept the real feed
  // already tracks per post (trackElementDwellMs, utils-core.js), just
  // scoped to this one card. Applies to every post_reminder question
  // (static, interactive, or recall) — passive measurement, not something
  // the participant sees or interacts with, so it isn't gated behind any
  // toggle. Merged onto the same responses[question.id] value object every
  // other reminder mode already writes to (reaction_type/selected_option/
  // etc.), rather than a separate response key, so it survives whatever
  // shape that object already has.
  const dwellRef = useRef(null);
  const dwellValueRef = useRef(value);
  useEffect(() => { dwellValueRef.current = value; }, [value]);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!post || !dwellRef.current) return;
    return trackElementDwellMs(dwellRef.current, {
      onUpdate: (ms) => {
        const prev = dwellValueRef.current;
        const next = {
          ...(prev && typeof prev === "object" ? prev : {}),
          dwell_ms: ms,
          dwell_s: Math.round(ms / 1000),
        };
        dwellValueRef.current = next;
        onChangeRef.current?.(questionId, next);
      },
    });
  }, [post, questionId]);

  // Context-note contributor-group size — if the reminder's post has the
  // "Add contributor info tooltip" intervention on with a group set to
  // "Random range" (resolveNoteReaderGroupSize, utils-core.js), record the
  // actual per-participant number it resolved to and displayed, so it can be
  // controlled for in analysis the same way buildParticipantRow's own
  // `_note_group{1,2}_size_shown` columns already do for a real feed visit —
  // this is the same deterministic (postId, groupIndex, participantSeed)
  // draw, so a participant who saw the post live sees the identical number
  // again here; this just also captures it for the (survey_only-style) case
  // where a reminder is the only place they ever encounter this post at all.
  // Excluded for recall questions, matching RECALL_FIELDS' own deliberately
  // minimal CSV output (utils-backend.js) — no dwell there either.
  useEffect(() => {
    if (!post || question?.recall_enabled || !post.noteMetaEnabled) return;
    const groups = Array.isArray(post.noteReaderGroups) ? post.noteReaderGroups : [];
    if (!groups.length) return;

    const patch = {};
    if (groups[0]) {
      patch.note_group1_size_shown = resolveNoteReaderGroupSize(post.id, 0, groups[0], participantSeed);
    }
    if (groups[1]) {
      patch.note_group2_size_shown = resolveNoteReaderGroupSize(post.id, 1, groups[1], participantSeed);
    }
    if (!Object.keys(patch).length) return;

    const prev = dwellValueRef.current;
    const next = { ...(prev && typeof prev === "object" ? prev : {}), ...patch };
    dwellValueRef.current = next;
    onChangeRef.current?.(questionId, next);
  }, [post, questionId, participantSeed, question?.recall_enabled]);

  return (
  <div ref={dwellRef} className={`survey-post-reminder-block ${app === "ig" ? "ig-reminder-post" : "fb-reminder-post"}`}>
    <SurveyReminderPostStyle />
    {question?.text ? (
      <div
        className="survey-post-reminder-intro"
        dangerouslySetInnerHTML={{ __html: question.text || "" }}
      />
    ) : null}

    {!post ? (
      <div className="survey-post-reminder-outer">
        <div className="survey-post-reminder-status">
          {lazyStatus === "loading"
            ? "Loading post…"
            : lazyError || "The reminder post could not be displayed."}
        </div>
      </div>
    ) : recallOptions.length > 0 ? (
      <div className="survey-post-reminder-outer">
        <div className="survey-recall-options">
          {recallOptions.map((option) => (
            <RecallOptionCard
              key={option.key}
              option={option}
              app={app}
              projectId={resolvedProjectId}
              feedId={reminderFeedId || ""}
              flags={applyFeedRandomization ? (reminderFlags || flags) : {}}
              participantSeed={participantSeed}
              assignedAvatarUrl={assignedAvatarUrl}
              assignedAuthor={assignedAuthor}
              questionId={questionId}
              selected={value?.selected_option === option.key}
              onSelect={handleRecallSelect}
            />
          ))}
        </div>
      </div>
    ) : (
      <div className="survey-post-reminder-outer">
        <div className={`survey-post-reminder-frame ${app === "ig" ? "ig-reminder-frame" : "fb-reminder-frame"}`}>
          <div className={`survey-post-reminder-card ${app === "ig" ? "ig-reminder-card" : "fb-reminder-card"}`}>
            <ReminderPostInner
              post={post}
              app={app}
              projectId={resolvedProjectId}
              feedId={reminderFeedId || ""}
              flags={applyFeedRandomization ? (reminderFlags || flags) : {}}
              participantSeed={participantSeed}
              assignedAvatarUrl={assignedAvatarUrl}
              assignedAuthor={assignedAuthor}
              interactive={interactive}
              value={value}
              onChange={handleInteractiveChange}
              suppressDisplayedSnapshot={disableReminderSnapshot}
            />
          </div>
        </div>
      </div>
    )}
  </div>
);
}, (prev, next) => {
  return (
    prev.question === next.question &&
    prev.posts === next.posts &&
    prev.projectId === next.projectId &&
    prev.feedId === next.feedId &&
    prev.flags === next.flags &&
    prev.participantSeed === next.participantSeed &&
    (prev.value === next.value || shallowEqualObject(prev.value, next.value))
  );
});

export const SurveyQuestionRenderer = memo(function SurveyQuestionRenderer({
  question,
  questionId,
  index,
  value,
  error,
  onChange,
  posts = [],
  projectId,
  feedId,
  flags,
  participantSeed,
  otherText,
  disableReminderSnapshot = false,
}) {
  const qType = question?.type;
  const isInfo = qType === SURVEY_QUESTION_TYPES.INFO;
  const isPostReminder = qType === SURVEY_QUESTION_TYPES.POST_REMINDER;

  const choiceItems = useMemo(() => {
    if (Array.isArray(question?.choices)) return question.choices;
    if (Array.isArray(question?.options)) {
      return question.options.map((label, i) => ({
        value: `opt_${i + 1}`,
        label: String(label || ""),
      }));
    }
    return [];
  }, [question]);

  const rows = Array.isArray(question?.rows) ? question.rows : [];
  const columns = Array.isArray(question?.columns) ? question.columns : [];
  const bipolarPoints = useMemo(
    () => makeBipolarScalePoints(question?.min, question?.max),
    [question?.min, question?.max]
  );

  const emitChange = useCallback(
    (nextValue) => {
      onChange(questionId, nextValue);
    },
    [onChange, questionId]
  );

  const handleTextChange = useCallback(
    (e) => emitChange(e.target.value),
    [emitChange]
  );

  const handleRadioChange = useCallback(
    (choiceValue) => emitChange(choiceValue),
    [emitChange]
  );

  // The "Other, please specify" text lives in a sibling response key, not
  // nested inside this question's own value — see otherSpecifyResponseKey's
  // comment in utils-survey.js for why.
  const handleOtherTextChange = useCallback(
    (e) => onChange(otherSpecifyResponseKey(questionId), e.target.value),
    [onChange, questionId]
  );

  const handleMultiChange = useCallback(
    (choiceValue, checked) => {
      const current = Array.isArray(value) ? value : [];
      const next = checked
        ? [...current, choiceValue]
        : current.filter((v) => v !== choiceValue);
      emitChange(next);
    },
    [emitChange, value]
  );

  const handleSliderChange = useCallback(
    (e) => emitChange(String(e.target.value)),
    [emitChange]
  );

  const handleBipolarChange = useCallback(
    (rowKey, pointValue) => {
      emitChange({
        ...(value && typeof value === "object" ? value : {}),
        [rowKey]: pointValue,
      });
    },
    [emitChange, value]
  );

  const handleMatrixSingleChange = useCallback(
    (rowKey, colValue) => {
      emitChange({
        ...(value && typeof value === "object" ? value : {}),
        [rowKey]: colValue,
      });
    },
    [emitChange, value]
  );

  const handleMatrixMultiChange = useCallback(
    (rowKey, rowValues, colValue, checked) => {
      const nextRowValues = checked
        ? [...rowValues, colValue]
        : rowValues.filter((v) => v !== colValue);

      emitChange({
        ...(value && typeof value === "object" ? value : {}),
        [rowKey]: nextRowValues,
      });
    },
    [emitChange, value]
  );

  return (
    <div
      className={`survey-question ${
        isInfo ? "survey-question-info" : ""
      } ${isPostReminder ? "survey-question-post-reminder" : ""} ${
        error ? "has-error" : ""
      }`}
    >
      {!isInfo && !isPostReminder && (
        <div className="survey-question-title">
          <div className="survey-question-title-inner">
            <span className="survey-question-number">{index + 1}.</span>
            <div
              className="survey-question-title-content"
              dangerouslySetInnerHTML={{ __html: question.text || "" }}
            />
          </div>
        </div>
      )}

      {!isInfo && !isPostReminder && question.description ? (
        <div className="survey-question-description">{question.description}</div>
      ) : null}

      {isInfo && (
        <div
          className="survey-info-block"
          dangerouslySetInnerHTML={{ __html: question.text || "" }}
        />
      )}

      {isPostReminder && (
        <PostReminderCard
          question={question}
          posts={posts}
          projectId={projectId}
          feedId={feedId}
          flags={flags}
          participantSeed={participantSeed}
          value={value}
          onChange={onChange}
          disableReminderSnapshot={disableReminderSnapshot}
        />
      )}

      {qType === SURVEY_QUESTION_TYPES.TEXT && (
        <input
          className="survey-input"
          type={question.numeric_only ? "number" : "text"}
          inputMode={question.numeric_only ? "numeric" : undefined}
          min={question.numeric_only && Number.isFinite(question.numeric_min) ? question.numeric_min : undefined}
          max={question.numeric_only && Number.isFinite(question.numeric_max) ? question.numeric_max : undefined}
          value={value ?? ""}
          onChange={handleTextChange}
        />
      )}

      {qType === SURVEY_QUESTION_TYPES.TEXTAREA && (
        <textarea
          className="survey-textarea"
          rows={4}
          value={value ?? ""}
          onChange={handleTextChange}
        />
      )}

      {(qType === SURVEY_QUESTION_TYPES.SINGLE ||
        qType === SURVEY_QUESTION_TYPES.DROPDOWN) && (
        <div className="survey-options">
          {choiceItems.map((choice) => (
            <label key={choice.value} className="survey-option">
              <input
                type="radio"
                name={questionId}
                checked={value === choice.value}
                onChange={() => handleRadioChange(choice.value)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
          {choiceItems.some((c) => c.is_other && c.value === value) && (
            <input
              type="text"
              className="survey-input"
              style={{ marginTop: 2 }}
              placeholder="Please specify…"
              value={otherText ?? ""}
              onChange={handleOtherTextChange}
              autoFocus
            />
          )}
        </div>
      )}

      {qType === SURVEY_QUESTION_TYPES.MULTI && (
        <div className="survey-options">
          {choiceItems.map((choice) => {
            const current = Array.isArray(value) ? value : [];
            const checked = current.includes(choice.value);

            return (
              <label key={choice.value} className="survey-option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    handleMultiChange(choice.value, e.target.checked)
                  }
                />
                <span>{choice.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {qType === SURVEY_QUESTION_TYPES.BIPOLAR && (
        <div className="survey-bipolar">
          <div className="survey-matrix survey-bipolar-matrix">
            <table className="survey-matrix-table">
              <thead>
                <tr>
                  <th />
                  {bipolarPoints.map((point) => (
                    <th key={point}>{point}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => {
                  const rowKey = row?.value || `row_${rowIndex + 1}`;
                  const leftLabel = row?.left_label || `Row ${rowIndex + 1}`;
                  const rightLabel = row?.right_label || "";
                  const rowValue =
                    value && typeof value === "object" ? value[rowKey] : "";

                  return (
                    <tr key={rowKey}>
                      <td>{leftLabel}</td>
                      {bipolarPoints.map((point) => {
                        const pointValue = String(point);
                        return (
                          <td key={pointValue}>
                            <input
                              type="radio"
                              name={`${questionId}__${rowKey}`}
                              checked={String(rowValue) === pointValue}
                              onChange={() =>
                                handleBipolarChange(rowKey, pointValue)
                              }
                            />
                          </td>
                        );
                      })}
                      <td>{rightLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {qType === SURVEY_QUESTION_TYPES.SLIDER && (
        <div className="survey-scale">
          <div className="survey-scale-labels">
            <span>{question.left_label || question.min_label || ""}</span>
            <span>{question.right_label || question.max_label || ""}</span>
          </div>
          <input
            type="range"
            min={question.min ?? 0}
            max={question.max ?? 100}
            step={1}
            value={value === "" || value == null ? question.min ?? 0 : value}
            onChange={handleSliderChange}
            className="survey-range"
          />
          <div className="survey-range-value">{value || question.min || 0}</div>
        </div>
      )}

      {qType === SURVEY_QUESTION_TYPES.MATRIX_SINGLE && (
        <div className="survey-matrix">
          <table className="survey-matrix-table">
            <thead>
              <tr>
                <th />
                {columns.map((col) => (
                  <th key={col?.value || col?.label}>
                    {col?.label || col?.value || ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const rowKey =
                  row?.value || row?.label || `row_${rowIndex + 1}`;
                const rowLabel = row?.label || row?.value || "";
                const rowValue =
                  value && typeof value === "object" ? value[rowKey] : "";

                return (
                  <tr key={rowKey}>
                    <td>{rowLabel}</td>
                    {columns.map((col) => {
                      const colValue = col?.value || col?.label || "";
                      return (
                        <td key={colValue}>
                          <input
                            type="radio"
                            name={`${questionId}__${rowKey}`}
                            checked={rowValue === colValue}
                            onChange={() =>
                              handleMatrixSingleChange(rowKey, colValue)
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {qType === SURVEY_QUESTION_TYPES.MATRIX_MULTI && (
        <div className="survey-matrix">
          <table className="survey-matrix-table">
            <thead>
              <tr>
                <th />
                {columns.map((col) => (
                  <th key={col?.value || col?.label}>
                    {col?.label || col?.value || ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const rowKey =
                  row?.value || row?.label || `row_${rowIndex + 1}`;
                const rowLabel = row?.label || row?.value || "";
                const rowValues =
                  value &&
                  typeof value === "object" &&
                  Array.isArray(value[rowKey])
                    ? value[rowKey]
                    : [];

                return (
                  <tr key={rowKey}>
                    <td>{rowLabel}</td>
                    {columns.map((col) => {
                      const colValue = col?.value || col?.label || "";
                      const checked = rowValues.includes(colValue);

                      return (
                        <td key={colValue}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              handleMatrixMultiChange(
                                rowKey,
                                rowValues,
                                colValue,
                                e.target.checked
                              )
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error ? <div className="survey-error">{error}</div> : null}
    </div>
  );
}, (prev, next) => {
  return (
    prev.question === next.question &&
    prev.questionId === next.questionId &&
    prev.index === next.index &&
    prev.error === next.error &&
    prev.posts === next.posts &&
    prev.projectId === next.projectId &&
    prev.feedId === next.feedId &&
    prev.flags === next.flags &&
    prev.participantSeed === next.participantSeed &&
    prev.otherText === next.otherText &&
    prev.disableReminderSnapshot === next.disableReminderSnapshot &&
    (prev.value === next.value ||
      shallowEqualArray(prev.value, next.value) ||
      shallowEqualObject(prev.value, next.value))
  );
});

export function SurveyScreen({
  survey,
  posts = [],
  responses,
  errors,
  errorMsg,
  participantSeed,
  feedId,
  projectId: propProjectId,
  flags,
  onChange,
  onSubmit,
  onPageValidationFail,
  onClearBanner,
  onPageChange,
  submitting,
  // Preview-only additions (default to the real participant-facing
  // behavior, so no existing caller is affected): `enforceRequired=false`
  // lets an admin click through without answering required questions;
  // `allowPageJump` makes the progress dots clickable to jump straight to
  // any page; `initialQuestionId` starts the screen on whichever page
  // contains that question instead of page 1.
  enforceRequired = true,
  allowPageJump = false,
  initialQuestionId = null,
  // Preview-only: see PostReminderCard's own comment for the full
  // rationale — stops a post-reminder question from reading/writing the
  // real participant-facing "displayed post snapshot" localStorage, so
  // previewing one experiment group's reminder can't freeze what a later
  // group's reminder shows just because they happen to reference the same
  // underlying feed+post.
  disableReminderSnapshot = false,
}) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [delayRemaining, setDelayRemaining] = useState(0);
  // Fully self-contained, same pattern as SurveyPrefaceFlow's consent-decline
  // overlay above — no backend write, no callback out to App-*.jsx. Once set,
  // this replaces the entire question UI with a terminal screen; there's no
  // "go back and change your answer" the way consent-decline allows, since
  // that would defeat the point of screening.
  const [screenedOutBy, setScreenedOutBy] = useState(null);
  const [screenoutRedirecting, setScreenoutRedirecting] = useState(false);
  const projectId = propProjectId || getProjectId() || "";
  const initialJumpDoneRef = useRef(false);

  // Rendered questions are only recomputed when the survey definition, feed,
  // or participant seed change — NOT on every response update. This keeps each
  // question object's identity stable while the participant is answering,
  // which matters because child components (e.g. the post-reminder card)
  // treat a new `question` reference as a reason to re-fetch/re-render.
  // Previously this was combined with the visibility filter in one memo keyed
  // on `responses`, so every keystroke/click produced brand-new question
  // objects for the whole page and re-triggered the reminder post's fetch.
  const renderedPages = useMemo(() => {
    const pages = Array.isArray(survey?.pages) ? survey.pages : [];
    const activeFeedId = String(feedId ?? "").trim();

    return pages.map((page, pageIdx) => {
      const renderedQuestions = (page?.questions || [])
        .filter(isRenderableQuestion)
        .map((question) =>
          getRenderedQuestion(question, {
            participantSeed: participantSeed || "",
            feedId: activeFeedId,
          })
        );

      return {
        id: page?.id || `page_${pageIdx + 1}`,
        title: page?.title || "",
        description: page?.description || "",
        next_delay_seconds: normalizePageDelaySeconds(page?.next_delay_seconds),
        questions: renderedQuestions,
      };
    });
  }, [survey, participantSeed, feedId]);

  const visiblePages = useMemo(() => {
    const activeFeedId = String(feedId ?? "").trim();
    const assignedGroupId = String(survey?.experiment_assigned_group_id ?? "").trim();

    return renderedPages
      .map((page) => ({
        ...page,
        questions: page.questions.filter((q) =>
          isQuestionVisible(q, responses, { feedId: activeFeedId, assignedGroupId })
        ),
      }))
      .filter((page) => page.questions.length > 0);
  }, [renderedPages, responses, feedId, survey?.experiment_assigned_group_id]);

  useEffect(() => {
    setCurrentPageIndex(0);
  }, [survey?.survey_id, feedId]);

  // Jumps once to whichever page contains `initialQuestionId` (preview-only
  // "preview this question" entry point) once that page is resolvable, then
  // never again for this (survey, question) pairing — so a participant's own
  // page navigation afterward isn't fought by this effect re-firing whenever
  // `visiblePages` recomputes (e.g. on every response change).
  useEffect(() => {
    initialJumpDoneRef.current = false;
  }, [survey?.survey_id, initialQuestionId]);

  useEffect(() => {
    if (!initialQuestionId || initialJumpDoneRef.current) return;
    const idx = visiblePages.findIndex((page) =>
      page.questions.some((q) => q.id === initialQuestionId)
    );
    if (idx >= 0) {
      initialJumpDoneRef.current = true;
      setCurrentPageIndex(idx);
    }
  }, [initialQuestionId, visiblePages]);

  useEffect(() => {
    if (visiblePages.length === 0) {
      if (currentPageIndex !== 0) setCurrentPageIndex(0);
      return;
    }
    if (currentPageIndex > visiblePages.length - 1) {
      setCurrentPageIndex(visiblePages.length - 1);
    }
  }, [visiblePages, currentPageIndex]);

  // Real production bug, fixed here: `onSubmit` (App-*.jsx's
  // `handleSurveySubmit`) validates the WHOLE survey via
  // `validateSurveyResponses` — not just the current page — so a required
  // question left unanswered on an earlier page (most commonly: the
  // participant used Back, or a question further up became required only
  // after a later answer) surfaces in `errors` even while sitting on the
  // last page. Per-page "Next" validation only ever fills `errors` with
  // current-page question ids, so it's naturally already on-screen; only a
  // final Submit can hand back an error whose question isn't on the visible
  // page at all — previously nothing looked at the returned error ids, so
  // the participant saw the generic banner with nothing highlighted and no
  // way to find the actual problem. This jumps to the first page (in
  // participant-visible order, so it matches whatever the participant
  // actually navigated through) containing an errored question — a no-op
  // whenever every error is already on the current page.
  useEffect(() => {
    if (!errors || typeof errors !== "object") return;
    const errorIds = Object.keys(errors);
    if (!errorIds.length) return;
    if (currentPage?.questions?.some((q) => errors[q.id])) return;
    const idx = visiblePages.findIndex((page) => page.questions.some((q) => errors[q.id]));
    if (idx >= 0 && idx !== currentPageIndex) {
      setCurrentPageIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors, visiblePages]);

  const currentPage = visiblePages[currentPageIndex] || null;
  const isLastPage = currentPageIndex === visiblePages.length - 1;
  const isFirstPage = currentPageIndex === 0;

  const currentPageDelaySeconds = normalizePageDelaySeconds(
  currentPage?.next_delay_seconds
);
const isNextDelayed =
  !isLastPage && currentPageDelaySeconds > 0 && delayRemaining > 0;


  useLayoutEffect(() => {
    scrollSurveyPageToTop();
    onPageChange?.(currentPageIndex);
  }, [currentPageIndex]);

  useEffect(() => {
  if (!currentPage || isLastPage || currentPageDelaySeconds <= 0) {
    setDelayRemaining(0);
    return;
  }

  setDelayRemaining(currentPageDelaySeconds);

  const intervalId = window.setInterval(() => {
    setDelayRemaining((prev) => {
      if (prev <= 1) {
        window.clearInterval(intervalId);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => window.clearInterval(intervalId);
  // Deliberately keyed on currentPage?.id (a stable string), NOT the
  // `currentPage` object itself — `visiblePages` (and therefore
  // `currentPage`) gets a brand-new object reference on every recompute,
  // including ones triggered by something as unrelated as a post-reminder
  // question's dwell-time tracker updating `responses` while a participant
  // merely scrolls the page. Depending on the object identity meant any such
  // unrelated re-render silently reset this countdown back to full — a real
  // reported bug, not just a hypothetical: scrolling was long enough to
  // trigger at least one dwell-tracking tick on some pages, so the timer
  // never actually reached zero for an attentive, scrolling participant.
  // currentPageDelaySeconds is already the number the effect actually
  // cares about, so using it directly (instead of recomputing `delaySeconds`
  // from the object inside the effect) keeps the dependency array honest.
}, [currentPageIndex, currentPage?.id, currentPageDelaySeconds, isLastPage]);

  

  const questionNumberOffset = useMemo(() => {
    let count = 0;
    for (let i = 0; i < currentPageIndex; i += 1) {
      const page = visiblePages[i];
      count += (page?.questions || []).filter(isNumberedQuestion).length;
    }
    return count;
  }, [visiblePages, currentPageIndex]);

  const validateCurrentPage = useCallback(() => {
    if (!currentPage) return { ok: true, errors: {} };
    if (!enforceRequired) return { ok: true, errors: {} };

    const pageErrors = {};

    currentPage.questions.forEach((q) => {
      if (
        !q ||
        q.type === SURVEY_QUESTION_TYPES.INFO ||
        // A post_reminder is only ever display-only (exempt from required)
        // UNLESS recall_enabled — that's the whole reason `required` is a
        // real, meaningful field on a recall reminder (see utils-survey.js's
        // isDisplayOnlyQuestion). Unconditionally skipping every
        // post_reminder here regardless of recall_enabled let a participant
        // click "Next" straight past a required, unanswered recall question
        // with zero warning — the final whole-survey Submit validator
        // (validateSurveyResponses, utils-survey.js) correctly catches it,
        // but only after the participant has already moved on, often many
        // pages further, which is the actual real-world bug this fixes.
        (q.type === SURVEY_QUESTION_TYPES.POST_REMINDER && !q.recall_enabled)
      ) {
        return;
      }

      const value = responses?.[q.id];

      // isEmptyRequiredValue no-ops for a non-required question (returns
      // false), so this loop no longer needs its own `!q.required` bail-out
      // — that removal is what lets the numeric range check below still run
      // for an *optional* numeric_only TEXT question that has a value.
      if (isEmptyRequiredValue(q, value, responses)) {
        if (
          q.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
          q.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI ||
          q.type === SURVEY_QUESTION_TYPES.BIPOLAR
        ) {
          pageErrors[q.id] = "Please complete all rows.";
        } else {
          pageErrors[q.id] = "Please answer this question.";
        }
        return;
      }

      const rangeError = getTextNumericRangeError(q, value);
      if (rangeError) pageErrors[q.id] = rangeError;
    });

    return {
      ok: Object.keys(pageErrors).length === 0,
      errors: pageErrors,
    };
  }, [currentPage, responses, enforceRequired]);

  // Runs only once the page's own required-answer validation already passed
  // (both call sites below check that first) — returns true if a screener on
  // this page failed, having already either redirected or set
  // `screenedOutBy` to stop the caller from advancing/submitting.
  const blockOnScreenerFailure = useCallback(
    (questions) => {
      if (!enforceRequired) return false;
      const failed = findScreenerFailure(questions, responses);
      if (!failed) return false;

      if (survey?.screenout_mode === "redirect" && survey?.screenout_redirect_url) {
        setScreenoutRedirecting(true);
        window.location.assign(survey.screenout_redirect_url);
        return true;
      }

      setScreenedOutBy(failed);
      return true;
    },
    [enforceRequired, responses, survey?.screenout_mode, survey?.screenout_redirect_url]
  );

 const goNext = useCallback(() => {
  if (isNextDelayed) {
    return;
  }

  onClearBanner?.();
  const validation = validateCurrentPage();

  if (!validation.ok) {
    onPageValidationFail?.(
      validation.errors,
      "Please complete the highlighted questions on this page."
    );
    return;
  }

  if (blockOnScreenerFailure(currentPage?.questions)) return;

  setCurrentPageIndex((prev) => Math.min(prev + 1, visiblePages.length - 1));
}, [
  isNextDelayed,
  onClearBanner,
  validateCurrentPage,
  onPageValidationFail,
  blockOnScreenerFailure,
  currentPage,
  visiblePages.length,
]);

  // Submit only ever fires from the last page's own button (see the nav
  // markup below) — validateSurveyResponses (utils-survey.js, called by
  // App-*.jsx's onSubmit) covers required-ness for the whole survey, but has
  // no concept of screening, and per-page Next never runs for the very last
  // page since there's no "next" from it. This is the one place left that
  // needs its own screener check before handing off to the real onSubmit.
  const handleSubmitClick = useCallback(() => {
    if (blockOnScreenerFailure(currentPage?.questions)) return;
    onSubmit?.();
  }, [blockOnScreenerFailure, currentPage, onSubmit]);

  const goBack = useCallback(() => {
    onClearBanner?.();
    setCurrentPageIndex((prev) => Math.max(prev - 1, 0));
  }, [onClearBanner]);

  const handleQuestionChange = useCallback(
    (questionId, nextValue) => {
      onChange(questionId, nextValue);
    },
    [onChange]
  );

  if (screenoutRedirecting) {
    return (
      <div className="survey-shell">
        <div className="survey-card">
          <div className="survey-body survey-body-standalone" style={{ textAlign: "center", padding: "32px 0" }}>
            Redirecting…
          </div>
        </div>
      </div>
    );
  }

  if (screenedOutBy) {
    return (
      <div className="survey-shell">
        <div className="survey-card">
          <div className="survey-body survey-body-standalone">
            <div
              className="survey-preface-content-html"
              dangerouslySetInnerHTML={{
                __html:
                  survey?.screenout_message_html ||
                  "<p>Thank you for your interest in this study. Based on your answers, you are not eligible to participate at this time.</p>",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!currentPage) {
    return (
      <div className="survey-shell">
        <div className="survey-card">
          <div className="survey-body survey-body-standalone">
            <div className="survey-error-banner">
              No survey questions are available.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="survey-shell">
      <div className="survey-card">
        <div className="survey-body survey-body-standalone">
          {visiblePages.length > 1 && (
            <>
              <div className="survey-page-meta">
                <div className="survey-page-title-wrap">
                  {currentPage.title ? (
                    <h2 className="survey-page-title">{currentPage.title}</h2>
                  ) : null}
                  {currentPage.description ? (
                    <div className="survey-page-subtitle">
                      {currentPage.description}
                    </div>
                  ) : null}
                </div>

                <div className="survey-page-count">
                  Page {currentPageIndex + 1} of {visiblePages.length}
                </div>
              </div>

              <div className="survey-progress" aria-hidden={allowPageJump ? undefined : "true"}>
                {visiblePages.map((page, idx) =>
                  allowPageJump ? (
                    <button
                      key={page.id || idx}
                      type="button"
                      className={`survey-progress-step ${
                        idx < currentPageIndex
                          ? "is-complete"
                          : idx === currentPageIndex
                            ? "is-current"
                            : "is-upcoming"
                      }`}
                      onClick={() => setCurrentPageIndex(idx)}
                      title={`Jump to page ${idx + 1}`}
                      aria-label={`Jump to page ${idx + 1}`}
                      style={{
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        WebkitAppearance: "none",
                        appearance: "none",
                        font: "inherit",
                        ...(idx === currentPageIndex ? {} : { border: "none" }),
                      }}
                    />
                  ) : (
                    <div
                      key={page.id || idx}
                      className={`survey-progress-step ${
                        idx < currentPageIndex
                          ? "is-complete"
                          : idx === currentPageIndex
                            ? "is-current"
                            : "is-upcoming"
                      }`}
                    />
                  )
                )}
              </div>
            </>
          )}

          {visiblePages.length <= 1 && currentPage.title ? (
            <div
              className="survey-page-title-wrap"
              style={{ marginBottom: currentPage.description ? 14 : 18 }}
            >
              <h2 className="survey-page-title">{currentPage.title}</h2>
              {currentPage.description ? (
                <div className="survey-page-subtitle">
                  {currentPage.description}
                </div>
              ) : null}
            </div>
          ) : null}

          {currentPage.questions.map((q, idx) => {
            const isUnnumbered =
              q?.type === SURVEY_QUESTION_TYPES.INFO ||
              q?.type === SURVEY_QUESTION_TYPES.POST_REMINDER;

            const displayIndex = isUnnumbered
              ? null
              : questionNumberOffset +
                currentPage.questions
                  .slice(0, idx + 1)
                  .filter(isNumberedQuestion).length -
                1;

            const value = responses?.[q.id];
            const error = errors?.[q.id];
            const otherText = responses?.[otherSpecifyResponseKey(q.id)];

            return (
              <SurveyQuestionRenderer
                key={q.id}
                question={q}
                questionId={q.id}
                index={displayIndex}
                value={value}
                error={error}
                onChange={handleQuestionChange}
                posts={posts}
                projectId={projectId}
                feedId={feedId}
                flags={flags}
                participantSeed={participantSeed}
                otherText={otherText}
                disableReminderSnapshot={disableReminderSnapshot}
              />
            );
          })}

          {errorMsg ? (
            <div className="survey-error-banner">{errorMsg}</div>
          ) : null}

          {visiblePages.length > 1 ? (
            <div className="survey-nav">
              <div className="survey-nav-left">
                {!isFirstPage ? (
                  <button
                    type="button"
                    className="survey-nav-btn"
                    onClick={goBack}
                    disabled={submitting}
                  >
                    Back
                  </button>
                ) : (
                  <div />
                )}
              </div>

              <div className="survey-nav-right">
                {!isLastPage ? (
                 <button
  type="button"
  className="survey-nav-btn survey-nav-btn-primary"
  onClick={goNext}
  disabled={submitting || isNextDelayed}
>
  {isNextDelayed ? `Next (${delayRemaining})` : "Next"}
</button>
                ) : (
                  <button
                    type="button"
                    className="btn primary survey-submit-btn"
                    onClick={handleSubmitClick}
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Submit survey"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="survey-submit-wrap">
              <button
                type="button"
                className="btn primary survey-submit-btn"
                onClick={handleSubmitClick}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit survey"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}