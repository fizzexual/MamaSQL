import { useState } from "react";
import type { ConnectionConfig } from "../ipc/types";
import { useStore } from "../state/store";
import { DataView } from "./bud/DataView";
import { DialogHost } from "./bud/DialogHost";
import { ServerModal } from "./bud/ServerModal";
import { ShortcutsOverlay } from "./bud/ShortcutsOverlay";
import { Sources } from "./bud/Sources";
import { StatusBar } from "./bud/StatusBar";
import { TopNav } from "./bud/TopNav";
import { WorkspacePanel } from "./bud/WorkspacePanel";
import { CommandPalette } from "./dash/CommandPalette";

export function AppShell() {
  const [serverModal, setServerModal] = useState<ConnectionConfig | "new" | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const topView = useStore((s) => s.topView);

  const openAdd = () => setServerModal("new");
  const openEdit = (c: ConnectionConfig) => setServerModal(c);

  return (
    <div className={`bud-app ${sidebarHidden ? "sidebar-hidden" : ""}`}>
      <TopNav onAddServer={openAdd} onToggleSidebar={() => setSidebarHidden((v) => !v)} sidebarHidden={sidebarHidden} />
      <div className="bud-body">
        <Sources onAddServer={openAdd} onEditServer={openEdit} />
        {topView === "data" ? <DataView /> : <WorkspacePanel view={topView} />}
      </div>
      <StatusBar />
      {serverModal && (
        <ServerModal existing={serverModal === "new" ? null : serverModal} onClose={() => setServerModal(null)} />
      )}
      <CommandPalette onAddServer={openAdd} />
      <ShortcutsOverlay />
      <DialogHost />
    </div>
  );
}
