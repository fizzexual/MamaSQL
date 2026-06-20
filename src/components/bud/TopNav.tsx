import { useState } from "react";
import {
  IconBrandMysql,
  IconChevronDown,
  IconDatabase,
  IconPlayerPlay,
  IconPlus,
  IconRocket,
  IconServer,
  IconUsers,
} from "@tabler/icons-react";
import type { ConnectionConfig } from "../../ipc/types";
import { type TopView, useStore } from "../../state/store";

const TABS: { id: TopView; label: string }[] = [
  { id: "data", label: "Data" },
  { id: "design", label: "Design" },
  { id: "automation", label: "Automation" },
  { id: "settings", label: "Settings" },
];

function EngineIcon({ conn, size = 15 }: { conn: ConnectionConfig; size?: number }) {
  if (conn.engine === "mysql") return <IconBrandMysql size={size} stroke={1.7} />;
  return <IconDatabase size={size} stroke={1.7} />;
}

export function TopNav({ onAddServer }: { onAddServer: () => void }) {
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const active = connections.find((c) => c.id === activeId);
  const topView = useStore((s) => s.topView);
  const setTopView = useStore((s) => s.setTopView);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const [open, setOpen] = useState(false);

  return (
    <div className="bud-topnav">
      <div className="bud-topnav-left">
        <div className="bud-brand">
          MAMA<span className="bud-brand-accent">SQL</span>
        </div>
        <span className="bud-topnav-sep" />
        <nav className="bud-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`bud-tab ${topView === t.id ? "active" : ""}`}
              onClick={() => setTopView(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="bud-topnav-center">
        <button className={`bud-connsw ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)}>
          <span className="bud-connsw-ic">
            {active ? <EngineIcon conn={active} size={15} /> : <IconServer size={15} stroke={1.7} />}
          </span>
          <span className={`bud-connsw-name ${active ? "" : "muted"}`}>{active ? active.name : "No connection"}</span>
          <IconChevronDown size={14} stroke={1.8} className="bud-connsw-caret" />
        </button>
        {open && (
          <>
            <div className="bud-menu-backdrop" onClick={() => setOpen(false)} />
            <div className="bud-connsw-menu">
              <div className="bud-connsw-label">Servers</div>
              {connections.length === 0 && <div className="bud-connsw-empty">No servers yet</div>}
              {connections.map((c) => (
                <button
                  key={c.id}
                  className={`bud-connsw-item ${c.id === activeId ? "active" : ""}`}
                  onClick={() => {
                    if (c.id !== activeId) void openAndIntrospect(c.id);
                    setOpen(false);
                  }}
                >
                  <EngineIcon conn={c} size={15} />
                  <span className="bud-connsw-iname">{c.name}</span>
                  {c.id === activeId && <span className="bud-connsw-dot" />}
                </button>
              ))}
              <div className="bud-connsw-div" />
              <button
                className="bud-connsw-add"
                onClick={() => {
                  setOpen(false);
                  onAddServer();
                }}
              >
                <IconPlus size={15} stroke={2} /> Add server
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bud-topnav-right">
        <button className="bud-naction">
          <IconUsers size={16} stroke={1.7} /> Users
        </button>
        <button className="bud-naction bud-preview">
          <IconPlayerPlay size={15} stroke={1.7} /> Preview
        </button>
        <button className="bud-publish">
          <IconRocket size={15} stroke={1.7} /> Publish
          <IconChevronDown size={13} stroke={1.8} className="caret" />
        </button>
        <span className="bud-avatar">R</span>
      </div>
    </div>
  );
}
