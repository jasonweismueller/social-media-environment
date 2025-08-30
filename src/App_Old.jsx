// Fakebook Research Feed — React + static CSS
// Features: avatars, Facebook-like cards, interaction logging,
//           intervention label OR context note (choose per post)

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

/* ------------------------------ Utils ------------------------------------- */
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const now = () => Date.now();
const fmtTime = (ms) => new Date(ms).toISOString();
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const getUrlParam = (key) =>
  new URLSearchParams(window.location.search).get(key || "");

function toCSV(rows, header) {
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [];
  if (header) lines.push(header.map(esc).join(","));
  for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

/* ---------------------------- Sample Posts -------------------------------- */
const INITIAL_POSTS = [
  {
    id: "p1",
    author: "Thomas Johnson",
    avatarUrl: "https://i.pravatar.cc/64?img=11",
    time: "2h",
    text:
      "I’ve partnered with Together For Tomorrow to support local clean-ups and recycling workshops. If you can, check them out and consider donating. I’ve partnered with Together For Tomorrow to support local clean-ups and recycling workshops. If you can, check them out and consider donating.",
    image: {
      alt: "Recycling workshop",
      svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 420'>
        <rect width='800' height='420' fill='#e2f3e6'/>
        <g fill='#2f855a'>
          <circle cx='150' cy='210' r='80'/>
          <rect x='260' y='120' width='420' height='180' rx='16'/>
        </g>
        <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='28' fill='#276749'>Recycling Workshop</text>
      </svg>`,
    },
    links: [{ label: "togetherfortomorrow.org", href: "#" }],
  },
  {
    id: "p2",
    author: "Rina Park",
    avatarUrl: "https://i.pravatar.cc/64?img=22",
    time: "5h",
    text:
      "Coffee chat at the community center went well! Next one is on Saturday — we’ll share tips to reduce single-use plastics at home.",
    image: {
      alt: "Reusable bottles on a table",
      svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 420'>
        <defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='#fde68a'/><stop offset='1' stop-color='#fca5a5'/></linearGradient></defs>
        <rect width='800' height='420' fill='url(#g)'/>
        <g fill='#374151'>
          <rect x='140' y='120' width='80' height='160' rx='14'/>
          <rect x='260' y='120' width='80' height='160' rx='14'/>
          <rect x='380' y='120' width='80' height='160' rx='14'/>
        </g>
        <text x='50%' y='85%' dominant-baseline='middle' text-anchor='middle' font-size='28' fill='#1f2937'>Bring your bottle</text>
      </svg>`,
    },
    links: [],
  },
  {
    id: "p3",
    author: "City Green Crew",
    avatarUrl: "https://i.pravatar.cc/64?img=33",
    time: "Yesterday",
    text:
      "Results from last weekend’s river clean: 28 volunteers, 42 bags collected. Thank you to everyone who came along!",
    image: null,
    links: [
      { label: "Volunteer sign-up", href: "#" },
      { label: "Event recap", href: "#" },
    ],
  },
];

/* ------------------------------- Icons ------------------------------------ */
const IconLike = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path
      fill="currentColor"
      d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z"
    />
  </svg>
);
const IconComment = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v14l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
  </svg>
);
const IconShare = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path
      fill="currentColor"
      d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.02-4.11A2.99 2.99 0 1 0 14 4a2.99 2.99 0 0 0 .05.53L7.03 8.64A3 3 0 1 0 7 15.36l7.02 4.11c-.03.17-.05.34-.05.53a3 3 0 1 0 3-3z"
    />
  </svg>
);
const IconDots = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
    <circle cx="5" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="19" cy="12" r="2" fill="currentColor" />
  </svg>
);
const IconLogo = (p) => (
  <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" {...p}>
    <rect width="32" height="32" rx="6" fill="#1877F2" />
    <path
      d="M20 9h-2.2c-2.2 0-3.8 1.7-3.8 3.9V16H12v3h2v6h3v-6h2.5l.5-3H17v-2c0-.6.4-1 1-1h2V9z"
      fill="#fff"
    />
  </svg>
);
const IconInfo = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M12 17v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="7" r="1.5" fill="currentColor" />
  </svg>
);

