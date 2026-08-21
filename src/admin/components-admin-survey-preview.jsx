import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Toggle, IconPillButton, IconShuffle, EmptyState, useToast, useAdminTheme } from "./ui";
import { SurveyScreen, SurveyScreenMobile, SurveyPrefaceFlow, ParticipantThemeToggle } from "../ui-core";
import { materializePagesFromBlocks, SURVEY_QUESTION_TYPES } from "../utils";

// Same "does this HTML field actually have content" check SurveyPrefaceFlow
// itself uses internally (it builds its own `steps` array from these same
// three fields and renders nothing for a step whose html is empty) — kept
// here too so this modal can decide *before* mounting SurveyPrefaceFlow
// whether there's a preface stage to show at all, versus jumping straight
// to the questions.
function surveyHasPrefaceContent(survey) {
  return !!(
    (survey?.participant_information_html || "").trim() ||
    (survey?.consent_text_html || "").trim() ||
    (survey?.instructions_html || "").trim()
  );
}

// Deliberately all-false — a stable, deterministic preview default. Any
// per-question `apply_feed_randomization` setting (post_reminder questions)
// is respected as-is; this only supplies the fallback the reminder card uses
// before its own (real, read-only) feed-flags fetch resolves.
const PREVIEW_FLAGS = {
  randomize_times: false,
  randomize_avatars: false,
  randomize_images: false,
  randomize_names: false,
  randomize_bios: false,
};

// Local, minimal check — deliberately not importing from
// components-admin-surveys-editor.jsx (which imports this file) to avoid a
// circular module dependency. `survey.pages[].questions[]` already holds
// real question objects with a plain `.type` field on the editor's in-memory
// survey shape, so no editor-specific flattening helper is needed here.
function surveyHasPostReminderQuestion(survey) {
  const pages = Array.isArray(survey?.pages) ? survey.pages : [];
  return pages.some(
    (page) =>
      Array.isArray(page?.questions) &&
      page.questions.some((q) => q?.type === SURVEY_QUESTION_TYPES.POST_REMINDER)
  );
}

function resolveGroupFeedSequence(experimentGroups, previewGroupId, feedSequenceIds) {
  const group = (experimentGroups || []).find((g) => g?.id === previewGroupId);
  if (Array.isArray(group?.feed_sequence_ids) && group.feed_sequence_ids.length) {
    return group.feed_sequence_ids;
  }
  return Array.isArray(feedSequenceIds) ? feedSequenceIds : [];
}

function getPostIdForMatch(post) {
  return String(
    post?.id ?? post?.post_id ?? post?.postId ?? post?.meta?.post_id ?? ""
  ).trim();
}

// A post_reminder's `post_id` is only unique *within* its own source feed —
// the same bare post_id can validly exist across several feeds (e.g. a
// template post duplicated into Control/Treatment/PL variant feeds, each
// with different real content). The real participant-facing app never hits
// this ambiguity because a real participant only ever has ONE feed's posts
// loaded at a time. This preview aggregates every linked feed's posts
// together (so any reminder can render without a live fetch), which
// reintroduces exactly that collision: `getQuestionReminderPost`
// (ui-survey.jsx) matches purely by post_id with no feed awareness, so two
// reminders sharing a post_id but pointing at different feeds would both
// resolve to whichever feed's copy happens to come first in the flattened
// array. Fixed by resolving each reminder's post explicitly by
// (post_feed_id, post_id) here and injecting it as `meta.post_snapshot` —
// checked by `getQuestionReminderPost` before it ever falls back to the
// ambiguous flattened `posts` array.
function withResolvedReminderSnapshots(pages, linkedFeedPostsMap) {
  return pages.map((page) => {
    if (!Array.isArray(page?.questions) || !page.questions.length) return page;
    return {
      ...page,
      questions: page.questions.map((q) => {
        if (q?.type !== SURVEY_QUESTION_TYPES.POST_REMINDER) return q;
        if (q?.meta?.post_snapshot) return q;
        const feedId = String(q?.post_feed_id ?? q?.meta?.post_feed_id ?? "").trim();
        const postId = String(q?.post_id ?? q?.meta?.post_id ?? "").trim();
        if (!feedId || !postId) return q;
        const feedPosts = Array.isArray(linkedFeedPostsMap?.[feedId])
          ? linkedFeedPostsMap[feedId]
          : [];
        const match = feedPosts.find((p) => getPostIdForMatch(p) === postId);
        if (!match) return q;
        return { ...q, meta: { ...(q.meta || {}), post_snapshot: match } };
      }),
    };
  });
}

