import { IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { promptDialog } from "../../state/dialog";
import type { ColumnInfo } from "../../ipc/types";
import { useStore } from "../../state/store";
import { ColumnEditor, type ColumnEditorAnchor } from "./ColumnEditor";

function typeIcon(t: string): string {
  const u = t.toUpperCase();
  if (/INT|SERIAL|NUM|DEC|REAL|FLOAT|DOUBLE|BIGINT/.test(u)) return "123";
  if (/DATE|TIME/.test(u)) return "◷";
  if (/BOOL/.test(u)) return "✓";
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

/**
 * Loading placeholder that mirrors the table it's about to show: the real
 * column headers are rendered (so nothing shifts when data arrives) and only
 * the cell bodies shimmer. If the structure isn't known yet there's nothing to
 * mirror — show a plain empty state instead of a generic skeleton.
 */
function GridSkeleton({ columns }: { columns?: ColumnInfo[] }) {
  // Structure not known yet — don't fake a grid, just say we're loading.
  if (!columns || columns.length === 0) {
    return <div className="bud-empty">Loading…</div>;
  }
  const rows = Array.from({ length: 8 });
  return (
    <div className="bud-grid-wrap">
      <table className="bud-grid bud-grid-skel">
        <thead>
          <tr>
            <th className="bud-checkcol" />
            <th className="bud-rownum" />
            {columns.map((c) => (
              <th key={c.name}>
                <span className="bud-th-ic">{typeIcon(c.dataType)}</span>
                <span className="bud-th-name">{c.name}</span>
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
              {columns.map((c, ci) => (
                <td key={c.name}>
                  <span className="sk sk-cell" style={{ width: `${45 + ((r * 7 + ci * 23) % 45)}%` }} />
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
  const addRow = useStore((s) => s.addRow);
  const addColumn = useStore((s) => s.addColumn);
  const openInspector = useStore((s) => s.openInspector);
  const inspectorRow = useStore((s) => s.inspectorRow);
  const selection = useStore((s) => s.selection);
  const toggleRow = useStore((s) => s.toggleRow);
  const selectAllRows = useStore((s) => s.selectAllRows);
  const columns = useStore((s) => (editTable ? s.schema.columnsByTable[editTable.table] : undefined));
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [newRow, setNewRow] = useState<string[] | null>(null);
  const [colEditor, setColEditor] = useState<ColumnEditorAnchor | null>(null);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  // Only show the skeleton if loading actually lingers — avoids a flash on the
  // near-instant in-browser SQLite loads.
  const [showSkel, setShowSkel] = useState(false);

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

  // Display order of original row indices, honoring the active column sort.
  const order = useMemo(() => {
    const idx = result ? result.rows.map((_, i) => i) : [];
    if (!result || !sort) return idx;
    const { col, dir } = sort;
    return idx.sort((a, b) => {
      const x = result.rows[a][col];
      const y = result.rows[b][col];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const nx = Number(x);
      const ny = Number(y);
      const bothNum = x !== "" && y !== "" && !Number.isNaN(nx) && !Number.isNaN(ny);
      const cmp = bothNum ? nx - ny : String(x).localeCompare(String(y));
      return cmp * dir;
    });
  }, [result, sort]);

  useEffect(() => setSort(null), [editTable?.table]);

  useEffect(() => {
    if (!loadingResult) {
      setShowSkel(false);
      return;
    }
    const t = setTimeout(() => setShowSkel(true), 160);
    return () => clearTimeout(t);
  }, [loadingResult]);

  // While loading: nothing for the first moment (no flash), then the skeleton.
  if (loadingResult) return showSkel ? <GridSkeleton columns={columns} /> : null;
  if (!result || !editTable) return null;
  const table = editTable.table;
  const allSelected = result.rows.length > 0 && selection.length === result.rows.length;

  const colInfo = (name: string): ColumnInfo =>
    columns?.find((c) => c.name === name) ?? { name, dataType: "TEXT", nullable: true, isPrimaryKey: false };

  const toggleSort = (col: number) =>
    setSort((s) => (!s || s.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));

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
  const addColumnPrompt = async () => {
    const name = await promptDialog({ title: "New column", label: "Column name", placeholder: "e.g. created_at" });
    if (!name?.trim()) return;
    const dataType =
      (await promptDialog({ title: "Column type", label: "Type (TEXT, INTEGER, REAL, DATE, …)", defaultValue: "TEXT" }))?.trim() ||
      "TEXT";
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
              <input type="checkbox" checked={allSelected} onChange={selectAllRows} aria-label="Select all rows" />
            </th>
            <th className="bud-rownum" />
            {result.columns.map((c, i) => (
              <th key={i} className={sort?.col === i ? "sorted" : ""}>
                <button className="bud-th-sort" title={`Sort by ${c.name}`} onClick={() => toggleSort(i)}>
                  <span className="bud-th-ic">{typeIcon(c.dataType)}</span>
                  <span className="bud-th-name">{c.name}</span>
                  {sort?.col === i && <span className="bud-th-arrow">{sort.dir === 1 ? "↑" : "↓"}</span>}
                </button>
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
              <button className="bud-addcol-btn" title="Add column" onClick={addColumnPrompt}>
                <IconPlus size={14} stroke={2} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {newRow && (
            <tr className="bud-newrow">
              <td className="bud-checkcol">
                <button className="bud-rowx" onClick={() => setNewRow(null)}>
                  <IconX size={13} stroke={2} />
                </button>
              </td>
              <td className="bud-rownum bud-newrow-num">
                <IconPlus size={13} stroke={2} />
              </td>
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
          {order.length === 0 && !newRow && (
            <tr className="bud-empty-row">
              <td className="bud-checkcol" />
              <td className="bud-rownum" />
              <td className="bud-empty-cell" colSpan={result.columns.length + 1}>
                This table is empty — add a row below.
              </td>
            </tr>
          )}
          {order.map((ri, pos) => {
            const row = result.rows[ri];
            return (
              <tr
                key={ri}
                className={`${ri === inspectorRow ? "row-open" : ""} ${selection.includes(ri) ? "selected" : ""}`}
              >
                <td className="bud-checkcol">
                  <input
                    type="checkbox"
                    className="bud-rowcheck"
                    checked={selection.includes(ri)}
                    onChange={() => toggleRow(ri)}
                  />
                </td>
                <td className="bud-rownum">
                  <span className="rn-num">{pos + 1}</span>
                  <button className="rn-expand" title="Edit row in panel" onClick={() => openInspector(ri)}>
                    ⤢
                  </button>
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cell == null ? "bud-null" : ""}
                    title={cell == null ? "" : String(cell)}
                    onDoubleClick={() => startEdit(ri, ci)}
                  >
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
            );
          })}
          <tr className="bud-addrow">
            <td className="bud-checkcol">
              <button className="bud-addrow-btn" onClick={() => setNewRow(result.columns.map(() => ""))} title="Add row">
                <IconPlus size={15} stroke={2} />
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
