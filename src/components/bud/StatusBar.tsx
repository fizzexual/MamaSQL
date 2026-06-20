import { IconClock, IconPlugConnected, IconPlugConnectedX, IconTable } from "@tabler/icons-react";
import { useStore } from "../../state/store";

export function StatusBar() {
  const conn = useStore((s) => s.connections.find((c) => c.id === s.activeConnectionId));
  const editTable = useStore((s) => s.editTable);
  const result = useStore((s) => s.result);
  const loadingResult = useStore((s) => s.loadingResult);
  const selection = useStore((s) => s.selection);

  const rows = result?.rows.length ?? 0;
  const sel = selection.length;

  return (
    <div className="bud-statusbar">
      <div className="bud-status-l">
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
        {editTable && (
          <span className="bud-status-item">
            <IconTable size={13} stroke={1.7} />
            {editTable.table}
          </span>
        )}
      </div>
      <div className="bud-status-r">
        {sel > 0 && <span className="bud-status-item accent">{sel} selected</span>}
        {loadingResult ? (
          <span className="bud-status-item">Loading…</span>
        ) : result ? (
          <>
            <span className="bud-status-item">
              {rows.toLocaleString()} row{rows === 1 ? "" : "s"}
              {result.truncated ? "+" : ""}
            </span>
            <span className="bud-status-item">
              <IconClock size={13} stroke={1.7} />
              {result.elapsedMs} ms
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
