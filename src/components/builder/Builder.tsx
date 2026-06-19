import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../state/store";
import { FieldInput, fieldKind } from "../bud/fieldInput";

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

export function Builder() {
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const tables = useStore((s) => s.schema.tables);
  const editTable = useStore((s) => s.editTable);
  const result = useStore((s) => s.result);
  const loadingResult = useStore((s) => s.loadingResult);
  const openTableData = useStore((s) => s.openTableData);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const editCell = useStore((s) => s.editCell);
  const loadConnections = useStore((s) => s.loadConnections);
  const scanLocal = useStore((s) => s.scanLocal);

  const [tab, setTab] = useState<"data" | "design" | "automation" | "settings">("design");
  const [propsTab, setPropsTab] = useState<"settings" | "styles" | "conditions">("settings");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [formType, setFormType] = useState<"create" | "update" | "view">("view");
  const [title, setTitle] = useState("Edit row");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState(0);

  // Bootstrap: load saved connections, then open the first connection + table so
  // the canvas is populated with real data on first paint.
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
  useEffect(() => setSelectedRow(0), [editTable?.table]);

  const samplesByCol = useMemo(
    () => (result ? result.columns.map((_, ci) => result.rows.map((r) => r[ci])) : []),
    [result],
  );
  const pkCol = editTable?.pkColumn ?? null;
  const pkIdx = result && pkCol ? result.columns.findIndex((c) => c.name === pkCol) : -1;
  const row = result && result.rows[selectedRow] ? result.rows[selectedRow] : null;
  const appName = connections.find((c) => c.id === activeId)?.name ?? "MamaSQL";
  const tableName = editTable?.table ?? "table";
  const editable = formType !== "view" && pkIdx >= 0;

  const pillFor = (v: unknown) => {
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

  return (
    <div className="bld">
      {/* ---------- Top bar ---------- */}
      <header className="bld-top">
        <div className="bld-top-l">
          <button className="bld-back" title="Back">
            ‹
          </button>
          <nav className="bld-toptabs">
            {(["data", "design", "automation", "settings"] as const).map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
        </div>
        <div className="bld-top-c">{appName}</div>
        <div className="bld-top-r">
          <span className="bld-ava">R</span>
          <button className="bld-naction">
            <span>◍</span> Users
          </button>
          <button className="bld-naction">
            <span>▷</span> Preview
          </button>
          <button className="bld-publish">
            <span className="bld-bb">◆</span> Publish <span className="caret">▾</span>
          </button>
        </div>
      </header>

      <div className="bld-body">
        {/* ---------- Left: Screens + Components ---------- */}
        <aside className="bld-left">
          <div className="bld-pane">
            <div className="bld-pane-head">
              <span>Screens</span>
              <div className="bld-pane-actions">
                <button title="Search">⌕</button>
                <button title="Add">＋</button>
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
                  <span className="bld-screen-ic">▦</span>/{t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="bld-pane grow">
            <div className="bld-pane-head">
              <span>Components</span>
              <div className="bld-pane-actions">
                <button title="Add">＋</button>
              </div>
            </div>
            <div className="bld-pane-body">
              <div className="bld-comp">
                <span className="bld-comp-ic">▦</span>Screen
              </div>
              <div className="bld-comp lvl1">
                <span className="bld-comp-ic">≡</span>Navigation
              </div>
              <div className="bld-comp lvl1">
                <span className="bld-comp-ic">T</span>Table heading
              </div>
              <div className="bld-comp lvl1">
                <span className="bld-comp-ic">▦</span>
                {tableName} - Table
              </div>
              <div className="bld-comp lvl1">
                <span className="bld-comp-arrow">▸</span>
                <span className="bld-comp-ic">▤</span>New row side panel
              </div>
              <div className="bld-comp lvl1">
                <span className="bld-comp-arrow">▾</span>
                <span className="bld-comp-ic">▤</span>Edit row side panel
              </div>
              <div className="bld-comp lvl2 active">
                <span className="bld-comp-ic">≣</span>Edit row form block
              </div>
            </div>
          </div>
        </aside>

        {/* ---------- Center: canvas ---------- */}
        <main className="bld-canvas-wrap">
          <div className="bld-canvas-bar">
            <button title="Undo">↺</button>
            <button title="Redo">↻</button>
            <div className="spacer" />
            <div className="bld-devices">
              {(["desktop", "tablet", "mobile"] as const).map((d) => (
                <button key={d} className={device === d ? "active" : ""} onClick={() => setDevice(d)} title={d}>
                  {d === "desktop" ? "🖥" : d === "tablet" ? "▭" : "▯"}
                </button>
              ))}
            </div>
          </div>

          <div className={`bld-canvas dev-${device}`}>
            <div className="bld-app">
              <div className="bld-app-head">
                <span className="bld-logo">◆</span>
                <span className="bld-app-name">{appName}</span>
              </div>
              <div className="bld-app-nav">{tableName}</div>

              <div className="bld-app-body">
                <h2 className="bld-h2">{tableName}</h2>

                {/* Data table */}
                <div className="bld-table-wrap">
                  {result && result.columns.length > 0 ? (
                    <table className="bld-table">
                      <thead>
                        <tr>
                          <th className="bld-th-check">
                            <input type="checkbox" />
                          </th>
                          {result.columns.map((c) => (
                            <th key={c.name}>
                              <span className="bld-th-ic">{typeIcon(c.dataType)}</span>
                              {c.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.slice(0, 8).map((r, ri) => (
                          <tr key={ri} className={ri === selectedRow ? "sel" : ""} onClick={() => setSelectedRow(ri)}>
                            <td className="bld-th-check">
                              <input type="checkbox" readOnly checked={ri === selectedRow} />
                            </td>
                            {r.map((cell, ci) => (
                              <td key={ci}>
                                {cell == null ? (
                                  <span className="bld-null">null</span>
                                ) : fieldKind(result.columns[ci], samplesByCol[ci] ?? []) === "select" ? (
                                  pillFor(cell)
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="bld-muted pad">{loadingResult ? "Loading…" : "No data"}</div>
                  )}
                </div>

                {/* Form block */}
                <div className="bld-formblock">
                  <div className="bld-formblock-tag">≣ Edit row form block</div>
                  <h3 className="bld-form-title">{title}</h3>
                  {result?.columns.map((col, ci) => {
                    if (hidden.has(col.name)) return null;
                    return (
                      <div className="bld-field" key={col.name}>
                        <label className="bld-field-label">{col.name}</label>
                        <FieldInput
                          className="bld-input"
                          kind={fieldKind(col, samplesByCol[ci] ?? [])}
                          value={row ? row[ci] : ""}
                          disabled={!editable || ci === pkIdx}
                          samples={samplesByCol[ci] ?? []}
                          onChange={(v) => {
                            if (editable && ci !== pkIdx) void editCell(selectedRow, ci, v);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* ---------- Right: properties ---------- */}
        <aside className="bld-props">
          <div className="bld-props-head">
            <span className="bld-props-ic">≣</span> Edit row form block
          </div>
          <div className="bld-props-tabs">
            {(["settings", "styles", "conditions"] as const).map((t) => (
              <button key={t} className={propsTab === t ? "active" : ""} onClick={() => setPropsTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {propsTab === "settings" ? (
            <div className="bld-props-body">
              <div className="bld-sec">General</div>
              <div className="bld-note">
                <span className="bld-note-ic">ⓘ</span>
                <div>
                  <strong>Form block</strong>
                  <p>Form blocks are only compatible with internal or SQL tables.</p>
                </div>
              </div>
              <div className="bld-row">
                <span className="bld-row-label">Data</span>
                <select
                  className="bld-prop-input"
                  value={editTable?.table ?? ""}
                  onChange={(e) => openTableData(e.target.value)}
                >
                  {tables.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bld-row top">
                <span className="bld-row-label">Type</span>
                <div className="bld-radios">
                  {(["create", "update", "view"] as const).map((t) => (
                    <label key={t} className="bld-radio">
                      <input type="radio" checked={formType === t} onChange={() => setFormType(t)} />
                      <span className="bld-radio-dot" />
                      {t[0].toUpperCase() + t.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="bld-sec collapse">
                Row ID <span className="bld-sec-x">—</span>
              </div>
              <a className="bld-link" href="#" onClick={(e) => e.preventDefault()}>
                How to pass a row ID using bindings
              </a>
              <div className="bld-row">
                <span className="bld-row-label">Row ID</span>
                <div className="bld-bind">
                  <input className="bld-prop-input" readOnly value={pkIdx >= 0 && row ? String(row[pkIdx]) : "{{ State.ID }}"} />
                  <span className="bld-bind-ic">⚡</span>
                </div>
              </div>
              <div className="bld-row">
                <span className="bld-row-label">No rows found</span>
                <div className="bld-bind">
                  <input className="bld-prop-input" defaultValue="We couldn't find a row to display" />
                  <span className="bld-bind-ic">⚡</span>
                </div>
              </div>

              <div className="bld-sec collapse">
                Details <span className="bld-sec-x">—</span>
              </div>
              <div className="bld-row">
                <span className="bld-row-label">Title</span>
                <div className="bld-bind">
                  <input className="bld-prop-input" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <span className="bld-bind-ic">⚡</span>
                </div>
              </div>
              <div className="bld-row">
                <span className="bld-row-label">Description</span>
                <div className="bld-bind">
                  <input className="bld-prop-input" placeholder="" />
                  <span className="bld-bind-ic">⚡</span>
                </div>
              </div>

              <div className="bld-row">
                <span className="bld-row-label">Fields</span>
                <input
                  type="checkbox"
                  className="bld-allfields"
                  checked={hidden.size === 0}
                  onChange={(e) => setHidden(e.target.checked ? new Set() : new Set(result?.columns.map((c) => c.name)))}
                />
                <span className="bud-switch" />
              </div>
              <div className="bld-fieldlist">
                {result?.columns.map((col) => (
                  <div className="bld-fielditem" key={col.name}>
                    <span className="bld-grip">⠿</span>
                    <span className="bld-gear">⚙</span>
                    <span className="bld-fieldname">{col.name}</span>
                    <label className="bld-fieldtoggle">
                      <input
                        type="checkbox"
                        checked={!hidden.has(col.name)}
                        onChange={(e) =>
                          setHidden((h) => {
                            const n = new Set(h);
                            if (e.target.checked) n.delete(col.name);
                            else n.add(col.name);
                            return n;
                          })
                        }
                      />
                      <span className="bud-switch" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bld-props-body">
              <div className="bld-muted pad">No {propsTab} options for this block.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
