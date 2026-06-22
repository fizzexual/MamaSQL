import {
  IconActivity,
  IconArrowRight,
  IconArrowUpRight,
  IconBolt,
  IconBrandMysql,
  IconCaretDownFilled,
  IconCaretUpFilled,
  IconChartLine,
  IconChevronDown,
  IconCode,
  IconDatabase,
  IconFileText,
  IconHistory,
  IconLayoutGrid,
  IconLoader2,
  IconPlus,
  IconSearch,
  IconServer,
  IconSettings,
  IconSparkles,
  IconTable,
  IconTag,
  IconTerminal2,
} from "@tabler/icons-react";
import { type ComponentType, useEffect, useState } from "react";
import type { ConnectionConfig } from "../../ipc/types";
import { useStore } from "../../state/store";
import { ConnectionModal } from "./ConnectionModal";

type Icon = ComponentType<{ size?: number; stroke?: number; className?: string }>;
type Dest = { top?: "data" | "automation" | "settings"; view?: "data" | "sql" | "history" };
type Page = "dashboard" | "connections" | "logs";

const NAV: { id: string; label: string; Icon: Icon; page?: Page; go?: Dest }[] = [
  { id: "dashboard", label: "Dashboard", Icon: IconLayoutGrid, page: "dashboard" },
  { id: "connections", label: "Connections", Icon: IconServer, page: "connections" },
  { id: "tables", label: "Tables", Icon: IconTable, go: { top: "data" } },
  { id: "editor", label: "Query Editor", Icon: IconTerminal2, go: { top: "data", view: "sql" } },
  { id: "browser", label: "Data Browser", Icon: IconDatabase, go: { top: "data", view: "data" } },
  { id: "automation", label: "Automation", Icon: IconBolt, go: { top: "automation" } },
  { id: "history", label: "History", Icon: IconHistory, go: { top: "data", view: "history" } },
  { id: "logs", label: "Logs", Icon: IconFileText, page: "logs" },
];

function EngineIcon({ engine, size = 18 }: { engine: string; size?: number }) {
  if (engine === "mysql") return <IconBrandMysql size={size} stroke={1.7} />;
  return <IconDatabase size={size} stroke={1.7} />;
}

/* ---------------------------------------------------------------- Overview */

function TopoPattern() {
  const blob =
    "M0,-92 C52,-94 94,-56 96,-9 C99,42 60,96 8,99 C-47,102 -97,62 -99,8 C-101,-46 -58,-90 0,-92 Z";
  const rings = Array.from({ length: 13 }, (_, i) => 0.16 + i * 0.125);
  return (
    <svg className="dash-topo" viewBox="0 0 420 300" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="topoGlow" cx="34%" cy="64%" r="62%">
          <stop offset="0%" stopColor="#ff2d8e" stopOpacity="0.6" />
          <stop offset="42%" stopColor="#c026d3" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="topoLine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5bb0" />
          <stop offset="100%" stopColor="#9d22b8" />
        </linearGradient>
      </defs>
      <rect width="420" height="300" fill="url(#topoGlow)" />
      <g stroke="url(#topoLine)" fill="none" strokeWidth="1.1">
        {rings.map((s, i) => (
          <path
            key={s}
            d={blob}
            transform={`translate(150 175) scale(${s})`}
            opacity={Math.max(0.12, 0.62 - i * 0.035)}
          />
        ))}
      </g>
    </svg>
  );
}

const BARS = [
  { m: "Jun", v: 19 },
  { m: "Feb", v: 25 },
  { m: "Mar", v: 20 },
  { m: "Apr", v: 30, hot: true },
  { m: "May", v: 22 },
  { m: "Jul", v: 21 },
];
const Y_TICKS = [30, 25, 20, 15, 10, 5, 0];
const Y_MAX = 32;

