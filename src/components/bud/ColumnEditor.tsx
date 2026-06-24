import {
  IconAlignLeft,
  IconBoltFilled,
  IconBraces,
  IconCalendar,
  IconCheck,
  IconCheckbox,
  IconChevronDown,
  IconHash,
  IconLetterCase,
} from "@tabler/icons-react";
import { useState } from "react";
import { confirmDialog } from "../../state/dialog";
import type { ColumnInfo } from "../../ipc/types";
import { useStore } from "../../state/store";

const FIELD_TYPES = [
  { label: "Single line text", Icon: IconLetterCase },
  { label: "Long form text", Icon: IconAlignLeft },
  { label: "Number", Icon: IconHash },
  { label: "Date & time", Icon: IconCalendar },
  { label: "Boolean", Icon: IconCheckbox },
  { label: "JSON", Icon: IconBraces },
] as const;

function guessType(t: string): string {
  const u = t.toUpperCase();
  if (/BOOL/.test(u)) return "Boolean";
  if (/INT|SERIAL|NUM|DEC|REAL|FLOAT|DOUBLE/.test(u)) return "Number";
  if (/JSON/.test(u)) return "JSON";
  if (/DATE|TIME/.test(u)) return "Date & time";
  if (/TEXT|CLOB|LONG/.test(u)) return "Long form text";
  if (/CHAR|STRING/.test(u)) return "Single line text";
  return "Single line text";
}

export interface ColumnEditorAnchor {
  column: ColumnInfo;
  x: number;
  y: number;
}

// Column editor. Save renames the column (ALTER TABLE … RENAME COLUMN) and
// Delete drops it (ALTER TABLE … DROP COLUMN). The formatting toggles mirror
// Budibase's panel and are presentational.
export function ColumnEditor({
  anchor,
  table,
  onClose,
}: {
  anchor: ColumnEditorAnchor;
  table: string;
  onClose: () => void;
}) {
  const { column } = anchor;
  const renameColumn = useStore((s) => s.renameColumn);
  const dropColumn = useStore((s) => s.dropColumn);
  const [name, setName] = useState(column.name);
  const [required, setRequired] = useState(!column.nullable);
  const [markdown, setMarkdown] = useState(false);
  const [fieldType, setFieldType] = useState(guessType(column.dataType));
  const [typeOpen, setTypeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const left = Math.min(anchor.x, window.innerWidth - 340);
  const top = Math.min(anchor.y + 4, window.innerHeight - 380);
  const CurIcon = FIELD_TYPES.find((f) => f.label === fieldType)?.Icon ?? IconLetterCase;

  const save = async () => {
    const next = name.trim();
    if (next && next !== column.name) {
      setBusy(true);
      await renameColumn(table, column.name, next);
    }
    onClose();
  };

  const del = async () => {
    if (
      await confirmDialog({
        title: "Delete column",
        message: `Delete "${column.name}"? This drops the column and all of its data.`,
        confirmLabel: "Delete",
        danger: true,
      })
    ) {
      setBusy(true);
      await dropColumn(table, column.name);
      onClose();
    }
  };

  return (
    <>
      <div className="bud-pop-backdrop" onClick={onClose} />
      <div className="bud-coleditor" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
        <input
          className="bud-ce-name"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="bud-ce-typewrap">
          <button
            type="button"
            className={`bud-ce-type ${typeOpen ? "open" : ""}`}
            title={`SQL type: ${column.dataType}`}
            onClick={() => setTypeOpen((v) => !v)}
          >
            <span className="bud-ce-type-ic">
              <CurIcon size={15} stroke={1.7} />
            </span>
            <span className="bud-ce-type-label">{fieldType}</span>
            <IconChevronDown size={15} stroke={1.7} className="bud-ce-type-caret" />
          </button>
          {typeOpen && (
            <div className="bud-ce-type-menu">
              {FIELD_TYPES.map((ft) => (
                <button
                  type="button"
                  key={ft.label}
                  className={`bud-ce-type-opt ${ft.label === fieldType ? "sel" : ""}`}
                  onClick={() => {
                    setFieldType(ft.label);
                    setTypeOpen(false);
                  }}
                >
                  <ft.Icon size={15} stroke={1.7} />
                  <span>{ft.label}</span>
                  {ft.label === fieldType && <IconCheck size={14} stroke={2} className="bud-ce-type-check" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="bud-ce-hint">
          A field's <b>type</b> is the kind of value it holds — plain text, a number, a date &amp; time,
          true/false, or JSON. It decides how values are shown, sorted, and edited.
        </p>
        <div className="bud-ce-section">
          Formatting <span className="bud-info">ⓘ</span>
        </div>
        <label className="bud-toggle">
          <input type="checkbox" checked={markdown} onChange={(e) => setMarkdown(e.target.checked)} />
          <span className="bud-switch" />
          Enable rich text support (markdown)
        </label>
        <label className="bud-toggle">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          <span className="bud-switch" />
          Required
        </label>
        <div className="bud-ce-section">Default value</div>
        <div className="bud-ce-default">
          <input placeholder="None" />
          <IconBoltFilled size={15} className="bud-ce-bind" />
        </div>
        <div className="bud-ce-actions">
          <button
            className="bud-ce-delete"
            onClick={del}
            disabled={busy || column.isPrimaryKey}
            title={column.isPrimaryKey ? "Can't drop the primary key" : "Drop this column"}
          >
            Delete
          </button>
          <button className="bud-ce-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="bud-ce-save" onClick={save} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </>
  );
}
