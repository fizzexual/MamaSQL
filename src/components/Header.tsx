import { useStore } from "../state/store";

export function Header() {
  const active = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const run = useStore((s) => s.run);
  const running = useStore((s) => s.running);

  return (
    <header className="header">
      <div className="header-left">
        <span className="logo">
          <span className="logo-mark">▦</span> MamaSQL
        </span>
        <nav className="menu">
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span>Help</span>
        </nav>
      </div>
      <div className="header-center">{active ? active.name : "No connection"}</div>
      <div className="header-right">
        <button className="btn-run" onClick={() => run()} disabled={running}>
          {running ? "Running…" : "▶ Run"}
          <kbd>⌃⏎</kbd>
        </button>
      </div>
    </header>
  );
}
