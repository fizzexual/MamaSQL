import { IconArrowUpRight, IconChevronLeft, IconChevronRight, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBackend } from "../../ipc/backend";
import { displayRows } from "../../lib/cell";
import { promptDialog } from "../../state/dialog";
import { toast } from "../../state/toast";
import type { ColumnInfo } from "../../ipc/types";
import { useStore } from "../../state/store";
import { CellViewer, isExpandable } from "./CellViewer";
import { ColumnEditor, type ColumnEditorAnchor } from "./ColumnEditor";
import { ExportMenu } from "./ExportMenu";

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
  const rawResult = useStore((s) => s.result);
  // Defensively normalize cells for display (pg/mysql JSON -> objects, binary ->
  // Buffer). Idempotent with the data-layer pass in lib/cell, so already-clean
  // rows are returned as-is.
  const result = useMemo(
    () => (rawResult ? { ...rawResult, rows: displayRows(rawResult.rows) } : rawResult),
    [rawResult],
  );
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
  const activeId = useStore((s) => s.activeConnectionId);
  const readOnly = useStore((s) => s.readOnlyConns.includes(s.activeConnectionId ?? ""));
  const navigateFk = useStore((s) => s.navigateFk);
  const pendingColFilter = useStore((s) => s.pendingColFilter);
  const setPendingColFilter = useStore((s) => s.setPendingColFilter);
  const openTableData = useStore((s) => s.openTableData);
  const searchTable = useStore((s) => s.searchTable);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [newRow, setNewRow] = useState<string[] | null>(null);
  const [colEditor, setColEditor] = useState<ColumnEditorAnchor | null>(null);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [cellView, setCellView] = useState<{ value: string; column?: string } | null>(null);
  const [selCell, setSelCell] = useState<{ r: number; c: number } | null>(null);
  const [gridFilter, setGridFilter] = useState("");
  const serverSearched = useRef(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [allFks, setAllFks] = useState<{ table: string; column: string; refTable: string; refColumn: string }[]>([]);
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
    const rows = result.rows;
    result.columns.forEach((c, i) => {
      if (/INT|NUM|REAL|FLOAT|DOUBLE|DATE|TIME/.test(c.dataType.toUpperCase())) return;
      const vals = new Set<string>();
      let ok = rows.length > 0;
      // Stop scanning as soon as a column can't be an option pill (long value or
      // too many distinct values) — avoids walking all rows of high-cardinality
      // text columns (ids, emails, JSON) on every table switch.
      for (let r = 0; r < rows.length; r++) {
        const v = rows[r][i] == null ? "" : String(rows[r][i]);
        if (v.length > 16) { ok = false; break; }
        vals.add(v);
        if (vals.size > 12) { ok = false; break; }
      }
      if (ok && vals.size > 0 && rows.length >= vals.size) set.add(i);
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

  // Reset filters/paging when the table changes.
  useEffect(() => {
    setGridFilter("");
    setPage(0);
    serverSearched.current = false;
  }, [editTable?.table]);

  // Whole-table search: debounce the filter and run it on the server so matches
  // beyond the loaded window are found too (the client-side filter above still
  // gives instant feedback while this resolves). Clearing it reloads the table.
  useEffect(() => {
    if (!editTable) return;
    const q = gridFilter.trim();
    const id = setTimeout(() => {
      if (q) {
        serverSearched.current = true;
        void searchTable(q);
      } else if (serverSearched.current) {
        serverSearched.current = false;
        void openTableData(editTable.table);
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridFilter, editTable?.table]);

  // Foreign keys are per-connection, so fetch them once (not on every table
  // switch) and derive the current table's map below.
  useEffect(() => {
    if (!activeId) {
      setAllFks([]);
      return;
    }
    let alive = true;
    getBackend()
      .listForeignKeys(activeId)
      .then((list) => alive && setAllFks(list))
      .catch(() => alive && setAllFks([]));
    return () => {
      alive = false;
    };
  }, [activeId]);

  const fks = useMemo(() => {
    const map: Record<string, { refTable: string; refColumn: string }> = {};
    if (editTable) {
      for (const fk of allFks) {
        if (fk.table === editTable.table) map[fk.column] = { refTable: fk.refTable, refColumn: fk.refColumn };
      }
    }
    return map;
  }, [allFks, editTable?.table]);

  // Seed the filter when arriving here by clicking a foreign key.
  useEffect(() => {
    if (!pendingColFilter) return;
    setGridFilter(pendingColFilter.value);
    setPage(0);
    setPendingColFilter(null);
  }, [pendingColFilter]);

  useEffect(() => {
    if (!loadingResult) {
      setShowSkel(false);
      return;
    }
    const t = setTimeout(() => setShowSkel(true), 160);
    return () => clearTimeout(t);
  }, [loadingResult]);

  // Ctrl/Cmd+C copies the selected cell (unless the user is typing or has a text selection).
  useEffect(() => {
    if (!selCell || !result) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.key !== "c" && e.key !== "C")) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (window.getSelection()?.toString()) return;
      const v = result.rows[selCell.r]?.[selCell.c];
      void navigator.clipboard?.writeText(v == null ? "" : String(v)).then(() => toast("Copied cell", "success")).catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selCell, result]);

  // While loading we keep the current grid on screen, so switching tables doesn't
  // flash to black (local queries finish well under the skeleton delay). Only show
  // a skeleton when there's genuinely nothing yet (the first load).
  if (loadingResult && !result) return showSkel ? <GridSkeleton columns={columns} /> : null;
  if (!result || !editTable) return null;
  const table = editTable.table;
  const allSelected = result.rows.length > 0 && selection.length === result.rows.length;

  const q = gridFilter.trim().toLowerCase();
  const filteredOrder = q
    ? order.filter((ri) => result.rows[ri].some((c) => c != null && String(c).toLowerCase().includes(q)))
    : order;
  const hasFilters = !!q;
  const pageCount = Math.max(1, Math.ceil(filteredOrder.length / pageSize));
  const curPage = Math.min(page, pageCount - 1);
  const pagedOrder = filteredOrder.slice(curPage * pageSize, curPage * pageSize + pageSize);

  const colInfo = (name: string): ColumnInfo =>
    columns?.find((c) => c.name === name) ?? { name, dataType: "TEXT", nullable: true, isPrimaryKey: false };

  const toggleSort = (col: number) =>
    setSort((s) => (!s || s.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));

  const startEdit = (row: number, col: number) => {
    if (!pkCol || col === pkIdx || readOnly) return;
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
    <div className="bud-grid-area">
      <div className="bud-grid-toolbar">
        <div className="bud-grid-search">
          <IconSearch size={13} stroke={2} />
          <input
            value={gridFilter}
            placeholder="Filter rows…"
            aria-label="Filter rows"
            onChange={(e) => {
              setGridFilter(e.target.value);
              setPage(0);
            }}
          />
          {gridFilter && (
            <button className="bud-grid-search-x" title="Clear filter" onClick={() => setGridFilter("")}>
              <IconX size={13} stroke={2} />
            </button>
          )}
        </div>
        {hasFilters && (
          <span className="bud-grid-toolbar-info">
            {filteredOrder.length.toLocaleString()} match{filteredOrder.length === 1 ? "" : "es"}
            {result.rows.length >= 1000 ? " (first 1,000)" : ""}
          </span>
        )}
        <span className="bud-grid-foot-spacer" />
        <ExportMenu result={result} rows={filteredOrder.map((ri) => result.rows[ri])} table={table} />
      </div>
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
              <button className="bud-addcol-btn" title="Add column" onClick={addColumnPrompt} disabled={readOnly}>
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
          {filteredOrder.length === 0 && !newRow && (
            <tr className="bud-empty-row">
              <td className="bud-checkcol" />
              <td className="bud-rownum" />
              <td className="bud-empty-cell" colSpan={result.columns.length + 1}>
                {hasFilters ? "No rows match the filters." : "This table is empty — add a row below."}
              </td>
            </tr>
          )}
          {pagedOrder.map((ri, pos) => {
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
                  <span className="rn-num">{curPage * pageSize + pos + 1}</span>
                  <button className="rn-expand" title="Edit row in panel" onClick={() => openInspector(ri)}>
                    ⤢
                  </button>
                </td>
                {row.map((cell, ci) => {
                  const fk = cell != null ? fks[result.columns[ci].name] : undefined;
                  return (
                    <td
                      key={ci}
                      className={`${cell == null ? "bud-null" : ""} ${fk ? "bud-fk-cell" : ""} ${selCell?.r === ri && selCell?.c === ci ? "sel" : ""}`}
                      title={cell == null ? "" : String(cell)}
                      onClick={() => {
                        setSelCell({ r: ri, c: ci });
                        const sv = cell == null ? "" : String(cell);
                        if (!editing && sv && isExpandable(sv)) setCellView({ value: sv, column: result.columns[ci].name });
                      }}
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
                      ) : (
                        <>
                          {optionCols.has(ci) ? pill(cell) : String(cell)}
                          {fk && (
                            <button
                              className="bud-fk-jump"
                              title={`Go to ${fk.refTable}.${fk.refColumn} = ${String(cell)}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void navigateFk(fk.refTable, fk.refColumn, cell);
                              }}
                            >
                              <IconArrowUpRight size={12} stroke={2} />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
                <td />
              </tr>
            );
          })}
          <tr className="bud-addrow">
            <td className="bud-checkcol">
              <button className="bud-addrow-btn" onClick={() => setNewRow(result.columns.map(() => ""))} title="Add row" disabled={readOnly}>
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
      </div>
      {filteredOrder.length > 0 && (
        <div className="bud-grid-foot">
          <span className="bud-grid-foot-info">
            {hasFilters
              ? `${filteredOrder.length.toLocaleString()} of ${result.rows.length.toLocaleString()} rows`
              : `${result.rows.length.toLocaleString()} ${result.rows.length === 1 ? "row" : "rows"}`}
            {result.truncated ? " (first 1000)" : ""}
          </span>
          <span className="bud-grid-foot-spacer" />
          {pageCount > 1 && (
            <span className="bud-pager">
              <button title="Previous page" disabled={curPage === 0} onClick={() => setPage(curPage - 1)}>
                <IconChevronLeft size={14} stroke={2} />
              </button>
              <span className="bud-pager-info">
                {curPage + 1} / {pageCount}
              </span>
              <button title="Next page" disabled={curPage >= pageCount - 1} onClick={() => setPage(curPage + 1)}>
                <IconChevronRight size={14} stroke={2} />
              </button>
            </span>
          )}
          <label className="bud-pagesize">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {colEditor && <ColumnEditor anchor={colEditor} table={table} onClose={() => setColEditor(null)} />}
      {cellView && <CellViewer value={cellView.value} column={cellView.column} onClose={() => setCellView(null)} />}
    </div>
  );
}
