import { useState } from "react";
import type { ColumnInfo } from "../../ipc/types";

function guessType(t: string): string {
  const u = t.toUpperCase();
  if (/INT|SERIAL|NUM|DEC|REAL|FLOAT|DOUBLE/.test(u)) return "Number";
  if (/DATE|TIME/.test(u)) return "Date/Time";
  if (/BOOL/.test(u)) return "Boolean";
  if (/TEXT|CLOB|LONG/.test(u)) return "Long form text";
  return "Single line text";
}

export interface ColumnEditorAnchor {
  column: ColumnInfo;
  x: number;
  y: number;
}

// Presentational clone of Budibase's column editor. Type / required / default
// are display + local state for now (ALTER COLUMN is a follow-up).
export function ColumnEditor({ anchor, onClose }: { anchor: ColumnEditorAnchor; onClose: () => void }) {
  const { column } = anchor;
  const [name, setName] = useState(column.name);
  const [required, setRequired] = useState(!column.nullable);
  const [markdown, setMarkdown] = useState(false);

  const left = Math.min(anchor.x, window.innerWidth - 340);
  const top = Math.min(anchor.y + 4, window.innerHeight - 380);

  return (
    <>
      <div className="bud-pop-backdrop" onClick={onClose} />
      <div className="bud-coleditor" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
        <input className="bud-ce-name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="bud-ce-type">
          <span className="bud-ce-type-ic">≡</span>
          <span className="bud-ce-type-label">{guessType(column.dataType)}</span>
          <span className="caret">▾</span>
        </div>
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
          <span className="bud-ce-bind">⚡</span>
        </div>
        <div className="bud-ce-actions">
          <button className="bud-ce-delete">Delete</button>
          <button className="bud-ce-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="bud-ce-save" onClick={onClose}>
            Save
          </button>
        </div>
      </div>
    </>
  );
}
