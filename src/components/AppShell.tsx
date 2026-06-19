import { ConnectionSidebar } from "./ConnectionSidebar";
import { Header } from "./Header";
import { HistoryPanel } from "./HistoryPanel";
import { ResultsPanel } from "./ResultsPanel";
import { SchemaTree } from "./SchemaTree";
import { SqlEditor } from "./SqlEditor";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  return (
    <div className="app">
      <Header />
      <div className="body">
        <aside className="sidebar">
          <ConnectionSidebar />
          <SchemaTree />
        </aside>
        <main className="workspace">
          <SqlEditor />
          <ResultsPanel />
        </main>
        <aside className="rightbar">
          <HistoryPanel />
        </aside>
      </div>
      <StatusBar />
    </div>
  );
}
