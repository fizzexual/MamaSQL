import {
  IconAlignLeft,
  IconArrowBackUp,
  IconChartBar,
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconEraser,
  IconFileCode,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlayerStop,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTable,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBackend } from "../../ipc/backend";
import { download, toCsv, toJson } from "../../lib/csv";
import { promptDialog } from "../../state/dialog";
import type { AppError, Column, QueryResult } from "../../ipc/types";
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
const KW_LIST = [...KEYWORDS];

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
type Suggestion = { label: string; kind: "column" | "table" | "keyword"; detail?: string };

let _measureCtx: CanvasRenderingContext2D | null = null;
/** Pixel position of the caret inside a no-wrap monospace textarea. */
function caretXY(ta: HTMLTextAreaElement): { x: number; y: number } {
  const pos = ta.selectionStart;
  const upto = ta.value.slice(0, pos);
  const line = upto.split("\n").length - 1;
  const col = pos - (upto.lastIndexOf("\n") + 1);
  const cs = getComputedStyle(ta);
  const padL = Number.parseFloat(cs.paddingLeft) || 0;
  const padT = Number.parseFloat(cs.paddingTop) || 0;
  const fs = Number.parseFloat(cs.fontSize) || 12.5;
  const lh = cs.lineHeight.endsWith("px") ? Number.parseFloat(cs.lineHeight) : fs * 1.55;
  if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
  let cw = fs * 0.6;
  if (_measureCtx) {
    _measureCtx.font = `${cs.fontSize} ${cs.fontFamily}`;
    cw = _measureCtx.measureText("M").width || cw;
  }
  const rect = ta.getBoundingClientRect();
  return {
    x: rect.left + padL + col * cw - ta.scrollLeft,
    y: rect.top + padT + (line + 1) * lh - ta.scrollTop,
  };
}

