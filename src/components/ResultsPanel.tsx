import { useState } from "react";
import { useStore } from "../state/store";
import { ChartView } from "./ChartView";
import { ResultsGrid } from "./ResultsGrid";
import { StatsView } from "./StatsView";

type View = "table" | "chart" | "stats";

export function ResultsPanel() {
  const result = useStore((s) => s.result);
  const [view, setView] = useState<View>("table");

  return (
    <div className="results-panel">
      <div className="view-tabs">
        <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>
          ▦ Table
        </button>
        <button
          className={view === "chart" ? "active" : ""}
          onClick={() => setView("chart")}
          disabled={!result}
        >
          📊 Chart
        </button>
        <button
          className={view === "stats" ? "active" : ""}
          onClick={() => setView("stats")}
          disabled={!result}
        >
          ∑ Stats
        </button>
      </div>
      {view === "table" && <ResultsGrid />}
      {view === "chart" && <ChartView />}
      {view === "stats" && <StatsView />}
    </div>
  );
}
