import { useStore } from "../../state/store";

export function TopNav({ onAddServer }: { onAddServer: () => void }) {
  const active = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  return (
    <div className="bud-topnav">
      <div className="bud-topnav-left">
        <button className="bud-back" title="Back">
          ‹
        </button>
        <nav className="bud-tabs">
          <span className="bud-tab active">Data</span>
          <span className="bud-tab">Design</span>
          <span className="bud-tab">Automation</span>
          <span className="bud-tab">Settings</span>
        </nav>
      </div>
      <div className="bud-topnav-center">{active ? active.name : "MamaSQL"}</div>
      <div className="bud-topnav-right">
        <button className="bud-addserver" onClick={onAddServer}>
          <span className="bud-ic">＋</span> Add Server
        </button>
        <span className="bud-avatar">R</span>
        <button className="bud-naction">
          <span className="bud-ic">◍</span> Users
        </button>
        <button className="bud-naction">
          <span className="bud-ic">▷</span> Preview
        </button>
        <button className="bud-publish">
          <span className="bud-ic">⛆</span> Publish <span className="caret">▾</span>
        </button>
      </div>
    </div>
  );
}
