import { IconArrowRight, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getBackend } from "../../ipc/backend";
import { useStore } from "../../state/store";

type Schema = Record<string, Record<string, string>>; // table -> (column -> dataType)

interface Diff {
  onlyA: string[];
  onlyB: string[];
  changed: {
    table: string;
    onlyA: string[];
    onlyB: string[];
    typeChanged: { col: string; a: string; b: string }[];
  }[];
  identical: number;
}

/** Open + introspect a connection by id into a {table: {col: type}} map. */
async function introspect(id: string): Promise<Schema> {
  const be = getBackend();
  await be.openConnection(id);
  const tables = await be.listTables(id);
  const out: Schema = {};
  for (const t of tables) {
    try {
      const cols = await be.listColumns(id, t.name);
      out[t.name] = Object.fromEntries(cols.map((c) => [c.name, c.dataType]));
    } catch {
      out[t.name] = {};
    }
  }
  return out;
}

function computeDiff(a: Schema, b: Schema): Diff {
  const aT = Object.keys(a);
  const bT = Object.keys(b);
  const bSet = new Set(bT);
  const aSet = new Set(aT);
  const onlyA = aT.filter((t) => !bSet.has(t)).sort();
  const onlyB = bT.filter((t) => !aSet.has(t)).sort();
  const changed: Diff["changed"] = [];
  let identical = 0;
  for (const t of aT.filter((t) => bSet.has(t)).sort()) {
    const ca = a[t];
    const cb = b[t];
    const colsA = Object.keys(ca);
    const colsB = Object.keys(cb);
    const cbSet = new Set(colsB);
    const caSet = new Set(colsA);
    const colOnlyA = colsA.filter((c) => !cbSet.has(c));
    const colOnlyB = colsB.filter((c) => !caSet.has(c));
    const typeChanged = colsA
      .filter((c) => cbSet.has(c) && ca[c] !== cb[c])
      .map((c) => ({ col: c, a: ca[c], b: cb[c] }));
    if (colOnlyA.length || colOnlyB.length || typeChanged.length) {
      changed.push({ table: t, onlyA: colOnlyA, onlyB: colOnlyB, typeChanged });
    } else {
      identical++;
    }
  }
  return { onlyA, onlyB, changed, identical };
}

/** Compare the schemas of two connections. Opened via `mamasql:schema-diff`. */
export function SchemaDiff() {
  const [open, setOpen] = useState(false);
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [diff, setDiff] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onEvt = () => {
      setDiff(null);
      setErr(null);
      setAId(activeId ?? connections[0]?.id ?? "");
      setBId(connections.find((c) => c.id !== (activeId ?? connections[0]?.id))?.id ?? "");
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mamasql:schema-diff", onEvt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mamasql:schema-diff", onEvt);
      window.removeEventListener("keydown", onKey);
    };
  }, [activeId, connections]);

  if (!open) return null;

  const nameOf = (id: string) => connections.find((c) => c.id === id)?.name ?? "?";

  const compare = async () => {
    if (!aId || !bId || aId === bId) {
      setErr("Pick two different connections.");
      return;
    }
    setBusy(true);
    setErr(null);
    setDiff(null);
    try {
      const [a, b] = await Promise.all([introspect(aId), introspect(bId)]);
      setDiff(computeDiff(a, b));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inSync = diff && !diff.onlyA.length && !diff.onlyB.length && !diff.changed.length;

  return (
    <div className="bud-erd-backdrop" onClick={() => setOpen(false)}>
      <div className="bud-diff" onClick={(e) => e.stopPropagation()}>
        <div className="bud-erd-head">
          <span className="bud-erd-title">Schema diff</span>
          <button className="bud-erd-close" onClick={() => setOpen(false)} title="Close (Esc)">
            <IconX size={16} stroke={1.8} />
          </button>
        </div>

        <div className="bud-diff-bar">
          <select value={aId} onChange={(e) => setAId(e.target.value)}>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <IconArrowRight size={16} stroke={1.8} />
          <select value={bId} onChange={(e) => setBId(e.target.value)}>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="bud-diff-go" onClick={() => void compare()} disabled={busy || !aId || !bId || aId === bId}>
            {busy ? "Comparing…" : "Compare"}
          </button>
        </div>

        <div className="bud-diff-body">
          {err && <div className="bud-error">⚠ {err}</div>}
          {!diff && !err && !busy && <div className="bud-empty">Pick two connections and press Compare.</div>}
          {inSync && <div className="bud-diff-insync">✓ Schemas are identical — {diff.identical} tables match.</div>}
          {diff && !inSync && (
            <>
              <div className="bud-diff-summary">
                {diff.onlyA.length} only in {nameOf(aId)} · {diff.onlyB.length} only in {nameOf(bId)} ·{" "}
                {diff.changed.length} changed · {diff.identical} identical
              </div>
              {diff.onlyA.length > 0 && (
                <div className="bud-diff-sec">
                  <div className="bud-diff-sec-h del">Tables only in {nameOf(aId)}</div>
                  {diff.onlyA.map((t) => (
                    <div className="bud-diff-row del" key={t}>
                      − {t}
                    </div>
                  ))}
                </div>
              )}
              {diff.onlyB.length > 0 && (
                <div className="bud-diff-sec">
                  <div className="bud-diff-sec-h add">Tables only in {nameOf(bId)}</div>
                  {diff.onlyB.map((t) => (
                    <div className="bud-diff-row add" key={t}>
                      + {t}
                    </div>
                  ))}
                </div>
              )}
              {diff.changed.map((c) => (
                <div className="bud-diff-sec" key={c.table}>
                  <div className="bud-diff-sec-h chg">Table “{c.table}” differs</div>
                  {c.onlyA.map((col) => (
                    <div className="bud-diff-row del" key={`a-${col}`}>
                      − column {col} <span className="bud-diff-note">(only in {nameOf(aId)})</span>
                    </div>
                  ))}
                  {c.onlyB.map((col) => (
                    <div className="bud-diff-row add" key={`b-${col}`}>
                      + column {col} <span className="bud-diff-note">(only in {nameOf(bId)})</span>
                    </div>
                  ))}
                  {c.typeChanged.map((tc) => (
                    <div className="bud-diff-row chg" key={`t-${tc.col}`}>
                      ~ {tc.col}: <span className="bud-diff-note">{tc.a}</span> → <span className="bud-diff-note">{tc.b}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
