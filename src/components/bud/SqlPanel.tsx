import {
  IconAlignLeft,
  IconArrowBackUp,
  IconCheck,
  IconEraser,
  IconFileCode,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlayerStop,
  IconRefresh,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { getBackend } from "../../ipc/backend";
import type { AppError, QueryResult } from "../../ipc/types";
import { useStore } from "../../state/store";

function normalize(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e) return e as AppError;
  return { kind: "internal", message: String(e) };
}

const KEYWORDS = new Set(
  (
    "SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER FULL CROSS ON USING GROUP BY ORDER HAVING LIMIT OFFSET " +
    "INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW INDEX SEQUENCE TRIGGER PROCEDURE FUNCTION DROP ALTER ADD COLUMN RENAME TO " +
    "AS AND OR NOT NULL IS IN LIKE ILIKE BETWEEN EXISTS DISTINCT UNION INTERSECT EXCEPT ALL ANY CASE WHEN THEN ELSE END WITH RETURNING " +
    "COUNT SUM AVG MIN MAX COALESCE CAST PRIMARY KEY FOREIGN REFERENCES UNIQUE DEFAULT CHECK CONSTRAINT GRANT REVOKE " +
    "INTEGER INT BIGINT SMALLINT SERIAL TEXT VARCHAR CHAR BOOLEAN BOOL TIMESTAMP TIMESTAMPTZ DATE TIME NUMERIC DECIMAL REAL DOUBLE FLOAT JSON JSONB UUID BLOB " +
    "TRUE FALSE ASC DESC NOW INTERVAL"
  ).split(/\s+/),
);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightSql(src: string): string {
  const re = /(--[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard tokenizer loop
  while ((m = re.exec(src)) !== null) {
    out += esc(src.slice(last, m.index));
    const tok = m[0];
    if (m[1] || m[2]) out += `<span class="t-com">${esc(tok)}</span>`;
    else if (m[3]) out += `<span class="t-str">${esc(tok)}</span>`;
    else if (m[4]) out += `<span class="t-num">${esc(tok)}</span>`;
    else if (m[5] && KEYWORDS.has(tok.toUpperCase())) out += `<span class="t-kw">${esc(tok)}</span>`;
    else out += esc(tok);
    last = m.index + tok.length;
  }
  out += esc(src.slice(last));
  return out;
}

/** Light formatter: upper-case recognised keywords, leave everything else alone. */
function formatSql(src: string): string {
  return src.replace(/[A-Za-z_]\w*/g, (w) => (KEYWORDS.has(w.toUpperCase()) ? w.toUpperCase() : w));
}

type Tab = "log" | "dbms" | "result";

export function SqlPanel() {
  const sql = useStore((s) => s.sql);
  const setSql = useStore((s) => s.setSql);
  const connId = useStore((s) => s.activeConnectionId);
  const connections = useStore((s) => s.connections);
  const conn = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const loadHistory = useStore((s) => s.loadHistory);
  const [res, setRes] = useState<QueryResult | null>(null);
  const [err, setErr] = useState<AppError | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>("result");
  const [sticky, setSticky] = useState(false);
  const [maxRows, setMaxRows] = useState("1000");
  const [maxChars, setMaxChars] = useState("-1");
  const [caretLine, setCaretLine] = useState(1);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLPreElement>(null);
  const gutRef = useRef<HTMLDivElement>(null);

  const schemaName = conn?.engine === "postgres" ? "public" : conn?.database || "main";

  const run = async () => {
    if (!connId || running) return;
    setRunning(true);
    setErr(null);
    try {
      const r = await getBackend().runQuery(connId, sql);
      setRes(r);
      setTab("result");
      void loadHistory();
    } catch (e) {
      setErr(normalize(e));
      setRes(null);
      setTab("log");
    } finally {
      setRunning(false);
    }
  };

  const sync = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (hlRef.current) {
      hlRef.current.scrollTop = ta.scrollTop;
      hlRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutRef.current) gutRef.current.scrollTop = ta.scrollTop;
  };

  const updateCaret = () => {
    const ta = taRef.current;
    if (!ta) return;
    setCaretLine(ta.value.slice(0, ta.selectionStart).split("\n").length);
  };

  const lineCount = sql.split("\n").length;

  return (
    <div className="bud-sqlpanel">
      <div className="bud-ide-toolbar">
        <button
          className="bud-sql-run bud-tb-exec"
          title="Execute (⌘↵)"
          onClick={() => void run()}
          disabled={running || !connId}
        >
          <IconPlayerPlay size={15} stroke={1.8} />
        </button>
        <button className="bud-tb-exec" title="Execute as script" onClick={() => void run()} disabled={running || !connId}>
          <IconPlayerSkipForward size={15} stroke={1.8} />
        </button>
        <button title="Stop" disabled={!running}>
          <IconPlayerStop size={15} stroke={1.8} />
        </button>
        <span className="bud-tb-sep" />
        <button title="Commit" disabled>
          <IconCheck size={15} stroke={1.8} />
        </button>
        <button title="Rollback" disabled>
          <IconArrowBackUp size={15} stroke={1.8} />
        </button>
        <span className="bud-tb-sep" />
        <button title="Format SQL" onClick={() => setSql(formatSql(sql))} disabled={!sql.trim()}>
          <IconAlignLeft size={15} stroke={1.8} />
        </button>
        <button title="Re-run" onClick={() => void run()} disabled={running || !connId}>
          <IconRefresh size={15} stroke={1.8} />
        </button>
        <button title="Explain plan" disabled={!sql.trim()}>
          <IconFileCode size={15} stroke={1.8} />
        </button>
        <button title="Clear editor" onClick={() => setSql("")} disabled={!sql}>
          <IconEraser size={15} stroke={1.8} />
        </button>
      </div>

      <div className="bud-connbar">
        <label className="bud-cb-field grow">
          <span className="bud-cb-label">Database Connection</span>
          <select
            className="bud-cb-select"
            value={connId ?? ""}
            onChange={(e) => {
              if (e.target.value && e.target.value !== connId) void openAndIntrospect(e.target.value);
            }}
          >
            {!connId && <option value="">No connection</option>}
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="bud-cb-check">
          <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} />
          <span>Sticky Database</span>
        </label>
        <label className="bud-cb-field grow">
          <span className="bud-cb-label">Schema</span>
          <select className="bud-cb-select" defaultValue={schemaName}>
            <option>{schemaName}</option>
          </select>
        </label>
        <label className="bud-cb-field sm">
          <span className="bud-cb-label">Max Rows</span>
          <input className="bud-cb-input" value={maxRows} onChange={(e) => setMaxRows(e.target.value)} />
        </label>
        <label className="bud-cb-field sm">
          <span className="bud-cb-label">Max Chars</span>
          <input className="bud-cb-input" value={maxChars} onChange={(e) => setMaxChars(e.target.value)} />
        </label>
      </div>

      <div className="bud-sql-editor-wrap">
        <div className="bud-sql-code">
          <div className="bud-sql-gutter" ref={gutRef} aria-hidden>
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i} className={i + 1 === caretLine ? "cur" : ""}>
                {i + 1}
              </span>
            ))}
          </div>
          <div className="bud-sql-edit">
            <pre
              className="bud-sql-hl"
              ref={hlRef}
              aria-hidden
              // biome-ignore lint/security/noDangerouslySetInnerHtml: tokens are HTML-escaped in highlightSql
              dangerouslySetInnerHTML={{ __html: `${highlightSql(sql)}\n` }}
            />
            <textarea
              ref={taRef}
              className="bud-sql-editor"
              value={sql}
              spellCheck={false}
              wrap="off"
              onScroll={sync}
              onChange={(e) => {
                setSql(e.target.value);
                updateCaret();
              }}
              onClick={updateCaret}
              onKeyUp={updateCaret}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run();
              }}
            />
          </div>
        </div>
        <div className="bud-sql-bar">
          <span className="bud-ed-status">
            {caretLine}/{lineCount} [{sql.length}]
          </span>
          <span className="bud-ed-mode">INS</span>
          <span className="bud-ed-spacer" />
          {running && <span className="bud-ed-running">Running…</span>}
          {res && !err && (
            <span className="bud-ed-meta">
              {res.rows.length} {res.rows.length === 1 ? "row" : "rows"} · {res.elapsedMs} ms
            </span>
          )}
          <span className="bud-ed-eol">LF</span>
          <span className="bud-ed-eol">Auto Commit: ON</span>
          <span className="bud-ed-eol">UTF-8</span>
        </div>
      </div>

      <div className="bud-sql-results">
        <div className="bud-results-tabs">
          <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>
            Log
          </button>
          <button className={tab === "dbms" ? "on" : ""} onClick={() => setTab("dbms")}>
            DBMS Output
          </button>
          <button className={tab === "result" ? "on" : ""} onClick={() => setTab("result")}>
            {res ? `1: Result [${res.rows.length}]` : "Result"}
          </button>
        </div>
        <div className="bud-results-body">
          {tab === "log" ? (
            <div className="bud-results-log">
              {err
                ? `ERROR: ${err.message ?? err.kind}`
                : res
                  ? `OK — ${res.rows.length} ${res.rows.length === 1 ? "row" : "rows"} in ${res.elapsedMs} ms`
                  : "Ready."}
            </div>
          ) : tab === "dbms" ? (
            <div className="bud-results-log">No DBMS output.</div>
          ) : err ? (
            <div className="bud-error">⚠ {err.message ?? err.kind}</div>
          ) : res && res.columns.length > 0 ? (
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
          ) : res ? (
            <div className="bud-empty">Statement ran. {res.rowsAffected} rows affected.</div>
          ) : (
            <div className="bud-empty">Write SQL and press Run (⌘/Ctrl + ↵).</div>
          )}
        </div>
      </div>
    </div>
  );
}