export function SqlPanel() {
  const sql = useStore((s) => s.sql);
  const setSql = useStore((s) => s.setSql);
  const connId = useStore((s) => s.activeConnectionId);
  const connections = useStore((s) => s.connections);
  const conn = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const loadHistory = useStore((s) => s.loadHistory);
  const history = useStore((s) => s.history);
  const tables = useStore((s) => s.schema.tables);
  const columnsByTable = useStore((s) => s.schema.columnsByTable);
  const saveScript = useStore((s) => s.saveScript);
  const saveFavorite = useStore((s) => s.saveFavorite);

  const [res, setRes] = useState<QueryResult | null>(null);
  const [err, setErr] = useState<AppError | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>("result");
  const [sticky, setSticky] = useState(false);
  const [maxRows, setMaxRows] = useState("1000");
  const [maxChars, setMaxChars] = useState("-1");
  const [caretLine, setCaretLine] = useState(1);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [editorH, setEditorH] = useState<number | null>(null);
  const [ac, setAc] = useState<{ items: Suggestion[]; index: number; token: string; x: number; y: number } | null>(null);
  const [resultView, setResultView] = useState<"table" | "chart">("table");
  const [rowFilter, setRowFilter] = useState("");
  const [copied, setCopied] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLPreElement>(null);
  const gutRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const runId = useRef(0);

  const schemaName = conn?.engine === "postgres" ? "public" : conn?.database || "main";
  const explainPrefix = conn?.engine === "sqlite" ? "EXPLAIN QUERY PLAN " : "EXPLAIN ";

  const exec = async (text = sql) => {
    if (!connId || running) return;
    const id = ++runId.current;
    setRunning(true);
    setErr(null);
    try {
      const r = await getBackend().runQuery(connId, text);
      if (runId.current !== id) return; // superseded / stopped
      setRes(r);
      setSort(null);
      setTab("result");
      void loadHistory();
    } catch (e) {
      if (runId.current !== id) return;
      setErr(normalize(e));
      setRes(null);
      setTab("log");
    } finally {
      if (runId.current === id) setRunning(false);
    }
  };

  const stop = () => {
    runId.current++; // any in-flight result will be ignored
    setRunning(false);
  };

  const sync = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (hlRef.current) {
      hlRef.current.scrollTop = ta.scrollTop;
      hlRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutRef.current) gutRef.current.scrollTop = ta.scrollTop;
    if (ac) refreshAc();
  };

  const updateCaret = () => {
    const ta = taRef.current;
    if (!ta) return;
    setCaretLine(ta.value.slice(0, ta.selectionStart).split("\n").length);
  };

  const buildSuggestions = (token: string): Suggestion[] => {
    const tl = token.toLowerCase();
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const push = (s: Suggestion) => {
      const k = `${s.kind}:${s.label.toLowerCase()}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    };
    for (const t of tables) if (t.name.toLowerCase().startsWith(tl)) push({ label: t.name, kind: "table", detail: "table" });
    for (const [tbl, cols] of Object.entries(columnsByTable)) {
      for (const c of cols) {
        if (c.name.toLowerCase().startsWith(tl)) push({ label: c.name, kind: "column", detail: `${c.dataType} · ${tbl}` });
      }
    }
    for (const kw of KW_LIST) if (kw.toLowerCase().startsWith(tl)) push({ label: kw, kind: "keyword" });
    return out.slice(0, 10);
  };

  const refreshAc = () => {
    const ta = taRef.current;
    if (!ta) return setAc(null);
    const upto = ta.value.slice(0, ta.selectionStart);
    const token = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(upto)?.[1] ?? "";
    if (token.length < 1) return setAc(null);
    const items = buildSuggestions(token);
    if (items.length === 0 || (items.length === 1 && items[0].label.toLowerCase() === token.toLowerCase())) {
      return setAc(null);
    }
    const { x, y } = caretXY(ta);
    setAc((prev) => ({ items, index: prev ? Math.min(prev.index, items.length - 1) : 0, token, x, y }));
  };

  const accept = (s: Suggestion) => {
    const ta = taRef.current;
    if (!ta || !ac) return;
    const start = ta.selectionStart - ac.token.length;
    const next = `${sql.slice(0, start)}${s.label}${sql.slice(ta.selectionStart)}`;
    pendingCaret.current = start + s.label.length;
    setSql(next);
    setAc(null);
    ta.focus();
  };

  // Restore caret + sync the highlight scroll after an autocomplete insert.
  useEffect(() => {
    if (pendingCaret.current != null && taRef.current) {
      const ta = taRef.current;
      ta.selectionStart = ta.selectionEnd = pendingCaret.current;
      pendingCaret.current = null;
      updateCaret();
      sync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql]);

  const onSplitDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const wrap = wrapRef.current;
    const panel = panelRef.current;
    if (!wrap || !panel) return;
    const top = wrap.getBoundingClientRect().top;
    const move = (ev: MouseEvent) => {
      const bottom = panel.getBoundingClientRect().bottom;
      setEditorH(Math.max(120, Math.min(ev.clientY - top, bottom - top - 160)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const saveAs = async (kind: "script" | "favorite") => {
    if (!sql.trim()) return;
    const name = await promptDialog({
      title: kind === "script" ? "Save SQL script" : "Add to favorites",
      label: "Name",
      placeholder: kind === "script" ? "e.g. monthly report" : "e.g. active customers",
    });
    if (!name?.trim()) return;
    if (kind === "script") saveScript(name.trim(), sql);
    else saveFavorite(name.trim(), sql);
  };

  const lineCount = sql.split("\n").length;
  const cap = Number.parseInt(maxRows, 10);
  const limited = res ? (Number.isFinite(cap) && cap > 0 ? res.rows.length > cap : false) : false;

  const sortedRows = useMemo(() => {
    if (!res) return [];
    const rows = res.rows;
    if (!sort) return rows;
    const { col, dir } = sort;
    return [...rows].sort((a, b) => {
      const x = a[col];
      const y = b[col];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const nx = Number(x);
      const ny = Number(y);
      const bothNum = x !== "" && y !== "" && !Number.isNaN(nx) && !Number.isNaN(ny);
      return (bothNum ? nx - ny : String(x).localeCompare(String(y))) * dir;
    });
  }, [res, sort]);
  const shownRows = Number.isFinite(cap) && cap > 0 ? sortedRows.slice(0, cap) : sortedRows;
  const rf = rowFilter.trim().toLowerCase();
  const filteredRows = rf
    ? shownRows.filter((r) => r.some((c) => c != null && String(c).toLowerCase().includes(rf)))
    : shownRows;

  const toggleSort = (col: number) =>
    setSort((s) => (!s || s.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));

  const exportAs = (fmt: "csv" | "json") => {
    if (!res) return;
    const data = { ...res, rows: filteredRows };
    if (fmt === "csv") download("result.csv", toCsv(data));
    else download("result.json", toJson(data));
  };

  const copyMarkdown = () => {
    if (!res) return;
    const names = res.columns.map((c) => c.name);
    const head = `| ${names.join(" | ")} |`;
    const sep = `| ${names.map(() => "---").join(" | ")} |`;
    const body = filteredRows
      .map((r) => `| ${r.map((c) => (c == null ? "" : String(c).replace(/\|/g, "\\|"))).join(" | ")} |`)
      .join("\n");
    void navigator.clipboard
      ?.writeText([head, sep, body].join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <div className="bud-sqlpanel" ref={panelRef}>
      <div className="bud-ide-toolbar">
        <button className="bud-sql-run bud-tb-exec" title="Execute (⌘↵)" onClick={() => void exec()} disabled={running || !connId}>
          <IconPlayerPlay size={15} stroke={1.8} />
        </button>
        <button className="bud-tb-exec" title="Execute as script" onClick={() => void exec()} disabled={running || !connId}>
          <IconPlayerSkipForward size={15} stroke={1.8} />
        </button>
        <button title="Stop" onClick={stop} disabled={!running}>
          <IconPlayerStop size={15} stroke={1.8} />
        </button>
        <span className="bud-tb-sep" />
        <button title="Commit (auto-commit on)" disabled>
          <IconCheck size={15} stroke={1.8} />
        </button>
        <button title="Rollback (auto-commit on)" disabled>
          <IconArrowBackUp size={15} stroke={1.8} />
        </button>
        <span className="bud-tb-sep" />
        <button title="Format SQL" onClick={() => setSql(formatSql(sql))} disabled={!sql.trim()}>
          <IconAlignLeft size={15} stroke={1.8} />
        </button>
        <button title="Re-run" onClick={() => void exec()} disabled={running || !connId}>
          <IconRefresh size={15} stroke={1.8} />
        </button>
        <button title="Explain plan" onClick={() => void exec(explainPrefix + sql)} disabled={!sql.trim() || !connId}>
          <IconFileCode size={15} stroke={1.8} />
        </button>
        <span className="bud-tb-sep" />
        <button title="Save as script" onClick={() => void saveAs("script")} disabled={!sql.trim()}>
          <IconDeviceFloppy size={15} stroke={1.8} />
        </button>
        <button title="Add to favorites" onClick={() => void saveAs("favorite")} disabled={!sql.trim()}>
          <IconStar size={15} stroke={1.8} />
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

      <div className="bud-sql-editor-wrap" ref={wrapRef} style={editorH != null ? { flex: "none", height: editorH } : undefined}>
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
                requestAnimationFrame(refreshAc);
              }}
              onClick={() => {
                updateCaret();
                setAc(null);
              }}
              onKeyUp={(e) => {
                if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Tab", "Escape"].includes(e.key)) {
                  updateCaret();
                }
              }}
              onBlur={() => setTimeout(() => setAc(null), 120)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  setAc(null);
                  void exec();
                  return;
                }
                if (ac) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setAc({ ...ac, index: (ac.index + 1) % ac.items.length });
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setAc({ ...ac, index: (ac.index - 1 + ac.items.length) % ac.items.length });
                  } else if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    accept(ac.items[ac.index]);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setAc(null);
                  }
                } else if (e.key === " " && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  requestAnimationFrame(refreshAc);
                }
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

      <div className="bud-vsplit" onMouseDown={onSplitDown} title="Drag to resize" />

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
              {err && <div className="bud-log-line err">ERROR: {err.message ?? err.kind}</div>}
              {history.length === 0 && !err ? (
                <div className="bud-log-line">Ready.</div>
              ) : (
                history.map((h) => (
                  <div className="bud-log-line" key={h.id}>
                    <span className="bud-log-time">{new Date(h.ranAt).toLocaleTimeString()}</span>
                    <span className="bud-log-sql">{h.sql.replace(/\s+/g, " ").trim()}</span>
                  </div>
                ))
              )}
            </div>
          ) : tab === "dbms" ? (
            <div className="bud-results-log">No DBMS output.</div>
          ) : err ? (
            <div className="bud-error">⚠ {err.message ?? err.kind}</div>
          ) : res && res.columns.length > 0 ? (
            <>
              <div className="bud-res-toolbar">
                <div className="bud-res-seg">
                  <button className={resultView === "table" ? "on" : ""} title="Table view" onClick={() => setResultView("table")}>
                    <IconTable size={14} stroke={1.7} /> Table
                  </button>
                  <button className={resultView === "chart" ? "on" : ""} title="Chart view" onClick={() => setResultView("chart")}>
                    <IconChartBar size={14} stroke={1.7} /> Chart
                  </button>
                </div>
                <div className="bud-res-filter">
                  <IconSearch size={13} stroke={1.7} />
                  <input value={rowFilter} onChange={(e) => setRowFilter(e.target.value)} placeholder="Filter rows…" />
                </div>
                <button title="Re-run" onClick={() => void exec()} disabled={running || !connId}>
                  <IconRefresh size={14} stroke={1.7} />
                </button>
                <button title="Export to CSV" onClick={() => exportAs("csv")}>
                  <IconDownload size={14} stroke={1.7} /> CSV
                </button>
                <button title="Export to JSON" onClick={() => exportAs("json")}>
                  <IconDownload size={14} stroke={1.7} /> JSON
                </button>
                <button title="Copy as Markdown" onClick={copyMarkdown}>
                  <IconCopy size={14} stroke={1.7} /> {copied ? "Copied!" : "Copy MD"}
                </button>
                <span className="bud-res-meta">
                  {filteredRows.length.toLocaleString()} {filteredRows.length === 1 ? "row" : "rows"}
                  {limited ? ` (capped at ${cap})` : ""} · {res.elapsedMs} ms
                </span>
              </div>
              {resultView === "chart" ? (
                <ResultChart columns={res.columns} rows={filteredRows} />
              ) : (
                <div className="bud-grid-wrap">
                  <table className="bud-grid">
                    <thead>
                      <tr>
                        <th className="bud-rownum" />
                        {res.columns.map((c, i) => (
                          <th key={i} className={sort?.col === i ? "sorted" : ""}>
                            <button className="bud-th-sort" title={`Sort by ${c.name}`} onClick={() => toggleSort(i)}>
                              <span className="bud-th-name">{c.name}</span>
                              {sort?.col === i && <span className="bud-th-arrow">{sort.dir === 1 ? "↑" : "↓"}</span>}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, ri) => (
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
              )}
            </>
          ) : res ? (
            <div className="bud-empty">Statement ran. {res.rowsAffected} rows affected.</div>
          ) : (
            <div className="bud-empty">Write SQL and press Run (⌘/Ctrl + ↵).</div>
          )}
        </div>
      </div>

      {ac && ac.items.length > 0 && (
        <div className="bud-ac" style={{ left: ac.x, top: ac.y }} onMouseDown={(e) => e.preventDefault()}>
          {ac.items.map((s, i) => (
            <button
              key={`${s.kind}-${s.label}`}
              className={`bud-ac-item ${i === ac.index ? "on" : ""}`}
              onClick={() => accept(s)}
              onMouseEnter={() => setAc((p) => (p ? { ...p, index: i } : p))}
            >
              <span className={`bud-ac-kind ${s.kind}`}>
                {s.kind === "column" ? "C" : s.kind === "table" ? "T" : "K"}
              </span>
              <span className="bud-ac-label">{s.label}</span>
              {s.detail && <span className="bud-ac-detail">{s.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Instant horizontal bar chart of a result set — picks a numeric column and a label column. */
function ResultChart({ columns, rows }: { columns: Column[]; rows: unknown[][] }) {
  const isNum = (i: number) =>
    rows.length > 0 &&
    rows.some((r) => r[i] != null && String(r[i]).trim() !== "") &&
    rows.every((r) => r[i] == null || (String(r[i]).trim() !== "" && !Number.isNaN(Number(r[i]))));

  const idLike = (name: string) => /(^id$|_id$|^.*key$)/i.test(name);
  const numericIdxs = columns.map((_, i) => i).filter((i) => isNum(i));
  if (numericIdxs.length === 0) return <div className="bud-empty">No numeric column to chart.</div>;
  // Prefer a real measure over a primary/foreign key column.
  const valueIdx = numericIdxs.find((i) => !idLike(columns[i].name)) ?? numericIdxs[0];
  const textIdx = columns.findIndex((_, i) => i !== valueIdx && !isNum(i));
  const labelIdx = textIdx >= 0 ? textIdx : columns.findIndex((_, i) => i !== valueIdx);

  const data = rows.slice(0, 24).map((r, i) => ({
    label: labelIdx >= 0 && r[labelIdx] != null ? String(r[labelIdx]) : `#${i + 1}`,
    value: Number(r[valueIdx]) || 0,
  }));
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <div className="bud-chart">
      <div className="bud-chart-head">
        {columns[valueIdx].name}
        {labelIdx >= 0 ? ` by ${columns[labelIdx].name}` : ""}
        {rows.length > 24 ? ` · first 24 of ${rows.length}` : ""}
      </div>
      <div className="bud-chart-bars">
        {data.map((d, i) => (
          <div className="bud-chart-row" key={i}>
            <span className="bud-chart-label" title={d.label}>
              {d.label}
            </span>
            <span className="bud-chart-track">
              <span className="bud-chart-fill" style={{ width: `${(Math.abs(d.value) / max) * 100}%` }} />
            </span>
            <span className="bud-chart-val">{d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
