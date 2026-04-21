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

function getChoiceItems(question) {
  return Array.isArray(question?.choices)
    ? question.choices
    : Array.isArray(question?.options)
      ? question.options.map((label, i) => ({
          value: `opt_${i + 1}`,
          label: String(label || ""),
        }))
      : [];
}

function getRowKey(row, rowIndex) {
  return row?.value || row?.label || `row_${rowIndex + 1}`;
}

function getRowLabel(row, rowIndex) {
  return row?.label || row?.value || `Row ${rowIndex + 1}`;
}

function getColumnValue(col, colIndex) {
  return col?.value || col?.label || `col_${colIndex + 1}`;
}

function getColumnLabel(col, colIndex) {
  return col?.label || col?.value || `Option ${colIndex + 1}`;
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

function isEmptyRequiredValue(q, value) {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;

  if (typeof value === "object") {
    const obj = value || {};

    if (q?.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE) {
      const rows = Array.isArray(q?.rows) ? q.rows : [];
      return rows.some((row, rowIndex) => {
        const rowKey = getRowKey(row, rowIndex);
        return !obj[rowKey];
      });
    }

    if (q?.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI) {
      const rows = Array.isArray(q?.rows) ? q.rows : [];
      return rows.some((row, rowIndex) => {
        const rowKey = getRowKey(row, rowIndex);
        return !Array.isArray(obj[rowKey]) || obj[rowKey].length === 0;
      });
    }

    if (q?.type === SURVEY_QUESTION_TYPES.BIPOLAR) {
      const rows = Array.isArray(q?.rows) ? q.rows : [];
      return rows.some((row, rowIndex) => {
        const rowKey = getRowKey(row, rowIndex);
        return String(obj[rowKey] ?? "").trim() === "";
      });
    }

    return Object.keys(obj).length === 0;
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
  return String(
    window.APP ||
      new URLSearchParams(window.location.search).get("app") ||
      "fb"
  ).toLowerCase() === "ig"
    ? "ig"
    : "fb";
}

function PlainOrHtmlBlock({ value, className, style }) {
  if (!value) return null;

  const asString = String(value || "");
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(asString);

  if (looksLikeHtml) {
    return (
      <div
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: asString }}
      />
    );
  }

  return (
    <div className={className} style={style}>
      {asString}
    </div>
  );
}

const ReminderPostInnerMobile = memo(function ReminderPostInnerMobile({
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
});

const PostReminderCardMobile = memo(function PostReminderCardMobile({
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
              : lazyError ||
                (fallbackLabel
                  ? `Reminder post selected: ${fallbackLabel}`
                  : "No reminder post has been selected for this survey item yet.")}
          </div>
        </div>
      ) : (
        <div className="survey-post-reminder-outer">
          <div className="survey-post-reminder-frame">
            <div className="survey-post-reminder-card">
              <ReminderPostInnerMobile
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
});

function MobileQuestionWrapper({ question, index, error, children }) {
  const isInfo = question?.type === SURVEY_QUESTION_TYPES.INFO;
  const isPostReminder =
    question?.type === SURVEY_QUESTION_TYPES.POST_REMINDER;

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
        <div
          className="survey-question-description"
          dangerouslySetInnerHTML={{ __html: question.description || "" }}
        />
      ) : null}

      {isInfo ? (
        <div
          className="survey-info-block"
          dangerouslySetInnerHTML={{ __html: question.text || "" }}
        />
      ) : (
        children
      )}

      {error ? <div className="survey-error">{error}</div> : null}
    </div>
  );
}

function MobileSingleChoice({ question, value, onChange }) {
  const choiceItems = getChoiceItems(question);

  return (
    <div className="survey-options">
      {choiceItems.map((choice) => (
        <label key={choice.value} className="survey-option">
          <input
            type="radio"
            name={question.id}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
          />
          <span>{choice.label}</span>
        </label>
      ))}
    </div>
  );
}

