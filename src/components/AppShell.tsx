import { useState } from "react";
import type { ConnectionConfig } from "../ipc/types";
import { useStore } from "../state/store";
import { DataView } from "./bud/DataView";
import { DialogHost } from "./bud/DialogHost";
import { ServerModal } from "./bud/ServerModal";
import { Sources } from "./bud/Sources";
import { TopNav } from "./bud/TopNav";
import { WorkspacePanel } from "./bud/WorkspacePanel";

export function AppShell() {
  const [serverModal, setServerModal] = useState<ConnectionConfig | "new" | null>(null);
  const topView = useStore((s) => s.topView);
  return (
    <div className="bud-app">
      <TopNav onAddServer={() => setServerModal("new")} />
      <div className="bud-body">
        <Sources onAddServer={() => setServerModal("new")} onEditServer={(c) => setServerModal(c)} />
        {topView === "data" ? <DataView /> : <WorkspacePanel view={topView} />}
      </div>
      {serverModal && (
        <ServerModal existing={serverModal === "new" ? null : serverModal} onClose={() => setServerModal(null)} />
      )}
      <DialogHost />
    </div>
  );
}
