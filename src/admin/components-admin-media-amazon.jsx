// components-admin-media-amazon.jsx
import React from "react";
import {
  getProjectId as getProjectIdUtil,
  readPostNames,
  writePostNames,
} from "../utils";

/* ---------------------------------------------------------------------------
   Amazon reviews-only media/settings fieldset
   ---------------------------------------------------------------------------
   Reviews-only pages usually do not need post images, videos, avatars, or link
   previews. This fieldset preserves the same component contract as the
   Facebook admin media fieldset, but focuses on Amazon review metadata and CSV
   naming support. It can be expanded later if you want product thumbnails.
---------------------------------------------------------------------------- */

export function MediaFieldset({
  editing,
  setEditing,
  feedId,
  projectId,
  isNew,
  setUploadingVideo,
  setUploadingPoster,
}) {
  const resolvedProjectId = projectId ?? getProjectIdUtil?.();
  const reviewId = editing?.id || null;

  const [reviewName, setReviewName] = React.useState(() => {
    if (!reviewId) return editing?.postName || editing?.name || "";
    try {
      const saved = readPostNames?.(resolvedProjectId, feedId)?.[reviewId] || "";
      return editing?.postName || editing?.name || saved || "";
    } catch {
      return editing?.postName || editing?.name || "";
    }
  });

  React.useEffect(() => {
    if (!reviewId) return;
    let saved = "";
    try {
      saved = readPostNames?.(resolvedProjectId, feedId)?.[reviewId] || "";
    } catch {}
    setReviewName(editing?.postName || editing?.name || saved || "");
  }, [reviewId, feedId, resolvedProjectId]);

  function updateReviewName(value) {
    setReviewName(value);
    setEditing((ed) => ({ ...ed, postName: value, name: value }));

    if (!reviewId || !feedId) return;
    try {
      const current = readPostNames?.(resolvedProjectId, feedId) || {};
      writePostNames?.(resolvedProjectId, feedId, {
        ...current,
        [reviewId]: value,
      });
    } catch {
      // Name persistence is a convenience only; the review object still stores it.
    }
  }

  return (
    <>
      <h4 className="section-title">Review export settings</h4>
      <fieldset className="fieldset amz-review-settings">
        <label>Review label override
          <input
            className="input"
            placeholder="e.g. review_positive_high_helpful"
            value={reviewName}
            onChange={(e) => updateReviewName(e.target.value)}
          />
          <div className="subtle" style={{ marginTop: 6 }}>
            Optional. This is useful when exported columns need meaningful review names rather than generated IDs.
          </div>
        </label>

        <div className="grid-2">
          <label>Condition
            <input
              className="input"
              value={editing.condition || ""}
              placeholder="e.g. control"
              onChange={(e) => setEditing((ed) => ({ ...ed, condition: e.target.value }))}
            />
          </label>

          <label>Review type
            <input
              className="input"
              value={editing.review_type || ""}
              placeholder="e.g. positive / negative / misinformation"
              onChange={(e) => setEditing((ed) => ({ ...ed, review_type: e.target.value }))}
            />
          </label>
        </div>

        <label>Internal notes
          <textarea
            className="textarea"
            rows={3}
            value={editing.admin_notes || ""}
            placeholder="Optional notes for yourself; participants will not see this unless you render it elsewhere."
            onChange={(e) => setEditing((ed) => ({ ...ed, admin_notes: e.target.value }))}
          />
        </label>
      </fieldset>
    </>
  );
}
