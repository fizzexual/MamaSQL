import { useState } from "react";
import { type FilterOp, useStore } from "../../state/store";

const OPS: { value: FilterOp; label: string }[] = [
  { value: "=", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: ">", label: "greater than" },
  { value: "<", label: "less than" },
];

export function CreateViewModal({
  table,
  columns,
  onClose,
}: {
  table: string;
  columns: string[];
  onClose: () => void;
}) {
  const addView = useStore((s) => s.addView);
  const [name, setName] = useState(`${table} view`);
  const [filtered, setFiltered] = useState(true);
  const [column, setColumn] = useState(columns[0] ?? "");
  const [op, setOp] = useState<FilterOp>("=");
  const [value, setValue] = useState("");

  const save = () => {
    const filter = filtered && column ? { column, op, value } : null;
    addView(table, name.trim() || `${table} view`, filter);
    onClose();
  };

  return (
    <>
      <div className="bud-modal-backdrop" onClick={onClose} />
      <div className="bud-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bud-modal-head">Create a view</div>
        <div className="bud-modal-body">
          <label className="bud-field">
            <span>View name</span>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="bud-toggle">
            <input type="checkbox" checked={filtered} onChange={(e) => setFiltered(e.target.checked)} />
            <span className="bud-switch" />
            Filter rows
          </label>

          {filtered && (
            <div className="bud-filter-row">
              <select className="bud-filter-col" value={column} onChange={(e) => setColumn(e.target.value)}>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select className="bud-filter-op" value={op} onChange={(e) => setOp(e.target.value as FilterOp)}>
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                className="bud-filter-val"
                placeholder="value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="bud-modal-actions">
          <button className="bud-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="bud-modal-save" onClick={save}>
            Create view
          </button>
        </div>
      </div>
    </>
  );
}
