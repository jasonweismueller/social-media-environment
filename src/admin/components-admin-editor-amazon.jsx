// components-admin-editor-amazon.jsx
import React from "react";
import { uid } from "../utils";
import { PostCard } from "../ui-posts";
import { MediaFieldset } from "./components-admin-media-amazon";

/* ----------------------------------------------------------------------------
   Amazon Reviews admin editor
   ---------------------------------------------------------------------------
   Uses the same high-level admin contract as the Facebook editor:
   - makeRandomPost() returns one editable content unit
   - AdminPostEditor receives { editing, setEditing, isNew, projectId, feedId }
   The content unit is an Amazon-style review rather than a social post.
--------------------------------------------------------------------------- */

const REVIEW_SNIPPETS = [
  "I was impressed at first, but after using it for a few weeks I noticed several issues that other reviewers did not mention.",
  "This product does what it promises. The setup was simple, the packaging was secure, and the overall quality feels reliable.",
  "I bought this after comparing several alternatives. It is not perfect, but it is good value for the price.",
  "The item arrived quickly and matched the description. I would recommend checking the dimensions carefully before ordering.",
  "I wanted to like this more, but the performance was inconsistent. Some features worked well while others felt unfinished.",
];

const REVIEW_TITLES = [
  "Good value for the price",
  "Works as expected",
  "Better than I thought",
  "Not perfect, but useful",
  "Read before buying",
  "Quality could be better",
];