export function SurveyPreviewModal({
  survey,
  experimentGroups = [],
  linkedFeeds = [],
  linkedFeedPostsMap = {},
  feedSequenceIds = [],
  initialQuestionId = null,
  onClose,
}) {
  const toast = useToast();

  const [responses, setResponses] = useState({});
  const [errors, setErrors] = useState({});
  const [errorMsg, setErrorMsg] = useState("");
  const [previewGroupId, setPreviewGroupId] = useState(experimentGroups[0]?.id ?? "");
  const [isMobile, setIsMobile] = useState(false);
  const [seedNonce, setSeedNonce] = useState(0);
  // Defaults to matching real participant behavior (required questions
  // block "Next"); the pill lets an admin turn that off to click through
  // quickly without answering everything.
  const [forceResponse, setForceResponse] = useState(true);
  // Jumping straight to one question (via a question's own "Preview this
  // question" icon) should land on that question, not force clicking
  // through the preface first — starts already-"done" in that case.
  const [prefaceDone, setPrefaceDone] = useState(!!initialQuestionId);
  const hasPrefaceContent = useMemo(() => surveyHasPrefaceContent(survey), [survey]);

  const participantSeed = seedNonce === 0 ? "preview" : `preview-${seedNonce}`;

  // Mirrors the admin dashboard's own current theme by default (so a
  // preview opened from a dark dashboard doesn't blind the admin with a
  // bright panel), independent of the survey's own allow_dark_mode flag —
  // that flag only controls whether the real ParticipantThemeToggle
  // renders below, for testing the actual participant-facing widget.
  // Deliberately local state, not the real participant_theme_v1 storage —
  // opening a preview must never touch (or be affected by) a real
  // participant's stored preference.
  const { theme: adminTheme } = useAdminTheme();
  const [manualDark, setManualDark] = useState(null); // null = still mirroring admin theme
  const previewIsDark = manualDark !== null ? manualDark : adminTheme === "dark";

  // Post-reminder questions render a real PostCard, whose comment/share
  // dialogs portal straight to document.body — see the identical comment
  // in components-admin-feed-preview.jsx for why this is needed alongside
  // the wrapper div below.
  useEffect(() => {
    document.body.classList.toggle("dark-mode", previewIsDark);
    return () => document.body.classList.remove("dark-mode");
  }, [previewIsDark]);

  const materializedPages = useMemo(() => {
    const pages = materializePagesFromBlocks(survey, survey?.page_blocks, {
      participantSeed,
      randomize: true,
      assignedGroupId: previewGroupId,
    });
    return withResolvedReminderSnapshots(pages, linkedFeedPostsMap);
  }, [survey, previewGroupId, participantSeed, linkedFeedPostsMap]);

  const previewSurvey = useMemo(
    () => ({
      ...survey,
      experiment_assigned_group_id: previewGroupId,
      pages: materializedPages,
    }),
    [survey, previewGroupId, materializedPages]
  );

  const hasRandomizedPageBlock = useMemo(
    () =>
      Array.isArray(survey?.page_blocks)
        ? survey.page_blocks.some((b) => b?.randomize_pages)
        : false,
    [survey]
  );

  const relevantFeedIds = useMemo(
    () => resolveGroupFeedSequence(experimentGroups, previewGroupId, feedSequenceIds),
    [experimentGroups, previewGroupId, feedSequenceIds]
  );

  const feedId = relevantFeedIds.length ? relevantFeedIds[relevantFeedIds.length - 1] : "";

  const hasPostReminder = useMemo(
    () => surveyHasPostReminderQuestion(survey),
    [survey]
  );

  const postsStillLoading =
    hasPostReminder &&
    relevantFeedIds.some((fid) => linkedFeedPostsMap[fid] === undefined);

  const flattenedPosts = useMemo(
    () => Object.values(linkedFeedPostsMap || {}).flat(),
    [linkedFeedPostsMap]
  );

  const handleChange = useCallback((questionId, value) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    setErrors((prev) => {
      if (!(questionId in prev)) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    toast.success("Preview complete — no data was recorded.");
  }, [toast]);

  const handlePageValidationFail = useCallback((pageErrors, message) => {
    setErrors((prev) => ({ ...prev, ...(pageErrors || {}) }));
    setErrorMsg(message || "");
  }, []);

  const handleClearBanner = useCallback(() => setErrorMsg(""), []);

  // Modal.jsx's own scrollable body div is the actual scroll container here
  // (not window/document) — the survey engine's built-in page-turn scroll
  // reset (`scrollSurveyPageToTop`, ui-survey.jsx) only targets window/
  // document/`.survey-page`/`.survey-shell`, none of which apply inside a
  // modal, so it silently no-ops here without this.
  const modalBodyRef = useRef(null);
  const handlePageChange = useCallback(() => {
    if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
  }, []);

  const ScreenComponent = isMobile ? SurveyScreenMobile : SurveyScreen;

  return (
    <Modal
      title="Survey preview"
      subtitle={survey?.name || "Untitled survey"}
      onClose={onClose}
      width={880}
      bodyRef={modalBodyRef}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        {/* Preview context — what's being previewed (which group, and a way
            to re-roll any randomization) — grouped tightly on the left,
            same 34px control height throughout so the select and the round
            reshuffle button line up. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {experimentGroups.length > 0 && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--admin-muted)",
              }}
            >
              Previewing as
              <select
                value={previewGroupId}
                onChange={(e) => setPreviewGroupId(e.target.value)}
                style={{
                  height: 34,
                  fontSize: 12,
                  padding: "0 8px",
                  borderRadius: 8,
                  border: "1px solid var(--admin-border-subtle)",
                  background: "var(--admin-surface)",
                  color: "var(--admin-text)",
                }}
              >
                {experimentGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {hasRandomizedPageBlock && (
            <IconPillButton
              onClick={() => setSeedNonce((n) => n + 1)}
              title="Re-shuffle randomized pages with a new seed"
            >
              <IconShuffle size={15} />
            </IconPillButton>
          )}
        </div>

        {/* Display options — how the preview behaves/renders — grouped
            together on the right, instead of split across both ends. */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Toggle
            label="Force response"
            hint={forceResponse ? "Required questions block Next" : "Click through without answering"}
            checked={forceResponse}
            onChange={setForceResponse}
          />
          <Toggle label="Preview as mobile" checked={isMobile} onChange={setIsMobile} />
        </div>
      </div>

      {postsStillLoading && (
        <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 10 }}>
          Loading linked feed posts…
        </div>
      )}

      {hasPrefaceContent && !prefaceDone ? (
        <div className={previewIsDark ? "dark-mode" : ""}>
          <SurveyPrefaceFlow
            survey={survey}
            participantDisplayId="PREVIEW"
            onComplete={() => setPrefaceDone(true)}
          />
        </div>
      ) : materializedPages.length === 0 ? (
        <EmptyState
          title="Nothing to preview yet"
          message={
            hasPrefaceContent
              ? "No questions yet — the information/consent/instructions pages above are everything there is to see so far."
              : "Add at least one question to see the participant view."
          }
        />
      ) : (
        <div className={previewIsDark ? "dark-mode" : ""} style={{ position: "relative" }}>
        <ScreenComponent
          survey={previewSurvey}
          posts={flattenedPosts}
          responses={responses}
          errors={errors}
          errorMsg={errorMsg}
          participantSeed={participantSeed}
          feedId={feedId}
          flags={PREVIEW_FLAGS}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onPageValidationFail={handlePageValidationFail}
          onClearBanner={handleClearBanner}
          onPageChange={handlePageChange}
          submitting={false}
          enforceRequired={forceResponse}
          allowPageJump
          initialQuestionId={initialQuestionId}
        />
        {survey?.allow_dark_mode && (
          <ParticipantThemeToggle
            isDark={previewIsDark}
            onToggle={() => setManualDark(!previewIsDark)}
            position="absolute"
          />
        )}
        </div>
      )}
    </Modal>
  );
}
