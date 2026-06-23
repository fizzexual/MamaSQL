import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArchive,
  IconArrowDownRight,
  IconArrowRight,
  IconArrowUpRight,
  IconBrandMysql,
  IconCaretDownFilled,
  IconCaretUpFilled,
  IconChevronDown,
  IconClock,
  IconDatabase,
  IconGauge,
  IconHome,
  IconLayoutSidebarLeftCollapse,
  IconLoader2,
  IconLogout,
  IconPlus,
  IconSchema,
  IconSearch,
  IconServer,
  IconSettings,
  IconTable,
  IconTerminal2,
  IconTrash,
  IconUsers,
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

type NavItem = { id: string; label: string; Icon: Icon; page?: Page; go?: Dest; badge?: string };
const MAIN_NAV: NavItem[] = [
  { id: "home", label: "Home", Icon: IconHome, page: "home" },
  { id: "editor", label: "Query Editor", Icon: IconTerminal2, go: { top: "data", view: "sql" } },
  { id: "browser", label: "Data Browser", Icon: IconDatabase, go: { top: "data", view: "data" } },
];
const DB_NAV: NavItem[] = [
  { id: "monitoring", label: "Monitoring", Icon: IconActivity, page: "logs" },
  { id: "performance", label: "Performance", Icon: IconGauge, page: "logs" },
  { id: "connections", label: "Connections", Icon: IconServer, page: "connections" },
  { id: "backups", label: "Backups", Icon: IconArchive, go: { top: "settings" }, badge: "New" },
  { id: "users", label: "Users", Icon: IconUsers, go: { top: "settings" } },
];
const FOOT_NAV: NavItem[] = [
  { id: "settings", label: "Settings", Icon: IconSettings, go: { top: "settings" } },
  { id: "logout", label: "Log out", Icon: IconLogout },
];
const SCHEMA_CHILDREN = ["Tables", "Views", "Indexes", "Functions", "Triggers"];

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

/* ------------------------------------------------------------- overview data */

const TONE: Record<string, string> = { green: "#4ade80", red: "#f87171", blue: "#5b9df8" };
const OV_KPIS = [
  { label: "Uptime", val: "99.9%", delta: "0.2%", up: true, tone: "green", spark: [4, 5, 4, 6, 5, 7, 6, 8] },
  { label: "Error rate", val: "0.4%", delta: "12%", up: false, tone: "red", spark: [8, 7, 8, 6, 7, 5, 6, 4] },
  { label: "Cache hit ratio", val: "94%", delta: "6%", up: true, tone: "blue", spark: [5, 6, 5, 7, 6, 7, 8, 9] },
  { label: "Throughput", val: "8.4k/s", delta: "6%", up: true, tone: "blue", spark: [4, 6, 5, 7, 6, 8, 7, 9] },
];
const MONTHS = ["Jan 2024", "Feb 2024", "Mar 2024", "Apr 2024", "May 2024", "Jun 2024", "Jul 2024", "Aug 2024"];
const HEAT_COLS = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];
const HEAT = [
  [10, 6, 6, 6, 0, 6, 0, 0, 0, 0, 0, 0],
  [6, 6, 6, 6, 0, 6, 6, 6, 0, 0, 0, 0],
  [10, 6, 0, 0, 0, 6, 6, 0, 0, 0, 0, 0],
  [10, 10, 10, 10, 6, 0, 6, 6, 0, 0, 0, 0],
  [10, 6, 0, 0, 6, 0, 6, 6, 0, 0, 0, 0],
  [10, 6, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0],
  [10, 6, 0, 6, 0, 0, 6, 0, 0, 0, 0, 0],
  [6, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];
const HEAT_TABS = ["Heatmap", "Timeline", "By table", "Top queries", "By engine"];

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 74;
  const h = 30;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / range) * (h - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="dash-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function heatBg(v: number) {
  if (v <= 0) return "#181b24";
  return `rgba(124, 108, 245, ${(0.2 + (v / 10) * 0.74).toFixed(2)})`;
}

