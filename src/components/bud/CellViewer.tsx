import { IconCopy, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "../../state/toast";

/** Parse a string as JSON only if it looks like an object/array. */
function tryJson(v: string): unknown {
  const t = v.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/** True when a value is worth opening the viewer for (JSON, or long/multi-line). */
export function isExpandable(v: string): boolean {
  return tryJson(v) !== undefined || v.length > 60 || v.includes("\n");
}

function scalarClass(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "number") return "num";
  if (typeof v === "boolean") return "bool";
  return "str";
}
function scalarText(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function JsonNode({ k, v, depth, last }: { k: string | number | null; v: unknown; depth: number; last: boolean }) {
  const isObj = v !== null && typeof v === "object";
  const [open, setOpen] = useState(depth < 2);
  const keyEl = k !== null ? <span className="bud-json-key">{typeof k === "string" ? `"${k}"` : k}</span> : null;
  const pad = { paddingLeft: depth * 16 };

  if (!isObj) {
    return (
      <div className="bud-json-row" style={pad}>
        {keyEl}
        {keyEl && <span className="bud-json-colon">: </span>}
        <span className={`bud-json-${scalarClass(v)}`}>{scalarText(v)}</span>
        {!last && ","}
      </div>
    );
  }
  const arr = Array.isArray(v);
  const entries: [string | number, unknown][] = arr
    ? (v as unknown[]).map((x, i) => [i, x])
    : Object.entries(v as Record<string, unknown>);
  const [openB, closeB] = arr ? ["[", "]"] : ["{", "}"];
  return (
    <div className="bud-json-node">
      <div className="bud-json-row" style={pad}>
        <button className="bud-json-toggle" onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"}
        </button>
        {keyEl}
        {keyEl && <span className="bud-json-colon">: </span>}
        {openB}
        {!open && (
          <span className="bud-json-collapsed">
            {" "}… {entries.length} {arr ? "items" : "keys"} {closeB}
            {!last && ","}
          </span>
        )}
      </div>
      {open && (
        <>
          {entries.map(([ek, ev], i) => (
            <JsonNode key={String(ek)} k={ek} v={ev} depth={depth + 1} last={i === entries.length - 1} />
          ))}
          <div className="bud-json-row" style={pad}>
            {closeB}
            {!last && ","}
          </div>
        </>
      )}
    </div>
  );
}

/** Centered modal for inspecting a single cell — JSON tree, or formatted text. */
export function CellViewer({ value, column, onClose }: { value: string; column?: string; onClose: () => void }) {
  const json = tryJson(value);
  const isJson = json !== undefined;
  return (
    <>
      <div className="bud-cv-backdrop" onClick={onClose} />
      <div className="bud-cellviewer" role="dialog">
        <div className="bud-cellviewer-head">
          <span className="bud-cellviewer-title">
            {column ? <strong>{column}</strong> : null}
            <span className="bud-cellviewer-kind">{isJson ? "JSON" : "TEXT"}</span>
            <span className="bud-cellviewer-len">{value.length.toLocaleString()} chars</span>
          </span>
          <span className="bud-ed-spacer" />
          <button
            className="bud-cellviewer-btn"
            title="Copy value"
            onClick={() => {
              void navigator.clipboard?.writeText(value).catch(() => {});
              toast("Copied cell value", "success");
            }}
          >
            <IconCopy size={13} stroke={1.7} /> Copy
          </button>
          <button className="bud-cellviewer-btn" title="Close" onClick={onClose}>
            <IconX size={14} stroke={1.8} />
          </button>
        </div>
        <div className="bud-cellviewer-body">
          {isJson ? (
            <div className="bud-json">
              <JsonNode k={null} v={json} depth={0} last />
            </div>
          ) : (
            <pre className="bud-cellviewer-text">{value}</pre>
          )}
        </div>
      </div>
    </>
  );
}
