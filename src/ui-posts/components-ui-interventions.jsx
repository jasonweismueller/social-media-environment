// components-ui-interventions.jsx
import React from "react";
import { IconInfo, IconUsers } from "../ui-core";

/* ------------------- Helpers: Note rich text ------------------- */
export function NoteRichText({ text }) {
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
            onClick={(e) => e.preventDefault()} // keep non-navigating for study
            style={{ color: "#1877F2", textDecoration: "underline" }}
            rel="noreferrer"
            target="_blank"
          >
            {p.value}
          </a>
        );
      })}
    </span>
  );
}

/* ------------------- Popover: readers context ------------------- */
export function ReadersContextPopover({
  enabled,
  groups,            // [{type,size}, {type,size}]
  typeValue,         // legacy fallback
  sizeValue,         // legacy fallback
  onAction,
  postId
}) {
  const [open, setOpen] = React.useState(false);

  const rawGroups = Array.isArray(groups) ? groups : [];
  const normalized = rawGroups
    .map(g => ({
      type: String(g?.type || "").trim(),
      size: String(g?.size || "").trim(),
    }))
    .filter(g => g.type || g.size)
    .slice(0, 2);

  if (normalized.length === 0 && (typeValue || sizeValue)) {
    normalized.push({
      type: String(typeValue || "").trim(),
      size: String(sizeValue || "").trim(),
    });
  }

  const showMeta = !!enabled && normalized.length > 0;
  const nice = (s) => String(s || "").trim();

  const renderGroup = (g, key) => {
    const size = nice(g.size) || "an unspecified number of";
    const type = (nice(g.type) || "readers").toLowerCase();
    return (
      <span key={key} style={{ fontWeight: 700 }}>
        {size} {type}
      </span>
    );
  };

  const ratedByLine = (() => {
    if (!showMeta) return null;
    if (normalized.length === 1) {
      return <>The context was rated as helpful by {renderGroup(normalized[0], 0)}.</>;
    }
    return (
      <>
        The context was rated as helpful by {renderGroup(normalized[0], 0)} and {renderGroup(normalized[1], 1)}.
      </>
    );
  })();

  if (!showMeta) return <div className="note-title">Readers added context</div>;

  const help =
    "Context notes are contributed by readers to add helpful information when a post may be misleading. " +
    "This panel shows which groups contributed and the approximate number of contributors in each group.";

  return (
    <div
      className="note-title-wrap"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="note-title-btn"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          color: "inherit",
          textAlign: "left",
          display: "inline-flex",
          alignItems: "center",
          lineHeight: 1.1,
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
          onAction?.("note_meta_toggle", { post_id: postId, open: !open });
        }}
        title="More info"
      >
        <span style={{ fontWeight: 700 }}>Readers added context</span>
      </button>

      <div
        style={{
          marginTop: 2,
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.25,
          // start subline under the icon
          marginLeft: "calc(-1 * var(--noteIconOffset, 0px))",
        }}
      >
        {ratedByLine}
      </div>

      {open && (
        <div
          className="note-popover"
          role="dialog"
          aria-label="Readers context details"
          style={{
            position: "absolute",
            top: "130%",
            left: 0,
            width: 340,
            maxWidth: "80vw",
            background: "#fff",
            color: "#111827",
            border: "1px solid rgba(17,24,39,.12)",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,.18)",
            padding: 12,
            zIndex: 9999,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "rgba(59,130,246,.12)",
                display: "grid",
                placeItems: "center",
              }}
              aria-hidden="true"
            >
              <IconUsers />
            </div>
            <div style={{ fontWeight: 800, lineHeight: 1.1 }}>
              About this context note
              <div style={{ fontWeight: 600, fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                Contributor details
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {normalized.map((g, idx) => {
              const typeText = g.type || "Not specified";
              const sizeText = g.size || "Not specified";
              return (
                <div
                  key={idx}
                  style={{
                    border: "1px solid rgba(17,24,39,.10)",
                    borderRadius: 10,
                    padding: 10,
                    background: "rgba(17,24,39,.02)",
                  }}
                >
                  {normalized.length > 1 && (
                    <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, marginBottom: 6 }}>
                      Group {idx + 1}
                    </div>
                  )}

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Type</div>
                      <div style={{ fontWeight: 700 }}>{typeText}</div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Size</div>
                      <div style={{ fontWeight: 700 }}>{sizeText}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ height: 1, background: "rgba(17,24,39,.10)", margin: "10px 0" }} />
          <div style={{ fontSize: 12, lineHeight: 1.35, opacity: 0.9 }}>{help}</div>
        </div>
      )}
    </div>
  );
}

/* ------------------- Wrapper: renders label OR note ------------------- */
export function InterventionBlock({ post, onAction, IconUsersFromCaller }) {
  // allow caller to pass IconUsers to avoid mismatch; fallback to ui-core IconUsers
  const UsersIcon = IconUsersFromCaller || IconUsers;

  if (!post?.interventionType) return null;

  const enabled = !!post.noteMetaEnabled;

  const groupsRaw = Array.isArray(post.noteReaderGroups) ? post.noteReaderGroups : [];
  const groups = groupsRaw
    .map(g => ({ type: (g?.type || "").trim(), size: (g?.size || "").trim() }))
    .filter(g => g.type || g.size)
    .slice(0, 2);

  if (post.interventionType === "label") {
    return (
      <div className="info-bar info-clean">
        <div className="info-head">
          <div className="info-icon"><IconInfo /></div>

          <ReadersContextPopover
            enabled={enabled && groups.length > 0}
            groups={groups}
            onAction={onAction}
            postId={post.id}
          />
        </div>

        <div className="info-sub">
          This is information that third-party fact-checkers say is false.
        </div>

        <div className="info-row">
          <div>Want to see why?</div>
          <button className="btn" onClick={() => onAction("intervention_learn_more", { post_id: post.id })}>
            Learn more
          </button>
        </div>
      </div>
    );
  }

  if (post.interventionType === "note") {
    return (
      <div className="note-bar">
        <div
          className="note-head"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 5,
            ["--noteIconW"]: "16px",
            ["--noteIconGap"]: "5px",
            ["--noteIconOffset"]: "calc(var(--noteIconW) + var(--noteIconGap))",
          }}
        >
          <div
            className="note-icon"
            style={{
              width: "var(--noteIconW)",
              height: "var(--noteIconW)",
              flexShrink: 0,
              marginTop: 1.3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UsersIcon style={{ width: "var(--noteIconW)", height: "var(--noteIconW)", display: "block" }} />
          </div>

          <ReadersContextPopover
            enabled={enabled && groups.length > 0}
            groups={groups}
            onAction={onAction}
            postId={post.id}
          />
        </div>

        <div className="note-sub">
          <NoteRichText text={post.noteText || ""} />
        </div>

        <div
          aria-hidden="true"
          style={{
            height: 1,
            background: "var(--line, rgba(17,24,39,.08))",
            marginTop: 12,
            marginBottom: 8,
            marginLeft: -16,   // set to your .note-bar horizontal padding
            marginRight: -16,  // set to your .note-bar horizontal padding
          }}
        />

        <div
          className="note-row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>Do you find this helpful?</div>
          <button className="btn" onClick={() => onAction("note_rate_open", { post_id: post.id })}>
            Rate it
          </button>
        </div>
      </div>
    );
  }

  return null;
}