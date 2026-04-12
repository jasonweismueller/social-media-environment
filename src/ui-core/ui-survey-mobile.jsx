import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  SURVEY_QUESTION_TYPES,
  isQuestionVisible,
  getRenderedQuestion,
} from "../utils";

function makeBipolarScalePoints(min, max) {
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : 1;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : 7;

  if (safeMax < safeMin) return [];
  return Array.from({ length: safeMax - safeMin + 1 }, (_, i) => safeMin + i);
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

function MobileQuestionWrapper({ question, index, error, children }) {
  const isInfo = question?.type === SURVEY_QUESTION_TYPES.INFO;

  return (
    <div className={`survey-question ${isInfo ? "survey-question-info" : ""} ${error ? "has-error" : ""}`}>
      {!isInfo && (
        <div className="survey-question-title">
          <span>{index + 1}. {question.text}</span>
        </div>
      )}

      {!isInfo && question.description ? (
        <div className="survey-question-description">{question.description}</div>
      ) : null}

      {isInfo ? <div className="survey-info-block">{question.text}</div> : children}

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
        const leftLabel = row?.left_label || question?.left_label || question?.min_label || "";
        const rightLabel = row?.right_label || question?.right_label || question?.max_label || "";

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
                      border: checked ? "1px solid rgba(237,73,86,.45)" : "1px solid #ececec",
                      background: checked ? "rgba(237,73,86,.08)" : "#fff",
                      borderRadius: 12,
                      padding: "10px 6px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: ".88rem", fontWeight: 700 }}>{pointValue}</span>
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

export function SurveyQuestionRendererMobile({ question, index, value, error, onChange }) {
  const qType = question?.type;

  return (
    <MobileQuestionWrapper question={question} index={index} error={error}>
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

      {(qType === SURVEY_QUESTION_TYPES.SINGLE || qType === SURVEY_QUESTION_TYPES.DROPDOWN) && (
        <MobileSingleChoice question={question} value={value} onChange={onChange} />
      )}

      {qType === SURVEY_QUESTION_TYPES.MULTI && (
        <MobileMultiChoice question={question} value={value} onChange={onChange} />
      )}

      {qType === SURVEY_QUESTION_TYPES.BIPOLAR && (
        <MobileBipolar question={question} value={value} onChange={onChange} />
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
        <MobileMatrixSingle question={question} value={value} onChange={onChange} />
      )}

      {qType === SURVEY_QUESTION_TYPES.MATRIX_MULTI && (
        <MobileMatrixMulti question={question} value={value} onChange={onChange} />
      )}
    </MobileQuestionWrapper>
  );
}

export function SurveyScreenMobile({
  survey,
  responses,
  errors,
  errorMsg,
  participantSeed,
  onChange,
  onSubmit,
  onPageValidationFail,
  onClearBanner,
  submitting,
}) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const visiblePages = useMemo(() => {
    const pages = Array.isArray(survey?.pages) ? survey.pages : [];

    return pages
      .map((page, pageIdx) => {
        const visibleQuestions = (page?.questions || [])
          .filter((q) => isQuestionVisible(q, responses))
          .map((question) =>
            getRenderedQuestion(question, {
              participantSeed: participantSeed || "",
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
  }, [survey, responses, participantSeed]);

  useEffect(() => {
    setCurrentPageIndex(0);
  }, [survey?.survey_id]);

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

  const questionNumberOffset = useMemo(() => {
    let count = 0;
    for (let i = 0; i < currentPageIndex; i += 1) {
      const page = visiblePages[i];
      count += (page?.questions || []).filter((q) => q?.type !== SURVEY_QUESTION_TYPES.INFO).length;
    }
    return count;
  }, [visiblePages, currentPageIndex]);

  const validateCurrentPage = useCallback(() => {
    if (!currentPage) return { ok: true, errors: {} };

    const pageErrors = {};

    currentPage.questions.forEach((q) => {
      if (!q || q.type === SURVEY_QUESTION_TYPES.INFO || !q.required) return;

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

  const goNext = () => {
    onClearBanner?.();
    const validation = validateCurrentPage();

    if (!validation.ok) {
      onPageValidationFail?.(validation.errors, "Please complete the highlighted questions on this page.");
      return;
    }

    setCurrentPageIndex((prev) => Math.min(prev + 1, visiblePages.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    onClearBanner?.();
    setCurrentPageIndex((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!currentPage) {
    return (
      <div className="survey-shell">
        <div className="survey-card">
          <div className="survey-body survey-body-standalone">
            <div className="survey-error-banner">No survey questions are available.</div>
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
                    <div className="survey-page-subtitle">{currentPage.description}</div>
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
            <div className="survey-page-title-wrap" style={{ marginBottom: currentPage.description ? 14 : 18 }}>
              <h2 className="survey-page-title">{currentPage.title}</h2>
              {currentPage.description ? (
                <div className="survey-page-subtitle">{currentPage.description}</div>
              ) : null}
            </div>
          ) : null}

          {currentPage.questions.map((q, idx) => {
            const isInfo = q?.type === SURVEY_QUESTION_TYPES.INFO;
            const displayIndex = isInfo
              ? null
              : questionNumberOffset +
                currentPage.questions
                  .slice(0, idx + 1)
                  .filter((item) => item?.type !== SURVEY_QUESTION_TYPES.INFO).length - 1;

            const value = responses?.[q.id];
            const error = errors?.[q.id];

            return (
              <SurveyQuestionRendererMobile
                key={q.id}
                question={q}
                index={displayIndex}
                value={value}
                error={error}
                onChange={(nextValue) => onChange(q.id, nextValue)}
              />
            );
          })}

          {errorMsg ? <div className="survey-error-banner">{errorMsg}</div> : null}

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

export default SurveyScreenMobile;