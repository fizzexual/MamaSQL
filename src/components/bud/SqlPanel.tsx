import { IconPlayerPlay } from "@tabler/icons-react";
import { useState } from "react";
import { getBackend } from "../../ipc/backend";
import type { AppError, QueryResult } from "../../ipc/types";
import { useStore } from "../../state/store";

function normalize(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e) return e as AppError;
  return { kind: "internal", message: String(e) };
}

export function SqlPanel() {
  const sql = useStore((s) => s.sql);
  const setSql = useStore((s) => s.setSql);
  const connId = useStore((s) => s.activeConnectionId);
  const loadHistory = useStore((s) => s.loadHistory);
  const [res, setRes] = useState<QueryResult | null>(null);
  const [err, setErr] = useState<AppError | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!connId || running) return;
    setRunning(true);
    setErr(null);
    try {
      const r = await getBackend().runQuery(connId, sql);
      setRes(r);
      void loadHistory();
    } catch (e) {
      setErr(normalize(e));
      setRes(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bud-sqlpanel">
      <div className="bud-sql-editor-wrap">
        <textarea
          className="bud-sql-editor"
          value={sql}
          spellCheck={false}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run();
          }}
        />
        <div className="bud-sql-bar">
          <button className="bud-sql-run" onClick={() => void run()} disabled={running || !connId}>
            <IconPlayerPlay size={14} stroke={1.8} /> {running ? "Running…" : "Run"}
            <span className="bud-kbd">
              <kbd>⌘</kbd>
              <kbd>↵</kbd>
            </span>
          </button>
          {res && !err && (
            <span className="bud-sql-meta">
              {res.rows.length} {res.rows.length === 1 ? "row" : "rows"} · {res.elapsedMs} ms
            </span>
          )}
        </div>
      </div>
      <div className="bud-sql-results">
        {err ? (
          <div className="bud-error">⚠ {err.message ?? err.kind}</div>
        ) : res ? (
          res.columns.length === 0 ? (
            <div className="bud-empty">Statement ran. {res.rowsAffected} rows affected.</div>
          ) : (
            <div className="bud-grid-wrap">
              <table className="bud-grid">
                <thead>
                  <tr>
                    <th className="bud-rownum" />
                    {res.columns.map((c, i) => (
                      <th key={i}>
                        <span className="bud-th-name">{c.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((row, ri) => (
                    <tr key={ri}>
                      <td className="bud-rownum">{ri + 1}</td>
                      {row.map((cell, ci) => (
                        <td key={ci} className={cell == null ? "bud-null" : ""}>
                          {cell == null ? "NULL" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="bud-empty">Write SQL and press Run (⌘/Ctrl + ↵).</div>
        )}
      </div>
    </div>
  );
}
