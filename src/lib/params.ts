import { promptDialog } from "../state/dialog";

// Matches comments / strings / Postgres `::` casts (so we skip them) and, last,
// a `:name` bind parameter.
const SCAN = /(--[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|(::)|(:[A-Za-z_]\w*)/g;

/** Distinct `:name` parameters in a statement, in first-seen order. */
export function findParams(sql: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard scanner loop
  while ((m = SCAN.exec(sql)) !== null) {
    if (m[5]) {
      const n = m[5].slice(1);
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/** Render a user-entered value as a SQL literal (number / NULL / bool stay bare). */
function literal(v: string): string {
  const t = v.trim();
  if (t === "") return "''";
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;
  if (/^(null|true|false)$/i.test(t)) return t.toUpperCase();
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * If `sql` has `:name` parameters, prompt for each and substitute SQL literals.
 * Returns the final SQL, or null if the user cancelled a prompt.
 */
export async function resolveParams(sql: string): Promise<string | null> {
  const names = findParams(sql);
  if (names.length === 0) return sql;
  const values: Record<string, string> = {};
  for (const n of names) {
    const v = await promptDialog({
      title: "Query parameter",
      label: `:${n}`,
      placeholder: "value — text, number, or NULL",
    });
    if (v == null) return null; // cancelled
    values[n] = v;
  }
  return sql.replace(SCAN, (full: string, _c1, _c2, _s, _cast, p?: string) =>
    p && p.slice(1) in values ? literal(values[p.slice(1)]) : full,
  );
}
