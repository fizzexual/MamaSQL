// MamaSQL engine bridge — the "desktop" backend the browser talks to.
//
// A browser tab can't open TCP sockets to PostgreSQL/MySQL, so this small local
// HTTP server does it on the browser's behalf using real Node drivers (pg,
// mysql2). Run it with `npm run bridge` (or `npm run dev:all`) and the web app
// will route Postgres/MySQL connections here automatically. SQLite stays fully
// in-browser and does not need this server.
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import pg from "pg";
import mysql from "mysql2/promise";

const PORT = Number(process.env.BRIDGE_PORT) || 5174;

// When the bridge runs in a container, "localhost" means the container itself.
// Transparently remap localhost / 127.0.0.1 / ::1 (and empty) to the host
// machine so a database running on the user's PC is reachable. External hosts,
// LAN IPs, and compose service names pass through unchanged.
const IN_DOCKER = existsSync("/.dockerenv") || process.env.BRIDGE_IN_DOCKER === "true";
function resolveHost(host) {
  const h = String(host ?? "").trim();
  if (!IN_DOCKER) return h || "localhost";
  if (h === "" || h.toLowerCase() === "localhost" || h === "127.0.0.1" || h === "::1") return "host.docker.internal";
  return h;
}

/** Open connections keyed by the web app's connection id. */
const pools = new Map(); // id -> { engine, conn }

function appError(kind, message) {
  return { error: { kind, message } };
}
function errMessage(e) {
  // pg's happy-eyeballs wraps connection failures in an AggregateError whose
  // inner errors hold the useful ECONNREFUSED/timeout detail.
  if (e && e.name === "AggregateError" && Array.isArray(e.errors) && e.errors.length) {
    const inner = e.errors.map((x) => (x && x.message ? x.message : String(x)));
    return [...new Set(inner)].join("; ");
  }
  return e && e.message ? String(e.message) : String(e);
}

/* ---- identifier quoting + placeholders per engine ---- */
const quote = {
  postgres: (id) => `"${String(id).replace(/"/g, '""')}"`,
  mysql: (id) => `\`${String(id).replace(/`/g, "``")}\``,
};
const placeholder = { postgres: (i) => `$${i + 1}`, mysql: () => "?" };

/* ---- low-level query helpers (rows as arrays, no key collisions) ---- */
async function rawArrayRows(engine, conn, sql, params = []) {
  if (engine === "postgres") {
    // With params we use the extended (prepared) protocol; without, the simple
    // protocol — which is what allows multiple statements in one execute.
    const r = await conn.query(
      params.length ? { text: sql, values: params, rowMode: "array" } : { text: sql, rowMode: "array" },
    );
    const last = Array.isArray(r) ? r[r.length - 1] : r;
    return { columns: (last.fields || []).map((f) => f.name), rows: last.rows || [], rowsAffected: last.rowCount ?? 0 };
  }
  const [res, fields] = await conn.query(
    params.length ? { sql, values: params, rowsAsArray: true } : { sql, rowsAsArray: true },
  );
  const multi = Array.isArray(fields) && fields.length > 0 && Array.isArray(fields[0]);
  const rowsOut = multi ? res[res.length - 1] : res;
  const fld = multi ? fields[fields.length - 1] : fields;
  if (Array.isArray(rowsOut)) {
    return { columns: (fld || []).map((f) => f.name), rows: rowsOut, rowsAffected: 0 };
  }
  return { columns: [], rows: [], rowsAffected: rowsOut?.affectedRows ?? 0 };
}

function toResult(raw, startedAt) {
  return {
    columns: raw.columns.map((name) => ({ name, dataType: "" })),
    rows: raw.rows,
    rowsAffected: raw.rowsAffected,
    elapsedMs: Math.max(1, Math.round(performance.now() - startedAt)),
    truncated: false,
  };
}

