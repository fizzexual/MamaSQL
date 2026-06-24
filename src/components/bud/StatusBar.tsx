import { IconLock, IconPlugConnected, IconPlugConnectedX } from "@tabler/icons-react";
import { useStore } from "../../state/store";

export function StatusBar() {
  const conn = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const result = useStore((s) => s.result);
  const loadingResult = useStore((s) => s.loadingResult);
  const selection = useStore((s) => s.selection);
  const readOnly = useStore((s) => s.readOnlyConns.includes(s.activeConnectionId ?? ""));

  const rows = result?.rows.length ?? 0;
  const sel = selection.length;
  const secs = result ? (result.elapsedMs / 1000).toFixed(3) : "0.000";

  return (
    <div className="bud-statusbar">
      <div className="bud-status-l">
        <span className="bud-status-fmt">
          Format: <em>&lt;Select a Cell&gt;</em>
        </span>
        {conn ? (
          <span className="bud-status-conn">
            <IconPlugConnected size={13} stroke={1.8} />
            <span className="bud-status-engine">{conn.engine}</span>
            {conn.name}
          </span>
        ) : (
          <span className="bud-status-conn off">
            <IconPlugConnectedX size={13} stroke={1.8} />
            Not connected
          </span>
        )}
        {conn?.env && (
          <span className={`bud-status-env ${conn.env}`} title={`${conn.env} environment`}>
            {conn.env === "prod" ? "PRODUCTION" : conn.env.toUpperCase()}
          </span>
        )}
        {readOnly && (
          <span className="bud-status-ro" title="This connection is read-only">
            <IconLock size={12} stroke={1.9} /> Read-only
          </span>
        )}
      </div>
      <div className="bud-status-r">
        {loadingResult && <span className="bud-status-item">Loading…</span>}
        {sel > 0 && <span className="bud-status-item accent">{sel} selected</span>}
        <span className="bud-status-item">{secs}/0.000 sec</span>
        <span className="bud-status-item">{rows > 0 ? `1/${rows.toLocaleString()}` : "0/0"}</span>
        <span className="bud-status-item">1-1</span>
        <span className="bud-status-mem" title="Heap memory">
          <span className="bud-status-mem-fill" style={{ width: "10%" }} />
          <span className="bud-status-mem-t">201M of 2048M</span>
        </span>
      </div>
    </div>
  );
}
