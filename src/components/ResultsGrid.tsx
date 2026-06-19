import { useMemo, useState } from "react";
import { download, toCsv, toJson } from "../lib/csv";
import { useStore } from "../state/store";

export function ResultsGrid() {
  const result = useStore((s) => s.result);
  const error = useStore((s) => s.error);
  const running = useStore((s) => s.running);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);

  const rows = useMemo(() => {
    if (!result) return [];
    if (!sort) return result.rows;
    const copy = [...result.rows];
    copy.sort((a, b) => {
      const x = a[sort.col];
      const y = b[sort.col];
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return copy;
  }, [result, sort]);

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

  const sortBy = (i: number) =>
    setSort((s) => (s && s.col === i ? { col: i, dir: s.dir === 1 ? -1 : 1 } : { col: i, dir: 1 }));

  return (
    <div className="results">
      <div className="results-toolbar">
        <span className="rows-count">{result.rows.length} rows</span>
        {result.truncated && <span className="badge">truncated</span>}
        <div className="spacer" />
        <button onClick={() => download("result.csv", toCsv(result))}>Export CSV</button>
        <button onClick={() => download("result.json", toJson(result))}>Export JSON</button>
      </div>
      <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th className="rownum">#</th>
              {result.columns.map((c, i) => (
                <th key={i} onClick={() => sortBy(i)} title={`${c.name} (${c.dataType})`}>
                  <span className="th-name">{c.name}</span>
                  <span className="th-type">{c.dataType}</span>
                  {sort?.col === i && <span className="sort">{sort.dir === 1 ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td className="rownum">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className={cell == null ? "null" : ""}>
                    {cell == null ? "NULL" : String(cell)}
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
