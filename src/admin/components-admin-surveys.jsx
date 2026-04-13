import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeSurvey,
  frontendSurveyToBackend,
  surveyQuestionCount,
  getProjectId,
  listFeedsFromBackend,
  listSurveysFromBackend,
  loadSurveyFromBackend,
  saveSurveyToBackend,
  deleteSurveyOnBackend,
  linkSurveyToFeedsOnBackend,
  getLinkedFeedIdsForSurveyFromBackend,
  loadPostsFromBackend,
  SURVEY_QUESTION_TYPES,
} from "../utils";

import {
  SurveyEditor,
  buildSavedQuestion,
  buildSurveyPagesFromFlatQuestions,
  flattenSurveyPagesForEditor,
  normalizeQuestionForEditor,
} from "./components-admin-surveys-editor";

/* =========================
   Local helpers
   ========================== */

const POST_REMINDER_TYPE =
  SURVEY_QUESTION_TYPES?.POST_REMINDER || "post_reminder";

function normalizeLinkedFeedIds(input) {
  return Array.isArray(input) ? input.map(String).filter(Boolean) : [];
}

function slugifySurveyName(name = "") {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeCopiedSurveyName(name = "") {
  const base = slugifySurveyName(name || "Untitled Survey");
  return base.endsWith("(Copy)") ? base : `${base} (Copy)`;
}

function makeImportedSurveyName(name = "") {
  const base = slugifySurveyName(name || "Untitled Survey");
  return base.endsWith("(Imported)") ? base : `${base} (Imported)`;
}

function hasPostReminderQuestion(surveyLike) {
  const flatQuestions = flattenSurveyPagesForEditor(surveyLike || {});
  return flatQuestions.some((q) => q?.type === POST_REMINDER_TYPE);
}

function resetSurveyIdentityForCopy(
  sourceSurvey,
  { projectId, keepFeedLinks = true } = {}
) {
  const normalized = normalizeSurvey(deepClone(sourceSurvey || {}));

  const copied = {
    ...normalized,
    survey_id: "",
    name: makeCopiedSurveyName(normalized.name),
    linked_project_id: projectId || "",
    linked_feed_ids: keepFeedLinks
      ? normalizeLinkedFeedIds(normalized.linked_feed_ids)
      : [],
    created_at: null,
    updated_at: null,
    version: 1,
    status: normalized.status || "draft",
    trigger: normalized.trigger || "after_feed_submit",
    pages: (normalized.pages || []).map((page, pageIndex) => ({
      ...page,
      id: page?.id || `page_${pageIndex + 1}`,
      questions: (page.questions || []).map((q, qIndex) => {
        const cleanQ = normalizeQuestionForEditor(q, qIndex);

        return {
          ...cleanQ,
          meta: cleanQ?.meta ? deepClone(cleanQ.meta) : {},
          visible_if: cleanQ?.visible_if ? deepClone(cleanQ.visible_if) : null,
          visible_in_feeds: Array.isArray(cleanQ?.visible_in_feeds)
            ? [...cleanQ.visible_in_feeds]
            : [],
          feed_overrides: cleanQ?.feed_overrides
            ? deepClone(cleanQ.feed_overrides)
            : {},
        };
      }),
    })),
  };

  return buildSurveyPagesFromFlatQuestions(
    copied,
    flattenSurveyPagesForEditor(copied)
  );
}

function resetSurveyIdentityForImport(sourceSurvey, { projectId } = {}) {
  const normalized = normalizeSurvey(deepClone(sourceSurvey || {}));

  const imported = {
    ...normalized,
    survey_id: "",
    name: makeImportedSurveyName(normalized.name),
    linked_project_id: projectId || "",
    linked_feed_ids: [],
    created_at: null,
    updated_at: null,
    version: 1,
    status: "draft",
    trigger: normalized.trigger || "after_feed_submit",
    pages: (normalized.pages || []).map((page, pageIndex) => ({
      ...page,
      id: page?.id || `page_${pageIndex + 1}`,
      questions: (page.questions || []).map((q, qIndex) => {
        const cleanQ = normalizeQuestionForEditor(q, qIndex);

        return {
          ...cleanQ,
          meta: cleanQ?.meta ? deepClone(cleanQ.meta) : {},
          visible_if: cleanQ?.visible_if ? deepClone(cleanQ.visible_if) : null,
          visible_in_feeds: Array.isArray(cleanQ?.visible_in_feeds)
            ? [...cleanQ.visible_in_feeds]
            : [],
          feed_overrides: cleanQ?.feed_overrides
            ? deepClone(cleanQ.feed_overrides)
            : {},
        };
      }),
    })),
  };

  return buildSurveyPagesFromFlatQuestions(
    imported,
    flattenSurveyPagesForEditor(imported)
  );
}

function surveyListButtonStyle(isActive) {
  return {
    width: "100%",
    textAlign: "left",
    padding: "12px 14px",
    cursor: "pointer",
    borderRadius: 12,
    marginBottom: 8,
    background: isActive ? "#eef2ff" : "#fff",
    border: isActive ? "1px solid #c7d2fe" : "1px solid #e5e7eb",
    boxShadow: isActive
      ? "0 1px 2px rgba(79,70,229,0.10)"
      : "0 1px 2px rgba(0,0,0,0.03)",
    transition: "all 0.15s ease",
  };
}

function SectionCard({ title, children, right = null }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        background: "#fff",
        padding: 16,
        marginBottom: 18,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h4 style={{ margin: 0, fontSize: 16 }}>{title}</h4>
        {right}
      </div>
      {children}
    </div>
  );
}

