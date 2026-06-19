import { useMemo, useState } from "react";
import { useStore } from "../../state/store";

type Col = { name: string; dataType: string };
type Kind = "number" | "date" | "datetime" | "bool" | "select" | "textarea" | "text";

function fieldKind(col: Col, samples: unknown[]): Kind {
  const t = col.dataType.toUpperCase();
  const name = col.name.toLowerCase();
  if (/BOOL/.test(t)) return "bool";
  if (/INT|SERIAL|NUM|DEC|REAL|FLOAT|DOUBLE|BIGINT/.test(t)) return "number";
  if (/TIMESTAMP|DATETIME/.test(t)) return "datetime";
  if (/DATE/.test(t)) return "date";
  const nonNull = samples.filter((v) => v != null).map(String);
  // Value-based date detection (TEXT columns that actually hold ISO dates).
  if (nonNull.length > 0 && nonNull.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))) return "date";
  if (nonNull.length > 0 && nonNull.every((s) => /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s))) return "datetime";
  if (/(comment|description|note|body|content|message|summary|bio|address)/.test(name)) return "textarea";
  const distinct = new Set(nonNull);
  if (distinct.size > 0 && distinct.size <= 12 && [...distinct].every((s) => s.length <= 28)) return "select";
  const maxLen = Math.max(0, ...nonNull.map((s) => s.length));
  if (/TEXT|CLOB/.test(t) && maxLen > 60) return "textarea";
  return "text";
}

