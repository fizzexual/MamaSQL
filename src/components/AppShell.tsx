import { useState } from "react";
import { DataView } from "./bud/DataView";
import { ServerModal } from "./bud/ServerModal";
import { Sources } from "./bud/Sources";
import { TopNav } from "./bud/TopNav";

export function AppShell() {
  const [serverOpen, setServerOpen] = useState(false);
  return (
    <div className="bud-app">
      <TopNav onAddServer={() => setServerOpen(true)} />
      <div className="bud-body">
        <Sources onAddServer={() => setServerOpen(true)} />
        <DataView />
      </div>
      {serverOpen && <ServerModal onClose={() => setServerOpen(false)} />}
    </div>
  );
}
