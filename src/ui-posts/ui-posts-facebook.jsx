// components-ui-posts.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  REACTION_META,
  sumSelectedReactions,
  topReactions,
  fakeNamesFor,
  displayTimeForPost,
  getAvatarPool,
  pickDeterministic,
  getImagePool,
  buildDeterministicAssignmentMap,
} from "../utils";

import { FB_FEMALE_NAMES, FB_MALE_NAMES, FB_COMPANY_NAMES } from "./names";
import { InterventionBlock } from "./components-ui-interventions";

import {
  FacebookCommentModalDesktop,
  FacebookShareModalDesktop,
} from "./ui-post-desktop-facebook";

import {
  FacebookMenuSheet,
  FacebookCommentSheetMobile,
  FacebookShareSheetMobile,
} from "./ui-post-mobile-facebook";

import {
  IconBadge,
  IconDots,
  IconGlobe,
  IconThumb,
  IconComment,
  IconShare,
  ActionBtn,
  PostText,
  NamesPeek,
  IconVolume,
  IconVolumeMute,
} from "../ui-core";

/* --- In-view autoplay hook --- */
function useInViewAutoplay(threshold = 0.6) {
  const wrapRef = React.useRef(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    if (!wrapRef.current) return;
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

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function MenuPortal({ anchorRef, open, onClose, children }) {
  const [coords, setCoords] = React.useState({ top: 0, left: 0, ready: false });

  React.useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef?.current;
    if (!anchor || typeof window === "undefined" || !document?.body) return;

    const update = () => {
      const r = anchor.getBoundingClientRect();
      setCoords({
        top: r.bottom + 4,
        left: r.left,
        ready: true,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  React.useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e) => {
      const menuEl = document.querySelector("#post-menu-portal");
      const inMenu = menuEl && menuEl.contains(e.target);
      const inBtn = anchorRef?.current && anchorRef.current.contains(e.target);
      if (!inMenu && !inBtn) onClose?.();
    };

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !coords.ready || typeof document === "undefined") return null;

  return createPortal(
    <div
      id="post-menu-portal"
      className="menu"
      role="menu"
      style={{
        position: "fixed",
        zIndex: 20000,
        top: coords.top,
        left: coords.left,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/* ----------------------------- Post Card ---------------------------------- */
export function PostCard({
  post,
  onAction,
  disabled,
  registerViewRef,
  respectShowReactions = false,
  flags = { randomize_times: false },
  app,
  projectId,
  feedId,
  runSeed,
  assignedAuthor,
  assignedAvatarUrl,
}) {
  const [reportAck, setReportAck] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentFocusTick, setCommentFocusTick] = useState(0);

  const randNamesOn = !!flags?.randomize_names;
  const randAvatarOn = !!(flags?.randomize_avatars ?? flags?.randomize_avatar);
  const randImagesOn = !!flags?.randomize_images;
  const [randImageUrl, setRandImageUrl] = React.useState(null);

  const shouldShowTime = post?.showTime === false ? false : true;

  const forcedRand =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("forcerand") === "1";

  const randomizeOn = forcedRand || (flags?.randomize_times ?? flags?.random_time) === true;

  const timeLabel = shouldShowTime
    ? (displayTimeForPost(post, {
        randomize: randomizeOn,
        seedParts: [runSeed || "run", app || "fb", projectId || "global", feedId || ""],
      }) || "")
    : "";

  const isMobile = useIsMobile();

  const [playbackRate, setPlaybackRate] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const [volume, setVolume] = useState(0);
  const [volOpen, setVolOpen] = useState(false);
  const [volFading, setVolFading] = useState(false);
  const volHideTimer = useRef(null);

  useEffect(() => () => clearTimeout(volHideTimer.current), []);

  useEffect(() => {
    if (volOpen) {
      setVolFading(false);
      return;
    }
    setVolFading(true);
    const t = setTimeout(() => setVolFading(false), 180);
    return () => clearTimeout(t);
  }, [volOpen]);

  const [mySubmittedComment, setMySubmittedComment] = useState(
    post._localMyCommentText || ""
  );
  const [participantComments, setParticipantComments] = useState(
    mySubmittedComment ? 1 : 0
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const dotsRef = useRef(null);

  const menuItems = (
    <div ref={menuRef}>
      <button
        className="menu-item disabled"
        role="menuitem"
        aria-disabled="true"
        tabIndex={-1}
        title="Unavailable in this study"
      >
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12" />
            <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Interested</span>
          <span className="mi-sub">More of your posts will be like this.</span>
        </span>
      </button>

      <button
        className="menu-item disabled"
        role="menuitem"
        aria-disabled="true"
        tabIndex={-1}
        title="Unavailable in this study"
      >
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12" />
            <path d="M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Not interested</span>
          <span className="mi-sub">Less of your posts will be like this.</span>
        </span>
      </button>

      <div className="menu-divider" />

      <button
        className="menu-item"
        role="menuitem"
        tabIndex={0}
        onClick={() => {
          setMenuOpen(false);
          onAction("report_misinformation_click", { post_id: post.id });
          setReportAck(true);
        }}
      >
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <line x1="7" y1="3" x2="7" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M7 4h10l-2 4 2 4H7z" fill="currentColor" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Report post</span>
          <span className="mi-sub">Tell us if it is misinformation.</span>
        </span>
      </button>

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M6 4h12v16l-6-4-6 4V4z" fill="currentColor" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Save post</span>
          <span className="mi-sub">Add this to your saved items.</span>
        </span>
      </button>

      <div className="menu-divider" />

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M18 8a6 6 0 10-12 0v5l-2 2h16l-2-2V8zM9 19a3 3 0 006 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Turn on notifications for this post</span>
        </span>
      </button>

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M8 5L3 12l5 7M16 5l5 7-5 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Embed</span>
        </span>
      </button>

      <div className="menu-divider" />

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <rect x="4" y="5" width="16" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Hide post</span>
          <span className="mi-sub">See fewer posts like this.</span>
        </span>
      </button>

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Snooze {post.author} for 30 days</span>
          <span className="mi-sub">Temporarily stop seeing posts.</span>
        </span>
      </button>

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Hide all from {post.author}</span>
          <span className="mi-sub">Stop seeing posts from this Page.</span>
        </span>
      </button>

      <div className="menu-divider" />

      <button className="menu-item disabled" role="menuitem" aria-disabled="true" tabIndex={-1}>
        <span className="mi-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mi-text">
          <span className="mi-title">Dismiss</span>
        </span>
      </button>
    </div>
  );

  const ALL_REACTIONS = {
    like: "👍",
    love: "❤️",
    care: "🤗",
    haha: "😆",
    wow: "😮",
    sad: "😢",
    angry: "😡",
  };

  const [myReaction, setMyReaction] = useState(null);

  const OPEN_DELAY = 400;
  const CLOSE_DELAY = 250;
  const SUPPRESS_MS = 300;
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const suppressHoverUntil = useRef(0);

  useEffect(() => {
    return () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, []);

  const { wrapRef, inView } = useInViewAutoplay(0.6);

  const scheduleOpen = () => {
    if (Date.now() < suppressHoverUntil.current) return;
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => {
      if (Date.now() < suppressHoverUntil.current) return;
      setFlyoutOpen(true);
    }, OPEN_DELAY);
  };

  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFlyoutOpen(false), CLOSE_DELAY);
  };

  const closeNowAndSuppress = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setFlyoutOpen(false);
    suppressHoverUntil.current = Date.now() + SUPPRESS_MS;
  };

  useEffect(() => {
    if (!flyoutOpen) return;

    const onDocPointerDown = (e) => {
      const inFlyout = e.target.closest?.(".react-flyout");
      const inLikeWrap = e.target.closest?.(".like-wrap");
      if (!inFlyout && !inLikeWrap) setFlyoutOpen(false);
    };

    document.addEventListener("pointerdown", onDocPointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, {
        capture: true,
      });
    };
  }, [flyoutOpen]);

  const showReactions = post.showReactions ?? false;
  const ALL_RX_KEYS = useMemo(() => Object.keys(REACTION_META), []);

  const baseReactions = useMemo(
    () => ({
      like: 0,
      love: 0,
      care: 0,
      haha: 0,
      wow: 0,
      sad: 0,
      angry: 0,
      ...(post.reactions || {}),
    }),
    [post.reactions]
  );

  const liveReactions = useMemo(() => {
    const obj = { ...baseReactions };
    if (myReaction) obj[myReaction] = (obj[myReaction] || 0) + 1;
    return obj;
  }, [baseReactions, myReaction]);

  const baseCommentCount = Number(post.metrics?.comments) || 0;
  const displayedCommentCount = baseCommentCount + participantComments;

  const baseShareCount = Number(post.metrics?.shares) || 0;
  const [shareCountLocal, setShareCountLocal] = useState(0);
  const displayedShareCount = baseShareCount + shareCountLocal;

  const totalReactions = useMemo(
    () => sumSelectedReactions(liveReactions, ALL_RX_KEYS),
    [liveReactions, ALL_RX_KEYS]
  );

  const top3 = useMemo(
    () => topReactions(liveReactions, ALL_RX_KEYS, 3),
    [liveReactions, ALL_RX_KEYS]
  );

  const hasRx = respectShowReactions
    ? showReactions && totalReactions > 0
    : totalReactions > 0;

  const click = (action, meta = {}) => {
    if (!disabled) onAction(action, { post_id: post.id, ...meta });
  };

  const postForCounts = useMemo(
    () => ({
      ...post,
      showReactions: true,
      metrics: {
        ...post.metrics,
        comments: displayedCommentCount,
        shares: displayedShareCount,
        reactions: totalReactions,
      },
    }),
    [post, displayedCommentCount, displayedShareCount, totalReactions]
  );

  const onLike = () => {
    if (isMobile) {
      setFlyoutOpen((v) => !v);
      return;
    }

    closeNowAndSuppress();
    setMyReaction((prev) => {
      if (prev == null) {
        click("react_pick", { type: "like", prev: null });
        return "like";
      }
      click("react_clear", { type: prev, prev });
      return null;
    });
  };

  const onPickReaction = (key) => {
    setMyReaction((prev) => {
      if (prev === key) {
        click("react_clear", { type: key, prev });
        return null;
      }
      click("react_pick", { type: key, prev });
      return key;
    });
    closeNowAndSuppress();
  };

  const onShare = () => {
    setFlyoutOpen(false);
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setShowShare(true);
    click("share_open");
  };

  const onConfirmShare = (data = {}) => {
  setShareCountLocal((n) => n + 1);

  click("share_target", {
    friend: data.friend || data.friends || "",
    friends: data.friends || data.friend || "",
    message: data.message || "",
  });

  setShowShare(false);
};

  const onExpand = () => {
    setExpanded(true);
    click("expand_text");
  };

  const onOpenComment = () => {
    setFlyoutOpen(false);
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setShowComment(true);
    setCommentFocusTick((n) => n + 1);
    click("comment_open");
  };

  const onSubmitComment = () => {
    const txt = commentText.trim();
    if (!txt) return;

    click("comment_submit", { text: txt, length: txt.length });
    setMySubmittedComment(txt);
    setParticipantComments((c) => c + 1);
    setCommentText("");

    if (isMobile) {
      setShowComment(false);
    }
  };

  const onImageOpen = () => {
    if (post.image) click("image_open", { alt: post.image.alt || "" });
  };

  const videoRef = useRef(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);

  const authorType =
    post.authorType === "male" || post.authorType === "company"
      ? post.authorType
      : "female";

  const seedParts = [
    runSeed || "run",
    app || "app",
    projectId || "proj",
    feedId || "feed",
    String(post.id ?? ""),
  ];

  const displayAuthor = React.useMemo(() => {
    if (!randNamesOn && post.author) return post.author;
    return assignedAuthor || post.author || (authorType === "company" ? "Sponsored" : "User");
  }, [randNamesOn, assignedAuthor, post.author, authorType]);

  const displayAvatar = randAvatarOn
    ? assignedAvatarUrl || post.avatarUrl || null
    : post.avatarUrl || null;

  React.useEffect(() => {
    let cancelled = false;
    const hasImage = !!(post?.image && post?.imageMode !== "none");
    if (!randImagesOn || !hasImage) {
      setRandImageUrl(null);
      return;
    }

    const topic = String(post?.topic || post?.imageTopic || "").trim();
    if (!topic) {
      setRandImageUrl(null);
      return;
    }

    (async () => {
      try {
        const list = await getImagePool(topic);
        if (cancelled) return;
        const pick = pickDeterministic(list, [...seedParts, "image"]);
        setRandImageUrl(pick || null);
      } catch {
        if (!cancelled) setRandImageUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    randImagesOn,
    post?.image,
    post?.imageMode,
    post?.topic,
    post?.imageTopic,
    runSeed,
    app,
    projectId,
    feedId,
    post?.id,
  ]);

  const displayImage = React.useMemo(() => {
    const hasImage = !!(post?.image && post?.imageMode !== "none");
    if (!hasImage) return null;
    if (randImagesOn && randImageUrl) {
      return { url: randImageUrl, alt: post.image?.alt || "" };
    }
    return post.image || null;
  }, [post?.image, post?.imageMode, randImagesOn, randImageUrl]);

  const fmtTime = (s) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, "0");
    return `${m}:${sec}`;
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.muted = true;
    v.volume = 0;

    const onLoadedMeta = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    const onTime = () => setCurrent(v.currentTime || 0);
    const onProg = () => {
      try {
        const b = v.buffered;
        if (b.length) setBufferedEnd(b.end(b.length - 1));
      } catch {}
    };
    const onPlay = () => setIsVideoPlaying(true);
    const onPause = () => setIsVideoPlaying(false);
    const onVol = () => {
      setVolume(v.volume);
      setIsMuted(v.muted);
    };

    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("progress", onProg);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVol);

    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("progress", onProg);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVol);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    const shouldMute = volume === 0;
    if (v.muted !== shouldMute) v.muted = shouldMute;
    setIsMuted(v.muted);
  }, [volume]);

  const onVideoTogglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.paused) {
        await v.play();
        click("video_play");
      } else {
        v.pause();
        click("video_pause");
      }
    } catch {}
  };

  const onVideoEnded = () => {
    setIsVideoPlaying(false);
    click("video_ended");
  };

  const setRate = (r) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = r;
    setPlaybackRate(r);
    setSettingsOpen(false);
    click("video_rate_change", { rate: r });
  };

  const toggleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    const doc = document;
    const isFull =
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement;

    if (isFull) {
      (doc.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.mozCancelFullScreen ||
        doc.msExitFullscreen)?.call(doc);
      click("video_fullscreen_exit");
    } else {
      (el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen)?.call(el);
      click("video_fullscreen_enter");
    }
  };

  const seekTo = (time) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(time)) return;
    v.currentTime = Math.max(0, Math.min(time, v.duration || time));
  };

  const handleBarClick = (e) => {
    const bar = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
    seekTo(pct * (duration || 0));
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const onDocClick = (e) => {
      if (!settingsRef.current) return;
      if (!settingsRef.current.contains(e.target)) setSettingsOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!reportAck) return;
    const t = setTimeout(() => setReportAck(false), 2800);
    return () => clearTimeout(t);
  }, [reportAck]);

  useEffect(() => {
    if (!menuOpen || isMobile) return;
    const onDocClick = (e) => {
      const insideMenu = menuRef.current && menuRef.current.contains(e.target);
      const insideBtn = dotsRef.current && dotsRef.current.contains(e.target);
      if (!insideMenu && !insideBtn) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, isMobile]);

  const LikeIcon = (p) =>
    myReaction ? (
      <span style={{ fontSize: 18, lineHeight: 1 }} {...p}>
        {ALL_REACTIONS[myReaction]}
      </span>
    ) : (
      <IconThumb {...p} />
    );

  const likeLabel = myReaction
    ? REACTION_META[myReaction]?.label || "Like"
    : "Like";

  const myParticipantId =
    ((typeof window !== "undefined" &&
      (window.SESSION?.participant_id || window.PARTICIPANT_ID)) ||
      null) ||
    "Participant";

  function ReactionIconWithNames({ rxKey, count, z, post, idx = 0 }) {
    const [open, setOpen] = React.useState(false);
    const label = REACTION_META[rxKey]?.label || rxKey;
    const { names, remaining } = fakeNamesFor(post.id, count, rxKey, 4);

    return (
      <span
        className="rx"
        style={{
          zIndex: z,
          position: "relative",
          width: 22,
          height: 22,
          fontSize: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "999px",
          marginLeft: idx === 0 ? 0 : -2,
          cursor: count > 0 ? "pointer" : "default",
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onPointerDown={closeNowAndSuppress}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
      >
        {REACTION_META[rxKey].emoji}
        {open && count > 0 && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              bottom: "130%",
              right: 0,
              background: "#111827",
              color: "white",
              padding: "8px 10px",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.25,
              boxShadow: "0 6px 24px rgba(0,0,0,.2)",
              whiteSpace: "nowrap",
              zIndex: 50,
              maxWidth: 260,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
            {names.length ? (
              <>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {names.map((n) => (
                    <li key={n} style={{ margin: "2px 0" }}>
                      {n}
                    </li>
                  ))}
                </ul>
                {remaining > 0 && (
                  <div style={{ opacity: 0.8, marginTop: 4 }}>and {remaining} more</div>
                )}
              </>
            ) : (
              <div style={{ opacity: 0.8 }}>No {label.toLowerCase()} yet</div>
            )}
          </div>
        )}
      </span>
    );
  }

  const shouldShowGhosts = showReactions && baseCommentCount > 0;

  const fb = {
    wrap: { position: "relative" },
    bottom: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: "8px 10px",
      color: "#fff",
      zIndex: 2,
      pointerEvents: "none",
      display: "grid",
      gap: 6,
      background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.45) 100%)",
    },
    progress: {
      position: "relative",
      height: 6,
      borderRadius: 999,
      background: "rgba(255,255,255,.25)",
      cursor: "pointer",
      overflow: "hidden",
      pointerEvents: "auto",
    },
    progBuffered: (pct) => ({
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: `${pct}%`,
      background: "rgba(255,255,255,.35)",
    }),
    progPlayed: (pct) => ({
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: `${pct}%`,
      background: "#fff",
    }),
    row: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    time: { fontSize: 12, fontWeight: 600, textShadow: "0 1px 2px rgba(0,0,0,.5)" },
    settingsWrap: { position: "relative", pointerEvents: "auto" },
    menu: {
      position: "absolute",
      bottom: "110%",
      right: 0,
      background: "#111827",
      color: "#fff",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: 8,
      boxShadow: "0 10px 24px rgba(0,0,0,.35)",
      padding: 6,
      minWidth: 120,
      zIndex: 3,
    },
    menuBtn: (active) => ({
      display: "block",
      width: "100%",
      textAlign: "left",
      border: 0,
      background: active ? "rgba(255,255,255,.08)" : "transparent",
      color: "#fff",
      padding: "6px 8px",
      borderRadius: 6,
      cursor: "pointer",
      fontSize: 13,
    }),
  };

  const postContent = (
    <>
      <header className="card-head">
        <div className="avatar">
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt=""
              className="avatar-img"
              loading="lazy"
              decoding="async"
              onLoad={() => click("avatar_load")}
              onError={() => click("avatar_error")}
            />
          ) : null}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name-row">
            <div className="name">{displayAuthor}</div>
            {post.badge && (
              <span className="badge">
                <IconBadge />
              </span>
            )}
          </div>

          <div className="meta" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {post.adType === "ad" ? (
              <>
                <span className="subtle">Sponsored</span>
                <span className="sep" aria-hidden="true">·</span>
                <IconGlobe
                  style={{ color: "var(--muted)", width: 14, height: 14, flexShrink: 0 }}
                />
              </>
            ) : timeLabel ? (
              <>
                <span className="subtle">{timeLabel}</span>
                <span className="sep" aria-hidden="true">·</span>
                <IconGlobe
                  style={{ color: "var(--muted)", width: 14, height: 14, flexShrink: 0 }}
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="menu-wrap">
          <button
            ref={dotsRef}
            className="dots"
            onClick={() => {
              if (!disabled) {
                setFlyoutOpen(false);
                clearTimeout(openTimer.current);
                clearTimeout(closeTimer.current);
                setMenuOpen((v) => !v);
                onAction("post_menu_toggle", { post_id: post.id });
              }
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Post menu"
            disabled={disabled}
          >
            <IconDots />
          </button>

          {isMobile
            ? createPortal(
                <FacebookMenuSheet
                  open={menuOpen}
                  onClose={() => setMenuOpen(false)}
                  menuItems={menuItems}
                />,
                document.body
              )
            : (
              <MenuPortal anchorRef={dotsRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
                {menuItems}
              </MenuPortal>
            )}
        </div>
      </header>

      <div className="card-body">
        <PostText
          text={post.text || ""}
          expanded={expanded}
          onExpand={onExpand}
          onClamp={() => click("text_clamped")}
        />
        {expanded && post.links?.length ? (
          <div className="link-row">
            {post.links.map((lnk, i) => (
              <a
                key={i}
                href={lnk.href}
                onClick={(e) => {
                  e.preventDefault();
                  click("link_click", { label: lnk.label, href: lnk.href });
                }}
                className="link"
              >
                {lnk.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {post.video && post.videoMode !== "none" ? (
        (() => {
          const u = post.video?.url || "";
          const isDrive =
            /(?:^|\/\/)(?:drive\.google\.com|drive\.usercontent\.google\.com)/i.test(u);

          let driveId = null;
          {
            const qMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(u);
            const dMatch = /\/d\/([a-zA-Z0-9_-]+)/.exec(u);
            if (qMatch) driveId = qMatch[1];
            else if (dMatch) driveId = dMatch[1];
          }

          if (isDrive && driveId) {
            return (
              <div className="video-wrap drive-embed" ref={wrapRef}>
                <iframe
                  src={`https://drive.google.com/file/d/${driveId}/preview`}
                  title="Drive video"
                  loading="lazy"
                  allow="autoplay; fullscreen"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    border: 0,
                    display: "block",
                    background: "#000",
                  }}
                />
              </div>
            );
          }

          const playedPct = duration ? Math.min(current / duration, 1) * 100 : 0;
          const bufferedPct = duration ? Math.min(bufferedEnd / duration, 1) * 100 : 0;

          return (
            <div
              className="video-wrap"
              ref={wrapRef}
              onMouseEnter={() => setSettingsOpen(false)}
              style={fb.wrap}
            >
              <video
                ref={videoRef}
                className="video-el"
                src={u}
                poster={post.videoPosterUrl || undefined}
                playsInline
                muted={isMuted}
                autoPlay={inView}
                preload="auto"
                loop={!!post.videoLoop}
                onPlay={() => setIsVideoPlaying(true)}
                onPause={() => setIsVideoPlaying(false)}
                onEnded={onVideoEnded}
                controls={!!post.videoShowControls}
                disablePictureInPicture
                controlsList="nodownload noremoteplayback"
                style={{
                  display: "block",
                  width: "auto",
                  height: "auto",
                  maxWidth: "100%",
                  maxHeight: "min(78vh, 600px)",
                  objectFit: "contain",
                  background: "#000",
                  margin: "0 auto",
                  cursor: "pointer",
                }}
                onClick={onVideoTogglePlay}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    onVideoTogglePlay();
                  }
                }}
              />

              {!post.videoShowControls && (
                <div style={fb.bottom}>
                  <div className="fb-ctrls">
                    <div className="fb-ctrl-left">
                      <button
                        type="button"
                        className="fb-btn"
                        onClick={onVideoTogglePlay}
                        aria-label={isVideoPlaying ? "Pause" : "Play"}
                        title={isVideoPlaying ? "Pause" : "Play"}
                        disabled={disabled}
                      >
                        {isVideoPlaying ? "❚❚" : "▶"}
                      </button>

                      <div
                        style={fb.time}
                        aria-label={`Time ${fmtTime(current)} of ${fmtTime(duration)}`}
                      >
                        {fmtTime(current)} / {fmtTime(duration)}
                      </div>
                    </div>

                    <div
                      className="fb-progress-inline"
                      role="slider"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(duration || 0)}
                      aria-valuenow={Math.round(current || 0)}
                      aria-label="Video progress"
                      tabIndex={0}
                      onClick={handleBarClick}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          seekTo(current - 5);
                          e.preventDefault();
                        }
                        if (e.key === "ArrowRight") {
                          seekTo(current + 5);
                          e.preventDefault();
                        }
                      }}
                      title="Seek"
                    >
                      <div style={fb.progBuffered(bufferedPct)} />
                      <div style={fb.progPlayed(playedPct)} />
                    </div>

                    <div className="fb-ctrl-right">
                      <div
                        className="fb-vol"
                        onMouseEnter={() => {
                          clearTimeout(volHideTimer.current);
                          setVolOpen(true);
                        }}
                        onMouseLeave={() => {
                          clearTimeout(volHideTimer.current);
                          volHideTimer.current = setTimeout(() => setVolOpen(false), 600);
                        }}
                      >
                        <button
                          type="button"
                          className="fb-btn"
                          onClick={() => {
                            const v = videoRef.current;
                            if (!v) return;
                            const next = !v.muted;
                            v.muted = next;
                            setIsMuted(next);
                            if (!next && v.volume === 0) {
                              v.volume = 0.25;
                              setVolume(0.25);
                            }
                            click(next ? "video_mute" : "video_unmute");
                            setVolOpen(true);
                          }}
                          aria-label={isMuted ? "Unmute" : "Mute"}
                          title={isMuted ? "Unmute" : "Mute"}
                          disabled={disabled}
                        >
                          {isMuted || volume === 0 ? <IconVolumeMute /> : <IconVolume />}
                        </button>

                        {volOpen && (
                          <div className={`fb-vol-pop${volFading ? " hide" : ""}`}>
                            <div className="fb-vol-box">
                              <div
                                className="fb-vol-visual"
                                aria-hidden="true"
                                style={{
                                  ["--vol-val"]: Math.round(volume * 100),
                                  ["--vol-fill"]:
                                    isMuted || volume === 0
                                      ? "rgba(255,255,255,.25)"
                                      : "#fff",
                                }}
                              />
                              <input
                                className="fb-vol-slider"
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={Math.round(volume * 100)}
                                aria-label="Volume"
                                aria-orientation="vertical"
                                onInput={(e) => {
                                  const v = videoRef.current;
                                  const pct = Math.max(
                                    0,
                                    Math.min(100, Number(e.target.value) || 0)
                                  );
                                  const vol = pct / 100;
                                  setVolume(vol);
                                  if (v) v.volume = vol;
                                  const shouldMute = vol === 0;
                                  if (v && v.muted !== shouldMute) v.muted = shouldMute;
                                  setIsMuted(shouldMute);
                                  const vis = e.currentTarget.previousElementSibling;
                                  vis?.style.setProperty("--vol-val", String(pct));
                                  vis?.style.setProperty(
                                    "--vol-fill",
                                    shouldMute ? "rgba(255,255,255,.25)" : "#fff"
                                  );
                                }}
                                onChange={() => {}}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={fb.settingsWrap} ref={settingsRef}>
                        <button
                          type="button"
                          className="fb-btn"
                          aria-haspopup="menu"
                          aria-expanded={settingsOpen}
                          onClick={() => setSettingsOpen((o) => !o)}
                          title="Settings"
                          disabled={disabled}
                        >
                          ⚙
                        </button>
                        {settingsOpen && (
                          <div style={fb.menu} role="menu">
                            {[0.5, 1, 1.25, 1.5, 2].map((r) => (
                              <button
                                key={r}
                                type="button"
                                role="menuitem"
                                style={fb.menuBtn(r === playbackRate)}
                                onClick={() => setRate(r)}
                                title={`${r}×`}
                                disabled={disabled}
                              >
                                {r}× {r === playbackRate ? "✓" : ""}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="fb-btn"
                        onClick={toggleFullscreen}
                        aria-label="Fullscreen"
                        title="Fullscreen"
                        disabled={disabled}
                      >
                        ⛶
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : displayImage ? (
        <button
          className="image-btn"
          onClick={onImageOpen}
          disabled={disabled}
          aria-label="Open image"
        >
          {displayImage.svg ? (
            <div
              dangerouslySetInnerHTML={{
                __html: post.image.svg.replace(
                  "<svg ",
                  "<svg preserveAspectRatio='xMidYMid slice' style='display:block;width:100%;height:auto;max-height:min(60vh,520px)' "
                ),
              }}
            />
          ) : displayImage.url ? (
            <img
              src={displayImage.url}
              alt={displayImage.alt || ""}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                maxHeight: "min(60vh, 520px)",
                objectFit: "cover",
              }}
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </button>
      ) : null}

      <InViewVideoController
        inView={inView}
        videoRef={videoRef}
        setIsVideoPlaying={setIsVideoPlaying}
        muted={isMuted}
      />

      {post.adType === "ad" && (
        <div
          className="ad-block"
          style={{
            marginTop: 0,
            padding: ".75rem",
            background: "var(--bg, #f3f4f6)",
            borderRadius: 0,
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {post.adDomain && (
              <div
                className="subtle"
                style={{
                  fontSize: ".85rem",
                  marginBottom: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {String(post.adDomain).toUpperCase()}
              </div>
            )}
            <div
              style={{
                fontWeight: 700,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {post.adHeadline || "Free Shipping"}
            </div>
            <div
              className="subtle"
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {post.adSubheadline || "Premium Crystal Glass 🥃"}
            </div>
          </div>

          <button
            className="btn primary"
            style={{ borderRadius: 999, padding: ".5rem 1rem", flexShrink: 0 }}
            onClick={() => onAction?.("ad_cta_click", { post_id: post.id })}
            disabled={disabled}
          >
            {post.adButtonText || "Shop now"}
          </button>
        </div>
      )}

      <InterventionBlock
        post={post}
        onAction={onAction}
        view={{
          author: displayAuthor,
          avatarUrl: displayAvatar,
          timeLabel,
          image: displayImage,
        }}
      />

      {reportAck && (
        <div className="ack-overlay" role="status" aria-live="polite">
          <div className="ack-overlay-box">
            <span className="ack-check" aria-hidden="true">
              ✓
            </span>
            <div className="ack-text">
              <strong>Thanks</strong>
              <br />
              Your report was recorded for this study.
            </div>
          </div>
        </div>
      )}

      {(() => {
        const hasComments = displayedCommentCount > 0;
        const hasShares = displayedShareCount > 0;
        const showStatsBar = hasRx || hasComments || hasShares;

        return showStatsBar ? (
          <div className="bar-stats">
            {hasRx ? (
              <div className="left">
                <div className="rx-stack">
                  {top3.map((r, i) => (
                    <ReactionIconWithNames
                      key={r.key}
                      rxKey={r.key}
                      count={liveReactions[r.key] || 0}
                      z={10 - i}
                      post={post}
                      idx={i}
                    />
                  ))}
                  <span className="muted rx-count" style={{ marginLeft: 8 }}>
                    <NamesPeek
                      post={postForCounts}
                      count={totalReactions}
                      kind="reactions"
                      label="reactions"
                      hideInlineLabel
                    />
                  </span>
                </div>
              </div>
            ) : (
              <div />
            )}

            {(hasComments || hasShares) && (
              <div
                className="right muted"
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                {hasComments && (
                  <NamesPeek
                    post={postForCounts}
                    count={displayedCommentCount}
                    kind="comments"
                    label={displayedCommentCount === 1 ? "comment" : "comments"}
                  />
                )}
                {hasShares && (
                  <NamesPeek
                    post={postForCounts}
                    count={displayedShareCount}
                    kind="shares"
                    label={displayedShareCount === 1 ? "share" : "shares"}
                  />
                )}
              </div>
            )}
          </div>
        ) : null;
      })()}

      <footer className="footer">
        <div className="actions">
          <div
            className="like-wrap"
            onMouseEnter={!isMobile ? scheduleOpen : undefined}
            onMouseLeave={
              !isMobile
                ? () => {
                    scheduleClose();
                    suppressHoverUntil.current = 0;
                  }
                : undefined
            }
          >
            <ActionBtn
              label={likeLabel}
              active={!!myReaction}
              onClick={onLike}
              Icon={LikeIcon}
              disabled={disabled}
              aria-haspopup="menu"
              aria-expanded={flyoutOpen}
            />

            {flyoutOpen && (
              <div
                className="react-flyout"
                role="menu"
                aria-label="Pick a reaction"
                onMouseEnter={!isMobile ? scheduleOpen : undefined}
                onMouseLeave={!isMobile ? scheduleClose : undefined}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {Object.entries(ALL_REACTIONS).map(([key, emoji]) => (
                  <button
                    type="button"
                    key={key}
                    aria-label={key}
                    onClick={() => onPickReaction(key)}
                    title={key}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ActionBtn
            label="Comment"
            onClick={onOpenComment}
            Icon={IconComment}
            disabled={disabled}
          />

          <ActionBtn
            label="Share"
            onClick={onShare}
            Icon={IconShare}
            active={false}
            disabled={disabled}
          />
        </div>
      </footer>
    </>
  );

  return (
    <article
      ref={registerViewRef(post.id)}
      data-post-id={post.id}
      data-has-image={displayImage ? "1" : undefined}
      className="card post-card"
    >
      {postContent}

      {isMobile
        ? createPortal(
            <FacebookCommentSheetMobile
              open={showComment}
              onClose={() => {
                onAction("comment_cancel", { post_id: post.id });
                setShowComment(false);
              }}
              onSubmit={onSubmitComment}
              commentText={commentText}
              setCommentText={setCommentText}
              mySubmittedComment={mySubmittedComment}
              shouldShowGhosts={shouldShowGhosts}
              baseCommentCount={baseCommentCount}
              participantId={String(myParticipantId)}
            />,
            document.body
          )
        : (
          <FacebookCommentModalDesktop
            open={showComment}
            onClose={() => {
              onAction("comment_cancel", { post_id: post.id });
              setShowComment(false);
            }}
            onSubmit={onSubmitComment}
            commentText={commentText}
            setCommentText={setCommentText}
            mySubmittedComment={mySubmittedComment}
            shouldShowGhosts={shouldShowGhosts}
            baseCommentCount={baseCommentCount}
            participantId={String(myParticipantId)}
            postContent={
              <div className="fb-modal-post-shell">
                {postContent}
              </div>
            }
            focusTick={commentFocusTick}
          />
        )}

      {isMobile
        ? createPortal(
            <FacebookShareSheetMobile
              open={showShare}
              onClose={() => setShowShare(false)}
              onShare={onConfirmShare}
            />,
            document.body
          )
        : (
          <FacebookShareModalDesktop
            open={showShare}
            onClose={() => setShowShare(false)}
            onShare={onConfirmShare}
          />
        )}
    </article>
  );
}

/* Programmatic in-view play/pause for native <video> */
function InViewVideoController({ inView, videoRef, setIsVideoPlaying, muted }) {
  useEffect(() => {
    const v = videoRef?.current;
    if (!v) return;
    try {
      if (inView) {
        v.muted = muted !== false;
        v.play().then(() => setIsVideoPlaying(true)).catch(() => {});
      } else {
        v.pause();
        setIsVideoPlaying(false);
      }
    } catch {}
  }, [inView, videoRef, setIsVideoPlaying, muted]);

  return null;
}

/* ------------------------------- Feed ------------------------------------- */
export function Feed({
  posts,
  registerViewRef,
  disabled,
  log,
  onSubmit,
  flags,
  app,
  projectId,
  feedId,
  runSeed,
}) {
  const STEP = 6;
  const FIRST_PAINT = Math.min(8, posts.length || 0);
  const [visibleCount, setVisibleCount] = useState(FIRST_PAINT);

  useEffect(() => {
    if (!posts?.length) return;
    const ric =
      window.requestIdleCallback ||
      ((fn) => setTimeout(() => fn({ didTimeout: false }), 200));
    const handle = ric(() => setVisibleCount((c) => Math.min(c + STEP, posts.length)));
    return () =>
      window.cancelIdleCallback ? window.cancelIdleCallback(handle) : clearTimeout(handle);
  }, [posts]);

  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisibleCount((c) => Math.min(c + STEP, posts.length));
          }
        }
      },
      { root: null, rootMargin: "600px 0px 600px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.unobserve(el);
  }, [posts.length]);

  const renderPosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);

  const femalePosts = useMemo(
    () => posts.filter((p) => (p.authorType || "female") === "female"),
    [posts]
  );

  const malePosts = useMemo(
    () => posts.filter((p) => p.authorType === "male"),
    [posts]
  );

  const companyPosts = useMemo(
    () => posts.filter((p) => p.authorType === "company"),
    [posts]
  );

  const femaleNameMap = useMemo(
    () =>
      buildDeterministicAssignmentMap(
        femalePosts,
        FB_FEMALE_NAMES,
        [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "female-names"],
        (p) => p.id
      ),
    [femalePosts, runSeed, app, projectId, feedId]
  );

  const maleNameMap = useMemo(
    () =>
      buildDeterministicAssignmentMap(
        malePosts,
        FB_MALE_NAMES,
        [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "male-names"],
        (p) => p.id
      ),
    [malePosts, runSeed, app, projectId, feedId]
  );

  const companyNameMap = useMemo(
    () =>
      buildDeterministicAssignmentMap(
        companyPosts,
        FB_COMPANY_NAMES,
        [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "company-names"],
        (p) => p.id
      ),
    [companyPosts, runSeed, app, projectId, feedId]
  );

  const [avatarMaps, setAvatarMaps] = useState({
    female: new Map(),
    male: new Map(),
    company: new Map(),
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [femalePool, malePool, companyPool] = await Promise.all([
        getAvatarPool("female"),
        getAvatarPool("male"),
        getAvatarPool("company"),
      ]);

      if (cancelled) return;

      setAvatarMaps({
        female: buildDeterministicAssignmentMap(
          femalePosts,
          femalePool,
          [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "female-avatars"],
          (p) => p.id
        ),
        male: buildDeterministicAssignmentMap(
          malePosts,
          malePool,
          [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "male-avatars"],
          (p) => p.id
        ),
        company: buildDeterministicAssignmentMap(
          companyPosts,
          companyPool,
          [runSeed || "run", app || "app", projectId || "proj", feedId || "feed", "company-avatars"],
          (p) => p.id
        ),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [femalePosts, malePosts, companyPosts, runSeed, app, projectId, feedId]);

  return (
    <div className="page">
      <aside className="rail rail-left" aria-hidden="true" tabIndex={-1}>
        <div className="ghost-card ghost-profile">
          <div className="ghost-avatar xl" />
          <div className="ghost-lines">
            <div className="ghost-line w-60" />
            <div className="ghost-line w-35" />
          </div>
        </div>
        <div className="ghost-list">
          {["Home", "AI", "Friends", "Events", "Memories", "Saved", "Groups", "Marketplace", "Feeds", "Video"].map((t, i) => (
            <div key={i} className="ghost-item icon">
              <div className="ghost-icon" />
              <div className="ghost-line w-70" />
            </div>
          ))}
        </div>
        <div className="ghost-title" />
        <div className="ghost-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ghost-item">
              <div className="ghost-avatar sm" />
              <div className="ghost-line w-60" />
            </div>
          ))}
        </div>
      </aside>

      <main className="container feed">
        {renderPosts.map((p) => {
          const assignedAuthor =
            p.authorType === "male"
              ? maleNameMap.get(p.id)
              : p.authorType === "company"
              ? companyNameMap.get(p.id)
              : femaleNameMap.get(p.id);

          const assignedAvatarUrl =
            p.authorType === "male"
              ? avatarMaps.male.get(p.id)
              : p.authorType === "company"
              ? avatarMaps.company.get(p.id)
              : avatarMaps.female.get(p.id);

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
            />
          );
        })}

        <div ref={sentinelRef} aria-hidden="true" />
        {visibleCount >= posts.length && <div className="end">End of Feed</div>}
        <div className="submit-wrap">
          <button
            type="button"
            className="btn primary btn-wide"
            onClick={onSubmit}
            disabled={disabled === true}
          >
            Submit
          </button>
        </div>
      </main>

      <aside className="rail rail-right" aria-hidden="true" tabIndex={-1}>
        <div className="ghost-card banner" />
        <div className="ghost-card banner" />
        <div className="ghost-card box">
          <div className="ghost-line w-40" style={{ marginBottom: 8 }} />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="ghost-row">
              <div className="ghost-avatar sm" />
              <div className="ghost-lines">
                <div className="ghost-line w-70" />
                <div className="ghost-line w-45" />
              </div>
            </div>
          ))}
        </div>
        <div className="ghost-card box">
          <div className="ghost-line w-35" style={{ marginBottom: 8 }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="ghost-row">
              <div className="ghost-avatar sm online" />
              <div className="ghost-line w-60" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}