import {
  IconBolt,
  IconBrowser,
  IconCirclePlus,
  IconClock,
  IconMail,
  IconTrash,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { confirmDialog } from "../../state/dialog";
import type { TopView } from "../../state/store";
import { useStore } from "../../state/store";

const SCREENS = [
  { name: "Home", path: "/", role: "Basic" },
  { name: "Employees", path: "/employees", role: "Basic" },
  { name: "Submissions", path: "/submissions", role: "Power" },
  { name: "Settings", path: "/settings", role: "Admin" },
];

const AUTOMATIONS = [
  { name: "Weekly timesheet reminder", trigger: "Schedule", icon: IconClock, on: true },
  { name: "Email on new submission", trigger: "Row created", icon: IconMail, on: true },
  { name: "Flag overtime > 9h", trigger: "Row updated", icon: IconBolt, on: false },
];

export function WorkspacePanel({ view }: { view: TopView }) {
  if (view === "design") return <DesignPanel />;
  if (view === "automation") return <AutomationPanel />;
  return <SettingsPanel />;
}

function PanelShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="bud-main bud-wp">
      <div className="bud-wp-head">
        <h1 className="bud-wp-title">{title}</h1>
        <p className="bud-wp-sub">{subtitle}</p>
      </div>
      <div className="bud-wp-body">{children}</div>
    </main>
  );
}

function DesignPanel() {
  return (
    <PanelShell title="Design" subtitle="Screens generated from your data sources.">
      <div className="bud-wp-toolbar">
        <button className="bud-create-view">
          <IconCirclePlus size={15} stroke={1.8} /> New screen
        </button>
      </div>
      <div className="bud-wp-cards">
        {SCREENS.map((s) => (
          <div key={s.path} className="bud-card">
            <div className="bud-card-ic">
              <IconBrowser size={18} stroke={1.6} />
            </div>
            <div className="bud-card-main">
              <div className="bud-card-title">{s.name}</div>
              <div className="bud-card-sub">{s.path}</div>
            </div>
            <span className="bud-pill bud-role">{s.role}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function AutomationPanel() {
  return (
    <PanelShell title="Automation" subtitle="Workflows that run when something happens in your data.">
      <div className="bud-wp-toolbar">
        <button className="bud-create-view">
          <IconCirclePlus size={15} stroke={1.8} /> New automation
        </button>
      </div>
      <div className="bud-wp-cards">
        {AUTOMATIONS.map((a) => (
          <div key={a.name} className="bud-card">
            <div className="bud-card-ic">
              <a.icon size={18} stroke={1.6} />
            </div>
            <div className="bud-card-main">
              <div className="bud-card-title">{a.name}</div>
              <div className="bud-card-sub">Trigger: {a.trigger}</div>
            </div>
            <span className={`bud-status ${a.on ? "on" : "off"}`}>{a.on ? "Enabled" : "Paused"}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function SettingsPanel() {
  const conn = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const deleteConnection = useStore((s) => s.deleteConnection);

  if (!conn) {
    return (
      <PanelShell title="Settings" subtitle="Pick a data source on the left to manage it.">
        <div className="bud-empty">No data source selected.</div>
      </PanelShell>
    );
  }

  const fields: [string, string][] = [
    ["Name", conn.name],
    ["Engine", conn.engine],
    ["Host", conn.host ?? "—"],
    ["Port", conn.port != null ? String(conn.port) : "—"],
    ["Database", conn.database],
    ["Username", conn.username ?? "—"],
  ];

  return (
    <PanelShell title="Settings" subtitle={`Connection details for ${conn.name}.`}>
      <div className="bud-settings-card">
        {fields.map(([label, value]) => (
          <div key={label} className="bud-setting-row">
            <span className="bud-setting-label">{label}</span>
            <input className="bud-setting-input" value={value} readOnly />
          </div>
        ))}
        <div className="bud-setting-actions">
          <button
            className="bud-danger-btn"
            onClick={async () => {
              if (
                await confirmDialog({
                  title: "Delete connection",
                  message: `Delete "${conn.name}"? This removes the saved connection.`,
                  confirmLabel: "Delete",
                  danger: true,
                })
              ) {
                void deleteConnection(conn.id);
              }
            }}
          >
            <IconTrash size={15} stroke={1.7} /> Delete connection
          </button>
        </div>
      </div>
    </PanelShell>
  );
}
