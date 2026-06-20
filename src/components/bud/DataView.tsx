import { download, toCsv } from "../../lib/csv";
import { useStore } from "../../state/store";
import { DataGrid } from "./DataGrid";

const TOOLS = [
  { ic: "🔒", label: "Access: App user" },
  { ic: "🔗", label: "Define relationship" },
  { ic: "⤓", label: "Import" },
  { ic: "⤒", label: "Export" },
  { ic: "⚡", label: "Row actions" },
  { ic: "🖥", label: "Screens" },
  { ic: "⚙", label: "Automations" },
  { ic: "✦", label: "Generate" },
];

export function DataView() {
  const editTable = useStore((s) => s.editTable);
  const activeId = useStore((s) => s.activeConnectionId);
  const result = useStore((s) => s.result);
  const error = useStore((s) => s.error);

  return (
    <main className="bud-main">
      <div className="bud-breadcrumb">
        <span className="bud-bc-table">
          <span className="bud-bc-ic">▦</span>
          {editTable ? editTable.table : "data"}
          <span className="bud-bc-menu">⋯</span>
        </span>
        <button className="bud-create-view">Create a view</button>
        <span className="bud-bc-help">To create subsets of data, control access and more, create a view.</span>
      </div>
      <div className="bud-toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            className="bud-tool"
            onClick={() => {
              if (t.label === "Export" && result) download(`${editTable?.table ?? "export"}.csv`, toCsv(result));
            }}
          >
            <span className="bud-tool-ic">{t.ic}</span> {t.label}
          </button>
        ))}
      </div>
      {error && <div className="bud-error">⚠ {error.message ?? error.kind}</div>}
      {!activeId ? (
        <div className="bud-empty">Add a server, then pick a source on the left.</div>
      ) : !editTable ? (
        <div className="bud-empty">Pick a table on the left to view and edit its data.</div>
      ) : (
        <DataGrid />
      )}
    </main>
  );
}
