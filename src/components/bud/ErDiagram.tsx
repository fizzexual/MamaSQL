import { IconTable, IconX } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getBackend } from "../../ipc/backend";
import type { ForeignKey } from "../../ipc/types";
import { useStore } from "../../state/store";

type Edge = { x1: number; y1: number; x2: number; y2: number; key: string };

/** Schema diagram: a box per table (with its columns) and a line per FK. */
export function ErDiagram() {
  const [open, setOpen] = useState(false);
  const [fks, setFks] = useState<ForeignKey[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const tables = useStore((s) => s.schema.tables);
  const columnsByTable = useStore((s) => s.schema.columnsByTable);
  const activeId = useStore((s) => s.activeConnectionId);
  const conn = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const canvasRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const onEvt = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mamasql:erd", onEvt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mamasql:erd", onEvt);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open || !activeId) return;
    let alive = true;
    getBackend()
      .listForeignKeys(activeId)
      .then((f) => alive && setFks(f))
      .catch(() => alive && setFks([]));
    return () => {
      alive = false;
    };
  }, [open, activeId]);

  // Measure box positions → draw a curved line per FK (table → referenced table).
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const cont = canvasRef.current;
      if (!cont) return;
      const cr = cont.getBoundingClientRect();
      const e: Edge[] = [];
      fks.forEach((fk, i) => {
        const a = boxRefs.current[fk.table];
        const b = boxRefs.current[fk.refTable];
        if (!a || !b || a === b) return;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const aRight = ar.left + ar.width / 2 < br.left + br.width / 2;
        const x1 = (aRight ? ar.right : ar.left) - cr.left + cont.scrollLeft;
        const y1 = ar.top + ar.height / 2 - cr.top + cont.scrollTop;
        const x2 = (aRight ? br.left : br.right) - cr.left + cont.scrollLeft;
        const y2 = br.top + br.height / 2 - cr.top + cont.scrollTop;
        e.push({ x1, y1, x2, y2, key: `${fk.table}.${fk.column}->${fk.refTable}.${fk.refColumn}-${i}` });
      });
      setEdges(e);
      setSize({ w: cont.scrollWidth, h: cont.scrollHeight });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [open, fks, tables, columnsByTable]);

  if (!open) return null;
  const fkCols = new Set(fks.map((f) => `${f.table}.${f.column}`));

  return (
    <div className="bud-erd-backdrop" onClick={() => setOpen(false)}>
      <div className="bud-erd" onClick={(e) => e.stopPropagation()}>
        <div className="bud-erd-head">
          <span className="bud-erd-title">
            Schema diagram{conn ? ` · ${conn.name}` : ""}
            <span className="bud-erd-sub">
              {tables.length} {tables.length === 1 ? "table" : "tables"} · {fks.length}{" "}
              {fks.length === 1 ? "relationship" : "relationships"}
            </span>
          </span>
          <button className="bud-erd-close" onClick={() => setOpen(false)} title="Close (Esc)">
            <IconX size={16} stroke={1.8} />
          </button>
        </div>
        <div className="bud-erd-canvas" ref={canvasRef}>
          {tables.length === 0 ? (
            <div className="bud-empty">No tables to diagram. Open a connection first.</div>
          ) : (
            <>
              <svg className="bud-erd-svg" width={size.w} height={size.h} aria-hidden>
                {edges.map((e) => (
                  <g key={e.key}>
                    <path
                      className="bud-erd-line"
                      d={`M ${e.x1} ${e.y1} C ${(e.x1 + e.x2) / 2} ${e.y1}, ${(e.x1 + e.x2) / 2} ${e.y2}, ${e.x2} ${e.y2}`}
                    />
                    <circle className="bud-erd-dot" cx={e.x2} cy={e.y2} r="3.5" />
                  </g>
                ))}
              </svg>
              <div className="bud-erd-boxes">
                {tables.map((t) => {
                  const cols = columnsByTable[t.name] ?? [];
                  return (
                    <div
                      key={t.name}
                      className="bud-erd-box"
                      ref={(el) => {
                        boxRefs.current[t.name] = el;
                      }}
                    >
                      <div className="bud-erd-box-head">
                        <IconTable size={13} stroke={1.7} /> {t.name}
                      </div>
                      <div className="bud-erd-cols">
                        {cols.length === 0 ? (
                          <div className="bud-erd-col dim">columns not loaded</div>
                        ) : (
                          cols.map((c) => (
                            <div className="bud-erd-col" key={c.name}>
                              <span className={`bud-erd-col-name ${c.isPrimaryKey ? "pk" : ""}`}>{c.name}</span>
                              <span className="bud-erd-col-tags">
                                {c.isPrimaryKey && <span className="bud-erd-tag pk">PK</span>}
                                {fkCols.has(`${t.name}.${c.name}`) && <span className="bud-erd-tag fk">FK</span>}
                              </span>
                              <span className="bud-erd-col-type">{c.dataType}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