const IconBadge = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...p}>
    <path fill="#1d9bf0" d="M12 2l2.2 2.2 3.1-.3 1.2 2.9 2.9 1.2-.3 3.1L24 12l-2.2 2.2.3 3.1-2.9 1.2-1.2 2.9-3.1-.3L12 24l-2.2-2.2-3.1.3-1.2-2.9-2.9-1.2.3-3.1L0 12l2.2-2.2-.3-3.1 2.9-1.2L6 2.2l3.1.3L12 2z"/>
    <path fill="#fff" d="M10.7 15.3l-2.5-2.5 1.1-1.1 1.4 1.4 4-4 1.1 1.1-5.1 5.1z"/>
  </svg>
);
// People/Community icon for context note
const IconUsers = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...p}>
    <path fill="currentColor" d="M16 11a4 4 0 1 0-3.2-6.5A4 4 0 0 0 16 11zM8 12a4 4 0 1 0-3.2-6.5A4 4 0 0 0 8 12z"/>
    <path fill="currentColor" d="M2 19a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1H2v-1zm10 0a6.99 6.99 0 0 1 3.3-6h.7a6 6 0 0 1 6 6v1h-10v-1z"/>
  </svg>
);

/* ------------------------------ Small UI pieces ---------------------------- */
function ActionBtn({ label, onClick, Icon, active, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`action ${active ? "active" : ""}`}
      aria-pressed={!!active}
    >
      <Icon />
      <span style={{ fontSize: ".9rem", fontWeight: 600 }}>{label}</span>
    </button>
  );
}

