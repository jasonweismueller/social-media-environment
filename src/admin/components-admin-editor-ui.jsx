// components-admin-editor-ui.jsx
//
// Shared presentational primitives for the post editors (Facebook/Instagram/
// Amazon `AdminPostEditor` + their `MediaFieldset`s). Pure UI, no data model
// logic — safe to share across the three near-duplicate editor files without
// running into the "reconciliation logic duplicated in four places" footgun
// described in CLAUDE.md (that's about survey page-block data shape, not
// form chrome).
//
// Renders inside `.admin-shell` (the post-editor modal is mounted as a
// sibling of `AdminShell` inside AdminDashboard's outer `.admin-shell` div),
// so the `--admin-*` tokens from src/admin/ui/tokens.css are available here.
import React, { useState } from "react";
import { Toggle } from "./ui";

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/* Collapsible card section. Reuses the existing (previously-unused)
   .section-collapse / .section-collapse-inner / .section-chev CSS already
   defined in all three stylesheets for the animated open/close. */
export function EditorSection({ title, subtitle, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className="card" style={{ margin: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          borderBottom: open ? "1px solid var(--line)" : "1px solid transparent",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--admin-text)" }}>{title}</span>
            {badge && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--admin-accent)",
                  background: "var(--admin-accent-soft)",
                  border: "1px solid var(--admin-accent-border)",
                  borderRadius: 999,
                  padding: "1px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {badge}
              </span>
            )}
          </span>
          {subtitle && <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>{subtitle}</span>}
        </span>
        <span className="section-chev" aria-expanded={open} style={{ color: "var(--admin-muted)", flex: "0 0 auto" }}>
          <ChevronIcon />
        </span>
      </button>

      <div className={`section-collapse${open ? "" : " is-collapsed"}`}>
        <div className="section-collapse-inner" style={{ padding: 14, display: "grid", gap: 12 }}>
          {children}
        </div>
      </div>
    </section>
  );
}

/* Label + control, stacked. Flex-column's default `align-items: stretch`
   makes the input/select/textarea child fill the width automatically. */
export function Field({ label, hint, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--admin-text)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "var(--admin-muted)", lineHeight: 1.4 }}>{hint}</span>}
    </label>
  );
}

/* Same look as Field, but a <div> instead of <label> — for groups that wrap
   more than one focusable control (radios, checkboxes, pills), where an
   implicit label→control association would be ambiguous/invalid. */
export function Group({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--admin-text)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "var(--admin-muted)", lineHeight: 1.4 }}>{hint}</span>}
    </div>
  );
}

export function RadioGroup({ name, value, options, onChange }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {options.map((opt) => (
        <label
          key={opt.value}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span style={{ textTransform: "capitalize" }}>{opt.label ?? opt.value}</span>
        </label>
      ))}
    </div>
  );
}

export function CheckRow({ checked, onChange, children }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

/* Sticky live-preview column. Keeps using .editor-preview (sticky + width
   from the existing .editor-grid) and .preview-zoom (scale transform) so no
   CSS files need to change — only what renders inside them. */
export function PreviewPane({ label = "Live preview", platformLabel, zoom, children }) {
  return (
    <aside className="editor-preview">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 2px" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
          {label}
        </span>
        {platformLabel && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--admin-accent)",
              background: "var(--admin-accent-soft)",
              border: "1px solid var(--admin-accent-border)",
              borderRadius: 999,
              padding: "2px 9px",
            }}
          >
            {platformLabel}
          </span>
        )}
      </div>
      <div
        style={{
          borderRadius: 14,
          border: "1px solid var(--admin-border-subtle)",
          background: "var(--admin-surface-alt)",
          padding: 18,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          className="preview-zoom"
          style={{ pointerEvents: "auto", ...(zoom ? { transform: `scale(${zoom})`, transformOrigin: "top center" } : null) }}
        >
          {children}
        </div>
      </div>
    </aside>
  );
}

export { Toggle };
