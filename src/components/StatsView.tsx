import { useMemo } from "react";
import { useStore } from "../state/store";

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function StatsView() {
  const result = useStore((s) => s.result);

  const stats = useMemo(() => {
    if (!result) return [];
    return result.columns.map((c, i) => {
      const vals = result.rows.map((r) => r[i]);
      const nonNull = vals.filter((v) => v != null);
      const nums = nonNull.map(asNumber).filter((n): n is number => n != null);
      const numeric = nonNull.length > 0 && nums.length === nonNull.length;
      const sum = nums.reduce((a, b) => a + b, 0);
      return {
        name: c.name,
        type: c.dataType,
        count: nonNull.length,
        nulls: vals.length - nonNull.length,
        distinct: new Set(nonNull.map((v) => String(v))).size,
        numeric,
        min: nums.length ? Math.min(...nums) : undefined,
        max: nums.length ? Math.max(...nums) : undefined,
        sum: nums.length ? sum : undefined,
        avg: nums.length ? sum / nums.length : undefined,
      };
    });
  }, [result]);

  if (!result) return <div className="results"><div className="empty">Run a query to see stats.</div></div>;
  const fmt = (n?: number) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2));

  return (
    <div className="results">
      <div className="grid-scroll">
        <table className="grid stats">
          <thead>
            <tr>
              <th>Column</th>
              <th>Count</th>
              <th>Nulls</th>
              <th>Distinct</th>
              <th>Min</th>
              <th>Max</th>
              <th>Sum</th>
              <th>Avg</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.name}>
                <td>
                  <strong>{s.name}</strong> <span className="th-type">{s.type}</span>
                </td>
                <td>{s.count}</td>
                <td>{s.nulls}</td>
                <td>{s.distinct}</td>
                <td>{s.numeric ? fmt(s.min) : "—"}</td>
                <td>{s.numeric ? fmt(s.max) : "—"}</td>
                <td>{s.numeric ? fmt(s.sum) : "—"}</td>
                <td>{s.numeric ? fmt(s.avg) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
