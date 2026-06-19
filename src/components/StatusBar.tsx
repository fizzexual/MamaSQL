import { useStore } from "../state/store";

export function StatusBar() {
  const result = useStore((s) => s.result);
  const error = useStore((s) => s.error);
  const active = useStore((s) => s.activeConnectionId);

  return (
    <footer className="statusbar">
      <span className={active ? "conn-dot on" : "conn-dot"}>
        {active ? `● ${active}` : "○ not connected"}
      </span>
      <div className="spacer" />
      {error && <span className="status-error">⚠ {error.message ?? error.kind}</span>}
      {result && !error && (
        <span className="status-ok">
          {result.rows.length} rows · {result.elapsedMs} ms
          {result.truncated ? " · truncated" : ""}
        </span>
      )}
    </footer>
  );
}
