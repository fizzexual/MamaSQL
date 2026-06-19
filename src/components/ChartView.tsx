import { useMemo, useState } from "react";
import { useStore } from "../state/store";

type ChartType = "bar" | "line" | "pie";
const PALETTE = [
  "#0891b2", "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
];

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

interface Point {
  label: string;
  value: number;
}

export function ChartView() {
  const result = useStore((s) => s.result);
  const [type, setType] = useState<ChartType>("bar");
  const [xCol, setXCol] = useState(0);
  const [yCol, setYCol] = useState<number | null>(null);

  const numericCols = useMemo(() => {
    if (!result) return [];
    return result.columns
      .map((c, i) => ({ c, i }))
      .filter(
        ({ i }) =>
          result.rows.length > 0 &&
          result.rows.every((r) => r[i] == null || num(r[i]) != null) &&
          result.rows.some((r) => num(r[i]) != null),
      );
  }, [result]);

  const yIndex = yCol ?? numericCols[0]?.i ?? null;

  const data = useMemo<Point[]>(() => {
    if (!result || yIndex == null) return [];
    return result.rows
      .slice(0, 40)
      .map((r) => ({ label: String(r[xCol] ?? ""), value: num(r[yIndex]) ?? 0 }));
  }, [result, xCol, yIndex]);

  if (!result) return <div className="results"><div className="empty">Run a query to chart it.</div></div>;
  if (numericCols.length === 0)
    return <div className="results"><div className="empty">No numeric column to chart.</div></div>;

  return (
    <div className="results">
      <div className="results-toolbar chart-toolbar">
        <div className="chart-types">
          {(["bar", "line", "pie"] as ChartType[]).map((t) => (
            <button key={t} className={type === t ? "active" : ""} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
        <label>
          X
          <select value={xCol} onChange={(e) => setXCol(Number(e.target.value))}>
            {result.columns.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Y
          <select value={yIndex ?? ""} onChange={(e) => setYCol(Number(e.target.value))}>
            {numericCols.map(({ c, i }) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="chart-area">
        {type === "pie" ? <Pie data={data} /> : <BarLine data={data} type={type} />}
      </div>
    </div>
  );
}

function BarLine({ data, type }: { data: Point[]; type: ChartType }) {
  const W = 820, H = 380, padL = 54, padB = 60, padT = 16, padR = 16;
  const cw = W - padL - padR;
  const ch = H - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const range = max - min || 1;
  const n = data.length || 1;
  const slot = cw / n;
  const y = (v: number) => padT + ch - ((v - min) / range) * ch;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * range);
  const step = Math.ceil(n / 20);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="xMidYMid meet">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        </g>
      ))}
      {type === "bar" ? (
        data.map((d, i) => {
          const bw = slot * 0.64;
          const x = padL + i * slot + (slot - bw) / 2;
          const yy = y(d.value);
          const y0 = y(Math.max(0, min));
          return (
            <rect key={i} x={x} y={Math.min(yy, y0)} width={bw} height={Math.abs(y0 - yy)} fill="var(--accent)" rx="2" />
          );
        })
      ) : (
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          points={data.map((d, i) => `${padL + i * slot + slot / 2},${y(d.value)}`).join(" ")}
        />
      )}
      {type === "line" &&
        data.map((d, i) => (
          <circle key={i} cx={padL + i * slot + slot / 2} cy={y(d.value)} r="3" fill="var(--accent)" />
        ))}
      {data.map((d, i) =>
        i % step === 0 ? (
          <text
            key={i}
            x={padL + i * slot + slot / 2}
            y={H - padB + 18}
            textAnchor="end"
            transform={`rotate(-35 ${padL + i * slot + slot / 2} ${H - padB + 18})`}
            className="chart-axis"
          >
            {d.label.slice(0, 14)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function Pie({ data }: { data: Point[] }) {
  const agg = new Map<string, number>();
  for (const d of data) agg.set(d.label, (agg.get(d.label) ?? 0) + Math.abs(d.value));
  const entries = [...agg.entries()].slice(0, 10);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const cx = 190, cy = 190, r = 150;
  let angle = -Math.PI / 2;
  const arcs = entries.map(([label, v], i) => {
    const a0 = angle;
    const a1 = angle + (v / total) * 2 * Math.PI;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return {
      d: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`,
      color: PALETTE[i % PALETTE.length],
      label,
      pct: ((v / total) * 100).toFixed(1),
    };
  });
  return (
    <svg viewBox="0 0 580 380" className="chart-svg" preserveAspectRatio="xMidYMid meet">
      {arcs.map((a, i) => (
        <path key={i} d={a.d} fill={a.color} stroke="#fff" strokeWidth="1.5" />
      ))}
      {arcs.map((a, i) => (
        <g key={`l${i}`} transform={`translate(390 ${40 + i * 28})`}>
          <rect width="14" height="14" rx="3" fill={a.color} />
          <text x="20" y="12" className="chart-legend">{a.label.slice(0, 18)} · {a.pct}%</text>
        </g>
      ))}
    </svg>
  );
}
