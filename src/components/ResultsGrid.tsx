import { useMemo, useState } from "react";
import { download, toCsv, toJson } from "../lib/csv";
import { useStore } from "../state/store";

export function ResultsGrid() {
  const result = useStore((s) => s.result);
  const error = useStore((s) => s.error);
  const running = useStore((s) => s.running);
  const editTable = useStore((s) => s.editTable);
  const editCell = useStore((s) => s.editCell);
  const deleteRowAt = useStore((s) => s.deleteRowAt);
  const addRow = useStore((s) => s.addRow);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [newRow, setNewRow] = useState<string[] | null>(null);

  const editable = !!editTable;
  const pkIdx = useMemo(
    () =>
      editTable?.pkColumn && result
        ? result.columns.findIndex((c) => c.name === editTable.pkColumn)
        : -1,
    [editTable, result],
  );

  const rows = useMemo(() => {
    if (!result) return [];
    if (editable || !sort) return result.rows;
    const copy = [...result.rows];
    copy.sort((a, b) => {
      const x = a[sort.col];
      const y = b[sort.col];
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return copy;
  }, [result, sort, editable]);

  if (running) return <div className="results"><div className="empty">Running…</div></div>;
  if (error)
    return (
      <div className="results">
        <div className="results-error">
          <strong>{error.kind}</strong>
          {error.message ? ` — ${error.message}` : ""}
        </div>
      </div>
    );
  if (!result) return <div className="results"><div className="empty">Run a query to see results.</div></div>;
  if (result.columns.length === 0)
    return (
      <div className="results">
        <div className="empty">OK — {result.rowsAffected} row(s) affected · {result.elapsedMs} ms</div>
      </div>
    );

  const sortBy = (i: number) => {
    if (editable) return;
    setSort((s) => (s && s.col === i ? { col: i, dir: s.dir === 1 ? -1 : 1 } : { col: i, dir: 1 }));
  };

  const startEdit = (row: number, col: number) => {
    if (!editTable?.pkColumn || col === pkIdx) return;
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

  return (
    <div className="results">
      <div className="results-toolbar">
        {editTable && (
          <span className="badge edit">
            ✎ editing {editTable.table}
            {editTable.pkColumn ? "" : " · no PK (read-only)"}
          </span>
        )}
        <span className="rows-count">{result.rows.length} rows</span>
        {result.truncated && <span className="badge">truncated</span>}
        <div className="spacer" />
        {editTable?.pkColumn &&
          (newRow ? (
            <>
              <button className="primary" onClick={saveNewRow}>Save row</button>
              <button onClick={() => setNewRow(null)}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setNewRow(result.columns.map(() => ""))}>＋ Add row</button>
          ))}
        <button onClick={() => download("result.csv", toCsv(result))}>Export CSV</button>
        <button onClick={() => download("result.json", toJson(result))}>Export JSON</button>
      </div>
      <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              {editable && <th className="rownum" />}
              <th className="rownum">#</th>
              {result.columns.map((c, i) => (
                <th key={i} onClick={() => sortBy(i)} title={`${c.name} (${c.dataType})`}>
                  <span className="th-name">
                    {c.name}
                    {i === pkIdx ? " 🔑" : ""}
                  </span>
                  <span className="th-type">{c.dataType}</span>
                  {sort?.col === i && <span className="sort">{sort.dir === 1 ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {newRow && (
              <tr className="new-row">
                <td className="rownum">
                  <button className="row-del" title="Cancel" onClick={() => setNewRow(null)}>✕</button>
                </td>
                <td className="rownum">＋</td>
                {result.columns.map((c, ci) => (
                  <td key={ci}>
                    <input
                      className="cell-input"
                      placeholder={c.name}
                      value={newRow[ci]}
                      onChange={(e) =>
                        setNewRow((nr) => (nr ? nr.map((v, j) => (j === ci ? e.target.value : v)) : nr))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveNewRow();
                        if (e.key === "Escape") setNewRow(null);
                      }}
                    />
                  </td>
                ))}
              </tr>
            )}
            {rows.map((row, ri) => (
              <tr key={ri}>
                {editable && (
                  <td className="rownum">
                    <button
                      className="row-del"
                      title={pkIdx < 0 ? "Need a primary key to delete" : "Delete row"}
                      disabled={pkIdx < 0}
                      onClick={() => {
                        if (window.confirm("Delete this row?")) void deleteRowAt(ri);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                )}
                <td className="rownum">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cell == null ? "null" : ""}
                    onDoubleClick={() => startEdit(ri, ci)}
                  >
                    {editing && editing.row === ri && editing.col === ci ? (
                      <input
                        className="cell-input"
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
                      "NULL"
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
