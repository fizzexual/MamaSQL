import type { QueryResult } from "../ipc/types";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(r: QueryResult): string {
  const header = r.columns.map((c) => csvCell(c.name)).join(",");
  const body = r.rows.map((row) => row.map(csvCell).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function toJson(r: QueryResult): string {
  const objs = r.rows.map((row) =>
    Object.fromEntries(r.columns.map((c, i) => [c.name, row[i]])),
  );
  return JSON.stringify(objs, null, 2);
}

export function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
