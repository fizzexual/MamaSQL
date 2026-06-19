import { useStore } from "../../state/store";

export function TopNav() {
  const active = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const refresh = useStore((s) => s.refresh);
  const editTable = useStore((s) => s.editTable);

  const tabs: { id: "data" | "sql" | "history"; label: string }[] = [
    { id: "data", label: "Data" },
    { id: "sql", label: "SQL" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="bud-topnav">
      <div className="bud-topnav-left">
        <span className="bud-brand">▦ MamaSQL</span>
        <nav className="bud-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`bud-tab ${view === t.id ? "active" : ""}`}
              onClick={() => setView(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="bud-topnav-center">{active ? active.name : "No connection"}</div>
      <div className="bud-topnav-right">
        <button
          className="bud-naction"
          disabled={!editTable}
          title="Refresh data"
          onClick={() => void refresh()}
        >
          <span className="bud-ic">⟳</span> Refresh
        </button>
        <span className="bud-avatar">M</span>
      </div>
    </div>
  );
}