function QueryChart() {
  const [range, setRange] = useState<"Monthly" | "Yearly">("Monthly");
  return (
    <section className="dash-card dash-chart-card">
      <div className="dash-card-head">
        <h3>Query Volume Breakdown</h3>
        <span className="dash-round-ic">
          <IconChartLine size={16} stroke={1.7} />
        </span>
      </div>
      <div className="dash-seg">
        <button className={range === "Monthly" ? "on" : ""} onClick={() => setRange("Monthly")}>
          Monthly
        </button>
        <button className={range === "Yearly" ? "on" : ""} onClick={() => setRange("Yearly")}>
          Yearly
        </button>
      </div>

      <div className="dash-chart">
        <div className="dash-yaxis">
          {Y_TICKS.map((t) => (
            <span key={t}>{t === 0 ? "0" : `${t}k`}</span>
          ))}
        </div>
        <div className="dash-plot">
          <div className="dash-grid">
            {Y_TICKS.map((t) => (
              <i key={t} />
            ))}
          </div>
          <div className="dash-bars">
            {BARS.map((b) => (
              <div className="dash-bar-col" key={b.m}>
                <div className={`dash-bar ${b.hot ? "hot" : ""}`} style={{ height: `${(b.v / Y_MAX) * 100}%` }}>
                  {b.hot && (
                    <>
                      <span className="dash-bar-stem" />
                      <span className="dash-bar-dot" />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="dash-tooltip">
            <div className="dash-tt-title">April</div>
            <div className="dash-tt-row">
              <span className="dot" /> <b>24,318</b> <span className="lbl">Reads</span>
            </div>
            <div className="dash-tt-row">
              <span className="dot" /> <b>5,204</b> <span className="lbl">Writes</span>
            </div>
          </div>
          <span className="dash-caret" />
        </div>
      </div>
      <div className="dash-xaxis">
        {BARS.map((b) => (
          <span key={b.m}>{b.m}</span>
        ))}
      </div>
    </section>
  );
}

const TABLES = [
  { name: "audit_log", schema: "ops", count: "2.10M", pct: "-4%", dir: "down", w: 92 },
  { name: "users", schema: "public", count: "1.24M", pct: "+12%", dir: "up", w: 78 },
  { name: "orders", schema: "public", count: "842K", pct: "+8%", dir: "up", w: 64 },
];

function TopTables() {
  return (
    <section className="dash-card dash-items-card">
      <div className="dash-card-head">
        <div className="dash-head-titled">
          <span className="dash-round-ic pink">
            <IconTag size={15} stroke={1.7} />
          </span>
          <h3>Top Tables</h3>
        </div>
        <button className="dash-drop">
          By rows <IconChevronDown size={14} stroke={1.8} />
        </button>
      </div>
      <div className="dash-items">
        {TABLES.map((t) => (
          <div className="dash-item" key={t.name}>
            <div className="dash-item-name">
              <span>{t.name}</span>
              <span className="sub">{t.schema}</span>
            </div>
            <div className="dash-item-bar">
              <div className="dash-item-fill" style={{ width: `${t.w}%` }} />
            </div>
            <div className="dash-item-val">
              <span className="amt">{t.count}</span>
              <span className={`pct ${t.dir}`}>
                {t.pct}
                {t.dir === "up" ? <IconCaretUpFilled size={11} /> : <IconCaretDownFilled size={11} />}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const QUERIES = [
  { sql: "SELECT * FROM users WHERE active = true", rows: "1,204", status: "Success", kind: "success" },
  { sql: "UPDATE orders SET status = 'paid'", rows: "32", status: "Success", kind: "success" },
  { sql: "ALTER TABLE events ADD COLUMN source text", rows: "—", status: "Running", kind: "running" },
];

function RecentQueries() {
  return (
    <section className="dash-card dash-txn-card">
      <div className="dash-card-head">
        <h3>Recent Queries</h3>
        <button className="dash-drop">
          Last 24h <IconChevronDown size={14} stroke={1.8} />
        </button>
      </div>
      <div className="dash-txn-cols">
        <span>Query</span>
        <span>Rows</span>
        <span>Status</span>
      </div>
      <div className="dash-txn-list">
        {QUERIES.map((q) => (
          <div className="dash-txn" key={q.sql}>
            <div className="dash-txn-name">
              <span className="dash-txn-badge">
                <IconCode size={16} stroke={1.8} />
              </span>
              <span className="dash-txn-q">{q.sql}</span>
            </div>
            <span className="dash-txn-amt">{q.rows}</span>
            <span className={`dash-pill ${q.kind}`}>{q.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Overview({ enter }: { enter: (d?: Dest) => void }) {
  return (
    <main className="dash-main">
      <header className="dash-top">
        <h1>Database overview</h1>
        <button className="dash-viewmore" onClick={() => enter({ top: "data" })}>
          View more <IconArrowRight size={17} stroke={1.8} />
        </button>
      </header>

      <div className="dash-row dash-row-top">
        <section className="dash-card dash-ai-card">
          <TopoPattern />
          <div className="dash-ai-body">
            <h2>AI SQL Assistant</h2>
            <p>Write, explain and optimize queries with real-time AI.</p>
          </div>
          <button className="dash-ai-cta" onClick={() => enter({ top: "data", view: "sql" })}>
            Open SQL editor <IconArrowRight size={16} stroke={1.8} />
          </button>
        </section>

        <section className="dash-card dash-wallet-card">
          <div className="dash-wallet-head">
            <span className="dash-wallet-ic">
              <IconDatabase size={20} stroke={1.7} />
            </span>
            <div className="dash-wallet-id">
              <h3>Primary database</h3>
              <span>postgres · localhost:5432</span>
            </div>
            <button className="dash-link" onClick={() => enter({ top: "data" })}>
              Manage
            </button>
          </div>
          <div className="dash-wallet-foot">
            <span className="dash-wallet-label">Total rows</span>
            <div className="dash-wallet-row">
              <span className="dash-wallet-amt">1,284,503</span>
              <span className="dash-wallet-trend">
                <IconArrowUpRight size={14} stroke={2} /> 12% this week
              </span>
            </div>
          </div>
        </section>

        <section className="dash-card dash-upgrade-card">
          <div className="dash-upgrade-top">
            <span className="dash-upgrade-mark">
              <IconSparkles size={18} stroke={1.8} />
            </span>
            <button className="dash-pro-btn" onClick={() => enter({ top: "settings" })}>
              Upgrade to PRO
            </button>
          </div>
          <div className="dash-upgrade-body">
            <h2>Upgrade Your Data Stack</h2>
            <p>Unlock AI queries, unlimited connections and team sharing.</p>
          </div>
        </section>
      </div>

      <div className="dash-row dash-row-bottom">
        <QueryChart />
        <div className="dash-col">
          <TopTables />
          <RecentQueries />
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------- Connections */

function connSub(c: ConnectionConfig): string {
  if (c.engine === "sqlite") return c.database || "local file";
  return `${c.host || "localhost"}${c.port ? `:${c.port}` : ""}`;
}

function ConnectionsPage({
  onAdd,
  onEdit,
  enter,
}: {
  onAdd: () => void;
  onEdit: (c: ConnectionConfig) => void;
  enter: (d?: Dest) => void;
}) {
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const open = async (c: ConnectionConfig) => {
    if (connectingId) return;
    if (c.id === activeId) {
      enter({ top: "data" });
      return;
    }
    setConnectingId(c.id);
    try {
      await openAndIntrospect(c.id);
      enter({ top: "data" });
    } catch {
      setConnectingId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = q
    ? connections.filter((c) => `${c.name} ${c.host ?? ""} ${c.database ?? ""} ${c.engine}`.toLowerCase().includes(q))
    : connections;

  return (
    <main className="dash-main dash-page">
      <header className="dash-top">
        <div>
          <h1>Connections</h1>
          <p className="dash-sub">Manage your database servers and data sources.</p>
        </div>
        <button className="dash-add-btn" onClick={onAdd}>
          <IconPlus size={17} stroke={2} /> Add connection
        </button>
      </header>

      <div className="dash-conn-toolbar">
        <div className="dash-search">
          <IconSearch size={15} stroke={1.8} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search connections…" />
        </div>
        <span className="dash-conn-count">
          {shown.length} {shown.length === 1 ? "connection" : "connections"}
        </span>
      </div>

      <div className="dash-conn-grid">
        {shown.map((c, i) => {
          const isActive = c.id === activeId;
          const isConnecting = connectingId === c.id;
          return (
            <section
              className={`dash-card dash-conn-card ${isActive ? "on" : ""} ${isConnecting ? "connecting" : ""}`}
              key={c.id}
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <div className="dash-conn-top">
                <span className={`dash-conn-badge ${c.engine}`}>
                  <EngineIcon engine={c.engine} />
                </span>
                <div className="dash-conn-id">
                  <h3>{c.name}</h3>
                  <span>{connSub(c)}</span>
                </div>
                <span className={`dash-conn-chip ${isActive ? "on" : ""}`}>{isActive ? "Connected" : "Idle"}</span>
              </div>
              <div className="dash-conn-meta">
                <div>
                  <span className="k">Database</span>
                  <span className="v">{c.database || "—"}</span>
                </div>
                <div>
                  <span className="k">User</span>
                  <span className="v">{c.username || "—"}</span>
                </div>
              </div>
              <div className="dash-conn-actions">
                <button className="dash-conn-open" onClick={() => open(c)} disabled={isConnecting}>
                  {isConnecting ? (
                    <>
                      <IconLoader2 size={15} className="dash-spin" /> Connecting…
                    </>
                  ) : isActive ? (
                    "Open data"
                  ) : (
                    "Connect"
                  )}
                </button>
                <button className="dash-conn-edit" onClick={() => onEdit(c)} title="Edit connection">
                  <IconSettings size={16} stroke={1.7} />
                </button>
              </div>
            </section>
          );
        })}

        {shown.length === 0 && <div className="dash-conn-none">No connections match “{query}”.</div>}

        <button className="dash-card dash-conn-add" onClick={onAdd} style={{ animationDelay: `${shown.length * 45}ms` }}>
          <span className="dash-conn-add-ic">
            <IconPlus size={22} stroke={2} />
          </span>
          <span className="dash-conn-add-t">Add connection</span>
        </button>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------- Logs */

const KPIS = [
  { label: "Queries · 24h", val: "8,420", delta: "6%", up: true, good: true },
  { label: "Errors", val: "12", delta: "3", up: false, good: true },
  { label: "Avg latency", val: "42 ms", delta: "8 ms", up: false, good: true },
  { label: "Slow queries", val: "5", delta: "2", up: true, good: false },
];

const LOGS = [
  { level: "query", time: "12:04:22", msg: "SELECT * FROM users WHERE active = true", meta: "1,204 rows · 18ms" },
  { level: "query", time: "12:03:58", msg: "UPDATE orders SET status = 'paid' WHERE id = 4821", meta: "1 row · 6ms" },
  { level: "warn", time: "12:01:10", msg: "Slow query: SELECT … FROM audit_log JOIN events …", meta: "2.1s · 84k rows" },
  { level: "error", time: "11:58:44", msg: 'ERROR: relation "invoces" does not exist', meta: "0 rows" },
  { level: "info", time: "11:55:02", msg: "Connection opened — postgres@localhost:5432", meta: "—" },
  { level: "query", time: "11:54:30", msg: "CREATE INDEX idx_users_email ON users(email)", meta: "OK · 312ms" },
  { level: "info", time: "11:50:18", msg: "Backup completed — nightly_dump.sql", meta: "42 MB" },
  { level: "query", time: "11:49:01", msg: "DELETE FROM sessions WHERE expires < now()", meta: "208 rows · 22ms" },
];

function LogsPage() {
  const [filter, setFilter] = useState<"all" | "query" | "error">("all");
  const shown = LOGS.filter((l) =>
    filter === "all" ? true : filter === "error" ? l.level === "error" || l.level === "warn" : l.level === "query",
  );
  return (
    <main className="dash-main dash-page">
      <header className="dash-top">
        <div>
          <h1>Logs</h1>
          <p className="dash-sub">Query activity and server events.</p>
        </div>
        <button className="dash-drop">
          Last 24h <IconChevronDown size={14} stroke={1.8} />
        </button>
      </header>

      <div className="dash-kpis">
        {KPIS.map((k, i) => (
          <div className="dash-card dash-kpi" key={k.label} style={{ animationDelay: `${i * 55}ms` }}>
            <span className="dash-kpi-label">{k.label}</span>
            <span className="dash-kpi-val">{k.val}</span>
            <span className={`dash-kpi-trend ${k.good ? "good" : "bad"}`}>
              {k.up ? <IconCaretUpFilled size={11} /> : <IconCaretDownFilled size={11} />}
              {k.up ? "+" : "−"}
              {k.delta}
            </span>
          </div>
        ))}
      </div>

      <section className="dash-card dash-logs-card">
        <div className="dash-card-head">
          <div className="dash-head-titled">
            <span className="dash-round-ic pink">
              <IconActivity size={15} stroke={1.7} />
            </span>
            <h3>Activity</h3>
          </div>
          <div className="dash-log-filters">
            {(["all", "query", "error"] as const).map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "query" ? "Queries" : "Errors"}
              </button>
            ))}
          </div>
        </div>
        <div className="dash-log-list">
          {shown.map((l, i) => (
            <div className="dash-log" key={`${l.time}-${i}`} style={{ animationDelay: `${i * 40}ms` }}>
              <span className={`dash-log-level ${l.level}`}>{l.level}</span>
              <span className="dash-log-time">{l.time}</span>
              <span className="dash-log-msg">{l.msg}</span>
              <span className="dash-log-meta">{l.meta}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------- Shell */

export function Dashboard() {
  const setScreen = useStore((s) => s.setScreen);
  const setTopView = useStore((s) => s.setTopView);
  const setView = useStore((s) => s.setView);
  const loadConnections = useStore((s) => s.loadConnections);
  const [page, setPage] = useState<Page>("dashboard");
  const [modal, setModal] = useState<null | "new" | ConnectionConfig>(null);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const enter = (dest?: Dest) => {
    setScreen("workspace");
    if (dest?.top) setTopView(dest.top);
    if (dest?.view) setView(dest.view);
  };

  return (
    <div className="dash-app">
      <aside className="dash-side">
        <nav className="dash-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`dash-nav-item ${n.page && page === n.page ? "active" : ""}`}
              onClick={() => {
                if (n.page) setPage(n.page);
                else if (n.go) enter(n.go);
              }}
            >
              <n.Icon size={19} stroke={1.6} />
              {n.label}
            </button>
          ))}
        </nav>
        <button className="dash-nav-item dash-settings" onClick={() => enter({ top: "settings" })}>
          <IconSettings size={19} stroke={1.6} />
          Settings
        </button>
      </aside>

      {page === "connections" ? (
        <ConnectionsPage onAdd={() => setModal("new")} onEdit={(c) => setModal(c)} enter={enter} />
      ) : page === "logs" ? (
        <LogsPage />
      ) : (
        <Overview enter={enter} />
      )}

      {modal && <ConnectionModal existing={modal === "new" ? null : modal} onClose={() => setModal(null)} />}
    </div>
  );
}
