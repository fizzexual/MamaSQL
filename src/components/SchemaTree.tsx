import { useState } from "react";
import { useStore } from "../state/store";

export function SchemaTree() {
  const tables = useStore((s) => s.schema.tables);
  const activeId = useStore((s) => s.activeConnectionId);

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
      <div className="panel-head">Tables</div>
      <ul className="tree">
        {tables.map((t) => (
          <TableNode key={t.name} name={t.name} kind={t.kind} />
        ))}
      </ul>
    </section>
  );
}

function TableNode({ name, kind }: { name: string; kind: string }) {
  const [open, setOpen] = useState(false);
  const expandTable = useStore((s) => s.expandTable);
  const columns = useStore((s) => s.schema.columnsByTable[name]);
  const setSql = useStore((s) => s.setSql);

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
