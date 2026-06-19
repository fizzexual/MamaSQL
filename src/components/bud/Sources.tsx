import { useEffect, useState } from "react";
import type { Engine } from "../../ipc/types";
import { useStore } from "../../state/store";

function engineIcon(engine: Engine): string {
  if (engine === "postgres") return "🐘";
  if (engine === "mysql") return "🐬";
  return "🗄";
}

export function Sources() {
  const connections = useStore((s) => s.connections);
  const loadConnections = useStore((s) => s.loadConnections);
  const detected = useStore((s) => s.detected);
  const scanLocal = useStore((s) => s.scanLocal);
  const addDetected = useStore((s) => s.addDetected);
  const createLocalDatabase = useStore((s) => s.createLocalDatabase);
  const [filter, setFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    loadConnections();
    scanLocal();
  }, [loadConnections, scanLocal]);

  const newDetections = detected.filter((d) => !connections.some((c) => c.id === d.id));

  return (
    <aside className="bud-sources">
      <div className="bud-sources-head">
        <span>Sources</span>
        <div className="bud-sources-actions">
          <button
            className={`icon-btn ${searchOpen ? "active" : ""}`}
            title="Filter tables"
            onClick={() => setSearchOpen((v) => !v)}
          >
            ⌕
          </button>
          <button
            className="icon-btn"
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
      {searchOpen && (
        <input
          className="bud-src-filter"
          autoFocus
          placeholder="Filter tables…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <div className="bud-sources-list">
        {connections.length === 0 && (
          <div className="bud-ds-empty">No sources yet — click ＋ above or add a detected one below.</div>
        )}
        {connections.map((c) => (
          <Datasource key={c.id} id={c.id} name={c.name} engine={c.engine} filter={filter} />
        ))}
        {newDetections.length > 0 && (
          <div className="bud-detected">
            <div className="bud-detected-head">Found locally</div>
            {newDetections.map((d) => (
              <div className="bud-src detected" key={d.id}>
                <span className={`dot ${d.engine}`} />
                <span className="bud-src-name">{d.name}</span>
                <button className="detected-add" onClick={() => addDetected(d)}>
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function Datasource({
  id,
  name,
  engine,
  filter,
}: {
  id: string;
  name: string;
  engine: Engine;
  filter: string;
}) {
  const [open, setOpen] = useState(true);
  const activeId = useStore((s) => s.activeConnectionId);
  const tables = useStore((s) => s.schema.tables);
  const loadingTables = useStore((s) => s.loadingTables);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const openTableData = useStore((s) => s.openTableData);
  const editTable = useStore((s) => s.editTable);
  const isActive = activeId === id;

  const toggle = async () => {
    if (!isActive) await openAndIntrospect(id);
    setOpen((v) => (isActive ? !v : true));
  };

  const shown = tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="bud-ds">
      <div className="bud-src ds" onClick={toggle}>
        <span className="bud-ds-arrow">{isActive && open ? "▾" : "▸"}</span>
        <span className="bud-src-ic">{engineIcon(engine)}</span>
        <span className="bud-src-name">{name}</span>
      </div>
      {isActive &&
        open &&
        (loadingTables ? (
          <div className="bud-ds-tables">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="bud-table skel" key={i}>
                <span className="sk sk-row" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="bud-ds-tables">
            {shown.length === 0 && <div className="bud-ds-empty">{filter ? "No match" : "No tables"}</div>}
            {shown.map((t) => (
              <div
                key={t.name}
                className={`bud-table ${editTable?.table === t.name ? "active" : ""}`}
                onClick={() => openTableData(t.name)}
              >
                <span className="bud-table-ic">{t.kind === "view" ? "◫" : "▦"}</span>
                {t.name}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
