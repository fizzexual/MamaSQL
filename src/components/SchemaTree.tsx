import { useState } from "react";
import { CreateTableModal } from "./CreateTableModal";
import { useStore } from "../state/store";

export function SchemaTree() {
  const tables = useStore((s) => s.schema.tables);
  const activeId = useStore((s) => s.activeConnectionId);
  const [creating, setCreating] = useState(false);

  if (!activeId) {
    return (
      <section className="panel grow">
        <div className="panel-head">Schema</div>
        <div className="empty">Connect to browse tables.</div>
      </section>
    );
  }

  return (
    <section className="panel grow">
      <div className="panel-head">
        <span>Tables</span>
        <button className="icon-btn" title="New table" onClick={() => setCreating(true)}>
          ＋
        </button>
      </div>
      <ul className="tree">
        {tables.map((t) => (
          <TableNode key={t.name} name={t.name} kind={t.kind} />
        ))}
      </ul>
      {creating && <CreateTableModal onClose={() => setCreating(false)} />}
    </section>
  );
}

function TableNode({ name, kind }: { name: string; kind: string }) {
  const [open, setOpen] = useState(false);
  const expandTable = useStore((s) => s.expandTable);
  const columns = useStore((s) => s.schema.columnsByTable[name]);
  const setSql = useStore((s) => s.setSql);
  const openTableData = useStore((s) => s.openTableData);
  const dropTable = useStore((s) => s.dropTable);

  const toggle = async () => {
    if (!open) await expandTable(name);
    setOpen((v) => !v);
  };

  return (
    <li>
      <div className="tree-row">
        <button className="tree-toggle" onClick={toggle}>
          {open ? "▾" : "▸"}
        </button>
        <span className="tree-icon">{kind === "view" ? "◫" : "▦"}</span>
        <button className="tree-label" onClick={toggle}>
          {name}
        </button>
        <button
          className="mini"
          title="Query this table"
          onClick={() => setSql(`SELECT * FROM ${name} LIMIT 100;`)}
        >
          ⌁
        </button>
        <button className="mini" title="Edit data" onClick={() => openTableData(name)}>
          ✎
        </button>
        <button
          className="mini danger"
          title="Drop table"
          onClick={() => {
            if (window.confirm(`Drop table ${name}? This cannot be undone.`)) void dropTable(name);
          }}
        >
          🗑
        </button>
      </div>
      {open && columns && (
        <ul className="cols">
          {columns.map((c) => (
            <li key={c.name} className="col">
              <span className="col-name">
                {c.isPrimaryKey && <span className="pk" title="Primary key">🔑</span>}
                {c.name}
              </span>
              <span className="col-type">{c.dataType}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
