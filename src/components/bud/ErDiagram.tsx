import { IconArrowsMaximize, IconDownload, IconMinus, IconPlus, IconTable, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBackend } from "../../ipc/backend";
import type { ColumnInfo } from "../../ipc/types";
import { useStore } from "../../state/store";

const BOX_W = 244;
const HEAD_H = 38;
const ROW_H = 25;
const MAX_COLS = 14;
const GAP_X = 80;
const GAP_Y = 48;
const MARGIN = 40;

type Pos = { x: number; y: number };

function boxHeight(cols: ColumnInfo[] | undefined): number {
  const n = cols?.length ?? 0;
  const shown = Math.min(n, MAX_COLS);
  const extra = n > MAX_COLS ? 1 : 0;
  return HEAD_H + Math.max(1, shown + extra) * ROW_H + 8;
}
const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Schema diagram: a box per table (with columns) and a curved line per FK.
 *  Pan the canvas, drag boxes, zoom, and export the whole thing as a PNG. */
export function ErDiagram() {
  const [open, setOpen] = useState(false);
  const [cols, setCols] = useState<Record<string, ColumnInfo[]>>({});
  const [fks, setFks] = useState<{ table: string; column: string; refTable: string; refColumn: string }[]>([]);
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const [pan, setPan] = useState<Pos>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const tables = useStore((s) => s.schema.tables);
  const activeId = useStore((s) => s.activeConnectionId);
  const conn = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const drag = useRef<{ name: string | null; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });

  const tableNames = useMemo(() => tables.filter((t) => t.kind !== "view").map((t) => t.name), [tables]);

  useEffect(() => {
    const onEvt = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mamasql:erd", onEvt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mamasql:erd", onEvt);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // On open: fetch every table's columns + the FKs, and reset the view.
  useEffect(() => {
    if (!open || !activeId) return;
    let alive = true;
    setPan({ x: 0, y: 0 });
    setZoom(1);
    const be = getBackend();
    be.listForeignKeys(activeId)
      .then((f) => alive && setFks(f))
      .catch(() => alive && setFks([]));
    Promise.all(
      tableNames.map((name) =>
        be
          .listColumns(activeId, name)
          .then((c) => [name, c] as const)
          .catch(() => [name, []] as const),
      ),
    ).then((pairs) => {
      if (alive) setCols(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [open, activeId, tableNames]);

  // Auto-layout: hub tables (most-referenced) first, packed into balanced columns.
  const layout = useMemo(() => {
    const inDeg: Record<string, number> = {};
    for (const f of fks) inDeg[f.refTable] = (inDeg[f.refTable] ?? 0) + 1;
    const ordered = [...tableNames].sort((a, b) => (inDeg[b] ?? 0) - (inDeg[a] ?? 0) || a.localeCompare(b));
    const ncols = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(ordered.length))));
    const colY = new Array(ncols).fill(MARGIN);
    const p: Record<string, Pos> = {};
    ordered.forEach((name, i) => {
      const col = i % ncols;
      p[name] = { x: MARGIN + col * (BOX_W + GAP_X), y: colY[col] };
      colY[col] += boxHeight(cols[name]) + GAP_Y;
    });
    return p;
  }, [tableNames, fks, cols]);

  useEffect(() => setPos(layout), [layout]);

  const at = (name: string): Pos => pos[name] ?? layout[name] ?? { x: 0, y: 0 };
  const fkCols = useMemo(() => new Set(fks.map((f) => `${f.table}.${f.column}`)), [fks]);
  const visCols = (name: string) => (cols[name] ?? []).slice(0, MAX_COLS);

  const colY = (name: string, colName: string): number => {
    const vis = visCols(name);
    const i = vis.findIndex((c) => c.name === colName);
    const p = at(name);
    return i < 0 ? p.y + boxHeight(cols[name]) / 2 : p.y + HEAD_H + (i + 0.5) * ROW_H + 4;
  };

  const edges = useMemo(() => {
    return fks
      .filter((f) => f.table !== f.refTable && tableNames.includes(f.table) && tableNames.includes(f.refTable))
      .map((f, idx) => {
        const A = at(f.table);
        const B = at(f.refTable);
        const aRight = A.x + BOX_W / 2 <= B.x + BOX_W / 2;
        return {
          x1: aRight ? A.x + BOX_W : A.x,
          y1: colY(f.table, f.column),
          x2: aRight ? B.x : B.x + BOX_W,
          y2: colY(f.refTable, f.refColumn),
          key: `${f.table}.${f.column}->${f.refTable}.${f.refColumn}-${idx}`,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fks, pos, layout, cols, tableNames]);

  const bounds = () => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const name of tableNames) {
      const p = at(name);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + BOX_W);
      maxY = Math.max(maxY, p.y + boxHeight(cols[name]));
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, w: 600, h: 400 };
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  };

  // --- interaction: drag boxes / pan canvas ---
  const onBoxDown = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const p = at(name);
    drag.current = { name, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
  };
  const onCanvasDown = (e: React.MouseEvent) => {
    drag.current = { name: null, sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
  };
  useEffect(() => {
    if (!open) return;
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.sx) / zoom;
      const dy = (e.clientY - d.sy) / zoom;
      if (d.name) setPos((prev) => ({ ...prev, [d.name as string]: { x: d.ox + dx, y: d.oy + dy } }));
      else setPan({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) });
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [open, zoom]);

  // Keep a live ref of the view so wheel-zoom stays correct across rapid events.
  useEffect(() => {
    viewRef.current = { zoom, pan };
  }, [zoom, pan]);

  // Scroll to zoom, anchored on the cursor.
  useEffect(() => {
    if (!open) return;
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const { zoom: z, pan: pn } = viewRef.current;
      const z2 = Math.min(2, Math.max(0.4, +(z * (e.deltaY < 0 ? 1.12 : 0.89)).toFixed(3)));
      const next = { x: mx - ((mx - pn.x) / z) * z2, y: my - ((my - pn.y) / z) * z2 };
      viewRef.current = { zoom: z2, pan: next };
      setZoom(z2);
      setPan(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  const resetView = () => {
    setPos(layout);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const exportPng = () => {
    const pad = 48;
    const bb = bounds();
    const W = bb.w + pad * 2;
    const H = bb.h + pad * 2;
    const ox = -bb.minX + pad;
    const oy = -bb.minY + pad;
    const C = {
      bg: "#0c0c11", box: "#15151c", head: "#1e1e27", border: "#2c2c38",
      text: "#ececf1", muted: "#a2a2b0", type: "#7b7b8a", pk: "#fcd34d", fk: "#9486ff", line: "#7c6cf5",
    };
    let g = "";
    for (const e of edges) {
      const mx = (e.x1 + e.x2) / 2;
      g += `<path d="M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}" fill="none" stroke="${C.line}" stroke-width="1.5" opacity="0.7"/><circle cx="${e.x2}" cy="${e.y2}" r="3.5" fill="${C.line}"/>`;
    }
    for (const name of tableNames) {
      const p = at(name);
      const h = boxHeight(cols[name]);
      const vis = visCols(name);
      const total = cols[name]?.length ?? 0;
      g += `<rect x="${p.x}" y="${p.y}" width="${BOX_W}" height="${h}" rx="12" fill="${C.box}" stroke="${C.border}"/>`;
      g += `<path d="M ${p.x} ${p.y + 12} a 12 12 0 0 1 12 -12 h ${BOX_W - 24} a 12 12 0 0 1 12 12 v ${HEAD_H - 12} h -${BOX_W} z" fill="${C.head}"/>`;
      g += `<text x="${p.x + 14}" y="${p.y + HEAD_H / 2 + 4}" fill="${C.text}" font-size="13" font-weight="600">${esc(name)}</text>`;
      vis.forEach((c, i) => {
        const ty = p.y + HEAD_H + (i + 0.5) * ROW_H + 4.5;
        const tag = c.isPrimaryKey ? "PK" : fkCols.has(`${name}.${c.name}`) ? "FK" : "";
        let x = p.x + 14;
        if (tag) {
          g += `<text x="${x}" y="${ty}" fill="${c.isPrimaryKey ? C.pk : C.fk}" font-size="9" font-weight="700">${tag}</text>`;
          x += 22;
        }
        g += `<text x="${x}" y="${ty}" fill="${C.text}" font-size="11.5">${esc(c.name)}</text>`;
        g += `<text x="${p.x + BOX_W - 12}" y="${ty}" fill="${C.type}" font-size="10.5" text-anchor="end">${esc(c.dataType)}</text>`;
      });
      if (total > MAX_COLS) {
        const ty = p.y + HEAD_H + (vis.length + 0.5) * ROW_H + 4.5;
        g += `<text x="${p.x + 14}" y="${ty}" fill="${C.muted}" font-size="10.5">+ ${total - MAX_COLS} more</text>`;
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"/><g transform="translate(${ox},${oy})" font-family="ui-monospace, monospace">${g}</g></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
      }
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `${(conn?.name ?? "schema").replace(/[^\w-]+/g, "_")}-diagram.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
    };
    img.src = url;
  };

  if (!open) return null;
  const bb = bounds();

  return (
    <div className="bud-erd-backdrop" onClick={() => setOpen(false)}>
      <div className="bud-erd" onClick={(e) => e.stopPropagation()}>
        <div className="bud-erd-head">
          <span className="bud-erd-title">
            Schema diagram{conn ? ` · ${conn.name}` : ""}
            <span className="bud-erd-sub">
              {tableNames.length} {tableNames.length === 1 ? "table" : "tables"} · {edges.length}{" "}
              {edges.length === 1 ? "relationship" : "relationships"}
            </span>
          </span>
          <div className="bud-erd-tools">
            <button title="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}>
              <IconMinus size={15} stroke={1.9} />
            </button>
            <span className="bud-erd-zoom">{Math.round(zoom * 100)}%</span>
            <button title="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>
              <IconPlus size={15} stroke={1.9} />
            </button>
            <button title="Reset layout & view" onClick={resetView}>
              <IconArrowsMaximize size={15} stroke={1.8} />
            </button>
            <button className="bud-erd-export" title="Export as PNG" onClick={exportPng}>
              <IconDownload size={15} stroke={1.8} /> PNG
            </button>
          </div>
          <button className="bud-erd-close" onClick={() => setOpen(false)} title="Close (Esc)">
            <IconX size={16} stroke={1.8} />
          </button>
        </div>
        <div className="bud-erd-canvas" ref={canvasRef} onMouseDown={onCanvasDown}>
          {tableNames.length === 0 ? (
            <div className="bud-empty">No tables to diagram. Open a connection first.</div>
          ) : (
            <div
              className="bud-erd-stage"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <svg className="bud-erd-svg" width={bb.minX + bb.w + MARGIN} height={bb.minY + bb.h + MARGIN} aria-hidden>
                <title>relationships</title>
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
              {tableNames.map((name) => {
                const p = at(name);
                const list = cols[name] ?? [];
                const vis = visCols(name);
                return (
                  <div
                    key={name}
                    className="bud-erd-box"
                    style={{ left: p.x, top: p.y, width: BOX_W }}
                  >
                    <div className="bud-erd-box-head" onMouseDown={(e) => onBoxDown(name, e)}>
                      <IconTable size={13} stroke={1.7} /> {name}
                    </div>
                    <div className="bud-erd-cols">
                      {list.length === 0 ? (
                        <div className="bud-erd-col dim" style={{ height: ROW_H }}>
                          no columns
                        </div>
                      ) : (
                        vis.map((c) => (
                          <div className="bud-erd-col" key={c.name} style={{ height: ROW_H }}>
                            <span className="bud-erd-col-tags">
                              {c.isPrimaryKey ? (
                                <span className="bud-erd-tag pk">PK</span>
                              ) : fkCols.has(`${name}.${c.name}`) ? (
                                <span className="bud-erd-tag fk">FK</span>
                              ) : null}
                            </span>
                            <span className={`bud-erd-col-name ${c.isPrimaryKey ? "pk" : ""}`}>{c.name}</span>
                            <span className="bud-erd-col-type">{c.dataType}</span>
                          </div>
                        ))
                      )}
                      {list.length > MAX_COLS && (
                        <div className="bud-erd-col more" style={{ height: ROW_H }}>
                          + {list.length - MAX_COLS} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
