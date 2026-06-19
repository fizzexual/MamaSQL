import { useRef, useState, type ChangeEvent } from "react";
import { download, fromCsv, toCsv, toJson } from "../../lib/csv";
import { useStore } from "../../state/store";
import { ResultsPanel } from "../ResultsPanel";
import { SqlEditor } from "../SqlEditor";
import { DataGrid } from "./DataGrid";

function HistoryView() {
  const history = useStore((s) => s.history);
  const setSql = useStore((s) => s.setSql);
  const setView = useStore((s) => s.setView);
  if (history.length === 0)
    return <div className="bud-empty">No queries yet — run something from the SQL tab.</div>;
  return (
    <div className="bud-history">
      {history.map((h) => (
        <button
          key={h.id}
          className="bud-hist-item"
          onClick={() => {
            setSql(h.sql);
            setView("sql");
          }}
        >
          <span className="bud-hist-sql">{h.sql}</span>
          <span className="bud-hist-time">{new Date(h.ranAt).toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}

export function DataView() {
  const editTable = useStore((s) => s.editTable);
  const activeId = useStore((s) => s.activeConnectionId);
  const result = useStore((s) => s.result);
  const error = useStore((s) => s.error);
  const view = useStore((s) => s.view);
  const refresh = useStore((s) => s.refresh);
  const renameTable = useStore((s) => s.renameTable);
  const dropTable = useStore((s) => s.dropTable);
  const importCsv = useStore((s) => s.importCsv);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editTable) return;
    const { headers, rows } = fromCsv(await file.text());
    if (headers.length && rows.length) await importCsv(editTable.table, headers, rows);
  };

  const doRename = async () => {
    setMenuOpen(false);
    if (!editTable) return;
    const next = window.prompt("Rename table to", editTable.table);
    if (next?.trim() && next.trim() !== editTable.table) await renameTable(editTable.table, next.trim());
  };
  const doDrop = async () => {
    setMenuOpen(false);
    if (!editTable) return;
    if (window.confirm(`Drop table "${editTable.table}"? This permanently deletes the table and all its rows.`))
      await dropTable(editTable.table);
  };

  return (
    <main className="bud-main">
      <div className="bud-breadcrumb">
        <span className="bud-bc-table">
          <span className="bud-bc-ic">▦</span>
          {editTable ? editTable.table : "data"}
          {editTable && (
            <span className="bud-bc-menu-wrap">
              <button className="bud-bc-menu" title="Table actions" onClick={() => setMenuOpen((v) => !v)}>
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="bud-menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="bud-menu">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        void refresh();
                      }}
                    >
                      <span>⟳</span> Refresh
                    </button>
                    <button onClick={doRename}>
                      <span>✎</span> Rename table…
                    </button>
                    <button className="danger" onClick={doDrop}>
                      <span>🗑</span> Drop table…
                    </button>
                  </div>
                </>
              )}
            </span>
          )}
        </span>
        <span className="bud-bc-help">Browse, edit and manage this table's data.</span>
        <div className="spacer" />
      </div>

      {view === "data" && editTable && (
        <div className="bud-toolbar">
          <button className="bud-tool" onClick={() => void refresh()}>
            <span className="bud-tool-ic">⟳</span> Refresh
          </button>
          <button className="bud-tool" onClick={() => fileRef.current?.click()}>
            <span className="bud-tool-ic">⤓</span> Import CSV
          </button>
          <button
            className="bud-tool"
            disabled={!result}
            onClick={() => result && download(`${editTable.table}.csv`, toCsv(result))}
          >
            <span className="bud-tool-ic">⤒</span> Export CSV
          </button>
          <button
            className="bud-tool"
            disabled={!result}
            onClick={() => result && download(`${editTable.table}.json`, toJson(result))}
          >
            <span className="bud-tool-ic">{"{}"}</span> Export JSON
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onImportFile} />
        </div>
      )}

      {error && <div className="bud-error">⚠ {error.message ?? error.kind}</div>}

      {view === "sql" ? (
        <div className="bud-sqlpanel">
          <SqlEditor />
          <ResultsPanel />
        </div>
      ) : view === "history" ? (
        <HistoryView />
      ) : !activeId ? (
        <div className="bud-empty">Select a source on the left to browse its tables.</div>
      ) : !editTable ? (
        <div className="bud-empty">Pick a table on the left to view and edit its data.</div>
      ) : (
        <DataGrid />
      )}
    </main>
  );
}