/* ---- connecting ---- */
async function connect(cfg, password) {
  const host = resolveHost(cfg.host);
  if (cfg.engine === "postgres") {
    const client = new pg.Client({
      host,
      port: cfg.port || 5432,
      user: cfg.username || "postgres",
      password: password ?? undefined,
      database: cfg.database || "postgres",
    });
    await client.connect();
    return client;
  }
  if (cfg.engine === "mysql") {
    return mysql.createConnection({
      host,
      port: cfg.port || 3306,
      user: cfg.username || "root",
      password: password ?? undefined,
      database: cfg.database || undefined,
      multipleStatements: true,
    });
  }
  throw new Error(`Unsupported engine for the bridge: ${cfg.engine}`);
}
async function closeConn(entry) {
  try {
    if (entry.engine === "postgres") await entry.conn.end();
    else await entry.conn.end();
  } catch {
    /* ignore */
  }
}
function need(id) {
  const e = pools.get(id);
  if (!e) {
    const err = new Error("connection_not_open");
    err.kind = "notConnected";
    throw err;
  }
  return e;
}

/* ---- request handlers ---- */
const handlers = {
  async health() {
    return { ok: true, engines: ["postgres", "mysql"] };
  },

  async test({ cfg, password }) {
    const conn = await connect(cfg, password);
    await closeConn({ engine: cfg.engine, conn });
    return { ok: true };
  },

  async databases({ cfg, password }) {
    // connect to the server's default db so we can list everything
    const base = { ...cfg, database: cfg.engine === "postgres" ? "postgres" : "" };
    const conn = await connect(base, password);
    try {
      const sql =
        cfg.engine === "postgres"
          ? "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
          : "SHOW DATABASES";
      const raw = await rawArrayRows(cfg.engine, conn, sql);
      return raw.rows.map((r) => String(r[0]));
    } finally {
      await closeConn({ engine: cfg.engine, conn });
    }
  },

  async createDatabase({ cfg, password, name }) {
    const safe = String(name).replace(/[^A-Za-z0-9_]/g, "");
    if (!safe) throw new Error("Invalid database name");
    const base = { ...cfg, database: cfg.engine === "postgres" ? "postgres" : "" };
    const conn = await connect(base, password);
    try {
      await conn.query(`CREATE DATABASE ${quote[cfg.engine](safe)}`);
      return { ok: true };
    } finally {
      await closeConn({ engine: cfg.engine, conn });
    }
  },

  async open({ id, cfg, password }) {
    const existing = pools.get(id);
    if (existing) await closeConn(existing);
    const conn = await connect(cfg, password);
    pools.set(id, { engine: cfg.engine, conn });
    return { ok: true };
  },

  async close({ id }) {
    const e = pools.get(id);
    if (e) {
      await closeConn(e);
      pools.delete(id);
    }
    return { ok: true };
  },

  async query({ id, sql }) {
    const { engine, conn } = need(id);
    const started = performance.now();
    const raw = await rawArrayRows(engine, conn, sql);
    return toResult(raw, started);
  },

  async tables({ id }) {
    const { engine, conn } = need(id);
    const sql =
      engine === "postgres"
        ? "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name"
        : "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = database() ORDER BY table_name";
    const raw = await rawArrayRows(engine, conn, sql);
    return raw.rows.map((r) => ({ name: String(r[0]), kind: /VIEW/i.test(String(r[1])) ? "view" : "table", schema: null }));
  },

  async columns({ id, table }) {
    const { engine, conn } = need(id);
    if (engine === "postgres") {
      const sql = `
        SELECT c.column_name, c.data_type, c.is_nullable,
               CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1 AND tc.table_schema = current_schema()
        ) pk ON pk.column_name = c.column_name
        WHERE c.table_name = $1 AND c.table_schema = current_schema()
        ORDER BY c.ordinal_position`;
      const raw = await rawArrayRows(engine, conn, sql, [table]);
      return raw.rows.map((r) => ({
        name: String(r[0]),
        dataType: String(r[1] || ""),
        nullable: String(r[2]).toUpperCase() === "YES",
        isPrimaryKey: Number(r[3]) === 1,
      }));
    }
    const sql =
      "SELECT column_name, data_type, is_nullable, column_key FROM information_schema.columns WHERE table_name = ? AND table_schema = database() ORDER BY ordinal_position";
    const raw = await rawArrayRows(engine, conn, sql, [table]);
    return raw.rows.map((r) => ({
      name: String(r[0]),
      dataType: String(r[1] || ""),
      nullable: String(r[2]).toUpperCase() === "YES",
      isPrimaryKey: String(r[3]).toUpperCase() === "PRI",
    }));
  },

  async updateCell({ id, table, pkColumn, pkValue, column, value }) {
    const { engine, conn } = need(id);
    const Q = quote[engine];
    const P = placeholder[engine];
    await conn.query(`UPDATE ${Q(table)} SET ${Q(column)} = ${P(0)} WHERE ${Q(pkColumn)} = ${P(1)}`, [value, pkValue]);
    return { ok: true };
  },
  async deleteRow({ id, table, pkColumn, pkValue }) {
    const { engine, conn } = need(id);
    const Q = quote[engine];
    await conn.query(`DELETE FROM ${Q(table)} WHERE ${Q(pkColumn)} = ${placeholder[engine](0)}`, [pkValue]);
    return { ok: true };
  },
  async insertRow({ id, table, columns, values }) {
    const { engine, conn } = need(id);
    const Q = quote[engine];
    const cols = columns.map(Q).join(", ");
    const ph = columns.map((_, i) => placeholder[engine](i)).join(", ");
    await conn.query(`INSERT INTO ${Q(table)} (${cols}) VALUES (${ph})`, values);
    return { ok: true };
  },
  async dropTable({ id, table }) {
    const { engine, conn } = need(id);
    await conn.query(`DROP TABLE IF EXISTS ${quote[engine](table)}`);
    return { ok: true };
  },
  async createTable({ id, name, columns }) {
    const { engine, conn } = need(id);
    const Q = quote[engine];
    const defs = (columns.length ? columns : [{ name: "id", dataType: "INTEGER", nullable: false, primaryKey: true }])
      .map((c) => {
        const parts = [Q(c.name), c.dataType || "TEXT"];
        if (c.primaryKey) parts.push("PRIMARY KEY");
        else if (!c.nullable) parts.push("NOT NULL");
        return parts.join(" ");
      })
      .join(", ");
    await conn.query(`CREATE TABLE ${Q(name)} (${defs})`);
    return { ok: true };
  },
  async addColumn({ id, table, column }) {
    const { engine, conn } = need(id);
    const Q = quote[engine];
    await conn.query(`ALTER TABLE ${Q(table)} ADD COLUMN ${Q(column.name)} ${column.dataType || "TEXT"}`);
    return { ok: true };
  },
  async dropColumn({ id, table, column }) {
    const { engine, conn } = need(id);
    const Q = quote[engine];
    await conn.query(`ALTER TABLE ${Q(table)} DROP COLUMN ${Q(column)}`);
    return { ok: true };
  },
  async renameColumn({ id, table, from, to }) {
    const { engine, conn } = need(id);
    const Q = quote[engine];
    await conn.query(`ALTER TABLE ${Q(table)} RENAME COLUMN ${Q(from)} TO ${Q(to)}`);
    return { ok: true };
  },
  async renameTable({ id, from, to }) {
    const { engine, conn } = need(id);
    const Q = quote[engine];
    const sql =
      engine === "mysql" ? `RENAME TABLE ${Q(from)} TO ${Q(to)}` : `ALTER TABLE ${Q(from)} RENAME TO ${Q(to)}`;
    await conn.query(sql);
    return { ok: true };
  },
};

/* ---- HTTP plumbing ---- */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function sendJson(res, status, obj) {
  cors(res);
  res.setHeader("Content-Type", "application/json");
  res.writeHead(status);
  res.end(JSON.stringify(obj));
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  const path = (req.url || "").replace(/^\/api\//, "").replace(/\?.*$/, "").replace(/^\//, "");
  const handler = handlers[path];
  if (!handler) return sendJson(res, 404, appError("notFound", `Unknown endpoint: ${path}`));

  if (req.method === "GET") {
    Promise.resolve(handler({}))
      .then((out) => sendJson(res, 200, out))
      .catch((e) => sendJson(res, 400, appError(e.kind || "internal", errMessage(e))));
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    let body = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch {
      return sendJson(res, 400, appError("badRequest", "Invalid JSON body"));
    }
    try {
      const out = await handler(body);
      sendJson(res, 200, out);
    } catch (e) {
      sendJson(res, 400, appError(e.kind || (e.code ? "connectionError" : "queryError"), errMessage(e)));
    }
  });
});

server.listen(PORT, () => {
  console.log(`MamaSQL engine bridge listening on http://localhost:${PORT}  (PostgreSQL + MySQL)`);
});
