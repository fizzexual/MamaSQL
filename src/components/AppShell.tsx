import { useState } from "react";
import type { ConnectionConfig } from "../ipc/types";
import { useStore } from "../state/store";
import { DataView } from "./bud/DataView";
import { DialogHost } from "./bud/DialogHost";
import { ServerModal } from "./bud/ServerModal";
import { Sources } from "./bud/Sources";
import { StatusBar } from "./bud/StatusBar";
import { TopNav } from "./bud/TopNav";
import { WorkspacePanel } from "./bud/WorkspacePanel";
import { CommandPalette } from "./dash/CommandPalette";
import { Dashboard } from "./dash/Dashboard";

export function AppShell() {
  const [serverModal, setServerModal] = useState<ConnectionConfig | "new" | null>(null);
  const topView = useStore((s) => s.topView);
  const screen = useStore((s) => s.screen);

  const openAdd = () => setServerModal("new");
  const openEdit = (c: ConnectionConfig) => setServerModal(c);

  return (
    <>
      {screen === "dashboard" ? (
        <Dashboard />
      ) : (
        <div className="bud-app">
          <TopNav onAddServer={openAdd} />
          <div className="bud-body">
            <Sources onAddServer={openAdd} onEditServer={openEdit} />
            {topView === "data" ? <DataView /> : <WorkspacePanel view={topView} />}
          </div>
          <StatusBar />
        </div>
      )}
      {serverModal && (
        <ServerModal existing={serverModal === "new" ? null : serverModal} onClose={() => setServerModal(null)} />
      )}
      <CommandPalette onAddServer={openAdd} />
      <DialogHost />
    </>
  );
}
