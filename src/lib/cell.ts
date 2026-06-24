// Turn a raw query cell into display text.
//
// Postgres jsonb/json and MySQL json columns come back from the driver as parsed
// objects/arrays; binary columns (bytea/BLOB) come back as Buffer-shaped objects
// or byte arrays. Rendering those with String() yields "[object Object]" or hides
// the value, so normalize them here: objects/arrays -> JSON text, binary -> its
// decoded UTF-8 text when printable (often JSON/text stored as bytes) else a hex
// dump. Primitives and null pass through untouched.

function bufferBytes(v: unknown): number[] | null {
  if (v instanceof Uint8Array) return Array.from(v);
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as { type?: unknown; data?: unknown } & Record<string, unknown>;
  // Node Buffer serialized to JSON: { type: "Buffer", data: [...] } (pg/mysql).
  if (o.type === "Buffer" && Array.isArray(o.data)) return o.data as number[];
  // Uint8Array serialized to JSON: { "0": b, "1": b, ... } (sql.js BLOBs). Only
  // treat dense, sequential, byte-valued keys as bytes so real JSON objects (with
  // meaningful string keys) keep rendering as JSON.
  const keys = Object.keys(o);
  if (
    keys.length > 0 &&
    keys.every((k, i) => k === String(i)) &&
    keys.every((k) => {
      const n = o[k];
      return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255;
    })
  ) {
    return keys.map((k) => o[k] as number);
  }
  return null;
}

function isPrintable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0xfffd) return false; // invalid UTF-8 (replacement char) -> treat as binary
    if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) return false; // control char (allow tab/LF/CR)
  }
  return true;
}

function bytesToText(bytes: number[]): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(bytes));
    if (text.length && isPrintable(text)) return text;
  } catch {
    /* fall through to hex */
  }
  const hex = bytes.slice(0, 64).map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("");
  return bytes.length > 64 ? `0x${hex}… (${bytes.length} bytes)` : `0x${hex}`;
}

/** Normalize one cell value to a display-ready primitive (string/number/bool/null). */
export function cellToDisplay(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  const bytes = bufferBytes(v);
  if (bytes) return bytesToText(bytes);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Normalize every cell in a result's rows; returns the same object if nothing changed. */
export function displayRows(rows: unknown[][]): unknown[][] {
  let touched = false;
  const out = rows.map((row) =>
    row.map((cell) => {
      const t = cellToDisplay(cell);
      if (t !== cell) touched = true;
      return t;
    }),
  );
  return touched ? out : rows;
}
