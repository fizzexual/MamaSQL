// Generates a large, realistic demo database for screenshots / the landing page.
// Writes a standard SQLite file straight into the bridge's DATA_DIR, so opening a
// SQLite connection named "Acme Commerce" in the app shows everything instantly.
//
//   node scripts/seed-demo.mjs
//
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const DIST = path.dirname(require.resolve("sql.js"));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
mkdirSync(DATA_DIR, { recursive: true });
const OUT = path.join(DATA_DIR, "acme_commerce.sqlite");

// ---- deterministic PRNG so re-runs produce the same database ----------------
let seed = 0x1a2b3c4d;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const money = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
const round2 = (n) => Math.round(n * 100) / 100;

const START = Date.UTC(2023, 0, 1);
const END = Date.UTC(2025, 5, 1);
const p2 = (n) => String(n).padStart(2, "0");
const fmt = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
};
const randMs = () => START + Math.floor(rnd() * (END - START));

// ---- vocab ------------------------------------------------------------------
const FIRST = "James Mary John Patricia Robert Jennifer Michael Linda David Elizabeth Maria Yusuf Wei Ana Liam Olivia Noah Emma Sofia Lucas Mia Arjun Priya Chen Fatima Omar Hannah Ethan Ava Leo Zoe Ibrahim Aisha Diego Camila Kenji Yuki Nina Marco Elena Tariq Layla Sven Freya Kofi Amara Pedro Bianca Igor Nadia".split(" ");
const LAST = "Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Kim Nguyen Patel Singh Chen Wang Ali Khan Haddad Rossi Romano Müller Schmidt Andersson Nielsen Okafor Mensah Silva Costa Ivanov Petrov Tanaka Sato Yilmaz Demir Dubois Laurent Novak Horvat Mehta Reddy Park Cruz Flores Cohen".split(" ");
const GEO = [
  ["United States", ["New York", "San Francisco", "Austin", "Chicago", "Seattle"]],
  ["United Kingdom", ["London", "Manchester", "Bristol", "Leeds"]],
  ["Germany", ["Berlin", "Munich", "Hamburg", "Cologne"]],
  ["France", ["Paris", "Lyon", "Marseille"]],
  ["Canada", ["Toronto", "Vancouver", "Montreal"]],
  ["Australia", ["Sydney", "Melbourne", "Brisbane"]],
  ["India", ["Mumbai", "Bengaluru", "Delhi", "Pune"]],
  ["Japan", ["Tokyo", "Osaka", "Kyoto"]],
  ["Brazil", ["São Paulo", "Rio de Janeiro"]],
  ["Spain", ["Madrid", "Barcelona", "Valencia"]],
  ["Netherlands", ["Amsterdam", "Rotterdam"]],
  ["Sweden", ["Stockholm", "Gothenburg"]],
  ["Nigeria", ["Lagos", "Abuja"]],
  ["UAE", ["Dubai", "Abu Dhabi"]],
];
const PLANS = ["free", "starter", "pro", "business", "enterprise"];
const CUST_STATUS = ["active", "active", "active", "trialing", "churned", "lead"];
const SOURCES = ["organic", "google_ads", "referral", "newsletter", "social", "partner"];
const COLORS = ["Black", "White", "Silver", "Blue", "Red", "Graphite", "Olive", "Sand"];
const CARRIERS = ["UPS", "FedEx", "DHL", "USPS", "Royal Mail"];
const PAY_METHODS = ["visa", "mastercard", "amex", "paypal", "apple_pay", "bank_transfer"];
const DEPTS = ["Engineering", "Sales", "Support", "Marketing", "Operations", "Finance"];
const ROLES = ["Engineer", "Senior Engineer", "Account Executive", "Support Agent", "Manager", "Analyst", "Designer"];
const EVENT_TYPES = ["page_view", "login", "add_to_cart", "checkout", "search", "support_open", "subscription_change"];
const ADJ = "Pro Ultra Eco Smart Classic Premium Compact Wireless Rugged Lite Max Studio".split(" ");
const NOUN = "Headphones Keyboard Mouse Monitor Webcam Speaker Charger Hub Stand Backpack Bottle Lamp Router Drive Cable Tripod Microphone Notebook".split(" ");
const CAT_TOP = ["Electronics", "Home & Office", "Audio", "Accessories", "Wearables", "Gaming", "Outdoor", "Photography"];

