import {
  IconChevronDown,
  IconChevronLeft,
  IconPlayerPlay,
  IconRocket,
  IconUsers,
} from "@tabler/icons-react";
import { type TopView, useStore } from "../../state/store";

const TABS: { id: TopView; label: string }[] = [
  { id: "data", label: "Data" },
  { id: "design", label: "Design" },
  { id: "automation", label: "Automation" },
  { id: "settings", label: "Settings" },
];

export function TopNav() {
  const active = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const topView = useStore((s) => s.topView);
  const setTopView = useStore((s) => s.setTopView);
  return (
    <div className="bud-topnav">
      <div className="bud-topnav-left">
        <button className="bud-back" title="Back">
          <IconChevronLeft size={20} stroke={1.8} />
        </button>
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
      <div className="bud-topnav-center">{active ? active.name : "MamaSQL"}</div>
      <div className="bud-topnav-right">
        <span className="bud-avatar">R</span>
        <button className="bud-naction">
          <IconUsers size={16} stroke={1.7} /> Users
        </button>
        <button className="bud-naction bud-preview">
          <IconPlayerPlay size={15} stroke={1.7} /> Preview
        </button>
        <button className="bud-publish">
          <IconRocket size={15} stroke={1.7} /> Publish <IconChevronDown size={13} stroke={1.8} className="caret" />
        </button>
      </div>
    </div>
  );
}
