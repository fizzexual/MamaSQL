import {
  IconChartBar,
  IconDeviceFloppy,
  IconFilePlus,
  IconFolderOpen,
  IconHistory,
  IconPlayerPlay,
  IconPlugConnected,
  IconRefresh,
  IconScript,
  IconSettings,
} from "@tabler/icons-react";
import { useStore } from "../../state/store";

/** Mac-style window controls (decorative, matches DbVisualizer on macOS). */
function TrafficLights() {
  return (
    <div className="bud-traffic" aria-hidden>
      <span className="tl r" />
      <span className="tl y" />
      <span className="tl g" />
    </div>
  );
}

export function TopNav({ onAddServer }: { onAddServer: () => void }) {
  const active = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const setTopView = useStore((s) => s.setTopView);
  const setView = useStore((s) => s.setView);
  const run = useStore((s) => s.run);

  const engineName = active ? (active.engine === "postgres" ? "PostgreSQL" : active.engine === "mysql" ? "MySQL" : "SQLite") : null;
  const title = active ? `DbVisualizer Pro — ${engineName} — ${active.name}` : "DbVisualizer Pro — Untitled";

  return (
    <div className="bud-titlebar">
      <TrafficLights />
      <div className="bud-tb-tools">
        <button title="New SQL file" onClick={() => { setTopView("data"); setView("sql"); }}>
          <IconFilePlus size={16} stroke={1.6} />
        </button>
        <button title="New script" onClick={() => { setTopView("data"); setView("sql"); }}>
          <IconScript size={16} stroke={1.6} />
        </button>
        <button title="Open file">
          <IconFolderOpen size={16} stroke={1.6} />
        </button>
        <button title="Save">
          <IconDeviceFloppy size={16} stroke={1.6} />
        </button>
        <span className="bud-tb-divider" />
        <button title="New connection" onClick={onAddServer}>
          <IconPlugConnected size={16} stroke={1.6} />
        </button>
        <button title="Reconnect">
          <IconRefresh size={16} stroke={1.6} />
        </button>
        <span className="bud-tb-divider" />
        <button className="bud-tb-run" title="Execute (⌘↵)" onClick={() => void run()}>
          <IconPlayerPlay size={16} stroke={1.7} />
        </button>
        <span className="bud-tb-divider" />
        <button title="Monitor">
          <IconChartBar size={16} stroke={1.6} />
        </button>
        <button title="SQL history" onClick={() => setView("history")}>
          <IconHistory size={16} stroke={1.6} />
        </button>
        <button title="Settings" onClick={() => setTopView("settings")}>
          <IconSettings size={16} stroke={1.6} />
        </button>
      </div>
      <div className="bud-tb-title">{title}</div>
    </div>
  );
}
