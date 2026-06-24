import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import type { ConnectionConfig } from "../ipc/types";
import { useStore } from "../state/store";
import { DataView } from "./bud/DataView";
import { DialogHost } from "./bud/DialogHost";
import { ErDiagram } from "./bud/ErDiagram";
import { ImportCsvModal } from "./bud/ImportCsvModal";
import { SchemaDiff } from "./bud/SchemaDiff";
import { ServerModal } from "./bud/ServerModal";
import { ShortcutsOverlay } from "./bud/ShortcutsOverlay";
import { Sources } from "./bud/Sources";
import { StatusBar } from "./bud/StatusBar";
import { ToastHost } from "./bud/ToastHost";
import { TopNav } from "./bud/TopNav";
import { WorkspacePanel } from "./bud/WorkspacePanel";
import { CommandPalette } from "./dash/CommandPalette";

function initialWidth(): number {
  try {
    return Number(localStorage.getItem("mamasql.sidebarW")) || 270;
  } catch {
    return 270;
  }
}

export function AppShell() {
  const [serverModal, setServerModal] = useState<ConnectionConfig | "new" | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const topView = useStore((s) => s.topView);
  const restoreSession = useStore((s) => s.restoreSession);

  // Restore the last connection + editor contents on load.
  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const openAdd = () => setServerModal("new");
  const openEdit = (c: ConnectionConfig) => setServerModal(c);

  const onResize = (e: React.MouseEvent) => {
    e.preventDefault();
    let last = sidebarWidth;
    const move = (ev: MouseEvent) => {
      last = Math.max(190, Math.min(ev.clientX, 560));
      setSidebarWidth(last);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      try {
        localStorage.setItem("mamasql.sidebarW", String(last));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className={`bud-app ${sidebarHidden ? "sidebar-hidden" : ""}`}
      style={{ ["--sidebar-w" as string]: `${sidebarWidth}px` }}
    >
      <TopNav onAddServer={openAdd} onToggleSidebar={() => setSidebarHidden((v) => !v)} sidebarHidden={sidebarHidden} />
      <div className="bud-body">
        <Sources onAddServer={openAdd} onEditServer={openEdit} />
        <AnimatePresence mode="wait" initial={false}>
          {topView === "data" ? (
            <DataView key="data" />
          ) : (
            <WorkspacePanel key={topView} view={topView} />
          )}
        </AnimatePresence>
      </div>
      {!sidebarHidden && <div className="bud-hsplit" onMouseDown={onResize} title="Drag to resize sidebar" />}
      <StatusBar />
      <AnimatePresence>
        {serverModal && (
          <ServerModal
            key="server-modal"
            existing={serverModal === "new" ? null : serverModal}
            onClose={() => setServerModal(null)}
          />
        )}
      </AnimatePresence>
      <CommandPalette onAddServer={openAdd} />
      <ShortcutsOverlay />
      <ErDiagram />
      <ImportCsvModal />
      <SchemaDiff />
      <ToastHost />
      <DialogHost />
    </div>
  );
}