const orderStatus = () => {
  const r = rnd();
  if (r < 0.5) return "delivered";
  if (r < 0.68) return "shipped";
  if (r < 0.82) return "paid";
  if (r < 0.9) return "pending";
  if (r < 0.96) return "cancelled";
  return "refunded";
};

// ---- build ------------------------------------------------------------------
const SQL = await initSqlJs({ locateFile: (f) => path.join(DIST, f) });
const db = new SQL.Database();
db.run("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;");

db.run(`
CREATE TABLE categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id)
);
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT, email TEXT,
  lead_time_days INTEGER, rating REAL
);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  email TEXT NOT NULL, country TEXT, city TEXT, plan TEXT, status TEXT,
  lifetime_value REAL, created_at TEXT, last_seen_at TEXT, metadata TEXT
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id), price REAL NOT NULL, cost REAL,
  stock INTEGER, rating REAL, is_active INTEGER, created_at TEXT, attributes TEXT
);
CREATE TABLE product_suppliers (
  id INTEGER PRIMARY KEY, product_id INTEGER REFERENCES products(id),
  supplier_id INTEGER REFERENCES suppliers(id), unit_cost REAL, is_primary INTEGER
);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, role TEXT, department TEXT,
  manager_id INTEGER REFERENCES employees(id), hired_at TEXT, salary REAL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), status TEXT,
  subtotal REAL, tax REAL, shipping REAL, total REAL, currency TEXT,
  placed_at TEXT, shipped_at TEXT
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id), quantity INTEGER, unit_price REAL, discount REAL
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id), method TEXT,
  amount REAL, status TEXT, processed_at TEXT, txn_ref TEXT
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id), carrier TEXT,
  tracking_no TEXT, status TEXT, shipped_at TEXT, delivered_at TEXT
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY, product_id INTEGER REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id), rating INTEGER, title TEXT, body TEXT,
  created_at TEXT, helpful_votes INTEGER
);
CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id),
  assignee_id INTEGER REFERENCES employees(id), subject TEXT, priority TEXT, status TEXT,
  created_at TEXT, resolved_at TEXT
);
CREATE TABLE events (
  id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), type TEXT,
  payload TEXT, created_at TEXT
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_items_product ON order_items(product_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_events_customer ON events(customer_id);
CREATE VIEW customer_lifetime AS
  SELECT c.id, c.first_name || ' ' || c.last_name AS customer, c.country,
         COUNT(o.id) AS orders, ROUND(COALESCE(SUM(o.total), 0), 2) AS revenue
  FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
  GROUP BY c.id;
CREATE VIEW monthly_revenue AS
  SELECT substr(placed_at, 1, 7) AS month, COUNT(*) AS orders, ROUND(SUM(total), 2) AS revenue
  FROM orders GROUP BY month ORDER BY month;
`);

const insert = (sql, rows) => {
  const st = db.prepare(sql);
  for (const r of rows) st.run(r);
  st.free();
};
const run = (label, fn) => {
  db.run("BEGIN");
  fn();
  db.run("COMMIT");
  const n = db.exec(`SELECT COUNT(*) FROM ${label}`)[0].values[0][0];
  console.log(`  ${label.padEnd(18)} ${String(n).padStart(7)}`);
};

// categories (self-referencing tree: top level + sub-categories)
run("categories", () => {
  const st = db.prepare("INSERT INTO categories VALUES (?,?,?,?)");
  let id = 1;
  const tops = CAT_TOP.map((name) => {
    const tid = id++;
    st.run([tid, name, name.toLowerCase().replace(/[^a-z]+/g, "-"), null]);
    return tid;
  });
  for (const tid of tops) {
    for (let k = 0; k < ri(2, 5); k++) {
      const name = `${pick(ADJ)} ${pick(NOUN)}s`;
      st.run([id++, name, name.toLowerCase().replace(/[^a-z]+/g, "-") + "-" + id, tid]);
    }
  }
  st.free();
});

run("suppliers", () => {
  const rows = [];
  for (let i = 1; i <= 120; i++) {
    const [country] = pick(GEO);
    rows.push([i, `${pick(LAST)} ${pick(["Supply Co", "Logistics", "Trading", "Imports", "Industries", "Partners"])}`, country, `sales@supplier${i}.example`, ri(2, 28), round2(3 + rnd() * 2)]);
  }
  insert("INSERT INTO suppliers VALUES (?,?,?,?,?,?)", rows);
});