function MobileMultiChoice({ question, value, onChange }) {
  const choiceItems = getChoiceItems(question);
  const current = Array.isArray(value) ? value : [];

  return (
    <div className="survey-options">
      {choiceItems.map((choice) => {
        const checked = current.includes(choice.value);

        return (
          <label key={choice.value} className="survey-option">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...current, choice.value]);
                } else {
                  onChange(current.filter((v) => v !== choice.value));
                }
              }}
            />
            <span>{choice.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function MobileBipolar({ question, value, onChange }) {
  const rows = Array.isArray(question?.rows) ? question.rows : [];
  const points = makeBipolarScalePoints(question?.min, question?.max);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((row, rowIndex) => {
        const rowKey = getRowKey(row, rowIndex);
        const rowLabel = getRowLabel(row, rowIndex);
        const rowValue = value && typeof value === "object" ? value[rowKey] : "";
        const leftLabel =
          row?.left_label || question?.left_label || question?.min_label || "";
        const rightLabel =
          row?.right_label || question?.right_label || question?.max_label || "";

        return (
          <div
            key={rowKey}
            style={{
              border: "1px solid #ececec",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: ".95rem", lineHeight: 1.4 }}>
              {rowLabel}
            </div>

            <div className="survey-scale-labels">
              <span>{leftLabel}</span>
              <span>{rightLabel}</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
                gap: 8,
              }}
            >
              {points.map((point) => {
                const pointValue = String(point);
                const checked = String(rowValue) === pointValue;

                return (
                  <label
                    key={pointValue}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      border: checked
                        ? "1px solid rgba(237,73,86,.45)"
                        : "1px solid #ececec",
                      background: checked ? "rgba(237,73,86,.08)" : "#fff",
                      borderRadius: 12,
                      padding: "10px 6px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: ".88rem", fontWeight: 700 }}>
                      {pointValue}
                    </span>
                    <input
                      type="radio"
                      name={`${question.id}__${rowKey}`}
                      checked={checked}
                      onChange={() =>
                        onChange({
                          ...(value && typeof value === "object" ? value : {}),
                          [rowKey]: pointValue,
                        })
                      }
                    />
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileMatrixSingle({ question, value, onChange }) {
  const rows = Array.isArray(question?.rows) ? question.rows : [];
  const columns = Array.isArray(question?.columns) ? question.columns : [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((row, rowIndex) => {
        const rowKey = getRowKey(row, rowIndex);
        const rowLabel = getRowLabel(row, rowIndex);
        const rowValue = value && typeof value === "object" ? value[rowKey] : "";

        return (
          <div
            key={rowKey}
            style={{
              border: "1px solid #ececec",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: ".95rem", lineHeight: 1.4 }}>
              {rowLabel}
            </div>

            <div className="survey-options">
              {columns.map((col, colIndex) => {
                const colValue = getColumnValue(col, colIndex);
                const colLabel = getColumnLabel(col, colIndex);

                return (
                  <label key={colValue} className="survey-option">
                    <input
                      type="radio"
                      name={`${question.id}__${rowKey}`}
                      checked={rowValue === colValue}
                      onChange={() =>
                        onChange({
                          ...(value && typeof value === "object" ? value : {}),
                          [rowKey]: colValue,
                        })
                      }
                    />
                    <span>{colLabel}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileMatrixMulti({ question, value, onChange }) {
  const rows = Array.isArray(question?.rows) ? question.rows : [];
  const columns = Array.isArray(question?.columns) ? question.columns : [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((row, rowIndex) => {
        const rowKey = getRowKey(row, rowIndex);
        const rowLabel = getRowLabel(row, rowIndex);
        const rowValues =
          value && typeof value === "object" && Array.isArray(value[rowKey])
            ? value[rowKey]
            : [];

        return (
          <div
            key={rowKey}
            style={{
              border: "1px solid #ececec",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: ".95rem", lineHeight: 1.4 }}>
              {rowLabel}
            </div>

            <div className="survey-options">
              {columns.map((col, colIndex) => {
                const colValue = getColumnValue(col, colIndex);
                const colLabel = getColumnLabel(col, colIndex);
                const checked = rowValues.includes(colValue);

                return (
                  <label key={colValue} className="survey-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const nextRowValues = e.target.checked
                          ? [...rowValues, colValue]
                          : rowValues.filter((v) => v !== colValue);

                        onChange({
                          ...(value && typeof value === "object" ? value : {}),
                          [rowKey]: nextRowValues,
                        });
                      }}
                    />
                    <span>{colLabel}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const SurveyQuestionRendererMobile = memo(function SurveyQuestionRendererMobile({
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

  const emitChange = useCallback(
    (nextValue) => onChange(questionId, nextValue),
    [onChange, questionId]
  );

  return (
    <MobileQuestionWrapper question={question} index={index} error={error}>
      {qType === SURVEY_QUESTION_TYPES.POST_REMINDER && (
        <PostReminderCardMobile
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
          onChange={(e) => emitChange(e.target.value)}
        />
      )}

      {qType === SURVEY_QUESTION_TYPES.TEXTAREA && (
        <textarea
          className="survey-textarea"
          rows={4}
          value={value ?? ""}
          onChange={(e) => emitChange(e.target.value)}
        />
      )}

      {(qType === SURVEY_QUESTION_TYPES.SINGLE ||
        qType === SURVEY_QUESTION_TYPES.DROPDOWN) && (
        <MobileSingleChoice
          question={question}
          value={value}
          onChange={emitChange}
        />
      )}

      {qType === SURVEY_QUESTION_TYPES.MULTI && (
        <MobileMultiChoice
          question={question}
          value={value}
          onChange={emitChange}
        />
      )}

      {qType === SURVEY_QUESTION_TYPES.BIPOLAR && (
        <MobileBipolar question={question} value={value} onChange={emitChange} />
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
            onChange={(e) => emitChange(String(e.target.value))}
            className="survey-range"
          />
          <div className="survey-range-value">{value || question.min || 0}</div>
        </div>
      )}

      {qType === SURVEY_QUESTION_TYPES.MATRIX_SINGLE && (
        <MobileMatrixSingle
          question={question}
          value={value}
          onChange={emitChange}
        />
      )}

      {qType === SURVEY_QUESTION_TYPES.MATRIX_MULTI && (
        <MobileMatrixMulti
          question={question}
          value={value}
          onChange={emitChange}
        />
      )}
    </MobileQuestionWrapper>
  );
});

export function SurveyScreenMobile({
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
  const hasMultiplePages = visiblePages.length > 1;

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
        pageErrors[q.id] =
          q.type === SURVEY_QUESTION_TYPES.MATRIX_SINGLE ||
          q.type === SURVEY_QUESTION_TYPES.MATRIX_MULTI ||
          q.type === SURVEY_QUESTION_TYPES.BIPOLAR
            ? "Please complete all rows."
            : "Please answer this question.";
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
          {hasMultiplePages ? (
            <>
              <div className="survey-page-meta">
                <div className="survey-page-title-wrap">
                  {currentPage.title ? (
                    <PlainOrHtmlBlock
                      value={currentPage.title}
                      className="survey-page-title"
                      style={{ margin: 0 }}
                    />
                  ) : null}

                  {currentPage.description ? (
                    <PlainOrHtmlBlock
                      value={currentPage.description}
                      className="survey-page-subtitle"
                    />
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
          ) : (
            (currentPage.title || currentPage.description) && (
              <div
                className="survey-page-title-wrap"
                style={{ marginBottom: currentPage.description ? 14 : 18 }}
              >
                {currentPage.title ? (
                  <PlainOrHtmlBlock
                    value={currentPage.title}
                    className="survey-page-title"
                    style={{ margin: 0 }}
                  />
                ) : null}

                {currentPage.description ? (
                  <PlainOrHtmlBlock
                    value={currentPage.description}
                    className="survey-page-subtitle"
                  />
                ) : null}
              </div>
            )
          )}

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
              <SurveyQuestionRendererMobile
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

          {errorMsg ? <div className="survey-error-banner">{errorMsg}</div> : null}

          {hasMultiplePages ? (
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

export default SurveyScreenMobile;