// ui-posts-x.jsx
// X (Twitter) feed — same Feed/PostCard API contract as the other three
// apps' post components (App-x.jsx/the survey engine's PostReminderCard
// both depend on that contract, not on any X-specific internals), adapted
// to X's own visual/interaction model: reply/repost/like/view/bookmark/
// share instead of Facebook's multi-emoji reactions, no carousel/bio-hover/
// intervention-block machinery. See CLAUDE.md for what's deliberately out
// of scope in this first pass (recall/interactive-post-reminder-specific
// polish, community-note-style interventions, quote-reposts).

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  displayTimeForPost,
  getAvatarPool,
  getAvatarPoolForPost,
  pickDeterministic,
  pickUniqueDeterministic,
  buildDeterministicAssignmentMap,
  fallbackEngagementStats,
  resolvePostAuthorType,
} from "../utils";

import { FB_FEMALE_NAMES, FB_MALE_NAMES } from "./names";

import {
  IconBadge,
  IconDots,
  IconLike,
  IconReply,
  IconRepost,
  IconShare,
  IconBookmark,
  IconViews,
  PostText,
  Modal,
  NamesPeek,
} from "../ui-core";

const DISPLAYED_POST_SNAPSHOT_PREFIX = "studyfeed:displayed_post_snapshot";
const DISPLAYED_POST_SNAPSHOT_LATEST_PREFIX = "studyfeed:displayed_post_snapshot_latest";

/* =========================================================================
   Left/right rail decorative chrome ("Realistic surroundings") — generic,
   fixed, identical for every participant/condition (nothing here is
   randomized off post content, so there's nothing for it to confound).
   Real X's left nav (from the reference screenshots) + a static, evergreen
   "Trending" list (deliberately not tied to any real current event — same
   reasoning as Facebook's own generic nav-item chrome) + a "Who to follow"
   list built from the same seeded avatar/name pools real posts use.
   ========================================================================= */
export const LEFT_RAIL_NAV_ITEMS = [
  "Home", "Explore", "Notifications", "Follow", "Chat", "Grok",
  "History", "Creator Studio", "Premium", "Profile", "More",
];

