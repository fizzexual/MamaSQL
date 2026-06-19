import { useState } from "react";
import type { ColumnDef } from "../ipc/types";
import { useStore } from "../state/store";

const TYPES = [
  "INTEGER",
  "TEXT",
  "REAL",
  "BOOLEAN",
  "TIMESTAMP",
  "DATE",
  "VARCHAR(255)",
  "BIGINT",
  "DOUBLE",
  "SERIAL",
];

export function CreateTableModal({ onClose }: { onClose: () => void }) {
  const createTable = useStore((s) => s.createTable);
  const [name, setName] = useState("");
  const [cols, setCols] = useState<ColumnDef[]>([
    { name: "id", dataType: "INTEGER", nullable: false, primaryKey: true },
    { name: "", dataType: "TEXT", nullable: true, primaryKey: false },
  ]);

  const update = (i: number, patch: Partial<ColumnDef>) =>
    setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addCol = () =>
    setCols((cs) => [...cs, { name: "", dataType: "TEXT", nullable: true, primaryKey: false }]);
  const removeCol = (i: number) => setCols((cs) => cs.filter((_, j) => j !== i));

  const submit = async () => {
    const valid = cols.filter((c) => c.name.trim());
    if (!name.trim() || valid.length === 0) return;
    await createTable(name.trim(), valid);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">New table</div>
        <div className="modal-body">
          <input
            className="modal-name"
            placeholder="table_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="coldef coldef-head">
            <span>Column</span>
            <span>Type</span>
            <span>Null</span>
            <span>PK</span>
            <span />
          </div>
          {cols.map((c, i) => (
            <div className="coldef" key={i}>
              <input
                placeholder="name"
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <select value={c.dataType} onChange={(e) => update(i, { dataType: e.target.value })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="checkbox"
                checked={c.nullable}
                onChange={(e) => update(i, { nullable: e.target.checked })}
              />
              <input
                type="checkbox"
                checked={c.primaryKey}
                onChange={(e) => update(i, { primaryKey: e.target.checked })}
              />
              <button className="icon-btn danger" title="Remove" onClick={() => removeCol(i)}>
                ✕
              </button>
            </div>
          ))}
          <button className="add-col" onClick={addCol}>
            ＋ Add column
          </button>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={submit}>
            Create table
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