const REVIEWERS = [
  "Amazon Customer",
  "Verified Buyer",
  "J. Miller",
  "Samantha K.",
  "Michael R.",
  "Priya N.",
  "Daniel T.",
  "Chris W.",
];

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function genNeutralAvatarDataUrl(size = 64) {
  const s = size;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="16" fill="#e5e7eb"/>
  <circle cx="16" cy="12" r="6" fill="#9ca3af"/>
  <path d="M6 30c1.8-7 6-10 10-10s8.2 3 10 10" fill="#9ca3af"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function makeRandomPost() {
  const id = uid();
  const rating = randInt(2, 5);
  return {
    id,
    postName: "",
    name: "",
    author: randPick(REVIEWERS),
    reviewer: "",
    reviewer_name: "",
    title: randPick(REVIEW_TITLES),
    review_title: "",
    text: Array.from({ length: randInt(1, 3) }, () => randPick(REVIEW_SNIPPETS)).join("\n\n"),
    review_text: "",
    rating,
    stars: rating,
    verified_purchase: true,
    product_variant: "Color: Black",
    review_date: "Reviewed in the United States on January 1, 2025",
    helpful_count: randInt(0, 248),
    show_helpful_count: true,
    report_enabled: true,
    helpful_enabled: true,
    read_more_enabled: true,
    collapsed_lines: 5,
    topic: "",
  };
}

function setField(setEditing, key, value) {
  setEditing((ed) => ({ ...ed, [key]: value }));
}

function setBoth(setEditing, a, b, value) {
  setEditing((ed) => ({ ...ed, [a]: value, [b]: value }));
}

function BoolSelect({ label, value, onChange }) {
  return (
    <label>{label}
      <select className="select" value={String(!!value)} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">On</option>
        <option value="false">Off</option>
      </select>
    </label>
  );
}

export function AdminPostEditor({
  editing,
  setEditing,
  isNew,
  projectId,
  feedId,
  setUploadingVideo,
  setUploadingPoster,
}) {
  const reviewTitle = editing.review_title ?? editing.title ?? "";
  const reviewText = editing.review_text ?? editing.text ?? "";
  const reviewer = editing.reviewer ?? editing.reviewer_name ?? editing.author ?? "";
  const rating = Number(editing.rating ?? editing.stars ?? 5) || 5;

  return (
    <div className="editor-grid amz-editor-grid">
      <div className="editor-form amz-editor-form">
        <h4 className="section-title">Review identity</h4>

        <label>Review name (for CSV)
          <input
            className="input"
            placeholder="e.g. Review_A"
            value={editing.postName || editing.name || ""}
            onChange={(e) => {
              const v = e.target.value;
              setEditing((ed) => ({ ...ed, postName: v, name: v }));
            }}
          />
          <div className="subtle" style={{ marginTop: 4 }}>
            Used as the readable review label in exported columns where your existing export code uses post names.
          </div>
        </label>

        <div className="grid-2">
          <label>Reviewer name
            <input
              className="input"
              value={reviewer}
              placeholder="Amazon Customer"
              onChange={(e) => setBoth(setEditing, "reviewer", "author", e.target.value)}
            />
          </label>

          <label>Star rating
            <select
              className="select"
              value={String(rating)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setEditing((ed) => ({ ...ed, rating: v, stars: v }));
              }}
            >
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </select>
          </label>
        </div>

        <label>Review title
          <input
            className="input"
            value={reviewTitle}
            placeholder="e.g. Good value for the price"
            onChange={(e) => setBoth(setEditing, "review_title", "title", e.target.value)}
          />
        </label>

        <label>Review text
          <textarea
            className="textarea"
            rows={8}
            value={reviewText}
            placeholder="Write the review body participants will see..."
            onChange={(e) => setBoth(setEditing, "review_text", "text", e.target.value)}
          />
        </label>

        <h4 className="section-title">Amazon review metadata</h4>
        <div className="grid-2">
          <BoolSelect
            label="Verified purchase"
            value={editing.verified_purchase !== false}
            onChange={(v) => setField(setEditing, "verified_purchase", v)}
          />
          <label>Helpful count
            <input
              className="input"
              type="number"
              min="0"
              value={Number(editing.helpful_count ?? editing.helpful ?? 0)}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value || 0));
                setEditing((ed) => ({ ...ed, helpful_count: v, helpful: v }));
              }}
            />
          </label>
        </div>

        <label>Review date/location line
          <input
            className="input"
            value={editing.review_date || editing.time || ""}
            placeholder="Reviewed in the United States on January 1, 2025"
            onChange={(e) => setBoth(setEditing, "review_date", "time", e.target.value)}
          />
        </label>

        <label>Product variant / style line
          <input
            className="input"
            value={editing.product_variant || ""}
            placeholder="Color: Black"
            onChange={(e) => setField(setEditing, "product_variant", e.target.value)}
          />
        </label>

        <label>Topic / condition label
          <input
            className="input"
            value={editing.topic || ""}
            placeholder="e.g. misinformation_review"
            onChange={(e) => setField(setEditing, "topic", e.target.value)}
          />
        </label>

        <h4 className="section-title">Participant actions</h4>
        <div className="grid-2">
          <BoolSelect
            label="Helpful button"
            value={editing.helpful_enabled !== false}
            onChange={(v) => setField(setEditing, "helpful_enabled", v)}
          />
          <BoolSelect
            label="Report button"
            value={editing.report_enabled !== false}
            onChange={(v) => setField(setEditing, "report_enabled", v)}
          />
          <BoolSelect
            label="Read more"
            value={editing.read_more_enabled !== false}
            onChange={(v) => setField(setEditing, "read_more_enabled", v)}
          />
          <label>Collapsed lines
            <input
              className="input"
              type="number"
              min="2"
              max="12"
              value={Number(editing.collapsed_lines ?? 5)}
              onChange={(e) => setField(setEditing, "collapsed_lines", Math.max(2, Number(e.target.value || 5)))}
            />
          </label>
        </div>

        <MediaFieldset
          editing={editing}
          setEditing={setEditing}
          feedId={feedId}
          projectId={projectId}
          isNew={isNew}
          setUploadingVideo={setUploadingVideo}
          setUploadingPoster={setUploadingPoster}
        />
      </div>

      <div className="editor-preview amz-editor-preview">
        <div className="preview-head">Amazon review preview</div>
        <div className="preview-zoom" style={{ transform: "scale(.92)", transformOrigin: "top left" }}>
          <PostCard
            post={{
              ...editing,
              reviewer,
              author: reviewer,
              review_title: reviewTitle,
              title: reviewTitle,
              review_text: reviewText,
              text: reviewText,
              rating,
              stars: rating,
            }}
            state={{ helpful: false, reported: false }}
            onHelpful={() => {}}
            onReport={() => {}}
            onVisible={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