const N_CUST = 6000;
run("customers", () => {
  const rows = [];
  for (let i = 1; i <= N_CUST; i++) {
    const fn = pick(FIRST), ln = pick(LAST);
    const [country, cities] = pick(GEO);
    const created = randMs();
    const meta = JSON.stringify({
      source: pick(SOURCES),
      newsletter: chance(0.6),
      tags: Array.from({ length: ri(0, 3) }, () => pick(["vip", "wholesale", "beta", "edu", "early-adopter", "high-value"])),
      nps: ri(0, 10),
    });
    rows.push([i, fn, ln, `${fn}.${ln}${chance(0.4) ? ri(1, 99) : ""}@${pick(["gmail.com", "outlook.com", "proton.me", "company.io", "yahoo.com"])}`.toLowerCase(), country, pick(cities), pick(PLANS), pick(CUST_STATUS), money(0, 9500), fmt(created), fmt(created + ri(0, 400) * 86400000), meta]);
  }
  insert("INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows);
});

const N_PROD = 1000;
const prices = [];
run("products", () => {
  const rows = [];
  for (let i = 1; i <= N_PROD; i++) {
    const name = `${pick(ADJ)} ${pick(NOUN)}`;
    const price = money(8, 499);
    prices[i] = price;
    const attrs = JSON.stringify({ color: pick(COLORS), weight_kg: round2(0.1 + rnd() * 4), warranty_months: pick([6, 12, 24, 36]), wireless: chance(0.5) });
    rows.push([i, name, `SKU-${1000 + i}`, ri(1, CAT_TOP.length), price, round2(price * (0.4 + rnd() * 0.3)), ri(0, 800), round2(3 + rnd() * 2), chance(0.92) ? 1 : 0, fmt(randMs()), attrs]);
  }
  insert("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?)", rows);
});

run("product_suppliers", () => {
  let id = 1;
  const rows = [];
  for (let pid = 1; pid <= N_PROD; pid++) {
    const k = ri(1, 3);
    for (let j = 0; j < k; j++) rows.push([id++, pid, ri(1, 120), round2(prices[pid] * (0.3 + rnd() * 0.25)), j === 0 ? 1 : 0]);
  }
  insert("INSERT INTO product_suppliers VALUES (?,?,?,?,?)", rows);
});

run("employees", () => {
  const rows = [];
  // a handful of managers (no manager_id), then reports pointing at them
  const managers = [];
  for (let i = 1; i <= 12; i++) {
    managers.push(i);
    rows.push([i, `${pick(FIRST)} ${pick(LAST)}`, `emp${i}@acme.example`, "Manager", pick(DEPTS), null, fmt(randMs()), money(110000, 190000)]);
  }
  for (let i = 13; i <= 220; i++) {
    rows.push([i, `${pick(FIRST)} ${pick(LAST)}`, `emp${i}@acme.example`, pick(ROLES), pick(DEPTS), pick(managers), fmt(randMs()), money(48000, 145000)]);
  }
  insert("INSERT INTO employees VALUES (?,?,?,?,?,?,?,?)", rows);
});

// orders + order_items + payments + shipments, kept internally consistent
const N_ORDERS = 20000;
{
  db.run("BEGIN");
  const oSt = db.prepare("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)");
  const iSt = db.prepare("INSERT INTO order_items VALUES (?,?,?,?,?,?)");
  const pSt = db.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?)");
  const sSt = db.prepare("INSERT INTO shipments VALUES (?,?,?,?,?,?,?)");
  let itemId = 1, payId = 1, shipId = 1;
  for (let oid = 1; oid <= N_ORDERS; oid++) {
    const status = orderStatus();
    const placedMs = randMs();
    const nItems = ri(1, 5);
    let subtotal = 0;
    for (let k = 0; k < nItems; k++) {
      const pid = ri(1, N_PROD);
      const qty = ri(1, 4);
      const unit = prices[pid];
      const disc = chance(0.25) ? pick([0.05, 0.1, 0.15, 0.2]) : 0;
      subtotal += unit * qty * (1 - disc);
      iSt.run([itemId++, oid, pid, qty, unit, disc]);
    }
    subtotal = round2(subtotal);
    const tax = round2(subtotal * 0.08);
    const shipping = subtotal > 75 ? 0 : pick([4.99, 7.5, 9.99]);
    const total = round2(subtotal + tax + shipping);
    const shipped = ["shipped", "delivered"].includes(status);
    const shippedMs = placedMs + ri(1, 6) * 86400000;
    const cur = pick(["USD", "USD", "USD", "EUR", "GBP"]);
    oSt.run([oid, ri(1, N_CUST), status, subtotal, tax, shipping, total, cur, fmt(placedMs), shipped ? fmt(shippedMs) : null]);

    if (status !== "pending" && status !== "cancelled") {
      const pstatus = status === "refunded" ? "refunded" : "captured";
      pSt.run([payId++, oid, pick(PAY_METHODS), total, pstatus, fmt(placedMs + ri(0, 3600) * 1000), `txn_${oid.toString(36)}${ri(100, 999)}`]);
    }
    if (shipped) {
      const delivered = status === "delivered";
      sSt.run([shipId++, oid, pick(CARRIERS), `1Z${ri(10000000, 99999999)}`, delivered ? "delivered" : "in_transit", fmt(shippedMs), delivered ? fmt(shippedMs + ri(1, 5) * 86400000) : null]);
    }
  }
  oSt.free(); iSt.free(); pSt.free(); sSt.free();
  db.run("COMMIT");
  for (const t of ["orders", "order_items", "payments", "shipments"]) {
    console.log(`  ${t.padEnd(18)} ${String(db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0]).padStart(7)}`);
  }
}

