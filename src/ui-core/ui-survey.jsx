import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  SURVEY_QUESTION_TYPES,
  isQuestionVisible,
  getRenderedQuestion,
  getProjectId,
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

function PostReminderCard({
  question,
  posts = [],
  projectId,
  feedId,
  flags,
  participantSeed,
}) {
  const post = getQuestionReminderPost(question, posts);
  const fallbackLabel = getReminderPostLabel(question, post || {});
  const reminderFeedId = getReminderPostFeedId(question, feedId);
  const app = getReminderApp();

  if (!post) {
    return (
      <div className="survey-post-reminder-block">
        {question?.text ? (
          <div
            className="survey-post-reminder-intro"
            dangerouslySetInnerHTML={{ __html: question.text || "" }}
          />
        ) : null}

        <div
          className="survey-post-reminder-card"
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            padding: 14,
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          {fallbackLabel
            ? `Reminder post selected: ${fallbackLabel}`
            : "No reminder post has been selected for this survey item yet."}
        </div>
      </div>
    );
  }

  return (
    <div className="survey-post-reminder-block">
      {question?.text ? (
        <div
          className="survey-post-reminder-intro"
          dangerouslySetInnerHTML={{ __html: question.text || "" }}
        />
      ) : null}

      <div
        className="survey-post-reminder-card"
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <PostCard
          post={post}
          onAction={() => {}}
          disabled={true}
          registerViewRef={() => undefined}
          app={app}
          projectId={projectId || getProjectId() || ""}
          feedId={reminderFeedId || ""}
          runSeed={participantSeed || "survey-reminder-preview"}
          flags={flags || {}}
        />
      </div>
    </div>
  );
}

export function SurveyQuestionRenderer({
  question,
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

  const choiceItems = Array.isArray(question?.choices)
    ? question.choices
    : Array.isArray(question?.options)
      ? question.options.map((label, i) => ({
          value: `opt_${i + 1}`,
          label: String(label || ""),
        }))
      : [];

  const rows = Array.isArray(question?.rows) ? question.rows : [];
  const columns = Array.isArray(question?.columns) ? question.columns : [];
  const bipolarPoints = makeBipolarScalePoints(question?.min, question?.max);

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
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {qType === SURVEY_QUESTION_TYPES.TEXTAREA && (
        <textarea
          className="survey-textarea"
          rows={4}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {(qType === SURVEY_QUESTION_TYPES.SINGLE ||
        qType === SURVEY_QUESTION_TYPES.DROPDOWN) && (
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
                              name={`${question.id}__${rowKey}`}
                              checked={String(rowValue) === pointValue}
                              onChange={() =>
                                onChange({
                                  ...(value && typeof value === "object"
                                    ? value
                                    : {}),
                                  [rowKey]: pointValue,
                                })
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
            onChange={(e) => onChange(String(e.target.value))}
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
                            name={`${question.id}__${rowKey}`}
                            checked={rowValue === colValue}
                            onChange={() =>
                              onChange({
                                ...(value && typeof value === "object"
                                  ? value
                                  : {}),
                                [rowKey]: colValue,
                              })
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
                            onChange={(e) => {
                              const nextRowValues = e.target.checked
                                ? [...rowValues, colValue]
                                : rowValues.filter((v) => v !== colValue);

                              onChange({
                                ...(value && typeof value === "object"
                                  ? value
                                  : {}),
                                [rowKey]: nextRowValues,
                              });
                            }}
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
}

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

  useLayoutEffect(() => {
    scrollSurveyPageToTop();
  }, [currentPageIndex]);

  const currentPage = visiblePages[currentPageIndex] || null;
  const isLastPage = currentPageIndex === visiblePages.length - 1;
  const isFirstPage = currentPageIndex === 0;

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

  const goNext = () => {
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
  };

  const goBack = () => {
    onClearBanner?.();
    setCurrentPageIndex((prev) => Math.max(prev - 1, 0));
  };

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
                index={displayIndex}
                value={value}
                error={error}
                onChange={(nextValue) => onChange(q.id, nextValue)}
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
                    disabled={submitting}
                  >
                    Next
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