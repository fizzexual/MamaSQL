import { useEffect } from "react";
import { useStore } from "../state/store";

export function HistoryPanel() {
  const history = useStore((s) => s.history);
  const loadHistory = useStore((s) => s.loadHistory);
  const setSql = useStore((s) => s.setSql);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <section className="panel">
      <div className="panel-head">History</div>
      <ul className="history">
        {history.length === 0 && <li className="empty">No queries yet.</li>}
        {history.map((h) => (
          <li key={h.id}>
            <button className="hist-item" onClick={() => setSql(h.sql)} title={h.ranAt}>
              {h.sql}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