run("reviews", () => {
  const rows = [];
  const titles = ["Exactly what I needed", "Great value", "Works perfectly", "A bit disappointed", "Highly recommend", "Solid build", "Not as described", "Will buy again", "Five stars", "Decent for the price"];
  for (let i = 1; i <= 10000; i++) {
    const rating = chance(0.7) ? ri(4, 5) : ri(1, 3);
    rows.push([i, ri(1, N_PROD), ri(1, N_CUST), rating, pick(titles), `${pick(titles)}. ${pick(["Shipping was fast.", "Quality exceeded expectations.", "Setup took a few minutes.", "Customer support helped quickly.", "Would suggest to a friend."])}`, fmt(randMs()), ri(0, 240)]);
  }
  insert("INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?)", rows);
});

run("support_tickets", () => {
  const rows = [];
  const subjects = ["Cannot reset password", "Refund request", "Order not delivered", "Billing question", "Feature request", "Bug: export fails", "Integration help", "Cancel subscription", "Damaged item", "Address change"];
  for (let i = 1; i <= 5000; i++) {
    const created = randMs();
    const resolved = chance(0.75);
    rows.push([i, ri(1, N_CUST), ri(1, 220), pick(subjects), pick(["low", "normal", "high", "urgent"]), resolved ? "resolved" : pick(["open", "pending", "in_progress"]), fmt(created), resolved ? fmt(created + ri(1, 14) * 86400000) : null]);
  }
  insert("INSERT INTO support_tickets VALUES (?,?,?,?,?,?,?,?)", rows);
});

run("events", () => {
  const rows = [];
  for (let i = 1; i <= 24000; i++) {
    const type = pick(EVENT_TYPES);
    const payload =
      type === "page_view" ? { path: pick(["/", "/pricing", "/product", "/checkout", "/account"]), ms: ri(40, 4000) } :
      type === "add_to_cart" ? { product_id: ri(1, N_PROD), qty: ri(1, 3) } :
      type === "checkout" ? { order_total: money(20, 600), items: ri(1, 5) } :
      type === "search" ? { query: pick(NOUN).toLowerCase(), results: ri(0, 80) } :
      { ok: true };
    rows.push([i, ri(1, N_CUST), type, JSON.stringify(payload), fmt(randMs())]);
  }
  insert("INSERT INTO events VALUES (?,?,?,?,?)", rows);
});

writeFileSync(OUT, Buffer.from(db.export()));
const total = ["categories", "suppliers", "customers", "products", "product_suppliers", "employees", "orders", "order_items", "payments", "shipments", "reviews", "support_tickets", "events"]
  .reduce((s, t) => s + db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0], 0);
db.close();
const mb = (Buffer.from("").length, (await import("node:fs")).statSync(OUT).size / 1048576);
console.log(`\n✔ wrote ${OUT}`);
console.log(`  ${total.toLocaleString()} rows across 13 tables + 2 views, ${mb.toFixed(1)} MB`);