function Home({ enter }: { enter: (d?: Dest) => void }) {
  const [tab, setTab] = useState(0);
  return (
    <main className="dash-main dash-overview">
      <h1 className="dash-ov-title">Database overview</h1>

      <div className="dash-ov-filters">
        <button className="dash-drop">
          Last 30 days <IconChevronDown size={14} stroke={1.8} />
        </button>
        <button className="dash-drop">
          All databases <IconChevronDown size={14} stroke={1.8} />
        </button>
        <button className="dash-filters-btn">
          <IconAdjustmentsHorizontal size={15} stroke={1.8} /> Filters
        </button>
      </div>

      <div className="dash-kpi-grid">
        {OV_KPIS.map((k) => (
          <div className="dash-card dash-kpi-card" key={k.label}>
            <div className="dash-kpi-top">
              <span className="dash-kpi-l">{k.label}</span>
              <Sparkline data={k.spark} color={TONE[k.tone]} />
            </div>
            <div className="dash-kpi-v">{k.val}</div>
            <div className={`dash-kpi-trend t-${k.tone}`}>
              <span className="dash-kpi-arrow">
                {k.up ? <IconArrowUpRight size={11} stroke={2.6} /> : <IconArrowDownRight size={11} stroke={2.6} />}
              </span>
              <b>{k.delta}</b>
              <span className="muted">than last month</span>
            </div>
          </div>
        ))}

        <section className="dash-card dash-promo">
          <div className="dash-promo-art">
            <svg viewBox="0 0 120 92" fill="none" aria-hidden>
              <ellipse cx="60" cy="60" rx="48" ry="30" fill="rgba(124, 108, 245, 0.22)" />
              <rect x="40" y="10" width="40" height="30" rx="5" fill="#f4f2ff" />
              <line x1="47" y1="21" x2="73" y2="21" stroke="#9b8bf0" strokeWidth="3" strokeLinecap="round" />
              <line x1="47" y1="29" x2="66" y2="29" stroke="#cabff7" strokeWidth="3" strokeLinecap="round" />
              <rect x="30" y="36" width="60" height="40" rx="8" fill="url(#promoEnv)" />
              <path d="M30 44 L60 64 L90 44" stroke="rgba(255,255,255,0.55)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M100 18 l1.6 4.6 4.6 1.6 -4.6 1.6 -1.6 4.6 -1.6 -4.6 -4.6 -1.6 4.6 -1.6 z" fill="#cabff7" />
              <circle cx="20" cy="32" r="2.4" fill="#8b7bf7" />
              <defs>
                <linearGradient id="promoEnv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8b7bf7" />
                  <stop offset="1" stopColor="#6a58ee" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <p className="dash-promo-t">Get started with AI queries for FREE</p>
          <button className="dash-promo-btn" onClick={() => enter({ top: "data", view: "sql" })}>
            Try now
          </button>
        </section>
      </div>

      <section className="dash-card dash-active">
        <div className="dash-active-head">
          <h3>Active on site</h3>
          <button className="dash-active-link" onClick={() => enter({ top: "data" })}>
            <IconArrowUpRight size={16} stroke={1.8} />
          </button>
        </div>
        <div className="dash-active-tabs">
          {HEAT_TABS.map((t, i) => (
            <button key={t} className={i === tab ? "on" : ""} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>
        <div className="dash-heat-wrap">
          <div className="dash-heat">
            <div className="dash-heat-row head">
              <span className="dash-heat-label" />
              {HEAT_COLS.map((c) => (
                <span key={c} className="dash-heat-colh">
                  {c}
                </span>
              ))}
            </div>
            {HEAT.map((row, r) => (
              <div className="dash-heat-row" key={MONTHS[r]}>
                <span className="dash-heat-label">{MONTHS[r]}</span>
                {row.map((v, c) => (
                  <span key={`${r}-${c}`} className={`dash-heat-cell ${v <= 0 ? "z" : ""}`} style={{ background: heatBg(v) }}>
                    {v}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
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
  const page = useStore((s) => s.dashPage);
  const setPage = useStore((s) => s.setDashPage);
  const [modal, setModal] = useState<ModalState>(null);
  const [schemaOpen, setSchemaOpen] = useState(true);
  const [sideHidden, setSideHidden] = useState(false);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const enter = (dest?: Dest) => {
    setScreen("workspace");
    if (dest?.top) setTopView(dest.top);
    if (dest?.view) setView(dest.view);
  };

  const navBtn = (n: NavItem) => (
    <button
      key={n.id}
      className={`dash-nav-item ${n.page && page === n.page ? "active" : ""}`}
      onClick={() => {
        if (n.page) setPage(n.page);
        else if (n.go) enter(n.go);
      }}
    >
      <n.Icon size={18} stroke={1.7} />
      <span className="dash-nav-t">{n.label}</span>
      {n.badge && <span className="dash-nav-newbadge">{n.badge}</span>}
    </button>
  );

  const isEdit = modal !== null && "id" in modal;
  const initialEngine = modal !== null && !("id" in modal) ? modal.engine : undefined;

  return (
    <div className={`dash-app ${sideHidden ? "side-hidden" : ""}`}>
      <header className="dash-topbar">
        <div className="dash-tb-l">
          <span className="dash-tb-logo">
            <span className="dash-tb-logomark" />
            MamaSQL
            <IconChevronDown size={13} stroke={2} className="dash-tb-logocaret" />
          </span>
          <button className="dash-tb-collapse" title="Toggle sidebar" onClick={() => setSideHidden((v) => !v)}>
            <IconLayoutSidebarLeftCollapse size={18} stroke={1.7} />
          </button>
        </div>
        <div className="dash-tb-crumb">
          <span>Workspace</span> <span className="sep">/</span> <span className="cur">Overview</span>
        </div>
        <button className="dash-tb-user">
          <span className="dash-tb-avatar">A</span>
          <span className="dash-tb-uname">Alex Wilkerson</span>
          <IconChevronDown size={15} stroke={1.8} />
        </button>
      </header>

      <aside className="dash-side">
        <button className="dash-side-search" onClick={() => window.dispatchEvent(new Event("mamasql:cmdk"))}>
          <IconSearch size={15} stroke={1.8} />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="dash-nav-scroll">
          <div className="dash-nav-label">Main menu</div>
          <nav className="dash-nav">{MAIN_NAV.map(navBtn)}</nav>

          <div className="dash-nav-label">Database</div>
          <nav className="dash-nav">
            <button className="dash-nav-item" onClick={() => setSchemaOpen((o) => !o)}>
              <IconSchema size={18} stroke={1.7} />
              <span className="dash-nav-t">Schema</span>
              <IconChevronDown size={15} stroke={1.9} className={`dash-nav-caret ${schemaOpen ? "open" : ""}`} />
            </button>
            {schemaOpen && (
              <div className="dash-subnav">
                {SCHEMA_CHILDREN.map((x) => (
                  <button key={x} className="dash-subitem" onClick={() => enter({ top: "data" })}>
                    <span>{x}</span>
                  </button>
                ))}
              </div>
            )}
            {DB_NAV.map(navBtn)}
          </nav>
        </div>

        <div className="dash-side-foot">{FOOT_NAV.map(navBtn)}</div>
      </aside>

      {page === "connections" ? (
        <ConnectionsPage onAdd={(engine) => setModal({ engine })} onEdit={(c) => setModal(c)} enter={enter} />
      ) : page === "logs" ? (
        <LogsPage />
      ) : (
        <Home enter={enter} />
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
