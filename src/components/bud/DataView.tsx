import {
  IconBolt,
  IconCode,
  IconCopy,
  IconDownload,
  IconTable,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { type ComponentType, type MouseEvent, useRef, useState } from "react";
import { download, fromCsv, toCsv } from "../../lib/csv";
import { useStore } from "../../state/store";
import { DataGrid } from "./DataGrid";
import { SqlPanel } from "./SqlPanel";

type Icon = ComponentType<{ size?: number; stroke?: number }>;
const TOOLS: { Icon: Icon; label: string }[] = [
  { Icon: IconDownload, label: "Import" },
  { Icon: IconUpload, label: "Export" },
  { Icon: IconBolt, label: "Row actions" },
];

type MenuState = { kind: "rowactions" | "generate"; x: number; y: number } | null;

export function DataView() {
  const editTable = useStore((s) => s.editTable);
  const activeId = useStore((s) => s.activeConnectionId);
  const result = useStore((s) => s.result);
  const error = useStore((s) => s.error);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setSql = useStore((s) => s.setSql);
  const setTopView = useStore((s) => s.setTopView);
  const importCsv = useStore((s) => s.importCsv);
  const selection = useStore((s) => s.selection);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const duplicateSelected = useStore((s) => s.duplicateSelected);
  const clearSelection = useStore((s) => s.clearSelection);
  const [menu, setMenu] = useState<MenuState>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const table = editTable?.table ?? "export";
  const n = selection.length;

  const openMenu = (kind: "rowactions" | "generate", e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((m) => (m?.kind === kind ? null : { kind, x: r.left, y: r.bottom + 4 }));
  };

  const exportSelected = () => {
    if (!result) return;
    const rows = n ? selection.map((i) => result.rows[i]) : result.rows;
    download(`${table}${n ? "-selected" : ""}.csv`, toCsv({ ...result, rows }));
    setMenu(null);
  };

  const generate = (sql: string) => {
    setSql(sql);
    setView("sql");
    setMenu(null);
  };

  const onTool = (label: string, e: MouseEvent) => {
    switch (label) {
      case "Import":
        fileRef.current?.click();
        break;
      case "Export":
        if (result) download(`${table}.csv`, toCsv(result));
        break;
      case "Row actions":
        openMenu("rowactions", e);
        break;
      case "Generate":
        openMenu("generate", e);
        break;
      case "Screens":
        setTopView("design");
        break;
      case "Automations":
        setTopView("automation");
        break;
      default:
        break;
    }
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { headers, rows } = fromCsv(String(reader.result));
      if (editTable && headers.length) void importCsv(editTable.table, headers, rows);
    };
    reader.readAsText(file);
  };

  const cols = result?.columns.map((c) => c.name) ?? [];

  return (
    <main className="bud-main">
      <div className="bud-qtabs">
        <button className={`bud-qtab ${view === "sql" ? "on" : ""}`} onClick={() => setView("sql")}>
          <IconCode size={14} stroke={1.7} className="bud-qtab-ic sql" />
          <span>SQL Editor</span>
          <span className="bud-qtab-x">
            <IconX size={12} stroke={2} />
          </span>
        </button>
        {editTable && (
          <button className={`bud-qtab ${view !== "sql" ? "on" : ""}`} onClick={() => setView("data")}>
            <IconTable size={14} stroke={1.7} className="bud-qtab-ic" />
            <span>{editTable.table}</span>
            <span className="bud-qtab-x">
              <IconX size={12} stroke={2} />
            </span>
          </button>
        )}
      </div>

      <div className="bud-toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            className={`bud-tool ${t.label === "Row actions" && n ? "has-sel" : ""}`}
            onClick={(e) => onTool(t.label, e)}
          >
            <t.Icon size={15} stroke={1.6} /> {t.label}
            {t.label === "Row actions" && n > 0 && <span className="bud-sel-badge">{n}</span>}
          </button>
        ))}
      </div>

      {error && <div className="bud-error">⚠ {error.message ?? error.kind}</div>}

      {!activeId ? (
        <div className="bud-empty">Add a server, then pick a source on the left.</div>
      ) : view === "sql" ? (
        <SqlPanel />
      ) : !editTable ? (
        <div className="bud-empty">Pick a table on the left to view and edit its data.</div>
      ) : (
        <DataGrid />
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = "";
        }}
      />

      {menu && (
        <>
          <div className="bud-menu-backdrop" onClick={() => setMenu(null)} />
          <div className="bud-menu" style={{ position: "fixed", left: menu.x, top: menu.y }}>
            {menu.kind === "rowactions" ? (
              <>
                <button disabled={!n} onClick={() => void duplicateSelected().then(() => setMenu(null))}>
                  <IconCopy size={15} stroke={1.7} /> Duplicate {n || "selected"}
                </button>
                <button onClick={exportSelected}>
                  <IconDownload size={15} stroke={1.7} /> Export {n ? `${n} selected` : "all"} to CSV
                </button>
                <button className="danger" disabled={!n} onClick={() => void deleteSelected().then(() => setMenu(null))}>
                  <IconTrash size={15} stroke={1.7} /> Delete {n || "selected"}
                </button>
                {n > 0 && (
                  <button onClick={() => { clearSelection(); setMenu(null); }}>
                    <IconX size={15} stroke={1.7} /> Clear selection
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => generate(`SELECT * FROM ${table} LIMIT 100;`)}>
                  <IconCode size={15} stroke={1.7} /> SELECT all rows
                </button>
                <button onClick={() => generate(`SELECT count(*) FROM ${table};`)}>
                  <IconCode size={15} stroke={1.7} /> Count rows
                </button>
                <button
                  onClick={() =>
                    generate(`INSERT INTO ${table} (${cols.join(", ")})\nVALUES (${cols.map(() => "?").join(", ")});`)
                  }
                >
                  <IconCode size={15} stroke={1.7} /> INSERT template
                </button>
              </>
            )}
          </div>
        </>
      )}

    </main>
  );
}
