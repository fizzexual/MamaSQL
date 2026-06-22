import {
  IconArrowRight,
  IconArrowUpRight,
  IconCalendar,
  IconCaretDownFilled,
  IconCaretUpFilled,
  IconChartLine,
  IconChevronDown,
  IconFileText,
  IconLayoutGrid,
  IconMessage,
  IconMessageCircle,
  IconScissors,
  IconSettings,
  IconShoppingCart,
  IconSparkles,
  IconTag,
  IconUserCircle,
  IconWallet,
} from "@tabler/icons-react";
import { type ComponentType, useState } from "react";
import { useStore } from "../../state/store";

type Icon = ComponentType<{ size?: number; stroke?: number }>;

const NAV: { id: string; label: string; Icon: Icon; workspace?: boolean }[] = [
  { id: "dashboard", label: "Dashboard", Icon: IconLayoutGrid },
  { id: "task", label: "Task", Icon: IconUserCircle },
  { id: "docs", label: "Docs", Icon: IconFileText },
  { id: "chat", label: "Chat", Icon: IconMessageCircle },
  { id: "customers", label: "Customers", Icon: IconShoppingCart, workspace: true },
  { id: "automation", label: "Automation", Icon: IconScissors },
  { id: "calendar", label: "Calendar", Icon: IconCalendar },
  { id: "messages", label: "Messages", Icon: IconMessage },
];

/** Concentric topographic contour lines for the AI Finance Manager card. */
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

function PayrollChart() {
  const [range, setRange] = useState<"Monthly" | "Yearly">("Monthly");
  return (
    <section className="dash-card dash-chart-card">
      <div className="dash-card-head">
        <h3>Payroll Expenses Breakdown</h3>
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
            <span key={t}>{t}</span>
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
            <div className="dash-tt-title">Transaction</div>
            <div className="dash-tt-row">
              <span className="dot" /> <b>$2,378.22</b> <span className="lbl">Base salary</span>
            </div>
            <div className="dash-tt-row">
              <span className="dot" /> <b>$4,232.84</b> <span className="lbl">Overtime</span>
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

const ITEMS = [
  { amt: "-$340.24", pct: "-12%", dir: "down", w: 78 },
  { amt: "-$624.24", pct: "-24%", dir: "down", w: 72 },
  { amt: "$640.24", pct: "40%", dir: "up", w: 55 },
];

function TopItems() {
  return (
    <section className="dash-card dash-items-card">
      <div className="dash-card-head">
        <div className="dash-head-titled">
          <span className="dash-round-ic pink">
            <IconTag size={15} stroke={1.7} />
          </span>
          <h3>Top Item Sales</h3>
        </div>
        <button className="dash-drop">
          Monthly <IconChevronDown size={14} stroke={1.8} />
        </button>
      </div>
      <div className="dash-items">
        {ITEMS.map((it, i) => (
          <div className="dash-item" key={i}>
            <div className="dash-item-name">
              <span>Dual sense</span>
              <span className="sub">Technique</span>
            </div>
            <div className="dash-item-bar">
              <div className="dash-item-fill" style={{ width: `${it.w}%` }} />
            </div>
            <div className="dash-item-val">
              <span className="amt">{it.amt}</span>
              <span className={`pct ${it.dir}`}>
                {it.pct}
                {it.dir === "up" ? <IconCaretUpFilled size={11} /> : <IconCaretDownFilled size={11} />}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const TXNS = [
  { name: "Adobe After Effect", amount: "$80.09", status: "Deposited" },
  { name: "Figma Professional", amount: "$15.00", status: "Pending" },
  { name: "Notion Plus", amount: "$8.00", status: "Deposited" },
];

function Transactions() {
  return (
    <section className="dash-card dash-txn-card">
      <div className="dash-card-head">
        <h3>Transaction</h3>
        <button className="dash-drop">
          10 May - 20 May <IconChevronDown size={14} stroke={1.8} />
        </button>
      </div>
      <div className="dash-txn-cols">
        <span>Name</span>
        <span>Amount</span>
        <span>Status</span>
      </div>
      <div className="dash-txn-list">
        {TXNS.map((t) => (
          <div className="dash-txn" key={t.name}>
            <div className="dash-txn-name">
              <span className="dash-txn-badge" />
              {t.name}
            </div>
            <span className="dash-txn-amt">{t.amount}</span>
            <span className={`dash-pill ${t.status.toLowerCase()}`}>{t.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Dashboard() {
  const setScreen = useStore((s) => s.setScreen);
  const [active, setActive] = useState("dashboard");

  const enterWorkspace = () => setScreen("workspace");

  return (
    <div className="dash-app">
      <aside className="dash-side">
        <nav className="dash-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`dash-nav-item ${active === n.id ? "active" : ""}`}
              onClick={() => {
                setActive(n.id);
                if (n.workspace) enterWorkspace();
              }}
            >
              <n.Icon size={19} stroke={1.6} />
              {n.label}
            </button>
          ))}
        </nav>
        <button className="dash-nav-item dash-settings" onClick={enterWorkspace}>
          <IconSettings size={19} stroke={1.6} />
          Settings
        </button>
      </aside>

      <main className="dash-main">
        <header className="dash-top">
          <h1>Dashboard overview</h1>
          <button className="dash-viewmore" onClick={enterWorkspace}>
            View more <IconArrowRight size={17} stroke={1.8} />
          </button>
        </header>

        <div className="dash-row dash-row-top">
          <section className="dash-card dash-ai-card">
            <TopoPattern />
            <div className="dash-ai-body">
              <h2>AI Finance Manager</h2>
              <p>Take control of your finances with real-time AI insights.</p>
            </div>
            <button className="dash-ai-cta" onClick={enterWorkspace}>
              See a detail <IconArrowRight size={16} stroke={1.8} />
            </button>
          </section>

          <section className="dash-card dash-wallet-card">
            <div className="dash-wallet-head">
              <span className="dash-wallet-ic">
                <IconWallet size={20} stroke={1.7} />
              </span>
              <div className="dash-wallet-id">
                <h3>Main wallet</h3>
                <span>0x1240</span>
              </div>
              <button className="dash-link" onClick={enterWorkspace}>
                Manage
              </button>
            </div>
            <div className="dash-wallet-foot">
              <span className="dash-wallet-label">Total balance</span>
              <div className="dash-wallet-row">
                <span className="dash-wallet-amt">32,160.12</span>
                <span className="dash-wallet-trend">
                  <IconArrowUpRight size={14} stroke={2} /> 15% from previous
                </span>
              </div>
            </div>
          </section>

          <section className="dash-card dash-upgrade-card">
            <div className="dash-upgrade-top">
              <span className="dash-upgrade-mark">
                <IconSparkles size={18} stroke={1.8} />
              </span>
              <button className="dash-pro-btn" onClick={enterWorkspace}>
                Upgrade to PRO
              </button>
            </div>
            <div className="dash-upgrade-body">
              <h2>Upgrade Your Money Mind</h2>
              <p>Level up with AI tools built for results.</p>
            </div>
          </section>
        </div>

        <div className="dash-row dash-row-bottom">
          <PayrollChart />
          <div className="dash-col">
            <TopItems />
            <Transactions />
          </div>
        </div>
      </main>
    </div>
  );
}
