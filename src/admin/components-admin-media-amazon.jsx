// components-admin-media-amazon.jsx
import React from "react";
import { EditorSection, Field } from "./components-admin-editor-ui";

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
  return (
    <EditorSection title="Review export settings" subtitle="Internal-only labeling &amp; notes">
      <div className="grid-2">
        <Field label="Condition">
          <input
            className="input"
            value={editing.condition || ""}
            placeholder="e.g. control"
            onChange={(e) => setEditing((ed) => ({ ...ed, condition: e.target.value }))}
          />
        </Field>

        <Field label="Review type">
          <input
            className="input"
            value={editing.review_type || ""}
            placeholder="e.g. positive / negative / misinformation"
            onChange={(e) => setEditing((ed) => ({ ...ed, review_type: e.target.value }))}
          />
        </Field>
      </div>

      <Field label="Internal notes">
        <textarea
          className="textarea"
          rows={3}
          value={editing.admin_notes || ""}
          placeholder="Optional notes for yourself; participants will not see this unless you render it elsewhere."
          onChange={(e) => setEditing((ed) => ({ ...ed, admin_notes: e.target.value }))}
        />
      </Field>
    </EditorSection>
  );
}