function FieldBlock({ label, children, hint = "" }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      {children}
      {hint ? (
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, style }) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        height: 42,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

function TextAreaInput({ value, onChange, placeholder, rows = 3, style }) {
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        resize: "vertical",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

function TrashIcon({ size = 16 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function IconOnlyButton({
  onClick,
  title,
  danger = false,
  disabled = false,
  style = {},
  size = 16,
  children = null,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        width: 42,
        height: 42,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: `1px solid ${danger ? "#dc2626" : "#d1d5db"}`,
        background: "#fff",
        color: danger ? "#dc2626" : disabled ? "#9ca3af" : "#111827",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        lineHeight: 1,
        ...style,
      }}
    >
      {children || <TrashIcon size={size} />}
    </button>
  );
}

/* =========================
   Main Component
   ========================= */

export function AdminSurveysPanel({
  projectId: propProjectId,
  feedId,
  feeds: propFeeds,
  loadFeedPosts,
}) {
  const projectId = propProjectId || getProjectId();
  const effectiveLoadFeedPosts =
    typeof loadFeedPosts === "function"
      ? loadFeedPosts
      : async (currentFeedId) =>
          loadPostsFromBackend(currentFeedId, {
            projectId: projectId || undefined,
            force: true,
          });

  const importFileRef = useRef(null);
  const [surveys, setSurveys] = useState([]);
  const [feeds, setFeeds] = useState(Array.isArray(propFeeds) ? propFeeds : []);
  const [selectedSurveyId, setSelectedSurveyId] = useState(null);
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [linkedFeedPostsMap, setLinkedFeedPostsMap] = useState({});
  const [loadingReminderPosts, setLoadingReminderPosts] = useState(false);

  useEffect(() => {
    if (Array.isArray(propFeeds)) {
      setFeeds(propFeeds);
    }
  }, [propFeeds]);

  async function loadAll() {
    setLoading(true);
    try {
      const incomingFeeds = Array.isArray(propFeeds) ? propFeeds : [];

      const [surveyList, feedList] = await Promise.all([
        listSurveysFromBackend({ projectId, force: true }),
        incomingFeeds.length
          ? Promise.resolve(incomingFeeds)
          : listFeedsFromBackend({ projectId }),
      ]);

      const safeSurveyList = Array.isArray(surveyList) ? surveyList : [];
      const safeFeedList = Array.isArray(feedList) ? feedList : [];

      const enrichedSurveyList = await Promise.all(
        safeSurveyList.map(async (s) => {
          if (!s?.survey_id) return s;

          try {
            const [full, linkedFeedIds] = await Promise.all([
              loadSurveyFromBackend(s.survey_id, {
                projectId,
                force: true,
              }),
              getLinkedFeedIdsForSurveyFromBackend({
                surveyId: s.survey_id,
                projectId,
                allFeeds: safeFeedList,
              }),
            ]);

            const normalizedFull = normalizeSurvey(full || {});
            return {
              ...s,
              ...normalizedFull,
              linked_feed_ids: normalizeLinkedFeedIds(linkedFeedIds),
              linked_project_id: projectId,
              trigger: normalizedFull.trigger || "after_feed_submit",
            };
          } catch {
            return {
              ...s,
              linked_feed_ids: [],
              linked_project_id: projectId,
              trigger: "after_feed_submit",
            };
          }
        })
      );

      setSurveys(enrichedSurveyList);
      setFeeds(safeFeedList);
    } catch (e) {
      console.warn("Failed to load surveys:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectSurvey(id) {
    setSelectedSurveyId(id);

    if (!id) {
      setSurvey(null);
      setLinkedFeedPostsMap({});
      return;
    }

    try {
      const [s, linkedFeedIds] = await Promise.all([
        loadSurveyFromBackend(id, { projectId, force: true }),
        getLinkedFeedIdsForSurveyFromBackend({
          surveyId: id,
          projectId,
          allFeeds: feeds,
        }),
      ]);

      const normalized = normalizeSurvey(s || {});
      const editorSurvey = buildSurveyPagesFromFlatQuestions(
        {
          ...normalized,
          linked_feed_ids: normalizeLinkedFeedIds(linkedFeedIds),
          linked_project_id: projectId,
          trigger: normalized.trigger || "after_feed_submit",
        },
        flattenSurveyPagesForEditor(normalized)
      );

      setSurvey(editorSurvey);
    } catch (e) {
      console.warn("Failed to load survey:", e);
      setSurvey(null);
      setLinkedFeedPostsMap({});
    }
  }

  function handleCreateSurvey() {
    const baseSurvey = {
      linked_project_id: projectId,
      linked_feed_ids: [],
      trigger: "after_feed_submit",
      survey_id: "",
      name: "",
      description: "",
      status: "draft",
      version: 1,
      pages: [
        {
          id: "page_1",
          title: "",
          description: "",
          questions: [],
        },
      ],
    };

    const editorSurvey = buildSurveyPagesFromFlatQuestions(
      baseSurvey,
      flattenSurveyPagesForEditor(baseSurvey)
    );

    setSurvey(editorSurvey);
    setSelectedSurveyId(null);
    setLinkedFeedPostsMap({});
  }

  function handleCopySurvey() {
    if (!survey) return;

    const copiedSurvey = resetSurveyIdentityForCopy(survey, {
      projectId,
      keepFeedLinks: true,
    });

    setSurvey(copiedSurvey);
    setSelectedSurveyId(null);
    setLinkedFeedPostsMap({});
  }

  function handleExportSurvey() {
    if (!survey) return;

    const normalized = normalizeSurvey(survey);

    const exportPayload = {
      ...frontendSurveyToBackend(normalized),
      linked_feed_ids: normalizeLinkedFeedIds(normalized.linked_feed_ids),
      linked_project_id: normalized.linked_project_id || "",
      trigger: normalized.trigger || "after_feed_submit",
      exported_at: new Date().toISOString(),
      export_format: "survey_v1",
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = slugifySurveyName(normalized.name || "survey")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_");

    a.href = url;
    a.download = `${safeName || "survey"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportSurveyFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const normalizedImported = normalizeSurvey(parsed || {});
      const importedSurvey = resetSurveyIdentityForImport(normalizedImported, {
        projectId,
      });

      setSurvey(importedSurvey);
      setSelectedSurveyId(null);
      setLinkedFeedPostsMap({});
    } catch (e) {
      console.warn("Failed to import survey:", e);
      alert("Failed to import survey JSON.");
    } finally {
      if (event.target) {
        event.target.value = "";
      }
    }
  }

  async function handleSaveSurvey() {
    if (!survey) return;

    setSavingSurvey(true);
    try {
      const normalized = {
        ...survey,
        linked_project_id: projectId,
        linked_feed_ids: normalizeLinkedFeedIds(survey.linked_feed_ids),
        trigger: survey.trigger || "after_feed_submit",
      };

      const rebuiltSurvey = buildSurveyPagesFromFlatQuestions(
        normalized,
        flattenSurveyPagesForEditor(normalized)
      );

      const payload = {
        ...normalized,
        pages: (rebuiltSurvey.pages || []).map((page) => ({
          ...(page || { id: "page_1", title: "", description: "" }),
          questions: (page.questions || []).map((q, i) => buildSavedQuestion(q, i)),
        })),
      };

      const res = await saveSurveyToBackend(payload, { projectId });

      if (res?.ok) {
        const savedSurveyId = res.survey_id || payload.survey_id;

        const [fresh, linkedFeedIds] = await Promise.all([
          loadSurveyFromBackend(savedSurveyId, {
            projectId,
            force: true,
          }),
          getLinkedFeedIdsForSurveyFromBackend({
            surveyId: savedSurveyId,
            projectId,
            allFeeds: feeds,
          }),
        ]);

        const normalizedFresh = normalizeSurvey({
          ...(fresh || {}),
          linked_feed_ids: normalizeLinkedFeedIds(linkedFeedIds),
          linked_project_id: projectId,
          trigger: fresh?.trigger || normalized.trigger || "after_feed_submit",
        });

        const editorFresh = buildSurveyPagesFromFlatQuestions(
          normalizedFresh,
          flattenSurveyPagesForEditor(normalizedFresh)
        );

        setSelectedSurveyId(savedSurveyId);
        setSurvey(editorFresh);

        await loadAll();
        alert("Survey saved");
      } else {
        alert(res?.err || "Failed to save survey");
      }
    } catch (e) {
      console.warn("Failed to save survey:", e);
      alert("Failed to save survey");
    } finally {
      setSavingSurvey(false);
    }
  }

  async function handleDeleteSurvey() {
    if (!survey?.survey_id) return;
    if (!window.confirm("Delete this survey?")) return;

    try {
      const res = await deleteSurveyOnBackend(survey.survey_id, { projectId });
      if (res?.ok) {
        setSurvey(null);
        setSelectedSurveyId(null);
        setLinkedFeedPostsMap({});
        await loadAll();
      } else {
        alert(res?.err || "Failed to delete survey");
      }
    } catch (e) {
      console.warn("Failed to delete survey:", e);
      alert("Failed to delete survey");
    }
  }

  function toggleFeed(nextFeedId) {
    setSurvey((prev) => {
      const set = new Set(normalizeLinkedFeedIds(prev?.linked_feed_ids));
      if (set.has(nextFeedId)) set.delete(nextFeedId);
      else set.add(nextFeedId);

      return {
        ...prev,
        linked_feed_ids: Array.from(set),
      };
    });
  }

  async function handleSaveFeedLinks() {
    if (!survey?.survey_id) {
      alert("Save survey first before linking feeds.");
      return;
    }

    setSavingLinks(true);
    try {
      const res = await linkSurveyToFeedsOnBackend({
        surveyId: survey.survey_id,
        feedIds: normalizeLinkedFeedIds(survey.linked_feed_ids),
        projectId,
        allFeeds: feeds,
        trigger: survey.trigger || "after_feed_submit",
      });

      if (res?.ok) {
        const linkedIds = await getLinkedFeedIdsForSurveyFromBackend({
          surveyId: survey.survey_id,
          projectId,
          allFeeds: feeds,
        });

        setSurvey((prev) => ({
          ...prev,
          linked_feed_ids: normalizeLinkedFeedIds(linkedIds),
        }));

        await loadAll();
        alert("Feeds linked");
      } else {
        alert(res?.err || "Failed to link feeds");
      }
    } catch (e) {
      console.warn("Failed to link feeds:", e);
      alert("Failed to link feeds");
    } finally {
      setSavingLinks(false);
    }
  }

  const linkedFeedCount = useMemo(
    () => normalizeLinkedFeedIds(survey?.linked_feed_ids).length,
    [survey]
  );

  const linkedFeedsForEditor = useMemo(() => {
    const linkedIds = new Set(normalizeLinkedFeedIds(survey?.linked_feed_ids));
    return (Array.isArray(feeds) ? feeds : []).filter((f) =>
      linkedIds.has(String(f?.feed_id || ""))
    );
  }, [feeds, survey]);

  const needsReminderPosts = useMemo(() => {
    return hasPostReminderQuestion(survey);
  }, [survey]);

  useEffect(() => {
    let cancelled = false;

    async function loadLinkedFeedPostsForReminder() {
      if (!survey) {
        setLinkedFeedPostsMap({});
        setLoadingReminderPosts(false);
        return;
      }

      if (!needsReminderPosts) {
        setLinkedFeedPostsMap({});
        setLoadingReminderPosts(false);
        return;
      }

      const relevantFeeds = Array.isArray(linkedFeedsForEditor)
        ? linkedFeedsForEditor
        : [];

      if (!relevantFeeds.length) {
        setLinkedFeedPostsMap({});
        setLoadingReminderPosts(false);
        return;
      }

      setLoadingReminderPosts(true);

      try {
        const entries = await Promise.all(
          relevantFeeds.map(async (feed) => {
            const currentFeedId = String(feed?.feed_id || "").trim();
            if (!currentFeedId) return null;

            try {
              const posts = await effectiveLoadFeedPosts(currentFeedId);
              return [currentFeedId, Array.isArray(posts) ? posts : []];
            } catch (e) {
              console.warn(
                `Failed to load posts for feed ${currentFeedId}:`,
                e
              );
              return [currentFeedId, []];
            }
          })
        );

        if (cancelled) return;

        const nextMap = {};
        entries.forEach((entry) => {
          if (!entry) return;
          const [currentFeedId, posts] = entry;
          nextMap[currentFeedId] = posts;
        });

      console.log("linkedFeedsForEditor", linkedFeedsForEditor);
console.log("nextMap", nextMap);

        setLinkedFeedPostsMap(nextMap);
      } finally {
        if (!cancelled) {
          setLoadingReminderPosts(false);
        }
      }
    }

    loadLinkedFeedPostsForReminder();

    return () => {
      cancelled = true;
    };
  }, [survey, needsReminderPosts, linkedFeedsForEditor, effectiveLoadFeedPosts]);

  const pageCount = useMemo(() => {
    if (!survey) return 0;
    const pages =
      buildSurveyPagesFromFlatQuestions(
        survey,
        flattenSurveyPagesForEditor(survey)
      ).pages || [];
    return pages.length;
  }, [survey]);

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div
        style={{
          width: 280,
          flex: "0 0 280px",
          borderRight: "1px solid #e5e7eb",
          paddingRight: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <h3 style={{ margin: 0 }}>Survey list</h3>
          {loading && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>Loading…</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCreateSurvey}
          style={{
            marginBottom: 14,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #4f46e5",
            background: "#4f46e5",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 10px rgba(79,70,229,0.18)",
          }}
        >
          + New Survey
        </button>

        <div>
          {surveys.map((s) => {
            const isActive = selectedSurveyId === s.survey_id;
            return (
              <button
                key={s.survey_id}
                type="button"
                onClick={() => handleSelectSurvey(s.survey_id)}
                style={surveyListButtonStyle(isActive)}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: isActive ? "#3730a3" : "#111827",
                    marginBottom: 4,
                  }}
                >
                  {s.name || s.survey_id}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {surveyQuestionCount(s || {})} questions
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!survey && (
          <div style={{ color: "#6b7280" }}>Select or create a survey.</div>
        )}

        {survey && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <h3 style={{ margin: 0 }}>Survey Editor</h3>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {linkedFeedCount} linked feed
                  {linkedFeedCount === 1 ? "" : "s"} · {pageCount} page
                  {pageCount === 1 ? "" : "s"}
                </div>

                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportSurveyFile}
                  style={{ display: "none" }}
                />

                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Import
                </button>

                {survey && (
                  <>
                    <button
                      type="button"
                      onClick={handleCopySurvey}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Copy
                    </button>

                    <button
                      type="button"
                      onClick={handleExportSurvey}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Export
                    </button>
                  </>
                )}

                {!!survey?.survey_id && (
                  <IconOnlyButton
                    onClick={handleDeleteSurvey}
                    title="Delete survey"
                    danger
                    size={17}
                  />
                )}
              </div>
            </div>

            <SectionCard title="Survey details">
              <FieldBlock label="Survey name">
                <TextInput
                  value={survey.name}
                  onChange={(v) => setSurvey({ ...survey, name: v })}
                  placeholder="Survey name"
                />
              </FieldBlock>

              <FieldBlock label="Description">
                <TextAreaInput
                  value={survey.description}
                  onChange={(v) => setSurvey({ ...survey, description: v })}
                  placeholder="Description"
                  rows={3}
                />
              </FieldBlock>
            </SectionCard>

            <SectionCard
              title="Link to feeds"
              right={
                <button
                  type="button"
                  onClick={handleSaveFeedLinks}
                  disabled={savingLinks}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    cursor: savingLinks ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {savingLinks ? "Saving..." : "Save Feed Links"}
                </button>
              }
            >
              <div
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: 12,
                  maxHeight: 220,
                  overflow: "auto",
                }}
              >
                {feeds.length === 0 && (
                  <div style={{ color: "#6b7280" }}>No feeds found.</div>
                )}

                {feeds.map((f) => (
                  <div key={f.feed_id} style={{ marginBottom: 8 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={normalizeLinkedFeedIds(
                          survey.linked_feed_ids
                        ).includes(f.feed_id)}
                        onChange={() => toggleFeed(f.feed_id)}
                      />
                      <span>{f.name || f.feed_id}</span>
                      {feedId && f.feed_id === feedId && (
                        <span style={{ fontSize: 12, color: "#6b7280" }}>
                          (current)
                        </span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </SectionCard>

            {needsReminderPosts && loadingReminderPosts && (
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                Loading linked feed posts for post reminder questions…
              </div>
            )}

            <SurveyEditor
              survey={survey}
              onSurveyChange={setSurvey}
              linkedFeeds={linkedFeedsForEditor}
              linkedFeedPostsMap={linkedFeedPostsMap}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={handleSaveSurvey}
                disabled={savingSurvey}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid #4f46e5",
                  background: "#4f46e5",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: savingSurvey ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 10px rgba(79,70,229,0.18)",
                }}
              >
                {savingSurvey ? "Saving Survey..." : "Save Survey"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}