import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getBackend } from "../../ipc/backend";
import type { QueryResult } from "../../ipc/types";
import { download, fromCsv, toCsv } from "../../lib/csv";
import { fieldKind } from "../bud/fieldInput";
import { RowInspector } from "../bud/RowInspector";
import { useStore } from "../../state/store";

const backend = getBackend();

function typeIcon(t: string): string {
  const u = t.toUpperCase();
  if (/INT|SERIAL|NUM|DEC|REAL|FLOAT|DOUBLE|BIGINT/.test(u)) return "123";
  if (/DATE|TIME/.test(u)) return "📅";
  if (/BOOL/.test(u)) return "☑";
  return "T";
}

const PILL: [string, string][] = [
  ["#ede9fe", "#6d28d9"],
  ["#dcfce7", "#15803d"],
  ["#fef3c7", "#b45309"],
  ["#e0f2fe", "#0369a1"],
  ["#fce7f3", "#be185d"],
];

type Tab = "data" | "sql" | "structure" | "history";

export function Builder() {
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const tables = useStore((s) => s.schema.tables);
  const columnsByTable = useStore((s) => s.schema.columnsByTable);
  const editTable = useStore((s) => s.editTable);
  const result = useStore((s) => s.result);
  const loadingResult = useStore((s) => s.loadingResult);
  const inspectorRow = useStore((s) => s.inspectorRow);
  const history = useStore((s) => s.history);
  const detected = useStore((s) => s.detected);
  const error = useStore((s) => s.error);

  const loadConnections = useStore((s) => s.loadConnections);
  const scanLocal = useStore((s) => s.scanLocal);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const openTableData = useStore((s) => s.openTableData);
  const editCell = useStore((s) => s.editCell);
  const addRow = useStore((s) => s.addRow);
  const addColumn = useStore((s) => s.addColumn);
  const dropTable = useStore((s) => s.dropTable);
  const renameTable = useStore((s) => s.renameTable);
  const refresh = useStore((s) => s.refresh);
  const importCsv = useStore((s) => s.importCsv);
  const addDetected = useStore((s) => s.addDetected);
  const createLocalDatabase = useStore((s) => s.createLocalDatabase);
  const openInspector = useStore((s) => s.openInspector);
  const loadHistory = useStore((s) => s.loadHistory);
  const setStoreSql = useStore((s) => s.setSql);

  const [tab, setTab] = useState<Tab>("data");
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [newRow, setNewRow] = useState<string[] | null>(null);
  const [sqlText, setSqlText] = useState("SELECT 1;");
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConnections();
    scanLocal();
  }, [loadConnections, scanLocal]);
  useEffect(() => {
    if (!activeId && connections.length > 0) void openAndIntrospect(connections[0].id);
  }, [activeId, connections, openAndIntrospect]);
  useEffect(() => {
    if (activeId && !editTable && tables.length > 0) void openTableData(tables[0].name);
  }, [activeId, editTable, tables, openTableData]);
  useEffect(() => {
    if (editTable) setSqlText(`SELECT * FROM ${editTable.table} LIMIT 100;`);
  }, [editTable?.table]);
  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  const appName = connections.find((c) => c.id === activeId)?.name ?? "MamaSQL";
  const tableName = editTable?.table ?? "";
  const cols = editTable ? columnsByTable[editTable.table] ?? [] : [];
  const newDetections = detected.filter((d) => !connections.some((c) => c.id === d.id));
  const pkColName = editTable?.pkColumn ?? null;
  const pkIdx = result && pkColName ? result.columns.findIndex((c) => c.name === pkColName) : -1;
  const samplesByCol = useMemo(
    () => (result ? result.columns.map((_, ci) => result.rows.map((r) => r[ci])) : []),
    [result],
  );

  const startEdit = (r: number, c: number) => {
    if (!result || pkIdx < 0 || c === pkIdx) return;
    setEditing({ row: r, col: c });
    setDraft(result.rows[r][c] == null ? "" : String(result.rows[r][c]));
  };
  const commitEdit = () => {
    if (editing) void editCell(editing.row, editing.col, draft);
    setEditing(null);
  };
  const saveNewRow = () => {
    if (!newRow || !result) return;
    const cs: string[] = [];
    const vs: unknown[] = [];
    result.columns.forEach((c, i) => {
      if (newRow[i] !== "") {
        cs.push(c.name);
        vs.push(newRow[i]);
      }
    });
    void addRow(cs, vs);
    setNewRow(null);
  };
  const addColumnPrompt = () => {
    const n = window.prompt("New column name");
    if (!n?.trim()) return;
    const t = window.prompt("Type (TEXT, INTEGER, REAL, DATE…)", "TEXT")?.trim() || "TEXT";
    void addColumn(tableName, { name: n.trim(), dataType: t, nullable: true, primaryKey: false });
  };
  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !editTable) return;
    const { headers, rows } = fromCsv(await f.text());
    if (headers.length && rows.length) await importCsv(editTable.table, headers, rows);
  };
  const runSql = async () => {
    if (!activeId) return;
    setSqlRunning(true);
    setSqlError(null);
    try {
      const r = await backend.runQuery(activeId, sqlText);
      setSqlResult(r);
      setStoreSql(sqlText);
      void loadHistory();
    } catch (e) {
      const m = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : String(e);
      setSqlError(m);
      setSqlResult(null);
    }
    setSqlRunning(false);
  };

  const pill = (v: unknown) => {
    const s = String(v);
    let h = 0;
    for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
    const [bg, fg] = PILL[h % PILL.length];
    return (
      <span className="bld-pill" style={{ background: bg, color: fg }}>
        {s}
      </span>
    );
  };
  const renderCell = (cell: unknown, ci: number) =>
    cell == null ? (
      <span className="bld-null">null</span>
    ) : result && fieldKind(result.columns[ci], samplesByCol[ci] ?? []) === "select" ? (
      pill(cell)
    ) : (
      String(cell)
    );

  return (
    <div className="bld">
      {/* ---------- Top bar ---------- */}
      <header className="bld-top">
        <div className="bld-top-l">
          <span className="bld-logo2">◆ MamaSQL</span>
          <nav className="bld-toptabs">
            {(["data", "sql", "structure", "history"] as const).map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t === "sql" ? "SQL" : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
        </div>
        <div className="bld-top-c">{appName}</div>
        <div className="bld-top-r">
          <button className="bld-naction" onClick={() => void refresh()} title="Refresh data">
            <span>⟳</span> Refresh
          </button>
          <span className="bld-ava">M</span>
        </div>
      </header>

      <div className="bld-body">
        {/* ---------- Left: tables + columns ---------- */}
        <aside className="bld-left">
          <div className="bld-pane">
            <div className="bld-pane-head">
              <span>Tables</span>
              <div className="bld-pane-actions">
                <button
                  title="New local database"
                  onClick={() => {
                    const n = window.prompt("New local database name", "scratch");
                    if (n) void createLocalDatabase(n);
                  }}
                >
                  ＋
                </button>
              </div>
            </div>
            <div className="bld-pane-body">
              {tables.length === 0 && <div className="bld-muted">No tables</div>}
              {tables.map((t) => (
                <button
                  key={t.name}
                  className={`bld-screen ${editTable?.table === t.name ? "active" : ""}`}
                  onClick={() => openTableData(t.name)}
                >
                  <span className="bld-screen-ic">{t.kind === "view" ? "◫" : "▦"}</span>
                  {t.name}
                </button>
              ))}
              {newDetections.length > 0 && (
                <div className="bld-detected">
                  <div className="bld-detected-head">Found locally</div>
                  {newDetections.map((d) => (
                    <div className="bld-detrow" key={d.id}>
                      <span className={`dot ${d.engine}`} />
                      <span className="bld-detname">{d.name}</span>
                      <button className="bld-detadd" onClick={() => addDetected(d)}>
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="bld-pane grow">
            <div className="bld-pane-head">
              <span>Columns</span>
            </div>
            <div className="bld-pane-body">
              {cols.length === 0 && <div className="bld-muted">Select a table</div>}
              {cols.map((c) => (
                <div className="bld-col" key={c.name}>
                  <span className="bld-col-ic">{typeIcon(c.dataType)}</span>
                  <span className="bld-col-name">{c.name}</span>
                  {c.isPrimaryKey && <span className="bld-col-pk">PK</span>}
                  <span className="bld-col-type">{c.dataType.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ---------- Center: canvas ---------- */}
        <main className="bld-canvas-wrap">
          <div className="bld-canvas">
            <div className="bld-sheet">
              {tab === "data" && (
                <>
                  <div className="bld-sheet-bar">
                    <div className="bld-sheet-title">
                      <span className="bld-th-ic" style={{ marginRight: 8 }}>
                        ▦
                      </span>
                      {tableName || "No table"}
                    </div>
                    <div className="bld-sheet-tools">
                      <button onClick={() => void refresh()}>⟳ Refresh</button>
                      <button onClick={() => fileRef.current?.click()}>⤓ Import</button>
                      <button disabled={!result} onClick={() => result && download(`${tableName}.csv`, toCsv(result))}>
                        ⤒ Export
                      </button>
                      <button onClick={addColumnPrompt}>＋ Column</button>
                      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onImport} />
                    </div>
                  </div>
                  {error && <div className="bld-err">⚠ {error.message ?? error.kind}</div>}
                  <div className="bld-table-wrap">
                    {loadingResult ? (
                      <div className="bld-muted pad">Loading…</div>
                    ) : result && result.columns.length > 0 ? (
                      <table className="bld-table editable">
                        <thead>
                          <tr>
                            <th className="bld-th-check">#</th>
                            {result.columns.map((c) => (
                              <th key={c.name}>
                                <span className="bld-th-ic">{typeIcon(c.dataType)}</span>
                                {c.name}
                              </th>
                            ))}
                            <th className="bld-addcol">
                              <button title="Add column" onClick={addColumnPrompt}>
                                ＋
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {newRow && (
                            <tr className="bld-new">
                              <td className="bld-th-check">
                                <button onClick={() => setNewRow(null)}>✕</button>
                              </td>
                              {result.columns.map((c, i) => (
                                <td key={i}>
                                  <input
                                    className="bld-cell-input"
                                    placeholder={c.name}
                                    value={newRow[i]}
                                    onChange={(e) =>
                                      setNewRow((nr) => (nr ? nr.map((v, j) => (j === i ? e.target.value : v)) : nr))
                                    }
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
                          {result.rows.map((r, ri) => (
                            <tr key={ri} className={ri === inspectorRow ? "sel" : ""}>
                              <td className="bld-th-check bld-rn">
                                <span className="bld-rn-num">{ri + 1}</span>
                                <button className="bld-rn-exp" title="Edit row" onClick={() => openInspector(ri)}>
                                  ⤢
                                </button>
                              </td>
                              {r.map((cell, ci) => (
                                <td key={ci} onDoubleClick={() => startEdit(ri, ci)}>
                                  {editing && editing.row === ri && editing.col === ci ? (
                                    <input
                                      className="bld-cell-input"
                                      autoFocus
                                      value={draft}
                                      onChange={(e) => setDraft(e.target.value)}
                                      onBlur={commitEdit}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") commitEdit();
                                        if (e.key === "Escape") setEditing(null);
                                      }}
                                    />
                                  ) : (
                                    renderCell(cell, ci)
                                  )}
                                </td>
                              ))}
                              <td />
                            </tr>
                          ))}
                          <tr className="bld-addrow">
                            <td className="bld-th-check">
                              <button title="Add row" onClick={() => setNewRow(result.columns.map(() => ""))}>
                                ＋
                              </button>
                            </td>
                            <td colSpan={result.columns.length + 1} />
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <div className="bld-muted pad">{tableName ? "Empty table" : "Pick a table on the left"}</div>
                    )}
                  </div>
                </>
              )}

              {tab === "sql" && (
                <div className="bld-sql">
                  <div className="bld-sheet-bar">
                    <div className="bld-sheet-title">SQL query</div>
                    <div className="bld-sheet-tools">
                      <button className="bld-run" onClick={runSql} disabled={sqlRunning || !activeId}>
                        ▶ {sqlRunning ? "Running…" : "Run"}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="bld-sqltext"
                    value={sqlText}
                    spellCheck={false}
                    onChange={(e) => setSqlText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void runSql();
                    }}
                  />
                  {sqlError && <div className="bld-err">⚠ {sqlError}</div>}
                  <div className="bld-table-wrap">
                    {sqlResult && sqlResult.columns.length > 0 ? (
                      <table className="bld-table">
                        <thead>
                          <tr>
                            {sqlResult.columns.map((c) => (
                              <th key={c.name}>
                                <span className="bld-th-ic">{typeIcon(c.dataType)}</span>
                                {c.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sqlResult.rows.map((r, ri) => (
                            <tr key={ri}>
                              {r.map((cell, ci) => (
                                <td key={ci}>{cell == null ? <span className="bld-null">null</span> : String(cell)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="bld-muted pad">
                        {sqlResult ? `${sqlResult.rowsAffected} row(s) affected` : "Run a query to see results"}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "structure" && (
                <div className="bld-structure">
                  <div className="bld-sheet-bar">
                    <div className="bld-sheet-title">Structure — {tableName}</div>
                    <div className="bld-sheet-tools">
                      <button onClick={addColumnPrompt}>＋ Column</button>
                    </div>
                  </div>
                  <div className="bld-table-wrap">
                    <table className="bld-table">
                      <thead>
                        <tr>
                          <th>Column</th>
                          <th>Type</th>
                          <th>Nullable</th>
                          <th>Key</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cols.map((c) => (
                          <tr key={c.name}>
                            <td>
                              <span className="bld-th-ic">{typeIcon(c.dataType)}</span>
                              {c.name}
                            </td>
                            <td>{c.dataType}</td>
                            <td>{c.nullable ? "YES" : "NO"}</td>
                            <td>{c.isPrimaryKey ? pill("PRIMARY") : ""}</td>
                          </tr>
                        ))}
                        {cols.length === 0 && (
                          <tr>
                            <td colSpan={4} className="bld-muted">
                              Select a table to see its structure
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === "history" && (
                <div className="bld-history2">
                  <div className="bld-sheet-bar">
                    <div className="bld-sheet-title">Query history</div>
                  </div>
                  {history.length === 0 ? (
                    <div className="bld-muted pad">No queries yet</div>
                  ) : (
                    <div className="bld-histlist">
                      {history.map((h) => (
                        <button
                          key={h.id}
                          className="bld-histitem"
                          onClick={() => {
                            setSqlText(h.sql);
                            setTab("sql");
                          }}
                        >
                          <span className="bld-histsql">{h.sql}</span>
                          <span className="bld-histtime">{new Date(h.ranAt).toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ---------- Right: row editor / table info ---------- */}
        {inspectorRow != null ? (
          <RowInspector key={inspectorRow} />
        ) : (
          <aside className="bld-props">
            <div className="bld-props-head">
              <span className="bld-props-ic">▦</span> {tableName || "No table"}
            </div>
            <div className="bld-props-body">
              <div className="bld-sec">Table</div>
              <div className="bld-inforow">
                <span>Connection</span>
                <b>{appName}</b>
              </div>
              <div className="bld-inforow">
                <span>Rows loaded</span>
                <b>{result?.rows.length ?? 0}</b>
              </div>
              <div className="bld-inforow">
                <span>Columns</span>
                <b>{cols.length}</b>
              </div>
              <div className="bld-inforow">
                <span>Primary key</span>
                <b>{editTable?.pkColumn ?? "—"}</b>
              </div>

              <div className="bld-sec">Actions</div>
              <button className="bld-act" onClick={() => void refresh()}>
                ⟳ Refresh
              </button>
              <button
                className="bld-act"
                disabled={!editTable}
                onClick={() => {
                  if (!editTable) return;
                  const n = window.prompt("Rename table to", editTable.table);
                  if (n?.trim() && n.trim() !== editTable.table) void renameTable(editTable.table, n.trim());
                }}
              >
                ✎ Rename table…
              </button>
              <button
                className="bld-act danger"
                disabled={!editTable}
                onClick={() => {
                  if (!editTable) return;
                  if (window.confirm(`Drop table "${editTable.table}"? This permanently deletes it.`))
                    void dropTable(editTable.table);
                }}
              >
                🗑 Drop table…
              </button>
              <div className="bld-hint">Tip: click the ⤢ on a row to edit it as a form.</div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
