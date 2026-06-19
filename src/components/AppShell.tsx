import { DataView } from "./bud/DataView";
import { Sources } from "./bud/Sources";
import { TopNav } from "./bud/TopNav";

export function AppShell() {
  return (
    <div className="bud-app">
      <TopNav />
      <div className="bud-body">
        <Sources />
        <DataView />
      </div>
    </div>
  );
}