function FieldInput({
  kind,
  value,
  disabled,
  samples,
  onChange,
}: {
  kind: Kind;
  value: unknown;
  disabled: boolean;
  samples: unknown[];
  onChange: (v: unknown) => void;
}) {
  const s = value == null ? "" : String(value);

  if (kind === "bool") {
    const checked = value === true || s === "true" || s === "1" || s === "t";
    return (
      <label className="insp-bool">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="bud-switch" />
        <span className="insp-bool-val">{checked ? "true" : "false"}</span>
      </label>
    );
  }

  if (kind === "select") {
    const distinct = [...new Set(samples.filter((v) => v != null).map(String))];
    if (s !== "" && !distinct.includes(s)) distinct.unshift(s);
    return (
      <select className="insp-input" value={s} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {distinct.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    );
  }

  if (kind === "textarea") {
    return (
      <textarea
        className="insp-input insp-textarea"
        value={s}
        rows={3}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  let inputType = kind === "number" ? "number" : kind === "date" ? "date" : kind === "datetime" ? "datetime-local" : "text";
  let inputVal = s;
  if (kind === "date") {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) inputVal = s.slice(0, 10);
    else if (s !== "") inputType = "text";
  } else if (kind === "datetime") {
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) inputVal = s.slice(0, 16).replace(" ", "T");
    else if (s !== "") inputType = "text";
  }
  return (
    <input
      className="insp-input"
      type={inputType}
      value={inputVal}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function RowInspector() {
  const result = useStore((s) => s.result);
  const editTable = useStore((s) => s.editTable);
  const inspectorRow = useStore((s) => s.inspectorRow);
  const closeInspector = useStore((s) => s.closeInspector);
  const editCell = useStore((s) => s.editCell);
  const deleteRowAt = useStore((s) => s.deleteRowAt);

  const pkCol = editTable?.pkColumn ?? null;
  const pkIdx = useMemo(
    () => (pkCol && result ? result.columns.findIndex((c) => c.name === pkCol) : -1),
    [pkCol, result],
  );
  const samplesByCol = useMemo(
    () => (result ? result.columns.map((_, ci) => result.rows.map((r) => r[ci])) : []),
    [result],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const d: Record<string, unknown> = {};
    if (result && inspectorRow != null && result.rows[inspectorRow]) {
      result.columns.forEach((c, i) => (d[c.name] = result.rows[inspectorRow][i]));
    }
    return d;
  });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"settings" | "styles">("settings");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [labelLeft, setLabelLeft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!result || !editTable || inspectorRow == null || inspectorRow >= result.rows.length) return null;
  const row = result.rows[inspectorRow];
  const canEdit = !!pkCol && pkIdx >= 0;
  const pkValue = pkIdx >= 0 ? row[pkIdx] : null;

  const set = (name: string, v: unknown) => {
    setDraft((d) => ({ ...d, [name]: v }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    for (let ci = 0; ci < result.columns.length; ci++) {
      if (ci === pkIdx) continue;
      const name = result.columns[ci].name;
      if (String(draft[name] ?? "") !== String(row[ci] ?? "")) {
        await editCell(inspectorRow, ci, draft[name]);
      }
    }
    setBusy(false);
    setSaved(true);
  };

  const del = async () => {
    if (window.confirm("Delete this row? This permanently removes it.")) await deleteRowAt(inspectorRow);
  };

  return (
    <aside className={`bud-inspector dens-${density} ${labelLeft ? "label-left" : ""}`}>
      <div className="insp-head">
        <span className="insp-title">
          <span className="insp-ic">▤</span> Edit row
        </span>
        <button className="insp-close" title="Close" onClick={closeInspector}>
          ✕
        </button>
      </div>

      <div className="insp-tabs">
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Settings
        </button>
        <button className={tab === "styles" ? "active" : ""} onClick={() => setTab("styles")}>
          Styles
        </button>
      </div>

      {tab === "settings" ? (
        <div className="insp-body">
          <div className="insp-meta">
            <span className="insp-table">
              <span className="bud-bc-ic">▦</span>
              {editTable.table}
            </span>
            {pkValue != null && (
              <span className="insp-pk">
                {pkCol} = {String(pkValue)}
              </span>
            )}
          </div>

          {!canEdit && <div className="insp-warn">⚠ No primary key — this table is read-only.</div>}

          <div className="insp-fields">
            {result.columns.map((col, ci) => {
              if (hidden.has(col.name)) return null;
              const isPk = ci === pkIdx;
              return (
                <label className="insp-field" key={col.name}>
                  <span className="insp-label">
                    {col.name}
                    {isPk && <span className="insp-pk-tag">PK</span>}
                  </span>
                  <FieldInput
                    kind={fieldKind(col, samplesByCol[ci] ?? [])}
                    value={draft[col.name]}
                    disabled={isPk || !canEdit}
                    samples={samplesByCol[ci] ?? []}
                    onChange={(v) => set(col.name, v)}
                  />
                </label>
              );
            })}
          </div>

          <div className="insp-section">Fields</div>
          <div className="insp-toggles">
            {result.columns.map((col) => (
              <label className="insp-toggle" key={col.name}>
                <span className="insp-grip">⠿</span>
                <span className="insp-toggle-name">{col.name}</span>
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
            ))}
          </div>
        </div>
      ) : (
        <div className="insp-body">
          <div className="insp-section">Density</div>
          <div className="insp-seg">
            <button className={density === "comfortable" ? "active" : ""} onClick={() => setDensity("comfortable")}>
              Comfortable
            </button>
            <button className={density === "compact" ? "active" : ""} onClick={() => setDensity("compact")}>
              Compact
            </button>
          </div>
          <div className="insp-section">Label position</div>
          <div className="insp-seg">
            <button className={!labelLeft ? "active" : ""} onClick={() => setLabelLeft(false)}>
              Top
            </button>
            <button className={labelLeft ? "active" : ""} onClick={() => setLabelLeft(true)}>
              Left
            </button>
          </div>
        </div>
      )}

      <div className="insp-actions">
        <button className="insp-del" onClick={del} disabled={!canEdit}>
          Delete
        </button>
        <div className="spacer" />
        {saved && <span className="insp-saved">✓ Saved</span>}
        <button className="insp-save" onClick={save} disabled={!canEdit || busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </aside>
  );
}
