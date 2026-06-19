import { useMemo, useState } from "react";
import type { ColumnInfo } from "../../ipc/types";
import { useStore } from "../../state/store";
import { ColumnEditor, type ColumnEditorAnchor } from "./ColumnEditor";

function typeIcon(t: string): string {
  const u = t.toUpperCase();
  if (/INT|SERIAL|NUM|DEC|REAL|FLOAT|DOUBLE|BIGINT/.test(u)) return "123";
  if (/DATE|TIME/.test(u)) return "🕑";
  if (/BOOL/.test(u)) return "☑";
  return "T";
}

const PILL_COLORS: [string, string][] = [
  ["#36275f", "#c4b5fd"],
  ["#123a2c", "#6ee7b7"],
  ["#3a2a10", "#fcd34d"],
  ["#0f3040", "#7dd3fc"],
  ["#3a1230", "#f9a8d4"],
  ["#2a1240", "#d8b4fe"],
];

/** Shimmer placeholder shown while a table's rows are loading. */
function GridSkeleton() {
  const rows = Array.from({ length: 12 });
  const cols = Array.from({ length: 5 });
  return (
    <div className="bud-grid-wrap">
      <table className="bud-grid bud-grid-skel">
        <thead>
          <tr>
            <th className="bud-checkcol" />
            <th className="bud-rownum">#</th>
            {cols.map((_, i) => (
              <th key={i}>
                <span className="sk sk-th" />
              </th>
            ))}
            <th className="bud-addcol" />
          </tr>
        </thead>
        <tbody>
          {rows.map((_, r) => (
            <tr key={r}>
              <td className="bud-checkcol" />
              <td className="bud-rownum">{r + 1}</td>
              {cols.map((_, c) => (
                <td key={c}>
                  <span className="sk sk-cell" style={{ width: `${45 + ((r * 7 + c * 23) % 45)}%` }} />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataGrid() {
  const result = useStore((s) => s.result);
  const editTable = useStore((s) => s.editTable);
  const loadingResult = useStore((s) => s.loadingResult);
  const editCell = useStore((s) => s.editCell);
  const deleteRowAt = useStore((s) => s.deleteRowAt);
  const addRow = useStore((s) => s.addRow);
  const addColumn = useStore((s) => s.addColumn);
  const openInspector = useStore((s) => s.openInspector);
  const inspectorRow = useStore((s) => s.inspectorRow);
  const columns = useStore((s) => (editTable ? s.schema.columnsByTable[editTable.table] : undefined));
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [newRow, setNewRow] = useState<string[] | null>(null);
  const [colEditor, setColEditor] = useState<ColumnEditorAnchor | null>(null);

  const pkCol = editTable?.pkColumn ?? null;
  const pkIdx = useMemo(
    () => (pkCol && result ? result.columns.findIndex((c) => c.name === pkCol) : -1),
    [pkCol, result],
  );

  // Columns rendered as colored option pills (few distinct short text values).
  const optionCols = useMemo(() => {
    const set = new Set<number>();
    if (!result) return set;
    result.columns.forEach((c, i) => {
      if (/INT|NUM|REAL|FLOAT|DOUBLE|DATE|TIME/.test(c.dataType.toUpperCase())) return;
      const vals = new Set(result.rows.map((r) => (r[i] == null ? "" : String(r[i]))));
      const maxLen = Math.max(0, ...[...vals].map((v) => v.length));
      if (vals.size > 0 && vals.size <= 12 && maxLen <= 16 && result.rows.length >= vals.size) set.add(i);
    });
    return set;
  }, [result]);

  if (loadingResult) return <GridSkeleton />;
  if (!result || !editTable) return null;
  const table = editTable.table;

  const colInfo = (name: string): ColumnInfo =>
    columns?.find((c) => c.name === name) ?? { name, dataType: "TEXT", nullable: true, isPrimaryKey: false };

  const startEdit = (row: number, col: number) => {
    if (!pkCol || col === pkIdx) return;
    setEditing({ row, col });
    setDraft(result.rows[row][col] == null ? "" : String(result.rows[row][col]));
  };
  const commitEdit = () => {
    if (editing) void editCell(editing.row, editing.col, draft);
    setEditing(null);
  };
  const saveNewRow = () => {
    if (!newRow) return;
    const cols: string[] = [];
    const vals: unknown[] = [];
    result.columns.forEach((c, i) => {
      if (newRow[i] !== "") {
        cols.push(c.name);
        vals.push(newRow[i]);
      }
    });
    void addRow(cols, vals);
    setNewRow(null);
  };
  const addColumnPrompt = () => {
    const name = window.prompt("New column name");
    if (!name?.trim()) return;
    const dataType = window.prompt("Column type (TEXT, INTEGER, REAL, DATE, …)", "TEXT")?.trim() || "TEXT";
    void addColumn(table, { name: name.trim(), dataType, nullable: true, primaryKey: false });
  };
  const pill = (v: unknown) => {
    const s = String(v);
    let h = 0;
    for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
    const [bg, fg] = PILL_COLORS[h % PILL_COLORS.length];
    return (
      <span className="bud-pill" style={{ background: bg, color: fg }}>
        {s}
      </span>
    );
  };

  return (
    <div className="bud-grid-wrap">
      <table className="bud-grid">
        <thead>
          <tr>
            <th className="bud-checkcol">
              <input type="checkbox" />
            </th>
            <th className="bud-rownum">#</th>
            {result.columns.map((c, i) => (
              <th key={i}>
                <span className="bud-th-ic">{typeIcon(c.dataType)}</span>
                <span className="bud-th-name">{c.name}</span>
                <button
                  className="bud-th-menu"
                  title="Edit column"
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setColEditor({ column: colInfo(c.name), x: r.left - 280, y: r.bottom });
                  }}
                >
                  ⋯
                </button>
              </th>
            ))}
            <th className="bud-addcol">
              <button title="Add column" onClick={addColumnPrompt}>
                ＋
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {newRow && (
            <tr className="bud-newrow">
              <td className="bud-checkcol">
                <button className="bud-rowx" onClick={() => setNewRow(null)}>
                  ✕
                </button>
              </td>
              <td className="bud-rownum">＋</td>
              {result.columns.map((c, i) => (
                <td key={i}>
                  <input
                    className="bud-cell-input"
                    placeholder={c.name}
                    value={newRow[i]}
                    onChange={(e) => setNewRow((nr) => (nr ? nr.map((v, j) => (j === i ? e.target.value : v)) : nr))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveNewRow();
                      if (e.key === "Escape") setNewRow(null);
                    }}
                  />
                </td>
              ))}
              <td />
            </tr>
          )}
          {result.rows.map((row, ri) => (
            <tr key={ri} className={ri === inspectorRow ? "row-open" : ""}>
              <td className="bud-checkcol">
                <input type="checkbox" className="bud-rowcheck" />
                <button
                  className="bud-rowx"
                  title={pkIdx < 0 ? "Need a primary key to delete" : "Delete row"}
                  disabled={pkIdx < 0}
                  onClick={() => {
                    if (window.confirm("Delete this row?")) void deleteRowAt(ri);
                  }}
                >
                  ✕
                </button>
              </td>
              <td className="bud-rownum">
                <span className="rn-num">{ri + 1}</span>
                <button className="rn-expand" title="Edit row in panel" onClick={() => openInspector(ri)}>
                  ⤢
                </button>
              </td>
              {row.map((cell, ci) => (
                <td key={ci} className={cell == null ? "bud-null" : ""} onDoubleClick={() => startEdit(ri, ci)}>
                  {editing && editing.row === ri && editing.col === ci ? (
                    <input
                      className="bud-cell-input"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                  ) : cell == null ? (
                    ""
                  ) : optionCols.has(ci) ? (
                    pill(cell)
                  ) : (
                    String(cell)
                  )}
                </td>
              ))}
              <td />
            </tr>
          ))}
          <tr className="bud-addrow">
            <td className="bud-checkcol">
              <button onClick={() => setNewRow(result.columns.map(() => ""))} title="Add row">
                ＋
              </button>
            </td>
            <td className="bud-rownum bud-kbd">
              <kbd>⌘</kbd>
              <kbd>↵</kbd>
            </td>
            <td colSpan={result.columns.length + 1} />
          </tr>
        </tbody>
      </table>
      {colEditor && <ColumnEditor anchor={colEditor} table={table} onClose={() => setColEditor(null)} />}
    </div>
  );
}
