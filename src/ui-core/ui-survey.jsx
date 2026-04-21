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
} from "../utils";

import { PostCard } from "../ui-posts";

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

function isEmptyRequiredValue(question, value) {
  if (!question || !question.required) return false;

  if (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return true;
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

function getReminderPostLabel(question = {}, post = {}) {
  return firstNonEmpty(
    question?.post_label,
    post?.name,
    post?.author,
    post?.username,
    post?.text,
    question?.post_id
  );
}

function getReminderPostFeedId(question = {}, fallbackFeedId = "") {
  return firstNonEmpty(
    question?.post_feed_id,
    question?.meta?.post_feed_id,
    fallbackFeedId
  );
}

function getReminderApp() {
  if (typeof window === "undefined") return "fb";
  return (
    String(
      window.APP ||
        new URLSearchParams(window.location.search).get("app") ||
        "fb"
    ).toLowerCase() === "ig"
      ? "ig"
      : "fb"
  );
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
              className="survey-question-title-content"
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

const ReminderPostInner = memo(function ReminderPostInner({
  post,
  app,
  projectId,
  feedId,
  flags,
  participantSeed,
}) {
  const noopAction = useCallback(() => {}, []);
  const noopRegisterViewRef = useCallback(() => undefined, []);

  return (
    <PostCard
      post={post}
      onAction={noopAction}
      disabled={true}
      registerViewRef={noopRegisterViewRef}
      app={app}
      projectId={projectId}
      feedId={feedId}
      runSeed={participantSeed || "survey-reminder-preview"}
      flags={flags || {}}
    />
  );
}, (prev, next) => {
  return (
    prev.post === next.post &&
    prev.app === next.app &&
    prev.projectId === next.projectId &&
    prev.feedId === next.feedId &&
    prev.flags === next.flags &&
    prev.participantSeed === next.participantSeed
  );
});

const PostReminderCard = memo(function PostReminderCard({
  question,
  posts = [],
  projectId,
  feedId,
  flags,
  participantSeed,
}) {
  const reminderFeedId = getReminderPostFeedId(question, feedId);
  const targetPostId = String(question?.post_id || "").trim();
  const resolvedProjectId = projectId || getProjectId() || "";
  const app = getReminderApp();

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
    requestKey,
  ]);

  const post = inlinePost || lazyPost;
  const fallbackLabel = getReminderPostLabel(question, post || lazyPost || {});

  return (
  <div className="survey-post-reminder-block">
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
            ? `Loading post${fallbackLabel ? `: ${fallbackLabel}` : ""}...`
            : lazyError || "The reminder post could not be displayed."}
        </div>
      </div>
    ) : (
      <div className="survey-post-reminder-outer">
        <div className="survey-post-reminder-frame">
          <div className="survey-post-reminder-card">
            <ReminderPostInner
              post={post}
              app={app}
              projectId={resolvedProjectId}
              feedId={reminderFeedId || ""}
              flags={flags}
              participantSeed={participantSeed}
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
    prev.participantSeed === next.participantSeed
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
        />
      )}

      {qType === SURVEY_QUESTION_TYPES.TEXT && (
        <input
          className="survey-input"
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
  submitting,
}) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [delayRemaining, setDelayRemaining] = useState(0);
  const projectId = propProjectId || getProjectId() || "";

  const visiblePages = useMemo(() => {
    const pages = Array.isArray(survey?.pages) ? survey.pages : [];
    const activeFeedId = String(feedId ?? "").trim();

    return pages
      .map((page, pageIdx) => {
        const visibleQuestions = (page?.questions || [])
          .filter(isRenderableQuestion)
          .filter((q) => isQuestionVisible(q, responses, { feedId: activeFeedId }))
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
  questions: visibleQuestions,
};
      })
      .filter((page) => page.questions.length > 0);
  }, [survey, responses, participantSeed, feedId]);

  useEffect(() => {
    setCurrentPageIndex(0);
  }, [survey?.survey_id, feedId]);

  useEffect(() => {
    if (visiblePages.length === 0) {
      if (currentPageIndex !== 0) setCurrentPageIndex(0);
      return;
    }
    if (currentPageIndex > visiblePages.length - 1) {
      setCurrentPageIndex(visiblePages.length - 1);
    }
  }, [visiblePages, currentPageIndex]);

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
  }, [currentPageIndex]);

  useEffect(() => {
  if (!currentPage || isLastPage) {
    setDelayRemaining(0);
    return;
  }

  const delaySeconds = normalizePageDelaySeconds(currentPage?.next_delay_seconds);

  if (delaySeconds <= 0) {
    setDelayRemaining(0);
    return;
  }

  setDelayRemaining(delaySeconds);

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
}, [currentPageIndex, currentPage, isLastPage]);

  

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

    const pageErrors = {};

    currentPage.questions.forEach((q) => {
      if (
        !q ||
        q.type === SURVEY_QUESTION_TYPES.INFO ||
        q.type === SURVEY_QUESTION_TYPES.POST_REMINDER ||
        !q.required
      ) {
        return;
      }

      const value = responses?.[q.id];

      if (isEmptyRequiredValue(q, value)) {
        if (
          q.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
          q.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI ||
          q.type === SURVEY_QUESTION_TYPES.BIPOLAR
        ) {
          pageErrors[q.id] = "Please complete all rows.";
        } else {
          pageErrors[q.id] = "Please answer this question.";
        }
      }
    });

    return {
      ok: Object.keys(pageErrors).length === 0,
      errors: pageErrors,
    };
  }, [currentPage, responses]);

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

  setCurrentPageIndex((prev) => Math.min(prev + 1, visiblePages.length - 1));
}, [
  isNextDelayed,
  onClearBanner,
  validateCurrentPage,
  onPageValidationFail,
  visiblePages.length,
]);

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

              <div className="survey-progress" aria-hidden="true">
                {visiblePages.map((page, idx) => (
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
                ))}
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
                    onClick={onSubmit}
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
                onClick={onSubmit}
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