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

/** Tab-separated — what spreadsheets expect when pasting from the clipboard. */
export function toTsv(r: QueryResult): string {
  const clean = (v: unknown) => (v == null ? "" : String(v).replace(/[\t\n\r]+/g, " "));
  const header = r.columns.map((c) => clean(c.name)).join("\t");
  const body = r.rows.map((row) => row.map(clean).join("\t")).join("\n");
  return `${header}\n${body}`;
}

/** GitHub-flavored Markdown table. */
export function toMarkdown(r: QueryResult): string {
  const cell = (v: unknown) => (v == null ? "" : String(v).replace(/\|/g, "\\|").replace(/\n/g, " "));
  const names = r.columns.map((c) => cell(c.name));
  const head = `| ${names.join(" | ")} |`;
  const sep = `| ${names.map(() => "---").join(" | ")} |`;
  const body = r.rows.map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

function sqlLiteral(v: unknown): string {
  if (v == null) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** A runnable batch of INSERT statements for the result rows. */
export function toInserts(r: QueryResult, table = "table_name"): string {
  const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const cols = r.columns.map((c) => ident(c.name)).join(", ");
  return r.rows
    .map((row) => `INSERT INTO ${ident(table)} (${cols}) VALUES (${row.map(sqlLiteral).join(", ")});`)
    .join("\n");
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

/** Parse CSV text into headers + rows (handles quoted fields and "" escapes). */
export function fromCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          q = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        q = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  if (lines.length === 0) return { headers: [], rows: [] };
  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}
