import React, { useEffect, useMemo, useState } from "react";
import {
  listQuestionLibraryFromBackend,
  saveQuestionLibraryItemToBackend,
  deleteQuestionLibraryItemFromBackend,
} from "../utils";
import { Modal, Button, EmptyState, useToast, useConfirm, usePrompt, IconBookmark, IconPencil, IconTrash } from "./ui";

// Deliberately a small local copy, not an import from
// components-admin-surveys-editor.jsx's own QUESTION_TYPE_LABELS — that
// file renders this modal (SurveyEditor -> QuestionLibraryPickerModal), so
// importing the other way around would create a circular module
// dependency between the two files. This list is only used for a compact
// "what's in this item" summary here, not the full type picker.
const TYPE_LABELS = {
  text: "Text",
  textarea: "Long text",
  single_choice: "Single choice",
  multi_choice: "Multi choice",
  dropdown: "Dropdown",
  matrix_single: "Matrix",
  matrix_multi: "Matrix (multi)",
  bipolar: "Bipolar",
  slider: "Slider",
  info: "Info",
};

function summarizeQuestions(questions = []) {
  const counts = new Map();
  (Array.isArray(questions) ? questions : []).forEach((q) => {
    const label = TYPE_LABELS[q?.type] || q?.type || "Question";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, n]) => (n > 1 ? `${label} (${n})` : label))
    .join(", ");
}

function firstQuestionPreview(questions = []) {
  const first = (Array.isArray(questions) ? questions : [])[0];
  const text = String(first?.text || "").replace(/<[^>]*>/g, "").trim();
  return text || "";
}

/**
 * Shared modal for the survey editor's question library: browse/search
 * saved items, insert one (if `onInsert` is passed — the picker is used
 * both from an actual insert position and, implicitly, as "manage the
 * library" when opened just to rename/delete), rename, or delete.
 */
export function QuestionLibraryPickerModal({ onInsert, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await listQuestionLibraryFromBackend();
      setItems(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [item.name, item.description, summarizeQuestions(item.questions)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, filter]);

  const handleRename = async (item) => {
    const nextName = await prompt({
      title: "Rename library item",
      message: "Name shown when browsing the library.",
      defaultValue: item.name,
    });
    if (!nextName || nextName === item.name) return;

    setBusyId(item.id);
    try {
      const res = await saveQuestionLibraryItemToBackend({
        id: item.id,
        name: nextName,
        description: item.description,
        questions: item.questions,
      });
      if (!res.ok) {
        toast.error(res.err || "Failed to rename.");
        return;
      }
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, name: nextName } : x)));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item) => {
    const ok = await confirm({
      title: "Delete library item?",
      message: `"${item.name}" will no longer be available to insert into any survey. This doesn't affect surveys it's already been added to.`,
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;

    setBusyId(item.id);
    try {
      const res = await deleteQuestionLibraryItemFromBackend(item.id);
      if (!res.ok) {
        toast.error(res.err || "Failed to delete.");
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal title="Question library" subtitle="Reusable questions and measures saved from any survey." onClose={onClose} width={560}>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search by name, description, or question type…"
        autoFocus
        style={{
          width: "100%",
          boxSizing: "border-box",
          height: 34,
          padding: "0 10px",
          marginBottom: 14,
          border: "1px solid var(--admin-border)",
          borderRadius: 8,
          fontSize: 12.5,
        }}
      />

      {loading && <div style={{ fontSize: 12, color: "var(--admin-muted)", padding: "8px 4px" }}>Loading…</div>}

      {!loading && items.length === 0 && (
        <EmptyState
          icon={IconBookmark}
          title="No saved items yet"
          message="Use “Save to library” on any question, or on a page in Study overview, to add one here."
        />
      )}

      {!loading && items.length > 0 && filteredItems.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--admin-muted)", padding: "8px 4px" }}>No matches.</div>
      )}

      <div style={{ display: "grid", gap: 10, maxHeight: "50vh", overflowY: "auto" }}>
        {filteredItems.map((item) => {
          const busy = busyId === item.id;
          const preview = firstQuestionPreview(item.questions);
          return (
            <div
              key={item.id}
              style={{
                border: "1px solid var(--admin-border)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--admin-text)" }}>{item.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--admin-muted)", marginTop: 2 }}>
                    {summarizeQuestions(item.questions)}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 4 }}>{item.description}</div>
                  )}
                  {!item.description && preview && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--admin-muted)",
                        marginTop: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {preview}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <IconOnlyButtonLocal title="Rename" onClick={() => handleRename(item)} disabled={busy}>
                    <IconPencil size={14} />
                  </IconOnlyButtonLocal>
                  <IconOnlyButtonLocal title="Delete" danger onClick={() => handleDelete(item)} disabled={busy}>
                    <IconTrash size={14} />
                  </IconOnlyButtonLocal>
                </div>
              </div>

              {onInsert && (
                <Button
                  size="sm"
                  variant="primary"
                  busy={busy}
                  onClick={() => {
                    onInsert(item.questions);
                    onClose();
                  }}
                >
                  Insert
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function IconOnlyButtonLocal({ title, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        border: "1px solid var(--admin-border)",
        background: "var(--admin-surface)",
        color: danger ? "var(--admin-danger-ink, #b91c1c)" : "var(--admin-text)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default QuestionLibraryPickerModal;
