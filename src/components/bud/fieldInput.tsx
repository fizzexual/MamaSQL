export type Col = { name: string; dataType: string };
export type Kind = "number" | "date" | "datetime" | "bool" | "select" | "textarea" | "text";

export function fieldKind(col: Col, samples: unknown[]): Kind {
  const t = col.dataType.toUpperCase();
  const name = col.name.toLowerCase();
  if (/BOOL/.test(t)) return "bool";
  if (/INT|SERIAL|NUM|DEC|REAL|FLOAT|DOUBLE|BIGINT/.test(t)) return "number";
  if (/TIMESTAMP|DATETIME/.test(t)) return "datetime";
  if (/DATE/.test(t)) return "date";
  const nonNull = samples.filter((v) => v != null).map(String);
  if (nonNull.length > 0 && nonNull.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))) return "date";
  if (nonNull.length > 0 && nonNull.every((s) => /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s))) return "datetime";
  if (/(comment|description|note|body|content|message|summary|bio|address)/.test(name)) return "textarea";
  const distinct = new Set(nonNull);
  if (distinct.size > 0 && distinct.size <= 12 && [...distinct].every((s) => s.length <= 28)) return "select";
  const maxLen = Math.max(0, ...nonNull.map((s) => s.length));
  if (/TEXT|CLOB/.test(t) && maxLen > 60) return "textarea";
  return "text";
}

export function FieldInput({
  kind,
  value,
  disabled,
  samples,
  className = "insp-input",
  onChange,
}: {
  kind: Kind;
  value: unknown;
  disabled: boolean;
  samples: unknown[];
  className?: string;
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
      <select className={className} value={s} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
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
        className={`${className} insp-textarea`}
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
      className={className}
      type={inputType}
      value={inputVal}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
