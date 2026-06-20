import { NumberInput, Select, Switch, Textarea, TextInput } from "@mantine/core";
import { fieldKind, type Col } from "../bud/fieldInput";

export function MantineField({
  col,
  value,
  samples,
  disabled,
  onChange,
}: {
  col: Col;
  value: unknown;
  samples: unknown[];
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const kind = fieldKind(col, samples);
  const s = value == null ? "" : String(value);

  if (kind === "bool") {
    const checked = value === true || s === "true" || s === "1" || s === "t";
    return (
      <Switch
        label={col.name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    );
  }

  if (kind === "select") {
    const data = [...new Set(samples.filter((v) => v != null).map(String))];
    if (s && !data.includes(s)) data.unshift(s);
    return (
      <Select
        label={col.name}
        data={data}
        value={s || null}
        disabled={disabled}
        searchable
        clearable
        size="sm"
        onChange={(v) => onChange(v ?? "")}
      />
    );
  }

  if (kind === "textarea") {
    return (
      <Textarea
        label={col.name}
        value={s}
        disabled={disabled}
        autosize
        minRows={2}
        maxRows={6}
        size="sm"
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }

  if (kind === "number") {
    return (
      <NumberInput
        label={col.name}
        value={s === "" ? "" : Number(s)}
        disabled={disabled}
        size="sm"
        hideControls
        onChange={(v) => onChange(v === "" ? "" : String(v))}
      />
    );
  }

  const type = kind === "date" ? "date" : kind === "datetime" ? "datetime-local" : "text";
  let val = s;
  if (kind === "date" && /^\d{4}-\d{2}-\d{2}/.test(s)) val = s.slice(0, 10);
  if (kind === "datetime" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) val = s.slice(0, 16).replace(" ", "T");
  return (
    <TextInput
      label={col.name}
      type={type}
      value={val}
      disabled={disabled}
      size="sm"
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}
