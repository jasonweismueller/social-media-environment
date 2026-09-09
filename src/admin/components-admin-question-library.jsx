import React, { useEffect, useMemo, useState } from "react";
import {
  listQuestionLibraryFromBackend,
  saveQuestionLibraryItemToBackend,
  deleteQuestionLibraryItemFromBackend,
} from "../utils";
import { Modal, Button, Toggle, EmptyState, useToast, useConfirm, IconBookmark, IconPencil, IconTrash } from "./ui";

// Which fields a question's type actually has to edit — matches the same
// type-family split components-admin-surveys-editor.jsx's own
// ChoiceEditorBlock/MatrixEditorBlock/BipolarEditorBlock/SliderEditorBlock
// use, just not imported from there (this file is already imported BY that
// one for QuestionLibraryPickerModal, so importing back the other way would
// create a circular module dependency — same reasoning TYPE_LABELS' own
// comment above already gives for not sharing that constant either).
const TYPES_WITH_ROWS = ["matrix_single", "matrix_multi", "bipolar"];
const TYPES_WITH_CHOICES = ["single_choice", "multi_choice", "dropdown"];
const TYPES_WITH_RANGE = ["bipolar", "slider"];

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
 * library" when opened just to rename/delete), edit, or delete.
 */
export function QuestionLibraryPickerModal({ onInsert, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

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
                minWidth: 0,
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
                  <IconOnlyButtonLocal title="Edit" onClick={() => setEditingItem(item)} disabled={busy}>
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

      {editingItem && (
        <EditLibraryItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setEditingItem(null);
          }}
        />
      )}
    </Modal>
  );
}