function PostText({ text, expanded, onExpand }) {
  const pRef = React.useRef(null);
  const [needsClamp, setNeedsClamp] = React.useState(false);

  React.useEffect(() => {
    const el = pRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      setNeedsClamp(el.scrollHeight > el.clientHeight + 1);
    });
  }, [text, expanded]);

  return (
    <div className="text-wrap">
      <p ref={pRef} className={`text ${!expanded ? "clamp" : ""}`}>{text}</p>

      {!expanded && needsClamp && (
      <div className="fade-more">
        <span className="dots" aria-hidden="true">…</span>
        <button className="see-more" onClick={onExpand}>See more</button>
      </div>
    )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <h3 style={{ margin: 0, fontWeight: 600 }}>{title}</h3>
          <button className="dots" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ----------------------------- Post Card ---------------------------------- */
function PostCard({
  post,
  onAction,
  disabled,
  registerViewRef,
  showInterventionLabel,
  showInterventionNote,
  noteText,
  showBadge,
}) {
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");

  // ⋯ menu state/refs
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const dotsRef = useRef(null);

  const click = (action, meta = {}) => {
    if (disabled) return;
    onAction(action, { post_id: post.id, ...meta });
  };

  const onLike = () =>
    setLiked((v) => {
      const next = !v;
      click(next ? "like" : "unlike");
      return next;
    });
  const onShare = () => click("share");
  const onExpand = () => {
    setExpanded(true);
    click("expand_text");
  };
  const onOpenComment = () => {
    setShowComment(true);
    click("comment_open");
  };
  const onSubmitComment = () => {
    const txt = commentText.trim();
    click("comment_submit", { text: txt, length: txt.length });
    setCommentText("");
    setShowComment(false);
  };
  const onImageOpen = () => {
    if (post.image) click("image_open", { alt: post.image.alt });
  };

  // Close menu on outside click / Esc
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      const insideMenu = menuRef.current && menuRef.current.contains(e.target);
      const insideBtn = dotsRef.current && dotsRef.current.contains(e.target);
      if (!insideMenu && !insideBtn) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <article ref={registerViewRef(post.id)} className="card">
      <header className="card-head">
        <div className="avatar">
          {post.avatarUrl ? (
            <img
              src={post.avatarUrl}
              alt=""
              className="avatar-img"
              onLoad={() => click("avatar_load")}
              onError={() => click("avatar_error")}
            />
          ) : null}
        </div>
        <div style={{ flex: 1 }}>
          <div className="name-row">
            <div className="name">{post.author}</div>
            {showBadge && (
              <span className="badge">
                <IconBadge />
              </span>
            )}
          </div>
          <div className="meta">{post.time} · Public</div>
        </div>

        {/* ⋯ menu */}
        <div className="menu-wrap">
          <button
            ref={dotsRef}
            className="dots"
            onClick={() => {
              if (disabled) return;
              setMenuOpen((v) => !v);
              onAction("post_menu_toggle", { post_id: post.id });
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Post menu"
            disabled={disabled}
          >
            <IconDots />
          </button>

          {menuOpen && (
            <div className="menu" role="menu" ref={menuRef}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  setMenuOpen(false);
                  onAction("report_misinformation_click", { post_id: post.id });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setMenuOpen(false);
                    onAction("report_misinformation_click", { post_id: post.id });
                  }
                }}
              >
                🚩 Report post as misinformation
              </div>

              <div className="menu-divider" />

              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  setMenuOpen(false);
                  onAction("post_menu_dismiss", { post_id: post.id });
                }}
              >
                ✖️ Dismiss
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="card-body">
        <PostText text={post.text} expanded={expanded} onExpand={onExpand} />
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

      {post.image ? (
        <button
          className="image-btn"
          onClick={onImageOpen}
          disabled={disabled}
          aria-label="Open image"
        >
          {/* eslint-disable-next-line react/no-danger */}
          <div
            dangerouslySetInnerHTML={{
              __html: post.image.svg.replace(
                "<svg ",
                "<svg preserveAspectRatio='xMidYMid slice' style='display:block;width:100%;height:auto' "
              ),
            }}
          />
        </button>
      ) : null}

      {/* --- Interventions: under image, above footer --- */}
      {showInterventionLabel && (
        <div className="info-bar info-clean">
          <div className="info-icon"><IconInfo /></div>
          <div className="info-body">
            <div className="info-title">False information</div>
            <div className="info-sub">
              This is information that third-party fact-checkers say is false.
            </div>
            <div className="info-row">
              <div>Want to see why?</div>
              <button className="btn" onClick={() => click("intervention_learn_more")}>
                Learn more
              </button>
            </div>
          </div>
        </div>
      )}

      {showInterventionNote && (
        <div className="note-bar">
          <div className="note-icon"><IconUsers /></div>
          <div className="note-body">
            <div className="note-title">Third-party fact checkers added context</div>
            <div className="note-sub">{noteText}</div>
            <div className="note-row">
              <div>Do you find this helpful?</div>
              <button className="btn" onClick={() => click("note_rate_open")}>
                Rate it
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="actions">
          <ActionBtn label="Like" active={liked} onClick={onLike} Icon={IconLike} disabled={disabled} />
          <ActionBtn label="Comment" onClick={onOpenComment} Icon={IconComment} disabled={disabled} />
          <ActionBtn label="Share" onClick={onShare} Icon={IconShare} disabled={disabled} />
        </div>
      </footer>

      {showComment && (
        <Modal onClose={() => setShowComment(false)} title="Write a comment">
          <textarea
            className="textarea"
            rows={4}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write your comment..."
          />
          <div className="row-end">
            <button
              className="btn"
              onClick={() => {
                click("comment_cancel");
                setShowComment(false);
              }}
            >
              Cancel
            </button>
            <button className="btn primary" onClick={onSubmitComment} disabled={!commentText.trim()}>
              Post
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}
/* --------------------------- Top-level App --------------------------------- */
export default function App() {
  const sessionIdRef = useRef(uid());
  const t0Ref = useRef(now());
  const [participantId, setParticipantId] = useState(
    () => getUrlParam("pid") || getUrlParam("participant") || ""
  );
  const [condition, setCondition] = useState(() => getUrlParam("cond") || "");
  const [randomize, setRandomize] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [toast, setToast] = useState(null);

  // Which post shows the intervention
  const initialLabelParam = getUrlParam("label");
  const [interventionPostId, setInterventionPostId] = useState(() => {
    if (!initialLabelParam) return null;
    const val = String(initialLabelParam).toLowerCase();
    if (val === "none" || val === "false" || val === "0") return null;
    return val; // p1/p2/p3
  });

  // Type: none | label | note (URL ?itype=label|note)
  const itypeParam = (getUrlParam("itype") || "").toLowerCase();
  const [interventionType, setInterventionType] = useState(
    itypeParam === "note" ? "note" : itypeParam === "label" ? "label" : "none"
  );

  // Composer (top input) on/off. URL: ?composer=0|1 or false|true
  const composerParam = (getUrlParam("composer") || "1").toLowerCase();
  const [showComposer, setShowComposer] = useState(
    !["0", "false", "off", "no"].includes(composerParam)
  );

  // Badge target: "none" | "all" | a specific post id (p1/p2/p3)
  // URL: ?badge=none|all|p1|p2|p3
  const badgeParam = (getUrlParam("badge") || "none").toLowerCase();
  const [badgeTarget, setBadgeTarget] = useState(
    ["all", ...INITIAL_POSTS.map(p => p.id)].includes(badgeParam) ? badgeParam : "none"
  );

  // Note text (URL ?inote=...)
  const defaultNote =
    getUrlParam("inote")
      ? decodeURIComponent(getUrlParam("inote"))
      : "There is no evidence that U.S. Immigration and Customs Enforcement (ICE) offers $750 for reporting people in the U.S. without authorization. The ICE tip form is meant for reporting crimes or suspicious activity, not for immigration enforcement rewards.";
  const [noteText, setNoteText] = useState(defaultNote);

  // Posts (clone + optional randomize)
  const posts = useMemo(() => {
    const arr = INITIAL_POSTS.map((p) => ({ ...p }));
    if (randomize) arr.sort(() => Math.random() - 0.5);
    return arr;
  }, [randomize]);

  // Event log
  const [events, setEvents] = useState([]);

  // Dwell tracking data and element mapping
  const dwell = useRef(new Map()); // postId -> { visible, tStart, total }
  const viewRefs = useRef(new Map());
  const elToId = useRef(new WeakMap());
  const registerViewRef = (postId) => (el) => {
    if (el) {
      viewRefs.current.set(postId, el);
      elToId.current.set(el, postId);
    }
  };

  // Toast helper
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  };

  const log = (action, meta = {}) => {
    const ts = now();
    const rec = {
      session_id: sessionIdRef.current,
      participant_id: participantId || null,
      condition: condition || null,
      timestamp_iso: fmtTime(ts),
      elapsed_ms: ts - t0Ref.current,
      action,
      ...meta,
    };
    setEvents((prev) => [...prev, rec]);
    if (action === "share") showToast("Post shared (recorded)");
  };

  // Session start/end logging
  useEffect(() => {
    log("session_start", { user_agent: navigator.userAgent });
    const onEnd = () => log("session_end", { total_events: events.length });
    window.addEventListener("beforeunload", onEnd);
    return () => window.removeEventListener("beforeunload", onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll tracking
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dir = y > lastY ? "down" : y < lastY ? "up" : "none";
      lastY = y;
      log("scroll", { y, direction: dir });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver for dwell time
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const postId = elToId.current.get(e.target);
          if (!postId) continue;
          const prev = dwell.current.get(postId) || {
            visible: false,
            tStart: 0,
            total: 0,
          };
          if (e.isIntersecting && e.intersectionRatio > 0) {
            if (!prev.visible) {
              const next = { ...prev, visible: true, tStart: now() };
              dwell.current.set(postId, next);
              log("view_start", { post_id: postId, ratio: e.intersectionRatio });
            }
          } else if (prev.visible) {
            const dur = clamp(now() - prev.tStart, 0, 1000 * 60 * 60);
            const next = { visible: false, tStart: 0, total: prev.total + dur };
            dwell.current.set(postId, next);
            log("view_end", {
              post_id: postId,
              duration_ms: dur,
              total_ms: next.total,
            });
          }
        }
      },
      { root: null, rootMargin: "0px", threshold: [0, 0.2, 0.5, 0.8, 1] }
    );

    for (const [, el] of viewRefs.current) io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  // Exporters
  const CSV_HEADER = [
    "session_id",
    "participant_id",
    "condition",
    "timestamp_iso",
    "elapsed_ms",
    "action",
    "post_id",
    "text",
    "length",
    "alt",
    "label",
    "href",
    "y",
    "direction",
    "ratio",
    "duration_ms",
    "total_ms",
    "user_agent",
    "total_events",
  ];

  const downloadCSV = () => {
    const csv = toCSV(events, CSV_HEADER);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fakebook_log_${sessionIdRef.current}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyJSON = async () => {
    const text = JSON.stringify(events, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      showToast("JSON copied to clipboard");
    } catch {
      showToast("Copy failed");
    }
  };

  const endAndLock = () => {
    setDisabled(true);
    log("session_locked", { reason: "end_clicked" });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Top nav */}
      <div className="nav">
        <div className="nav-inner">
          <IconLogo />
          <div className="brand">Fakebook</div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: ".4rem",
              flexWrap: "wrap",
            }}
          >
            <input
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              className="input"
              placeholder="Participant ID"
            />
            <input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="input"
              placeholder="Condition"
            />

            {/* Choose which post gets the intervention */}
            <label style={{ fontSize: ".85rem", color: "#6b7280" }}>
              Intervention:
              <select
                className="select"
                value={interventionPostId || "none"}
                onChange={(e) =>
                  setInterventionPostId(
                    e.target.value === "none" ? null : e.target.value
                  )
                }
              >
                <option value="none">None</option>
                {INITIAL_POSTS.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.id} — {p.author}
                  </option>
                ))}
              </select>
            </label>
            
            {/* Verification Badge */}
            <label style={{ fontSize: ".85rem", color: "#6b7280" }}>
            Badge:
            <select
              className="select"
              value={badgeTarget}
              onChange={(e) => setBadgeTarget(e.target.value)}
            >
              <option value="none">None</option>
              <option value="all">All</option>
              {INITIAL_POSTS.map(p => (
                <option key={p.id} value={p.id}>{p.id} — {p.author}</option>
              ))}
            </select>
          </label>

            {/* Profile */}
            <label style={{ fontSize: ".85rem", color: "#6b7280", display: "inline-flex", alignItems: "center", gap: ".35rem" }}>
            Composer:
            <input
              type="checkbox"
              checked={showComposer}
              onChange={(e) => setShowComposer(e.target.checked)}
              />
            </label>
            
            {/* Intervention type */}
            <label style={{ fontSize: ".85rem", color: "#6b7280" }}>
              Type:
              <select
                className="select"
                value={interventionType}
                onChange={(e) => setInterventionType(e.target.value)}
              >
                <option value="none">None</option>
                <option value="label">False info label</option>
                <option value="note">Context note</option>
              </select>
            </label>

            {/* Custom note text input */}
            {interventionType === "note" && (
              <input
                className="input"
                style={{ minWidth: 320 }}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Context note text…"
              />
            )}

            <button
              className={`btn toggle ${randomize ? "active" : ""}`}
              onClick={() => setRandomize((v) => !v)}
              disabled={disabled}
              title="Randomize feed order"
            >
              {randomize ? "Randomized" : "Randomize"}
            </button>
            <button
              className="btn"
              onClick={() => {
                setEvents([]);
                dwell.current = new Map();
                log("log_reset");
              }}
            >
              Reset Log
            </button>
            <button className="btn" onClick={downloadCSV}>
              Download CSV
            </button>
            <button className="btn" onClick={copyJSON}>
              Copy JSON
            </button>
            <button className="btn primary" onClick={endAndLock}>
              End & Lock
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <main className="container">
      {showComposer && (
        <div className="composer">
          <div className="composer-row">
            <div className="avatar">
              <img className="avatar-img" alt="" src="https://i.pravatar.cc/64?img=5" />
            </div>
            <button
              className="composer-btn"
              onClick={() => log("composer_focus")}
              disabled={disabled}
            >
              What’s on your mind?
            </button>
          </div>
          <div className="composer-actions">
            <div className="composer-chip" onClick={() => log("composer_add_photo")}>
              Photo
            </div>
            <div className="composer-chip" onClick={() => log("composer_add_event")}>
              Event
            </div>
            <div className="composer-chip" onClick={() => log("composer_add_feeling")}>
              Feeling
            </div>
          </div>
        </div>
      )}

        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onAction={log}
            disabled={disabled}
            registerViewRef={registerViewRef}
            showInterventionLabel={interventionPostId === p.id && interventionType === "label"}
            showInterventionNote={interventionPostId === p.id && interventionType === "note"}
            noteText={noteText}
            showBadge={badgeTarget === "all" || badgeTarget === p.id}
          />
        ))}

        <div className="end">End of Feed</div>
      </main>

      {toast && <div className="toast">{toast}</div>}

      {/* Dev panel */}
      <div className="dev">
        <div>Events: {events.length}</div>
        <div>Session: {sessionIdRef.current.slice(0, 8)}…</div>
      </div>
    </div>
  );
}