import { useEffect, useState } from "react";
import type { Engine } from "../../ipc/types";
import { useStore } from "../../state/store";

function engineIcon(engine: Engine): string {
  if (engine === "postgres") return "🐘";
  if (engine === "mysql") return "🐬";
  return "🗄";
}

export function Sources({ onAddServer }: { onAddServer: () => void }) {
  const connections = useStore((s) => s.connections);
  const loadConnections = useStore((s) => s.loadConnections);
  const scanLocal = useStore((s) => s.scanLocal);

  useEffect(() => {
    loadConnections();
    scanLocal();
  }, [loadConnections, scanLocal]);

  return (
    <aside className="bud-sources">
      <div className="bud-sources-head">
        <span>Sources</span>
        <div className="bud-sources-actions">
          <button className="icon-btn" title="Search">
            ⌕
          </button>
          <button className="icon-btn" title="Add server" onClick={onAddServer}>
            ＋
          </button>
        </div>
      </div>
      <div className="bud-sources-list">
        <div className="bud-src static">
          <span className="bud-src-ic">◍</span> App users
        </div>
        <div className="bud-src static">
          <span className="bud-src-ic">🛡</span> Manage roles
        </div>
        {connections.map((c) => (
          <Datasource key={c.id} id={c.id} name={c.name} engine={c.engine} />
        ))}
      </div>
    </aside>
  );
}

function Datasource({ id, name, engine }: { id: string; name: string; engine: Engine }) {
  const [open, setOpen] = useState(true);
  const activeId = useStore((s) => s.activeConnectionId);
  const tables = useStore((s) => s.schema.tables);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const openTableData = useStore((s) => s.openTableData);
  const editTable = useStore((s) => s.editTable);
  const isActive = activeId === id;

  const toggle = async () => {
    if (!isActive) await openAndIntrospect(id);
    setOpen((v) => (isActive ? !v : true));
  };

  return (
    <div className="bud-ds">
      <div className="bud-src ds" onClick={toggle}>
        <span className="bud-ds-arrow">{isActive && open ? "▾" : "▸"}</span>
        <span className="bud-src-ic">{engineIcon(engine)}</span>
        <span className="bud-src-name">{name}</span>
      </div>
      {isActive && open && (
        <div className="bud-ds-tables">
          {tables.length === 0 && <div className="bud-ds-empty">No tables</div>}
          {tables.map((t) => (
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
      )}
    </div>
  );
}
