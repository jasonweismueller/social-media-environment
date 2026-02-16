// components-ui-interventions.jsx
import React from "react";
import { IconInfo, IconUsers } from "../ui-core"; // adjust path if needed

// --- NOTE: render URLs as real links that DO NOT trigger modal open ---
function NoteRichText({ text, onLinkClick }) {
  const raw = String(text || "");
  const URL_RE = /(\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+)/gi;

  const out = [];
  let last = 0;
  let m;

  while ((m = URL_RE.exec(raw)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) out.push({ kind: "text", value: raw.slice(last, start) });
    out.push({ kind: "url", value: m[0] });
    last = end;
  }
  if (last < raw.length) out.push({ kind: "text", value: raw.slice(last) });

  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {out.map((p, i) => {
        if (p.kind === "text") return <React.Fragment key={i}>{p.value}</React.Fragment>;

        const href = p.value.startsWith("http") ? p.value : `https://${p.value}`;
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#1877F2", textDecoration: "underline" }}
            onClick={(e) => {
              // ✅ open URL in new tab, but do NOT open the modal
              e.stopPropagation();
              onLinkClick?.(href);
              // allow default browser open-new-tab behavior
            }}
          >
            {p.value}
          </a>
        );
      })}
    </span>
  );
}

// --- Simple modal (no dependency on your existing Modal component) ---
function NoteModal({ open, onClose, children, title = "Note" }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50000,
        background: "rgba(0,0,0,.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: 760,
          maxWidth: "92vw",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid rgba(17,24,39,.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 0,
              background: "transparent",
              fontSize: 22,
              cursor: "pointer",
              lineHeight: 1,
              padding: 6,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

// --- The “X-like” note details block inside the modal ---
function NoteDetailsCard({ post, view, onAction, onClose }) {
  const hasImage = !!(view?.image?.url || view?.image?.svg);
  const author = view?.author || post.author || "User";
  const avatarUrl = view?.avatarUrl || post.avatarUrl || null;
  const timeLabel = view?.timeLabel || "";

  // You can wire these to your own post fields:
  const ratedHelpfulLabel = "Currently rated helpful"; // or compute from post.noteMeta...
  const shownOnLabel = "Shown on X";
  const badges = [
    "Provides important context",
    "Easy to understand",
    // you can conditionally add more
  ];

  return (
    <div
      style={{
        border: "1px solid rgba(17,24,39,.12)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Top: pseudo “post” header like X */}
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {/* avatar */}
          <div style={{ width: 44, height: 44, borderRadius: 999, overflow: "hidden", background: "#e5e7eb", flexShrink: 0 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : null}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>{author}</div>
              {post.badge ? (
                <span
                  aria-label="Verified"
                  title="Verified"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: "#1D9BF0",
                    display: "inline-grid",
                    placeItems: "center",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  ✓
                </span>
              ) : null}
              {timeLabel ? <div style={{ color: "#6b7280" }}>· {timeLabel}</div> : null}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* Small image (top-left) */}
              {hasImage ? (
                <div
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: 16,
                    overflow: "hidden",
                    background: "#e5e7eb",
                    flexShrink: 0,
                  }}
                >
                  {view?.image?.url ? (
                    <img src={view.image.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div
                      dangerouslySetInnerHTML={{ __html: String(view?.image?.svg || "") }}
                      style={{ width: "100%", height: "100%" }}
                    />
                  )}
                </div>
              ) : null}

              {/* Post text */}
              <div style={{ fontSize: 18, lineHeight: 1.35, color: "#111827", whiteSpace: "pre-wrap" }}>
                {post.text || ""}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(17,24,39,.10)" }} />

      {/* Note meta rows (like the screenshot) */}
      <div style={{ padding: 14, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
          <span style={{ width: 20, height: 20, borderRadius: 999, background: "#10b981", display: "inline-grid", placeItems: "center", color: "#fff", fontWeight: 900 }}>
            ✓
          </span>
          <span style={{ fontWeight: 800 }}>{ratedHelpfulLabel}</span>
          <span style={{ color: "#6b7280" }}>·</span>
          <button
            type="button"
            style={{ border: 0, background: "transparent", color: "#6b7280", textDecoration: "underline", cursor: "pointer" }}
            onClick={() => onAction?.("note_view_details", { post_id: post.id })}
          >
            View details
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#6b7280", fontSize: 16 }}>
          <span style={{ width: 20, textAlign: "center" }}>👁</span>
          <span>{shownOnLabel}</span>
        </div>

        {badges.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", color: "#6b7280", fontSize: 16 }}>
            <span style={{ width: 20, textAlign: "center" }}>💬</span>
            <span>{b}</span>
          </div>
        ))}
      </div>

      {/* Note body */}
      <div style={{ padding: 14, fontSize: 20, lineHeight: 1.4 }}>
        <NoteRichText
          text={post.noteText || ""}
          onLinkClick={(href) => onAction?.("note_link_open", { post_id: post.id, href })}
        />
      </div>

      <div style={{ height: 1, background: "rgba(17,24,39,.10)" }} />

      {/* Rating row */}
      <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Is this note helpful?</div>

        <div style={{ display: "flex", gap: 10 }}>
          {["Yes", "Somewhat", "No"].map((label) => (
            <button
              key={label}
              type="button"
              className="btn"
              onClick={() => {
                onAction?.("note_helpful_rate", { post_id: post.id, value: label.toLowerCase() });
                onClose?.();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteIntervention({ post, view, onAction }) {
  const [open, setOpen] = React.useState(false);

  const openModal = (source) => {
    onAction?.("note_modal_open", { post_id: post.id, source });
    setOpen(true);
  };

  return (
    <>
      {/* ✅ Gray background note surface (X-like) */}
      <div
        className="note-bar"
        style={{
          marginTop: 0,
          padding: 12,
          background: "#f3f4f6",
          borderTop: "1px solid rgba(17,24,39,.08)",
        }}
      >
        {/* clicking anywhere on note surface opens modal */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => openModal("note_surface")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openModal("note_surface");
            }
          }}
          style={{ cursor: "pointer" }}
        >
          {/* header */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                marginTop: 2,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
              }}
            >
              <IconUsers style={{ width: 16, height: 16, display: "block" }} />
            </div>

            <div style={{ display: "grid", gap: 2 }}>
              <div style={{ fontWeight: 800, lineHeight: 1.1 }}>Readers added context</div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.25 }}>
                {/* keep your “rated as helpful by …” sentence here if you want */}
                The context was rated as helpful.
              </div>
            </div>
          </div>

          {/* note text */}
          <div style={{ marginTop: 10, fontSize: 14, color: "#111827" }}>
            <NoteRichText
              text={post.noteText || ""}
              onLinkClick={(href) => onAction?.("note_link_open", { post_id: post.id, href })}
            />
          </div>
        </div>

        {/* divider inside gray box */}
        <div
          aria-hidden="true"
          style={{
            height: 1,
            background: "rgba(17,24,39,.10)",
            marginTop: 12,
            marginBottom: 10,
          }}
        />

        {/* rating row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 14, color: "#374151" }}>Do you find this helpful?</div>
          <button type="button" className="btn" onClick={() => openModal("rate_it_button")}>
            Rate it
          </button>
        </div>
      </div>

      <NoteModal open={open} onClose={() => setOpen(false)} title="Note">
        <NoteDetailsCard
          post={post}
          view={view}
          onAction={onAction}
          onClose={() => setOpen(false)}
        />
      </NoteModal>
    </>
  );
}

function LabelIntervention({ post, onAction }) {
  return (
    <div className="info-bar info-clean">
      <div className="info-head">
        <div className="info-icon"><IconInfo /></div>
        <div className="info-title-wrap">
          <div className="info-title" style={{ fontWeight: 800 }}>Independent fact-checkers</div>
          <div className="info-sub" style={{ marginTop: 2 }}>
            This is information that third-party fact-checkers say is false.
          </div>
        </div>
      </div>

      <div className="info-row">
        <div>Want to see why?</div>
        <button className="btn" onClick={() => onAction?.("intervention_learn_more", { post_id: post.id })}>
          Learn more
        </button>
      </div>
    </div>
  );
}

export function InterventionBlock({ post, onAction, view }) {
  if (!post?.interventionType) return null;

  if (post.interventionType === "note") {
    return <NoteIntervention post={post} view={view} onAction={onAction} />;
  }

  if (post.interventionType === "label") {
    return <LabelIntervention post={post} onAction={onAction} />;
  }

  return null;
}