// Full-content editor for a saved library item — name, description, and
// every question's own text plus its rows/choices (add/remove/reorder) and
// min/max where relevant. Previously the only way to change anything here
// beyond the name was delete-and-resave from a real survey question; this
// edits the item directly. Deliberately doesn't let a question's *type* be
// changed (a much bigger, riskier feature — the rows/choices editors below
// are shaped per-type already) and doesn't touch group/feed-visibility
// fields, since library items never carry those in the first place (see
// question_library_items.sql's own comment on why).
function EditLibraryItemModal({ item, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(item.name || "");
  const [description, setDescription] = useState(item.description || "");
  const [questions, setQuestions] = useState(() =>
    (Array.isArray(item.questions) ? item.questions : []).map((q) => ({
      ...q,
      rows: Array.isArray(q.rows) ? q.rows.map((r) => ({ ...r })) : [],
      choices: Array.isArray(q.choices) ? q.choices.map((c) => ({ ...c })) : [],
    }))
  );
  const [saving, setSaving] = useState(false);

  function updateQuestion(qIndex, patch) {
    setQuestions((prev) => prev.map((q, i) => (i === qIndex ? { ...q, ...patch } : q)));
  }

  function updateRow(qIndex, rowIndex, patch) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return { ...q, rows: (q.rows || []).map((r, ri) => (ri === rowIndex ? { ...r, ...patch } : r)) };
      })
    );
  }

  function addRow(qIndex) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const rows = [...(q.rows || [])];
        const n = rows.length + 1;
        rows.push({
          value: `${q.id || "row"}_${n}`,
          label: q.type === "bipolar" ? "" : `Row ${n}`,
          left_label: "",
          right_label: "",
          is_attention_check: false,
          attention_check_value: "",
        });
        return { ...q, rows };
      })
    );
  }

  function removeRow(qIndex, rowIndex) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, rows: (q.rows || []).filter((_, ri) => ri !== rowIndex) } : q))
    );
  }

  function moveRow(qIndex, rowIndex, dir) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const rows = [...(q.rows || [])];
        const target = rowIndex + dir;
        if (target < 0 || target >= rows.length) return q;
        [rows[rowIndex], rows[target]] = [rows[target], rows[rowIndex]];
        return { ...q, rows };
      })
    );
  }

  function updateChoice(qIndex, choiceIndex, patch) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return { ...q, choices: (q.choices || []).map((c, ci) => (ci === choiceIndex ? { ...c, ...patch } : c)) };
      })
    );
  }

  function addChoice(qIndex) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const choices = [...(q.choices || [])];
        choices.push({ value: `opt_${choices.length + 1}`, label: `Option ${choices.length + 1}`, is_other: false });
        return { ...q, choices };
      })
    );
  }

  function removeChoice(qIndex, choiceIndex) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, choices: (q.choices || []).filter((_, ci) => ci !== choiceIndex) } : q))
    );
  }

  function moveChoice(qIndex, choiceIndex, dir) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const choices = [...(q.choices || [])];
        const target = choiceIndex + dir;
        if (target < 0 || target >= choices.length) return q;
        [choices[choiceIndex], choices[target]] = [choices[target], choices[choiceIndex]];
        return { ...q, choices };
      })
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const finalName = name.trim() || item.name;
      const res = await saveQuestionLibraryItemToBackend({
        id: item.id,
        name: finalName,
        description,
        questions,
      });
      if (!res.ok) {
        toast.error(res.err || "Failed to save.");
        return;
      }
      toast.success("Saved.");
      onSaved({ ...item, name: finalName, description, questions });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    height: 32,
    padding: "0 8px",
    border: "1px solid var(--admin-border)",
    borderRadius: 6,
    fontSize: 12.5,
  };

  return (
    <Modal
      title="Edit library item"
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={saving} onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12, maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--admin-muted)" }}>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--admin-muted)" }}>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, height: "auto", padding: 8, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        {questions.map((q, qIndex) => {
          const hasRows = TYPES_WITH_ROWS.includes(q.type);
          const hasChoices = TYPES_WITH_CHOICES.includes(q.type);
          const hasRange = TYPES_WITH_RANGE.includes(q.type);
          const isBipolar = q.type === "bipolar";

          return (
            <div
              key={q.id || qIndex}
              style={{
                border: "1px solid var(--admin-border)",
                borderRadius: 8,
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--admin-muted)",
                }}
              >
                {TYPE_LABELS[q.type] || q.type}
                {questions.length > 1 ? ` — question ${qIndex + 1}` : ""}
              </div>

              <label style={{ display: "grid", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--admin-muted)" }}>
                Question text
                <textarea
                  value={q.text || ""}
                  onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
                  rows={2}
                  style={{ ...inputStyle, height: "auto", padding: 8, resize: "vertical", fontFamily: "inherit" }}
                />
              </label>

              {q.type !== "info" && q.type !== "post_reminder" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <Toggle checked={!!q.required} onChange={(v) => updateQuestion(qIndex, { required: v })} />
                  Required
                </label>
              )}

              {hasRange && (
                <div style={{ display: "flex", gap: 10 }}>
                  <label style={{ display: "grid", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--admin-muted)" }}>
                    Min
                    <input
                      type="number"
                      value={Number.isFinite(q.min) ? q.min : 1}
                      onChange={(e) => updateQuestion(qIndex, { min: Number(e.target.value) })}
                      style={{ ...inputStyle, width: 80 }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--admin-muted)" }}>
                    Max
                    <input
                      type="number"
                      value={Number.isFinite(q.max) ? q.max : 7}
                      onChange={(e) => updateQuestion(qIndex, { max: Number(e.target.value) })}
                      style={{ ...inputStyle, width: 80 }}
                    />
                  </label>
                </div>
              )}

              {hasRows && (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--admin-muted)" }}>
                    {isBipolar ? "Item pairs" : "Rows"}
                  </div>
                  {(q.rows || []).map((row, rowIndex) => (
                    <div key={rowIndex} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {isBipolar ? (
                        <>
                          <input
                            type="text"
                            placeholder="Left label"
                            value={row.left_label ?? row.label ?? ""}
                            onChange={(e) =>
                              updateRow(qIndex, rowIndex, { left_label: e.target.value, label: e.target.value })
                            }
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          <input
                            type="text"
                            placeholder="Right label"
                            value={row.right_label ?? ""}
                            onChange={(e) => updateRow(qIndex, rowIndex, { right_label: e.target.value })}
                            style={{ ...inputStyle, flex: 1 }}
                          />
                        </>
                      ) : (
                        <input
                          type="text"
                          placeholder="Row label"
                          value={row.label ?? ""}
                          onChange={(e) => updateRow(qIndex, rowIndex, { label: e.target.value })}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      )}
                      <IconOnlyButtonLocal title="Move up" onClick={() => moveRow(qIndex, rowIndex, -1)} disabled={rowIndex === 0}>
                        ↑
                      </IconOnlyButtonLocal>
                      <IconOnlyButtonLocal
                        title="Move down"
                        onClick={() => moveRow(qIndex, rowIndex, 1)}
                        disabled={rowIndex === (q.rows || []).length - 1}
                      >
                        ↓
                      </IconOnlyButtonLocal>
                      <IconOnlyButtonLocal title="Remove" danger onClick={() => removeRow(qIndex, rowIndex)}>
                        <IconTrash size={12} />
                      </IconOnlyButtonLocal>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => addRow(qIndex)}>
                    + Add {isBipolar ? "pair" : "row"}
                  </Button>
                </div>
              )}

              {hasChoices && (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--admin-muted)" }}>Choices</div>
                  {(q.choices || []).map((choice, choiceIndex) => (
                    <div key={choiceIndex} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="text"
                        placeholder="Choice label"
                        value={choice.label ?? ""}
                        onChange={(e) => updateChoice(qIndex, choiceIndex, { label: e.target.value })}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <IconOnlyButtonLocal
                        title="Move up"
                        onClick={() => moveChoice(qIndex, choiceIndex, -1)}
                        disabled={choiceIndex === 0}
                      >
                        ↑
                      </IconOnlyButtonLocal>
                      <IconOnlyButtonLocal
                        title="Move down"
                        onClick={() => moveChoice(qIndex, choiceIndex, 1)}
                        disabled={choiceIndex === (q.choices || []).length - 1}
                      >
                        ↓
                      </IconOnlyButtonLocal>
                      <IconOnlyButtonLocal title="Remove" danger onClick={() => removeChoice(qIndex, choiceIndex)}>
                        <IconTrash size={12} />
                      </IconOnlyButtonLocal>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => addChoice(qIndex)}>
                    + Add choice
                  </Button>
                </div>
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
