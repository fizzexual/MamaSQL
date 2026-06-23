import {
  IconDeviceFloppy,
  IconFilePlus,
  IconFolderOpen,
  IconHistory,
  IconPlayerPlay,
  IconPlugConnected,
  IconRefresh,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { useRef } from "react";
import { promptDialog } from "../../state/dialog";
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
  const activeId = useStore((s) => s.activeConnectionId);
  const sql = useStore((s) => s.sql);
  const setTopView = useStore((s) => s.setTopView);
  const setView = useStore((s) => s.setView);
  const loadSql = useStore((s) => s.loadSql);
  const saveScript = useStore((s) => s.saveScript);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const run = useStore((s) => s.run);
  const fileRef = useRef<HTMLInputElement>(null);

  const engineName = active ? (active.engine === "postgres" ? "PostgreSQL" : active.engine === "mysql" ? "MySQL" : "SQLite") : null;
  const title = active ? `DbVisualizer Pro — ${engineName} — ${active.name}` : "DbVisualizer Pro — Untitled";

  const openFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => loadSql(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const save = async () => {
    if (!sql.trim()) return;
    const name = await promptDialog({ title: "Save SQL script", label: "Name", placeholder: "e.g. monthly report" });
    if (name?.trim()) saveScript(name.trim(), sql);
  };

  return (
    <div className="bud-titlebar">
      <TrafficLights />
      <div className="bud-tb-tools">
        <button title="New SQL" onClick={() => loadSql("")}>
          <IconFilePlus size={16} stroke={1.6} />
        </button>
        <button title="Open .sql file" onClick={() => fileRef.current?.click()}>
          <IconFolderOpen size={16} stroke={1.6} />
        </button>
        <button title="Save as script" onClick={() => void save()}>
          <IconDeviceFloppy size={16} stroke={1.6} />
        </button>
        <span className="bud-tb-divider" />
        <button title="New connection" onClick={onAddServer}>
          <IconPlugConnected size={16} stroke={1.6} />
        </button>
        <button title="Reconnect" onClick={() => activeId && void openAndIntrospect(activeId)} disabled={!activeId}>
          <IconRefresh size={16} stroke={1.6} />
        </button>
        <span className="bud-tb-divider" />
        <button className="bud-tb-run" title="Execute (⌘↵)" onClick={() => void run()} disabled={!activeId}>
          <IconPlayerPlay size={16} stroke={1.7} />
        </button>
        <span className="bud-tb-divider" />
        <button title="SQL history" onClick={() => setView("history")}>
          <IconHistory size={16} stroke={1.6} />
        </button>
        <button title="Settings" onClick={() => setTopView("settings")}>
          <IconSettings size={16} stroke={1.6} />
        </button>
        <span className="bud-tb-divider" />
        <button
          className="bud-cmdk-pill"
          title="Command palette (⌘K)"
          onClick={() => window.dispatchEvent(new Event("mamasql:cmdk"))}
        >
          <IconSearch size={13} stroke={1.8} />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
      <div className="bud-tb-title">{title}</div>
      <input
        ref={fileRef}
        type="file"
        accept=".sql,text/plain"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