function RailNavIconGlyph({ children }) {
  return (
    <span className="rail-real-icon rail-real-icon--x" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

export const LEFT_RAIL_ICONS = {
  Home: <RailNavIconGlyph><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" /></RailNavIconGlyph>,
  Explore: <RailNavIconGlyph><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.3-4.3" /></RailNavIconGlyph>,
  Notifications: <RailNavIconGlyph><path d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 5-2.1 6.5-2.1 6.5h15.2s-2.1-1.5-2.1-6.5A5.5 5.5 0 0 0 12 3Z" /><path d="M9.7 18a2.3 2.3 0 0 0 4.6 0" /></RailNavIconGlyph>,
  Follow: <RailNavIconGlyph><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M17 8v6M14 11h6" /></RailNavIconGlyph>,
  Chat: <RailNavIconGlyph><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></RailNavIconGlyph>,
  Grok: <RailNavIconGlyph><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="5" /></RailNavIconGlyph>,
  History: <RailNavIconGlyph><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></RailNavIconGlyph>,
  "Creator Studio": <RailNavIconGlyph><path d="M12 3C6.9 3 3 6.6 3 11.2c0 2.6 1.3 4.9 3.4 6.4V21l3.1-1.7c.8.2 1.6.3 2.5.3 5.1 0 9-3.6 9-8.4S17.1 3 12 3Z" /></RailNavIconGlyph>,
  Premium: <RailNavIconGlyph><path d="M12 2l2.2 2.2 3.1-.3 1.2 2.9 2.9 1.2-.3 3.1L24 12l-2.2 2.2.3 3.1-2.9 1.2-1.2 2.9-3.1-.3L12 24l-2.2-2.2-3.1.3-1.2-2.9-2.9-1.2.3-3.1L0 12l2.2-2.2-.3-3.1 2.9-1.2L6 2.2l3.1.3L12 2z" /></RailNavIconGlyph>,
  Profile: <RailNavIconGlyph><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></RailNavIconGlyph>,
  More: <RailNavIconGlyph><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></RailNavIconGlyph>,
};

// Deliberately generic/evergreen, not tied to any real current event —
// same posture as Facebook's own static left-nav chrome: fixed, identical
// for every participant, nothing here is content-dependent so there's
// nothing for it to confound.
export const TRENDING_TOPICS = [
  { category: "Technology", topic: "New phone launch" },
  { category: "Sports", topic: "Local team wins" },
  { category: "Entertainment", topic: "New movie release" },
  { category: "Business", topic: "Market update" },
];

export function buildRailContacts({ femalePool, malePool, runSeed, app, projectId, feedId, count = 6 }) {
  const seedBase = [runSeed || "run", app || "app", projectId || "proj", feedId || "feed"];
  let femaleIdx = 0;
  let maleIdx = 0;
  return Array.from({ length: count }, (_, i) => {
    const isFemale = pickDeterministic(["female", "male"], [...seedBase, "who-to-follow-gender", i]) === "female";
    const genderIdx = isFemale ? femaleIdx++ : maleIdx++;
    const namePool = isFemale ? FB_FEMALE_NAMES : FB_MALE_NAMES;
    const genderAvatarPool = isFemale ? (femalePool || []) : (malePool || []);
    const name =
      pickUniqueDeterministic(namePool, genderIdx, [...seedBase, "who-to-follow-name", isFemale ? "f" : "m"]) ||
      `Account ${i + 1}`;
    return {
      id: `who-to-follow-${i}`,
      name,
      avatarUrl: pickUniqueDeterministic(genderAvatarPool, genderIdx, [...seedBase, "who-to-follow-avatar", isFemale ? "f" : "m"]),
    };
  });
}

/* ------------------------------- helpers ----------------------------------- */
function snapshotKeyPart_(value) {
  return encodeURIComponent(String(value == null ? "" : value));
}

function displayedPostSnapshotKey({ projectId = "", feedId = "", postId = "", participantSeed = "" } = {}) {
  return [DISPLAYED_POST_SNAPSHOT_PREFIX, snapshotKeyPart_(projectId), snapshotKeyPart_(participantSeed), snapshotKeyPart_(feedId), snapshotKeyPart_(postId)].join("::");
}

function displayedPostSnapshotLatestKey({ projectId = "", feedId = "", postId = "" } = {}) {
  return [DISPLAYED_POST_SNAPSHOT_LATEST_PREFIX, snapshotKeyPart_(projectId), snapshotKeyPart_(feedId), snapshotKeyPart_(postId)].join("::");
}

function safeLocalStorageSet_(key, value) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function saveDisplayedPostSnapshot(snapshot, { projectId = "", feedId = "", postId = "", participantSeed = "" } = {}) {
  const cleanPostId = String(postId || snapshot?.id || "").trim();
  const cleanFeedId = String(feedId || "").trim();
  if (!snapshot || !cleanPostId || !cleanFeedId) return false;

  const payload = JSON.stringify(snapshot);
  const scopedKey = displayedPostSnapshotKey({ projectId, feedId: cleanFeedId, postId: cleanPostId, participantSeed });
  const latestKey = displayedPostSnapshotLatestKey({ projectId, feedId: cleanFeedId, postId: cleanPostId });

  const okScoped = participantSeed ? safeLocalStorageSet_(scopedKey, payload) : true;
  const okLatest = safeLocalStorageSet_(latestKey, payload);
  return !!(okScoped && okLatest);
}

function useInViewAutoplay(threshold = 0.6) {
  const wrapRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const el = wrapRef.current;
    const obs = new IntersectionObserver(
      ([e]) => setInView(!!(e?.isIntersecting && e.intersectionRatio >= threshold)),
      { root: null, threshold: [0, threshold, 1] }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { wrapRef, inView };
}

function fmtCount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  return String(v);
}

function makeHandleFromName(name, postId) {
  const base = String(name || "user").toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = String(postId || "").replace(/[^0-9]/g, "").slice(-3);
  return `@${base || "user"}${suffix}`;
}

/* ------------------------------- ReplyModal --------------------------------
   A simple reply composer + reply list — X's equivalent of Facebook's
   comment modal, but without the elaborate friend-list/threaded-reply
   machinery: one text field, submitted replies show below it. */
function ReplyModal({ post, author, avatarUrl, verified, handle, disabled, onClose, onSubmit }) {
  const [text, setText] = useState("");
  const [replies, setReplies] = useState([]);

  return (
    <Modal title="Reply" onClose={onClose}>
      <div className="x-reply-original">
        <span className="x-avatar-sm" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} aria-hidden="true" />
        <div>
          <div className="x-reply-original-name">
            {author}
            {verified && <IconBadge />}
            <span className="x-reply-original-handle">{handle}</span>
          </div>
          <div className="x-reply-original-text">{post?.text || ""}</div>
        </div>
      </div>

      {replies.length > 0 && (
        <div className="x-reply-list">
          {replies.map((r, i) => (
            <div key={i} className="x-reply-row">
              <span className="x-avatar-sm x-avatar-sm--neutral" aria-hidden="true" />
              <div>
                <div className="x-reply-row-name">You</div>
                <div className="x-reply-row-text">{r}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="x-reply-composer">
        <textarea
          className="x-reply-input"
          placeholder="Post your reply"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className="x-reply-submit"
          disabled={disabled || !text.trim()}
          onClick={() => {
            const clean = text.trim();
            if (!clean) return;
            setReplies((r) => [...r, clean]);
            setText("");
            onSubmit?.(clean);
          }}
        >
          Reply
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- PostCard ----------------------------------- */
export function PostCard({
  post,
  onAction,
  disabled,
  registerViewRef,
  flags = {},
  app,
  projectId,
  feedId,
  runSeed,
  assignedAuthor,
  assignedAvatarUrl,
  participantSeed,
  onDisplayedPostSnapshot,
  // Forces the caption to always render in full, no "Show more"/"Show
  // less" — used for non-interactive (static) post_reminder survey
  // questions. Real feed + interactive reminders don't pass this.
  alwaysExpandText = false,
  // Cosmetic entrance stagger — see the `post-reveal-in` CSS animation.
  revealIndex = null,
  // See ui-posts-facebook.jsx's identical prop for the full rationale — a
  // "recall" reminder isn't built for X in this pass, so nothing sets this
  // true yet, but the prop is threaded through so that stays a drop-in
  // addition later rather than a structural change.
  suppressDisplayedSnapshot = false,
}) {
  const id = String(post?.id || "");
  const randNamesOn = !!flags?.randomize_names;
  const randAvatarOn = !!(flags?.randomize_avatars ?? flags?.randomize_avatar);
  const randTimesOn = !!(flags?.randomize_times ?? flags?.random_time);
  const engagementFallbackOn = !!flags?.realistic_engagement;
  const engagementRandomizeOn = !!flags?.realistic_engagement_randomize;

  const author = randNamesOn && assignedAuthor ? assignedAuthor : (post?.author || post?.name || "Anonymous");
  // Same reasoning as ui-posts-facebook.jsx's displayAvatar: while
  // randomization is on but assignedAvatarUrl hasn't resolved yet (only
  // possible via PostReminderCard's async no-snapshot fallback — the real
  // feed always computes it up front), show blank instead of the post's
  // raw stored avatar, so participants never see one photo swap to another.
  const avatarUrl = randAvatarOn ? (assignedAvatarUrl || "") : (post?.avatarUrl || post?.avatar || "");
  const verified = post?.verified !== false && post?.verified !== undefined ? !!post.verified : false;
  const handle = post?.handle ? (post.handle.startsWith("@") ? post.handle : `@${post.handle}`) : makeHandleFromName(author, id);
  const isAd = String(post?.adType || "none") === "ad";

  const timeLabel = displayTimeForPost(post, {
    randomize: randTimesOn,
    seedParts: [runSeed || "run", app || "x", projectId || "global", feedId || ""],
  }) || "";

  const [expandedState, setExpanded] = useState(false);
  const expanded = alwaysExpandText || expandedState;

  // See ui-posts-facebook.jsx's identical `revealDone` state for the
  // rationale — drops the `post-reveal-in` class (and its `animation`
  // declaration) once the entrance animation actually finishes, so Safari
  // can't hold onto a stale compositor/hit-test layer over this card's
  // header indefinitely.
  const [revealDone, setRevealDone] = useState(revealIndex == null);

  const [liked, setLiked] = useState(!!post?._localLiked);
  const [reposted, setReposted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [replyCountBump, setReplyCountBump] = useState(0);

  const enteredAt = useRef(Date.now());
  const { wrapRef: videoWrapRef, inView: videoInView } = useInViewAutoplay(0.6);
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (videoInView) v.play().catch(() => {});
      else v.pause();
    } catch {}
  }, [videoInView]);

  const stats = useMemo(() => {
    const fallback = engagementFallbackOn
      ? fallbackEngagementStats(id, engagementRandomizeOn ? (runSeed || "") : "")
      : { likes: 0, comments: 0, shares: 0 };
    const likeCount = Number.isFinite(Number(post?.like_count)) && Number(post?.like_count) > 0
      ? Number(post.like_count)
      : fallback.likes;
    const replyCount = Number.isFinite(Number(post?.reply_count)) && Number(post?.reply_count) > 0
      ? Number(post.reply_count)
      : fallback.comments;
    const repostCount = Number.isFinite(Number(post?.repost_count)) && Number(post?.repost_count) > 0
      ? Number(post.repost_count)
      : fallback.shares;
    const viewCount = Number.isFinite(Number(post?.view_count)) && Number(post?.view_count) > 0
      ? Number(post.view_count)
      : likeCount * 22 + replyCount * 4 + repostCount * 6 + 40;
    return { likeCount, replyCount, repostCount, viewCount };
  }, [post, id, engagementFallbackOn, engagementRandomizeOn, runSeed]);

  const displayedLikeCount = stats.likeCount + (liked ? 1 : 0);
  const displayedRepostCount = stats.repostCount + (reposted ? 1 : 0);
  const displayedReplyCount = stats.replyCount + replyCountBump;

  const logBase = (extra = {}) => ({
    post_id: id,
    author,
    ms_since_render: Date.now() - enteredAt.current,
    ...extra,
  });

  const handleAction = (action, payload) => {
    onAction?.(action, logBase(payload));
  };

  const toggleLike = () => {
    if (disabled) return;
    const next = !liked;
    setLiked(next);
    handleAction(next ? "react_pick" : "react_clear", { type: "like" });
  };

  const toggleRepost = () => {
    if (disabled) return;
    const next = !reposted;
    setReposted(next);
    handleAction(next ? "repost" : "unrepost", {});
  };

  const toggleBookmark = () => {
    if (disabled) return;
    const next = !bookmarked;
    setBookmarked(next);
    handleAction(next ? "save" : "unsave", {});
  };

  const openReply = () => {
    if (disabled) return;
    handleAction("comment_open", {});
    setShowReply(true);
  };

  const submitReply = (text) => {
    setReplyCountBump((c) => c + 1);
    handleAction("comment_submit", { text, length: text.length });
  };

  const copyLink = () => {
    if (disabled) return;
    handleAction("share", {});
    setShowShareMenu(false);
  };

  // "Displayed post snapshot" — what a post_reminder survey question shows
  // back to this participant later should match exactly what they saw
  // here (randomized name/avatar/time already resolved), same mechanism
  // Facebook/Instagram/Amazon already use.
  const displayedSnapshot = useMemo(() => {
    if (!post) return null;
    const snapshot = {
      ...post,
      id,
      author,
      handle,
      time: timeLabel,
      verified,
      __snapshot_feed_id: String(feedId || ""),
      __snapshot_post_id: id,
    };
    // Only overwrite the snapshot's avatar once a real URL is known — while
    // it's still blank (randomization on, assignment not resolved yet, see
    // the displayAvatar/avatarUrl fix above), leave the post's own existing
    // avatarUrl in place rather than persisting a blank one that a later
    // reminder could recover as "what was actually shown."
    if (avatarUrl) snapshot.avatarUrl = avatarUrl;
    return snapshot;
  }, [post, id, author, avatarUrl, handle, timeLabel, verified, feedId]);

  useEffect(() => {
    if (suppressDisplayedSnapshot || !displayedSnapshot || !id || !feedId) return;
    saveDisplayedPostSnapshot(displayedSnapshot, { projectId, feedId, postId: id, participantSeed });
    onDisplayedPostSnapshot?.(displayedSnapshot);
  }, [suppressDisplayedSnapshot, displayedSnapshot, id, feedId, projectId, participantSeed, onDisplayedPostSnapshot]);

  const mediaUrl = post?.videoUrl || post?.video_url || post?.video?.url || "";
  const imageUrl = !mediaUrl ? (post?.imageUrl || post?.image_url || post?.image?.url || "") : "";

  return (
    <article
      className={revealIndex != null && !revealDone ? "x-post post-reveal-in" : "x-post"}
      data-post-id={id}
      ref={(el) => registerViewRef?.(id, el)}
      style={revealIndex != null && !revealDone ? { animationDelay: `${(revealIndex % 6) * 70}ms` } : undefined}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setRevealDone(true);
      }}
    >
      {isAd && <div className="x-promoted">Promoted</div>}

      <div className="x-post-row">
        <span
          className="x-avatar"
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
          aria-hidden="true"
        />

        <div className="x-post-main">
          <header className="x-post-head">
            <span className="x-author-name">{author}</span>
            {verified && <IconBadge />}
            <span className="x-post-handle">{handle}</span>
            {timeLabel && (
              <>
                <span className="x-dot" aria-hidden="true">·</span>
                <span className="x-post-time">{timeLabel}</span>
              </>
            )}
            <button
              type="button"
              className="x-more-btn"
              aria-label="More"
              disabled={disabled}
            >
              <IconDots />
            </button>
          </header>

          <PostText
            text={post?.text || ""}
            expanded={expanded}
            onExpand={() => { setExpanded(true); handleAction("expand_text", {}); }}
            onCollapse={() => { setExpanded(false); handleAction("collapse_text", {}); }}
            onClamp={() => {}}
            onAction={onAction}
            postId={id}
          />

          {imageUrl && (
            <div className="x-post-media">
              <img src={imageUrl} alt="" loading="lazy" decoding="async" />
            </div>
          )}

          {mediaUrl && (
            <div className="x-post-media" ref={videoWrapRef}>
              <video ref={videoRef} src={mediaUrl} muted loop playsInline />
            </div>
          )}

          <footer className="x-action-row" aria-label="Post actions">
            <button type="button" className="x-action x-action--reply" disabled={disabled} onClick={openReply}>
              <IconReply />
              <NamesPeek post={{ id }} count={displayedReplyCount} kind="replies" label="" hideInlineLabel />
            </button>

            <button
              type="button"
              className={`x-action x-action--repost ${reposted ? "is-active" : ""}`}
              aria-pressed={reposted}
              disabled={disabled}
              onClick={toggleRepost}
            >
              <IconRepost />
              <span>{fmtCount(displayedRepostCount)}</span>
            </button>

            <button
              type="button"
              className={`x-action x-action--like ${liked ? "is-active" : ""}`}
              aria-pressed={liked}
              disabled={disabled}
              onClick={toggleLike}
            >
              <IconLike />
              <span>{fmtCount(displayedLikeCount)}</span>
            </button>

            <span className="x-action x-action--views" aria-hidden="true">
              <IconViews />
              <span>{fmtCount(stats.viewCount)}</span>
            </span>

            <span className="x-action-spacer" />

            <button
              type="button"
              className={`x-action x-action--bookmark ${bookmarked ? "is-active" : ""}`}
              aria-pressed={bookmarked}
              disabled={disabled}
              onClick={toggleBookmark}
            >
              <IconBookmark />
            </button>

            <div className="x-share-wrap">
              <button
                type="button"
                className="x-action x-action--share"
                disabled={disabled}
                onClick={() => setShowShareMenu((v) => !v)}
              >
                <IconShare />
              </button>
              {showShareMenu && (
                <div className="x-share-menu" role="menu">
                  <button type="button" role="menuitem" onClick={copyLink}>Copy link</button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { toggleRepost(); setShowShareMenu(false); }}
                  >
                    {reposted ? "Undo repost" : "Repost"}
                  </button>
                </div>
              )}
            </div>
          </footer>
        </div>
      </div>

      {showReply && (
        <ReplyModal
          post={post}
          author={author}
          avatarUrl={avatarUrl}
          verified={verified}
          handle={handle}
          disabled={disabled}
          onClose={() => setShowReply(false)}
          onSubmit={submitReply}
        />
      )}
    </article>
  );
}

/* ------------------------------- Feed --------------------------------------- */
export function Feed({
  posts = [],
  registerViewRef,
  disabled,
  log,
  onSubmit,
  flags,
  app,
  projectId,
  feedId,
  runSeed,
  participantSeed,
  onDisplayedPostSnapshot,
  submitButtonLabel = "Submit",
  // Default true so a standalone mount (the admin's Feed Preview) keeps
  // rendering its own rails; the real participant page (App-x.jsx) nests
  // this inside its own PageWithRails and passes showRails={false} — same
  // reasoning/precedent as Facebook's identical prop.
  showRails = true,
}) {
  const STEP = 6;
  const FIRST_PAINT = Math.min(8, posts.length || 0);
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
      { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.unobserve(el);
  }, [posts.length]);

  const renderPosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);

  // A post's own Author Type can be "random" (per-post gender
  // randomization, distinct from the feed-wide randomize_names/_avatars
  // toggles) — resolved once per post here (seeded, so stable per
  // participant/session) and reused for bucketing below and the final
  // per-post assignedAuthor/assignedAvatarUrl pick further down.
  const resolvedAuthorTypeById = useMemo(() => {
    const seedBase = [runSeed || "run", app || "x", projectId || "proj", feedId || "feed"];
    const map = new Map();
    for (const p of posts) {
      map.set(p.id, resolvePostAuthorType(p, [...seedBase, String(p.id ?? "")]));
    }
    return map;
  }, [posts, runSeed, app, projectId, feedId]);

  const femalePosts = useMemo(
    () => posts.filter((p) => (resolvedAuthorTypeById.get(p.id) || "female") === "female"),
    [posts, resolvedAuthorTypeById]
  );
  const malePosts = useMemo(
    () => posts.filter((p) => resolvedAuthorTypeById.get(p.id) === "male"),
    [posts, resolvedAuthorTypeById]
  );

  // Posts flagged "misinformation" draw their randomized avatar from a
  // dedicated pool (see getAvatarPoolForPost) rather than the plain
  // female/male pool everyone else uses.
  const femaleMisinfoPosts = useMemo(() => femalePosts.filter((p) => !!p.isMisinformation), [femalePosts]);
  const femaleNormalPosts = useMemo(() => femalePosts.filter((p) => !p.isMisinformation), [femalePosts]);
  const maleMisinfoPosts = useMemo(() => malePosts.filter((p) => !!p.isMisinformation), [malePosts]);
  const maleNormalPosts = useMemo(() => malePosts.filter((p) => !p.isMisinformation), [malePosts]);

  const femaleNameMap = useMemo(
    () => buildDeterministicAssignmentMap(femalePosts, FB_FEMALE_NAMES, [runSeed || "run", app || "x", projectId || "proj", feedId || "feed", "female-names"], (p) => p.id),
    [femalePosts, runSeed, app, projectId, feedId]
  );
  const maleNameMap = useMemo(
    () => buildDeterministicAssignmentMap(malePosts, FB_MALE_NAMES, [runSeed || "run", app || "x", projectId || "proj", feedId || "feed", "male-names"], (p) => p.id),
    [malePosts, runSeed, app, projectId, feedId]
  );

  const [avatarMaps, setAvatarMaps] = useState({ female: new Map(), male: new Map(), femaleMisinfo: new Map(), maleMisinfo: new Map() });
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [femalePool, malePool, femaleMisinfoPool, maleMisinfoPool] = await Promise.all([
        getAvatarPool("female"),
        getAvatarPool("male"),
        getAvatarPoolForPost("female", true),
        getAvatarPoolForPost("male", true),
      ]);
      if (cancelled) return;
      setAvatarMaps({
        female: buildDeterministicAssignmentMap(femaleNormalPosts, femalePool, [runSeed || "run", app || "x", projectId || "proj", feedId || "feed", "female-avatars"], (p) => p.id),
        male: buildDeterministicAssignmentMap(maleNormalPosts, malePool, [runSeed || "run", app || "x", projectId || "proj", feedId || "feed", "male-avatars"], (p) => p.id),
        femaleMisinfo: buildDeterministicAssignmentMap(femaleMisinfoPosts, femaleMisinfoPool, [runSeed || "run", app || "x", projectId || "proj", feedId || "feed", "female-misinfo-avatars"], (p) => p.id),
        maleMisinfo: buildDeterministicAssignmentMap(maleMisinfoPosts, maleMisinfoPool, [runSeed || "run", app || "x", projectId || "proj", feedId || "feed", "male-misinfo-avatars"], (p) => p.id),
      });

      const showAvatars = !!flags?.realistic_surroundings_avatars;
      setContacts(buildRailContacts({
        femalePool: showAvatars ? femalePool : [],
        malePool: showAvatars ? malePool : [],
        runSeed, app, projectId, feedId, count: 5,
      }));
    })();
    return () => { cancelled = true; };
  }, [femaleNormalPosts, maleNormalPosts, femaleMisinfoPosts, maleMisinfoPosts, femalePosts, malePosts, runSeed, app, projectId, feedId, flags?.realistic_surroundings_avatars]);

  const realisticSurroundingsOn = !!flags?.realistic_surroundings;

  return (
    <div className="page">
      {showRails && (realisticSurroundingsOn ? (
        <aside className="rail rail-left rail--content" aria-hidden="true" tabIndex={-1}>
          <div className="rail-real-list">
            {LEFT_RAIL_NAV_ITEMS.map((label) => (
              <div key={label} className="rail-real-item">
                {LEFT_RAIL_ICONS[label]}
                <span>{label}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : (
        <aside className="rail rail-left" aria-hidden="true" tabIndex={-1}>
          <div className="ghost-list">
            {LEFT_RAIL_NAV_ITEMS.map((t, i) => (
              <div key={i} className="ghost-item icon">
                <div className="ghost-icon" />
                <div className="ghost-line w-70" />
              </div>
            ))}
          </div>
        </aside>
      ))}

      <main className="container feed">
        {renderPosts.map((p, revealIndex) => {
          const resolvedType = resolvedAuthorTypeById.get(p.id) || "female";
          const assignedAuthor = resolvedType === "male" ? maleNameMap.get(p.id) : femaleNameMap.get(p.id);
          const isMisinfo = !!p.isMisinformation;
          const assignedAvatarUrl = resolvedType === "male"
            ? (isMisinfo ? avatarMaps.maleMisinfo.get(p.id) : avatarMaps.male.get(p.id))
            : (isMisinfo ? avatarMaps.femaleMisinfo.get(p.id) : avatarMaps.female.get(p.id));
          return (
            <PostCard
              key={p.id}
              post={p}
              onAction={log}
              disabled={disabled}
              registerViewRef={registerViewRef}
              flags={flags}
              runSeed={runSeed}
              app={app}
              projectId={projectId}
              feedId={feedId}
              assignedAuthor={assignedAuthor || null}
              assignedAvatarUrl={assignedAvatarUrl || null}
              participantSeed={participantSeed}
              onDisplayedPostSnapshot={onDisplayedPostSnapshot}
              revealIndex={flags?.realistic_pacing ? revealIndex : null}
            />
          );
        })}

        <div ref={sentinelRef} aria-hidden="true" />
        {visibleCount >= posts.length && <div className="end">End of Feed</div>}
        <div className="submit-wrap">
          <button type="button" className="btn primary btn-wide" onClick={onSubmit} disabled={disabled === true}>
            {submitButtonLabel}
          </button>
        </div>
      </main>

      {showRails && (realisticSurroundingsOn ? (
        <aside className="rail rail-right rail--content" aria-hidden="true" tabIndex={-1}>
          <div className="rail-real-title">Trending</div>
          <div className="rail-real-list">
            {TRENDING_TOPICS.map((t) => (
              <div key={t.topic} className="rail-real-item rail-real-item--trend">
                <span className="rail-trend-meta">{t.category} · Trending</span>
                <span className="rail-trend-topic">{t.topic}</span>
              </div>
            ))}
          </div>
          <div className="rail-real-title">Who to follow</div>
          <div className="rail-real-list">
            {contacts.map((c) => (
              <div key={c.id} className="rail-real-item">
                <span className="rail-contact-avatar-wrap">
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" className="rail-contact-avatar" loading="lazy" decoding="async" />
                  ) : (
                    <span className="rail-contact-avatar rail-contact-avatar--blank" />
                  )}
                </span>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : (
        <aside className="rail rail-right" aria-hidden="true" tabIndex={-1}>
          <div className="ghost-card box">
            <div className="ghost-line w-40" style={{ marginBottom: 8 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="ghost-row">
                <div className="ghost-lines">
                  <div className="ghost-line w-70" />
                  <div className="ghost-line w-45" />
                </div>
              </div>
            ))}
          </div>
        </aside>
      ))}
    </div>
  );
}

export default Feed;
