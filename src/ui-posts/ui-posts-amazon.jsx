// ui-posts-amazon.jsx
// Amazon reviews-only environment.
/// Uses the same Feed API as the Facebook/Instagram feed components so App-amazon.jsx
// can keep the existing project/feed/survey/session logging architecture.

import React, { useEffect, useMemo, useRef, useState } from "react";

function asNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function fmtInt(value) {
  const n = asNum(value, 0);
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
}

function getReviewId(review) {
  return String(review?.id || review?.review_id || review?.post_id || "");
}

function getReviewAuthor(review) {
  return String(
    review?.reviewer ||
      review?.reviewer_name ||
      review?.author ||
      review?.name ||
      "Amazon Customer"
  );
}

function getReviewTitle(review) {
  return String(
    review?.review_title ||
      review?.title ||
      review?.headline ||
      review?.summary ||
      ""
  );
}

function getReviewText(review) {
  return String(
    review?.review_text ||
      review?.body ||
      review?.text ||
      review?.caption ||
      ""
  );
}

function getReviewRating(review) {
  return clamp(asNum(review?.rating ?? review?.stars ?? review?.star_rating, 5), 1, 5);
}

function getReviewDate(review) {
  return String(
    review?.review_date ||
      review?.date ||
      review?.time ||
      "Reviewed in the United States on January 1, 2025"
  );
}

function getHelpfulCount(review) {
  return asNum(
    review?.helpful_count ??
      review?.helpful ??
      review?.helpfulVotes ??
      review?.metrics?.helpful,
    0
  );
}

