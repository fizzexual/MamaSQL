import { useStore } from "../state/store";
import { DataView } from "./bud/DataView";
import { RowInspector } from "./bud/RowInspector";
import { Sources } from "./bud/Sources";
import { TopNav } from "./bud/TopNav";

export function AppShell() {
  const view = useStore((s) => s.view);
  const inspectorRow = useStore((s) => s.inspectorRow);
  const showInspector = view === "data" && inspectorRow !== null;

  return (
    <div className="bud-app">
      <TopNav />
      <div className={`bud-body ${showInspector ? "with-inspector" : ""}`}>
        <Sources />
        <DataView />
        {showInspector && <RowInspector key={inspectorRow} />}
      </div>
    </div>
  );
}
