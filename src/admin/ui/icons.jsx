import React from "react";

// Small stroke-based icon set for admin chrome (nav, empty states, platform
// picker, icon buttons) — replaces ad-hoc emoji, which render inconsistently
// across OS/browser and read as less deliberate than the rest of the design
// system. Same visual language as the existing feed-facing icons (e.g.
// RepostIcon in ui-posts-instagram.jsx): 24x24 viewBox, stroke="currentColor",
// strokeWidth 1.8, round caps/joins, no fill.
function Base({ children, size = 18, style, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      // SVGs default to `display: inline` with baseline alignment, which
      // (unlike a text glyph) reserves extra space below the shape for a
      // font-style descender it doesn't have — inside a flex row with
      // align-items:center, that phantom space is enough to visibly shift
      // the icon relative to adjacent text. `display: block` removes it.
      style={{ display: "block", flexShrink: 0, ...style }}
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconFolder(props) {
  return (
    <Base {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </Base>
  );
}

export function IconFeed(props) {
  return (
    <Base {...props}>
      <path d="M4 4h2a14 14 0 0 1 14 14v2" />
      <path d="M4 10a10 10 0 0 1 10 10" />
      <circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconClipboard(props) {
  return (
    <Base {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h6" />
    </Base>
  );
}

export function IconUser(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Base>
  );
}

export function IconInbox(props) {
  return (
    <Base {...props}>
      <path d="M3 12h5l1.5 3h5L16 12h5" />
      <path d="M5.5 6h13L21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6L5.5 6Z" />
    </Base>
  );
}

export function IconNote(props) {
  return (
    <Base {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Base>
  );
}

export function IconWarning(props) {
  return (
    <Base {...props}>
      <path d="M12 3.5 22 20H2L12 3.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconPencil(props) {
  return (
    <Base {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17l-1 3Z" />
      <path d="M14 6.5 17.5 10" />
    </Base>
  );
}

export function IconTrash(props) {
  return (
    <Base {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Base>
  );
}

export function IconPlus(props) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function IconFacebook(props) {
  return (
    <Base {...props}>
      <path d="M15 8.5h2V5h-2a4 4 0 0 0-4 4v2H9v3.5h2V21h3.5v-6.5H17l.5-3.5h-3V9a.5.5 0 0 1 .5-.5Z" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconInstagram(props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconCart(props) {
  return (
    <Base {...props}>
      <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" />
      <circle cx="9.5" cy="20.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20.5" r="1.2" fill="currentColor" stroke="none" />
    </Base>
  );
}