function Stars({ rating = 5 }) {
  const safe = Math.round(clamp(asNum(rating, 5), 1, 5));
  return (
    <span className="amz-stars" aria-label={`${safe} out of 5 stars`} title={`${safe} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < safe ? "amz-star is-filled" : "amz-star"}>★</span>
      ))}
    </span>
  );
}

function ReadMoreText({ text, collapsedChars = 520, onExpand, disabled }) {
  const [expanded, setExpanded] = useState(false);
  const clean = String(text || "");
  const needsClamp = clean.length > collapsedChars;
  const shown = !needsClamp || expanded ? clean : `${clean.slice(0, collapsedChars).trimEnd()}…`;

  return (
    <div className="amz-review-text-wrap">
      <p className="amz-review-text">{shown}</p>
      {needsClamp && !expanded && (
        <button
          type="button"
          className="amz-read-more"
          disabled={disabled}
          onClick={() => {
            setExpanded(true);
            onExpand?.();
          }}
        >
          Read more
        </button>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  disabled,
  registerViewRef,
  onAction,
  projectId,
  feedId,
  participantSeed,
  onDisplayedPostSnapshot,
}) {
  const id = getReviewId(review);
  const author = getReviewAuthor(review);
  const title = getReviewTitle(review);
  const text = getReviewText(review);
  const rating = getReviewRating(review);
  const date = getReviewDate(review);
  const helpfulCount = getHelpfulCount(review);
  const verified = review?.verified_purchase !== false && review?.verified !== false;
  const variant = String(review?.variant || review?.product_variant || review?.format || "").trim();
  const [helpful, setHelpful] = useState(false);
  const [reported, setReported] = useState(false);
  const enteredAt = useRef(Date.now());

  useEffect(() => {
    const snapshot = {
      ...review,
      id,
      review_id: id,
      reviewer: author,
      review_title: title,
      review_text: text,
      rating,
      review_date: date,
      helpful_count: helpfulCount,
      __snapshot_kind: "amazon_review",
      __snapshot_feed_id: feedId || "",
      __snapshot_post_id: id,
    };
    onDisplayedPostSnapshot?.(snapshot, {
      projectId,
      feedId,
      postId: id,
      participantSeed,
    });
  }, [review, id, author, title, text, rating, date, helpfulCount, projectId, feedId, participantSeed, onDisplayedPostSnapshot]);

  const logBase = (extra = {}) => ({
    post_id: id,
    review_id: id,
    item_type: "amazon_review",
    reviewer: author,
    rating,
    review_title: title,
    feed_id: feedId || "",
    project_id: projectId || "",
    ms_since_review_render: Date.now() - enteredAt.current,
    ...extra,
  });

  return (
    <article
      className="amz-review"
      data-post-id={id}
      data-review-id={id}
      data-has-image="0"
      ref={(el) => registerViewRef?.(id, el)}
    >
      <header className="amz-review-head">
        <div className="amz-avatar" aria-hidden="true">
          {author.slice(0, 1).toUpperCase() || "A"}
        </div>
        <div className="amz-reviewer-block">
          <div className="amz-reviewer-name">{author}</div>
          <div className="amz-review-date">{date}</div>
        </div>
      </header>

      <div className="amz-rating-row">
        <Stars rating={rating} />
        {title && <span className="amz-review-title">{title}</span>}
      </div>

      {variant && <div className="amz-variant">{variant}</div>}
      {verified && <div className="amz-verified">Verified Purchase</div>}

      <ReadMoreText
        text={text}
        disabled={disabled}
        onExpand={() => onAction?.("review_read_more", logBase({ expanded: true }))}
      />

      <div className="amz-helpful-line">
        {helpfulCount > 0
          ? `${fmtInt(helpfulCount + (helpful ? 1 : 0))} ${helpfulCount + (helpful ? 1 : 0) === 1 ? "person" : "people"} found this helpful`
          : helpful
            ? "1 person found this helpful"
            : ""}
      </div>

      <footer className="amz-review-actions" aria-label="Review actions">
        <button
          type="button"
          className={helpful ? "amz-helpful-btn is-active" : "amz-helpful-btn"}
          disabled={disabled}
          aria-pressed={helpful}
          onClick={() => {
            const next = !helpful;
            setHelpful(next);
            onAction?.(next ? "review_helpful" : "review_helpful_removed", logBase({ helpful: next }));
          }}
        >
          Helpful
        </button>
        <span className="amz-action-sep" aria-hidden="true">|</span>
        <button
          type="button"
          className={reported ? "amz-report-btn is-active" : "amz-report-btn"}
          disabled={disabled || reported}
          onClick={() => {
            setReported(true);
            onAction?.("review_report", logBase({ reported: true }));
          }}
        >
          {reported ? "Reported" : "Report"}
        </button>
      </footer>
    </article>
  );
}

function ReviewsSummary({ posts = [] }) {
  const count = posts.length;
  const avg = count
    ? posts.reduce((sum, p) => sum + getReviewRating(p), 0) / count
    : 0;
  const rounded = Math.round(avg * 10) / 10;

  return (
    <section className="amz-reviews-summary" aria-label="Customer reviews summary">
      <h1>Customer reviews</h1>
      <div className="amz-summary-rating-row">
        <Stars rating={Math.round(avg || 5)} />
        <span className="amz-summary-rating-text">{rounded || "—"} out of 5</span>
      </div>
      <div className="amz-summary-count">{fmtInt(count)} global {count === 1 ? "rating" : "ratings"}</div>
      <div className="amz-summary-note">Showing reviews selected for this study</div>
    </section>
  );
}

export function Feed({
  posts = [],
  registerViewRef,
  disabled,
  log,
  onSubmit,
  projectId,
  feedId,
  participantSeed,
  onDisplayedPostSnapshot,
  submitButtonLabel = "Submit",
}) {
  const STEP = 8;
  const FIRST_PAINT = Math.min(10, posts.length || 0);
  const [visibleCount, setVisibleCount] = useState(FIRST_PAINT);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setVisibleCount(Math.min(FIRST_PAINT, posts.length || 0));
  }, [posts, FIRST_PAINT]);

  useEffect(() => {
    if (!sentinelRef.current) return undefined;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setVisibleCount((c) => Math.min(c + STEP, posts.length));
        }
      },
      { root: null, rootMargin: "800px 0px 800px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.unobserve(el);
  }, [posts.length]);

  const renderPosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);

  return (
    <div className="amz-page">
      <main className="amz-reviews-shell">
        <ReviewsSummary posts={posts} />

        <section className="amz-reviews-list" aria-label="Customer review list">
          {renderPosts.map((review, idx) => {
            const id = getReviewId(review) || `review_${idx + 1}`;
            const normalizedReview = { ...review, id };
            return (
              <ReviewCard
                key={id}
                review={normalizedReview}
                disabled={disabled}
                registerViewRef={registerViewRef}
                onAction={log}
                projectId={projectId}
                feedId={feedId}
                participantSeed={participantSeed}
                onDisplayedPostSnapshot={onDisplayedPostSnapshot}
              />
            );
          })}
          <div ref={sentinelRef} aria-hidden="true" />
          {visibleCount >= posts.length && <div className="amz-end">End of reviews</div>}
        </section>

        <div className="amz-submit-wrap">
          <button
            type="button"
            className="amz-submit-btn"
            onClick={onSubmit}
            disabled={disabled === true}
          >
            {submitButtonLabel || "Submit"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default Feed;
