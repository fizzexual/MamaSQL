import { IconCopy, IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import { download, toCsv, toInserts, toJson, toMarkdown, toTsv } from "../../lib/csv";
import { toast } from "../../state/toast";
import type { QueryResult } from "../../ipc/types";

/**
 * Export / Copy dropdowns for a result set. Reused by the SQL results panel and
 * the data-browse grid. `rows`, when given, are the currently shown (filtered)
 * rows; otherwise the full result is used. `table` names the file / INSERT target.
 */
export function ExportMenu({ result, rows, table }: { result: QueryResult; rows?: unknown[][]; table?: string }) {
  const [open, setOpen] = useState<"export" | "copy" | null>(null);
  const data: QueryResult = { ...result, rows: rows ?? result.rows };
  const base = (table || "result").replace(/[^\w-]+/g, "_") || "result";
  const tbl = table || "table_name";

  const copy = (text: string, label: string) => {
    setOpen(null);
    void navigator.clipboard
      ?.writeText(text)
      .then(() => toast(`Copied ${data.rows.length.toLocaleString()} rows as ${label}`, "success"))
      .catch(() => toast("Clipboard unavailable", "error"));
  };
  const save = (name: string, content: string) => {
    setOpen(null);
    download(name, content);
    toast(`Exported ${name}`, "success");
  };

  return (
    <span className="bud-export">
      <button className="bud-export-btn" title="Export to a file" onClick={() => setOpen(open === "export" ? null : "export")}>
        <IconDownload size={14} stroke={1.7} /> Export ▾
      </button>
      {open === "export" && (
        <>
          <div className="bud-menu-backdrop" onClick={() => setOpen(null)} />
          <div className="bud-export-menu">
            <button onClick={() => save(`${base}.csv`, toCsv(data))}>CSV</button>
            <button onClick={() => save(`${base}.json`, toJson(data))}>JSON</button>
            <button onClick={() => save(`${base}.md`, toMarkdown(data))}>Markdown</button>
            <button onClick={() => save(`${base}.sql`, toInserts(data, tbl))}>SQL INSERTs</button>
          </div>
        </>
      )}
      <button className="bud-export-btn" title="Copy to clipboard" onClick={() => setOpen(open === "copy" ? null : "copy")}>
        <IconCopy size={14} stroke={1.7} /> Copy ▾
      </button>
      {open === "copy" && (
        <>
          <div className="bud-menu-backdrop" onClick={() => setOpen(null)} />
          <div className="bud-export-menu">
            <button onClick={() => copy(toTsv(data), "TSV (spreadsheet)")}>TSV — paste into Sheets/Excel</button>
            <button onClick={() => copy(toMarkdown(data), "Markdown")}>Markdown table</button>
            <button onClick={() => copy(toJson(data), "JSON")}>JSON</button>
            <button onClick={() => copy(toInserts(data, tbl), "SQL INSERTs")}>SQL INSERTs</button>
          </div>
        </>
      )}
    </span>
  );
}
