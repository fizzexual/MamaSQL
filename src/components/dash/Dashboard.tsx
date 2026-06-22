import {
  IconActivity,
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconBookmark,
  IconBrandMysql,
  IconCaretDownFilled,
  IconCaretUpFilled,
  IconChartLine,
  IconChevronDown,
  IconClock,
  IconCode,
  IconDatabase,
  IconFileText,
  IconHistory,
  IconLayoutGrid,
  IconLoader2,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconServer,
  IconSettings,
  IconSparkles,
  IconTable,
  IconTerminal2,
  IconTrash,
} from "@tabler/icons-react";
import { type ComponentType, useEffect, useState } from "react";
import type { ConnectionConfig, Engine } from "../../ipc/types";
import { confirmDialog } from "../../state/dialog";
import { useStore } from "../../state/store";
import { ConnectionModal } from "./ConnectionModal";

type Icon = ComponentType<{ size?: number; stroke?: number; className?: string }>;
type Dest = { top?: "data" | "automation" | "settings"; view?: "data" | "sql" | "history" };
type Page = "home" | "connections" | "logs";
type ModalState = null | { engine?: Engine } | ConnectionConfig;

const NAV: { id: string; label: string; Icon: Icon; page?: Page; go?: Dest }[] = [
  { id: "home", label: "Home", Icon: IconLayoutGrid, page: "home" },
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

function engineLabel(e: string) {
  return e === "postgres" ? "PostgreSQL" : e === "mysql" ? "MySQL" : "SQLite";
}

function connSub(c: ConnectionConfig): string {
  if (c.engine === "sqlite") return c.database || "local file";
  return `${c.host || "localhost"}${c.port ? `:${c.port}` : ""}`;
}

function TopoPattern() {
  const blob =
    "M0,-92 C52,-94 94,-56 96,-9 C99,42 60,96 8,99 C-47,102 -97,62 -99,8 C-101,-46 -58,-90 0,-92 Z";
  const rings = Array.from({ length: 11 }, (_, i) => 0.2 + i * 0.14);
  return (
    <svg className="dash-topo" viewBox="0 0 360 260" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="topoGlow" cx="78%" cy="22%" r="60%">
          <stop offset="0%" stopColor="#ff2d8e" stopOpacity="0.42" />
          <stop offset="45%" stopColor="#c026d3" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="topoLine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5bb0" />
          <stop offset="100%" stopColor="#9d22b8" />
        </linearGradient>
      </defs>
      <rect width="360" height="260" fill="url(#topoGlow)" />
      <g stroke="url(#topoLine)" fill="none" strokeWidth="1">
        {rings.map((s, i) => (
          <path key={s} d={blob} transform={`translate(280 50) scale(${s})`} opacity={Math.max(0.08, 0.4 - i * 0.03)} />
        ))}
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------- chart helpers */

const BARS = [
  { m: "Mon", v: 18 },
  { m: "Tue", v: 24 },
  { m: "Wed", v: 21 },
  { m: "Thu", v: 30, hot: true },
  { m: "Fri", v: 26 },
  { m: "Sat", v: 12 },
  { m: "Sun", v: 9 },
];
const Y_TICKS = [30, 20, 10, 0];
const Y_MAX = 32;

function ActivityChart() {
  const [range, setRange] = useState<"Daily" | "Weekly">("Daily");
  return (
    <section className="dash-card dash-chart-card a-activity">
      <div className="dash-card-head">
        <div className="dash-head-titled">
          <span className="dash-round-ic">
            <IconChartLine size={16} stroke={1.7} />
          </span>
          <h3>Query activity</h3>
        </div>
        <div className="dash-seg">
          <button className={range === "Daily" ? "on" : ""} onClick={() => setRange("Daily")}>
            Daily
          </button>
          <button className={range === "Weekly" ? "on" : ""} onClick={() => setRange("Weekly")}>
            Weekly
          </button>
        </div>
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
            <div className="dash-tt-title">Thursday</div>
            <div className="dash-tt-row">
              <span className="dot" /> <b>24,318</b> <span className="lbl">Reads</span>
            </div>
            <div className="dash-tt-row">
              <span className="dot" /> <b>5,204</b> <span className="lbl">Writes</span>
            </div>
          </div>
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

/* ------------------------------------------------------------------- Home */

const HOME_METRICS = [
  { label: "Tables", val: "48", sub: "across 6 schemas" },
  { label: "Rows", val: "1.28M", sub: "total records" },
  { label: "Storage", val: "4.2 GB", sub: "on disk" },
  { label: "Indexes", val: "112", sub: "12 unused" },
  { label: "Avg query", val: "24 ms", sub: "last 24h" },
];

const LARGEST = [
  { name: "audit_log", schema: "ops", size: "1.6 GB", rows: "2.10M", w: 100 },
  { name: "events", schema: "analytics", size: "920 MB", rows: "1.84M", w: 70 },
  { name: "users", schema: "public", size: "412 MB", rows: "1.24M", w: 44 },
  { name: "orders", schema: "public", size: "180 MB", rows: "842K", w: 24 },
];

const RECENT = [
  { sql: "SELECT * FROM users WHERE active = true", when: "2m" },
  { sql: "UPDATE orders SET status = 'paid' WHERE id = 4821", when: "8m" },
  { sql: "SELECT count(*) FROM events WHERE ts > now() - interval '1 day'", when: "21m" },
  { sql: "DELETE FROM sessions WHERE expires < now()", when: "1h" },
  { sql: "ALTER TABLE events ADD COLUMN source text", when: "2h" },
];

const SAVED = [
  { name: "Active users", sql: "SELECT * FROM users WHERE active = true" },
  { name: "Daily signups", sql: "SELECT date_trunc('day', created_at) d, count(*) FROM users GROUP BY 1" },
  { name: "Top customers", sql: "SELECT customer_id, sum(total) FROM orders GROUP BY 1 ORDER BY 2 DESC" },
  { name: "Stale sessions", sql: "SELECT * FROM sessions WHERE expires < now()" },
];

function Home({ enter, connections, onAdd }: { enter: (d?: Dest) => void; connections: ConnectionConfig[]; onAdd: () => void }) {
  const activeId = useStore((s) => s.activeConnectionId);
  const setSql = useStore((s) => s.setSql);
  const run = useStore((s) => s.run);
  const [text, setText] = useState("SELECT *\nFROM users\nWHERE active = true\nLIMIT 100;");

  const loadQuery = (sql: string) => {
    setSql(sql);
    enter({ top: "data", view: "sql" });
  };
  const runConsole = () => {
    setSql(text);
    if (activeId) void run();
    enter({ top: "data", view: "sql" });
  };

  const metrics = [{ label: "Databases", val: String(connections.length), sub: "connected sources" }, ...HOME_METRICS];

  return (
    <main className="dash-main dash-home">
      <header className="dash-top">
        <div>
          <h1>Workspace</h1>
          <p className="dash-sub">
            {activeId ? "Connected · " : "No active connection · "}
            {connections.length} {connections.length === 1 ? "source" : "sources"}
          </p>
        </div>
        <div className="dash-home-actions">
          <button className="dash-ghost-btn" onClick={onAdd}>
            <IconPlus size={16} stroke={2} /> New connection
          </button>
          <button className="dash-add-btn" onClick={() => enter({ top: "data", view: "sql" })}>
            <IconBolt size={16} stroke={2} /> New query
          </button>
        </div>
      </header>

      <div className="dash-metrics">
        {metrics.map((m) => (
          <div className="dash-card dash-metric" key={m.label}>
            <span className="dash-metric-label">{m.label}</span>
            <span className="dash-metric-val">{m.val}</span>
            <span className="dash-metric-sub">{m.sub}</span>
          </div>
        ))}
      </div>

      <div className="dash-home-grid">
        <ActivityChart />

        <section className="dash-card dash-console a-console">
          <TopoPattern />
          <div className="dash-card-head">
            <div className="dash-head-titled">
              <span className="dash-round-ic pink">
                <IconTerminal2 size={15} stroke={1.7} />
              </span>
              <h3>Run SQL</h3>
            </div>
            <span className="dash-console-conn">{activeId ? "main" : "no connection"}</span>
          </div>
          <textarea
            className="dash-console-input"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="dash-console-foot">
            <button className="dash-console-ai" onClick={() => loadQuery(text)}>
              <IconSparkles size={15} stroke={1.7} /> Ask AI
            </button>
            <button className="dash-console-run" onClick={runConsole}>
              <IconPlayerPlay size={15} stroke={1.8} /> Run
            </button>
          </div>
        </section>

        <section className="dash-card a-tables">
          <div className="dash-card-head">
            <div className="dash-head-titled">
              <span className="dash-round-ic">
                <IconTable size={15} stroke={1.7} />
              </span>
              <h3>Largest tables</h3>
            </div>
            <button className="dash-link" onClick={() => enter({ top: "data" })}>
              All
            </button>
          </div>
          <div className="dash-items">
            {LARGEST.map((t) => (
              <button className="dash-item dash-item-btn" key={t.name} onClick={() => enter({ top: "data" })}>
                <div className="dash-item-name">
                  <span>{t.name}</span>
                  <span className="sub">{t.schema}</span>
                </div>
                <div className="dash-item-bar">
                  <div className="dash-item-fill" style={{ width: `${t.w}%` }} />
                </div>
                <div className="dash-item-val">
                  <span className="amt">{t.size}</span>
                  <span className="dash-item-meta">{t.rows} rows</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="dash-card a-recent">
          <div className="dash-card-head">
            <div className="dash-head-titled">
              <span className="dash-round-ic">
                <IconHistory size={15} stroke={1.7} />
              </span>
              <h3>Recent queries</h3>
            </div>
            <button className="dash-link" onClick={() => enter({ top: "data", view: "history" })}>
              History
            </button>
          </div>
          <div className="dash-qlist">
            {RECENT.map((q) => (
              <button className="dash-qrow" key={q.sql} onClick={() => loadQuery(q.sql)}>
                <IconCode size={15} stroke={1.7} />
                <span className="dash-qrow-sql">{q.sql}</span>
                <span className="dash-qrow-meta">{q.when}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="dash-card a-saved">
          <div className="dash-card-head">
            <div className="dash-head-titled">
              <span className="dash-round-ic pink">
                <IconBookmark size={15} stroke={1.7} />
              </span>
              <h3>Saved queries</h3>
            </div>
            <button className="dash-link" onClick={runConsole}>
              New
            </button>
          </div>
          <div className="dash-qlist">
            {SAVED.map((s) => (
              <button className="dash-qrow saved" key={s.name} onClick={() => loadQuery(s.sql)}>
                <IconBookmark size={15} stroke={1.7} />
                <span className="dash-qrow-name">{s.name}</span>
                <span className="dash-qrow-sql dim">{s.sql}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------- Connections */

const RECENT_TABLES = [
  { name: "users", schema: "public" },
  { name: "orders", schema: "public" },
  { name: "events", schema: "analytics" },
  { name: "audit_log", schema: "ops" },
];

function ConnectionsPage({
  onAdd,
  onEdit,
  enter,
}: {
  onAdd: (engine?: Engine) => void;
  onEdit: (c: ConnectionConfig) => void;
  enter: (d?: Dest) => void;
}) {
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const openAndIntrospect = useStore((s) => s.openAndIntrospect);
  const deleteConnection = useStore((s) => s.deleteConnection);
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

  const remove = async (c: ConnectionConfig) => {
    const ok = await confirmDialog({
      title: `Delete “${c.name}”?`,
      message: "This removes the saved connection. Your database is not affected.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) void deleteConnection(c.id);
  };

  const q = query.trim().toLowerCase();
  const shown = q
    ? connections.filter((c) => `${c.name} ${c.host ?? ""} ${c.database ?? ""} ${c.engine}`.toLowerCase().includes(q))
    : connections;

  const active = connections.filter((c) => c.id === activeId).length;
  const engines = new Set(connections.map((c) => c.engine)).size;
  const KPI = [
    { label: "Connections", val: String(connections.length) },
    { label: "Active", val: String(active) },
    { label: "Idle", val: String(connections.length - active) },
    { label: "Engines", val: String(engines) },
  ];

  return (
    <main className="dash-main dash-page">
      <header className="dash-top">
        <div>
          <h1>Connections</h1>
          <p className="dash-sub">Manage your database servers and data sources.</p>
        </div>
        <button className="dash-add-btn" onClick={() => onAdd()}>
          <IconPlus size={17} stroke={2} /> Add connection
        </button>
      </header>

      <div className="dash-metrics four">
        {KPI.map((k) => (
          <div className="dash-card dash-metric" key={k.label}>
            <span className="dash-metric-label">{k.label}</span>
            <span className="dash-metric-val">{k.val}</span>
          </div>
        ))}
      </div>

      <div className="dash-conn-layout">
        <div className="dash-conn-main">
          <div className="dash-conn-toolbar">
            <div className="dash-search">
              <IconSearch size={15} stroke={1.8} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search connections…" />
            </div>
            <span className="dash-conn-count">
              {shown.length} {shown.length === 1 ? "result" : "results"}
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
                      <span className="k">Engine</span>
                      <span className="v">{engineLabel(c.engine)}</span>
                    </div>
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
                    <button className="dash-icon-btn" onClick={() => onEdit(c)} title="Edit connection">
                      <IconSettings size={16} stroke={1.7} />
                    </button>
                    <button className="dash-icon-btn danger" onClick={() => remove(c)} title="Delete connection">
                      <IconTrash size={16} stroke={1.7} />
                    </button>
                  </div>
                </section>
              );
            })}
            {shown.length === 0 && <div className="dash-conn-none">No connections match “{query}”.</div>}
          </div>
        </div>

        <aside className="dash-conn-side">
          <section className="dash-card dash-side-card">
            <div className="dash-card-head">
              <h3>Quick connect</h3>
            </div>
            <div className="dash-quick">
              {(["postgres", "mysql", "sqlite"] as Engine[]).map((e) => (
                <button key={e} className="dash-quick-btn" onClick={() => onAdd(e)}>
                  <span className={`dash-conn-badge ${e}`}>
                    <EngineIcon engine={e} size={16} />
                  </span>
                  {engineLabel(e)}
                  <IconArrowRight size={15} stroke={1.8} className="dash-quick-arrow" />
                </button>
              ))}
            </div>
          </section>

          <section className="dash-card dash-side-card">
            <div className="dash-card-head">
              <h3>Recently opened</h3>
            </div>
            <div className="dash-qlist">
              {RECENT_TABLES.map((t) => (
                <button className="dash-qrow" key={t.name} onClick={() => enter({ top: "data" })}>
                  <IconTable size={15} stroke={1.7} />
                  <span className="dash-qrow-name">{t.name}</span>
                  <span className="dash-qrow-meta">{t.schema}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
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
  { level: "error", time: "11:58:44", msg: 'relation "invoces" does not exist', meta: "0 rows" },
  { level: "info", time: "11:55:02", msg: "Connection opened — postgres@localhost:5432", meta: "—" },
  { level: "query", time: "11:54:30", msg: "CREATE INDEX idx_users_email ON users(email)", meta: "OK · 312ms" },
  { level: "info", time: "11:50:18", msg: "Backup completed — nightly_dump.sql", meta: "42 MB" },
  { level: "query", time: "11:49:01", msg: "DELETE FROM sessions WHERE expires < now()", meta: "208 rows · 22ms" },
  { level: "query", time: "11:47:12", msg: "SELECT count(*) FROM events GROUP BY day", meta: "30 rows · 1.3s" },
  { level: "warn", time: "11:44:05", msg: "Connection pool at 80% capacity", meta: "16 / 20" },
];

const SLOWEST = [
  { sql: "SELECT … FROM audit_log JOIN events", ms: "2.14s", w: 100 },
  { sql: "SELECT count(*) FROM events GROUP BY day", ms: "1.32s", w: 62 },
  { sql: "UPDATE orders SET … WHERE status = 'x'", ms: "880ms", w: 41 },
  { sql: "SELECT * FROM users ORDER BY created_at", ms: "540ms", w: 25 },
];

const ERRORS = [
  { msg: 'relation "invoces" does not exist', code: "42P01", time: "11:58" },
  { msg: 'syntax error at or near "FORM"', code: "42601", time: "11:42" },
  { msg: "duplicate key violates unique constraint", code: "23505", time: "10:21" },
];

function LogsPage() {
  const [filter, setFilter] = useState<"all" | "query" | "error">("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = LOGS.filter((l) => {
    const passLevel = filter === "all" ? true : filter === "error" ? l.level === "error" || l.level === "warn" : l.level === "query";
    return passLevel && (!q || l.msg.toLowerCase().includes(q));
  });

  return (
    <main className="dash-main dash-page">
      <header className="dash-top">
        <div>
          <h1>Logs</h1>
          <p className="dash-sub">Query activity, performance and server events.</p>
        </div>
        <button className="dash-drop">
          Last 24h <IconChevronDown size={14} stroke={1.8} />
        </button>
      </header>

      <div className="dash-metrics four">
        {KPIS.map((k) => (
          <div className="dash-card dash-metric" key={k.label}>
            <span className="dash-metric-label">{k.label}</span>
            <span className="dash-metric-val">{k.val}</span>
            <span className={`dash-kpi-trend ${k.good ? "good" : "bad"}`}>
              {k.up ? <IconCaretUpFilled size={11} /> : <IconCaretDownFilled size={11} />}
              {k.up ? "+" : "−"}
              {k.delta}
            </span>
          </div>
        ))}
      </div>

      <div className="dash-logs-layout">
        <section className="dash-card dash-logs-card">
          <div className="dash-card-head">
            <div className="dash-head-titled">
              <span className="dash-round-ic pink">
                <IconActivity size={15} stroke={1.7} />
              </span>
              <h3>Activity</h3>
            </div>
            <div className="dash-logs-tools">
              <div className="dash-search sm">
                <IconSearch size={14} stroke={1.8} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter…" />
              </div>
              <div className="dash-log-filters">
                {(["all", "query", "error"] as const).map((f) => (
                  <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : f === "query" ? "Queries" : "Errors"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="dash-log-list">
            {shown.map((l, i) => (
              <div className="dash-log" key={`${l.time}-${i}`} style={{ animationDelay: `${i * 28}ms` }}>
                <span className={`dash-log-level ${l.level}`}>{l.level}</span>
                <span className="dash-log-time">{l.time}</span>
                <span className="dash-log-msg">{l.msg}</span>
                <span className="dash-log-meta">{l.meta}</span>
              </div>
            ))}
            {shown.length === 0 && <div className="dash-conn-none">No log entries match.</div>}
          </div>
        </section>

        <aside className="dash-logs-side">
          <section className="dash-card dash-side-card">
            <div className="dash-card-head">
              <div className="dash-head-titled">
                <span className="dash-round-ic">
                  <IconClock size={15} stroke={1.7} />
                </span>
                <h3>Slowest queries</h3>
              </div>
            </div>
            <div className="dash-items">
              {SLOWEST.map((s) => (
                <div className="dash-item slow" key={s.sql}>
                  <div className="dash-slow-sql">{s.sql}</div>
                  <div className="dash-item-bar">
                    <div className="dash-item-fill warn" style={{ width: `${s.w}%` }} />
                  </div>
                  <span className="dash-slow-ms">{s.ms}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="dash-card dash-side-card">
            <div className="dash-card-head">
              <div className="dash-head-titled">
                <span className="dash-round-ic danger">
                  <IconAlertTriangle size={15} stroke={1.7} />
                </span>
                <h3>Recent errors</h3>
              </div>
            </div>
            <div className="dash-qlist">
              {ERRORS.map((e) => (
                <div className="dash-err" key={e.msg}>
                  <span className="dash-err-msg">{e.msg}</span>
                  <span className="dash-err-meta">
                    <code>{e.code}</code> {e.time}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------- Shell */

export function Dashboard() {
  const setScreen = useStore((s) => s.setScreen);
  const setTopView = useStore((s) => s.setTopView);
  const setView = useStore((s) => s.setView);
  const loadConnections = useStore((s) => s.loadConnections);
  const connections = useStore((s) => s.connections);
  const [page, setPage] = useState<Page>("home");
  const [modal, setModal] = useState<ModalState>(null);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const enter = (dest?: Dest) => {
    setScreen("workspace");
    if (dest?.top) setTopView(dest.top);
    if (dest?.view) setView(dest.view);
  };

  const isEdit = modal !== null && "id" in modal;
  const initialEngine = modal !== null && !("id" in modal) ? modal.engine : undefined;

  return (
    <div className="dash-app">
      <aside className="dash-side">
        <div className="dash-brand">
          MAMA<span>SQL</span>
        </div>
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
        <ConnectionsPage onAdd={(engine) => setModal({ engine })} onEdit={(c) => setModal(c)} enter={enter} />
      ) : page === "logs" ? (
        <LogsPage />
      ) : (
        <Home enter={enter} connections={connections} onAdd={() => setModal({})} />
      )}

      {modal !== null && (
        <ConnectionModal
          existing={isEdit ? (modal as ConnectionConfig) : null}
          initialEngine={initialEngine}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
