// MamaSQL engine bridge — the "desktop" backend the browser talks to.
//
// A browser tab can't open TCP sockets to PostgreSQL/MySQL, so this small local
// HTTP server does it on the browser's behalf using real Node drivers (pg,
// mysql2). Run it with `npm run bridge` (or `npm run dev:all`) and the web app
// will route Postgres/MySQL connections here automatically. SQLite stays fully
// in-browser and does not need this server.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import mysql from "mysql2/promise";
import initSqlJs from "sql.js";

const PORT = Number(process.env.BRIDGE_PORT) || 5174;

// Where server-side SQLite database files live. Defaults to ./data next to the
// repo (or /data in the container). Each database name maps to one file, so the
// same database name is shared across browsers, tabs, and ports.
const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

const require = createRequire(import.meta.url);
const SQLJS_DIST = path.dirname(require.resolve("sql.js"));
let _sqlJs = null;
function sqlJs() {
  if (!_sqlJs) _sqlJs = initSqlJs({ locateFile: (f) => path.join(SQLJS_DIST, f) });
  return _sqlJs;
}

/** Sanitize a database name into a safe file name. */
function sqliteFileKey(name) {
  const safe = String(name || "database").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "database";
  return safe;
}
function sqlitePath(fileKey) {
  return path.join(DATA_DIR, `${fileKey}.sqlite`);
}
// One in-memory sql.js database per file, shared by every connection pointing at
// it (so concurrent browsers see each other's writes via this single process).
const sqliteDbs = new Map(); // fileKey -> Database
const sqliteSaved = new Map(); // fileKey -> changeStamp() of what is on disk

// What SQLite itself says changed: row changes (any statement shape, including
// WITH … INSERT), schema changes (DDL), and user_version. Asking the engine
// instead of pattern-matching the SQL text is what keeps writes from being missed.
function changeStamp(db) {
  const one = (sql) => db.exec(sql)[0].values[0][0];
  return `${one("SELECT total_changes()")}:${one("PRAGMA schema_version")}:${one("PRAGMA user_version")}`;
}
// sql.js has no autocommit getter; BEGIN fails exactly when a transaction is open.
function inTransaction(db) {
  try {
    db.exec("BEGIN");
  } catch {
    return true;
  }
  db.exec("ROLLBACK");
  return false;
}

async function openSqlite(fileKey) {
  let db = sqliteDbs.get(fileKey);
  if (db) return db;
  const SQL = await sqlJs();
  const file = sqlitePath(fileKey);
  const existed = existsSync(file);
  db = existed ? new SQL.Database(readFileSync(file)) : new SQL.Database();
  sqliteDbs.set(fileKey, db);
  if (existed) sqliteSaved.set(fileKey, changeStamp(db));
  else persistSqlite(fileKey);
  return db;
}
/** Write the whole database to disk: temp file + rename, so a crash can't leave half a file. */
function persistSqlite(fileKey) {
  const db = sqliteDbs.get(fileKey);
  if (!db) return;
  const file = sqlitePath(fileKey);
  writeFileSync(`${file}.tmp`, Buffer.from(db.export()));
  renameSync(`${file}.tmp`, file);
  sqliteSaved.set(fileKey, changeStamp(db));
}
/** Save when something changed and no transaction is open (a transaction saves at COMMIT). */
function saveIfChanged(fileKey) {
  const db = sqliteDbs.get(fileKey);
  if (!db || inTransaction(db)) return;
  if (sqliteSaved.get(fileKey) !== changeStamp(db)) persistSqlite(fileKey);
}
function sqliteIdent(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}
/** Run one statement with bound params, then save it. */
function sqliteRun(fileKey, sql, params = []) {
  const db = sqliteDbs.get(fileKey);
  const st = db.prepare(sql);
  try {
    st.run(params);
  } finally {
    st.free();
    saveIfChanged(fileKey);
  }
}
/** Run a (possibly multi-statement) query; returns the last result set. */
function sqliteQuery(fileKey, sql, started) {
  const db = sqliteDbs.get(fileKey);
  let columns = [];
  let rows = [];
  let res;
  let rowsAffected = 0;
  try {
    res = db.exec(sql);
    rowsAffected = db.getRowsModified(); // before saving: export() reopens the db and resets it
  } finally {
    // Statements before a failing one have already run — save them too.
    saveIfChanged(fileKey);
  }
  if (res.length) {
    const last = res[res.length - 1];
    columns = last.columns;
    rows = last.values;
  } else if (/^\s*(select|with|pragma)\b/i.test(sql)) {
    try {
      const st = db.prepare(sql);
      columns = st.getColumnNames();
      st.free();
    } catch {
      /* ignore */
    }
  }
  return {
    columns: columns.map((name) => ({ name, dataType: "" })),
    rows,
    rowsAffected,
    elapsedMs: Math.max(1, Math.round(performance.now() - started)),
    truncated: false,
  };
}

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
/**
 * The text of an error, for the client: only a message string — never the raw
 * value, whose string form can carry a stack trace. Details stay in the log.
 */
function errMessage(e) {
  if (typeof e === "string") return e;
  // pg's happy-eyeballs wraps connection failures in an AggregateError whose
  // inner errors hold the useful ECONNREFUSED/timeout detail.
  if (e && e.name === "AggregateError" && Array.isArray(e.errors) && e.errors.length) {
    const inner = e.errors.map((x) => (x && typeof x.message === "string" ? x.message : "connection failed"));
    return [...new Set(inner)].join("; ");
  }
  if (e && typeof e.message === "string" && e.message) return e.message;
  console.error("[bridge] error without a message:", e);
  return "Unexpected error";
}

/* ---- identifier quoting + placeholders per engine ---- */
const quote = {
  postgres: (id) => `"${String(id).replace(/"/g, '""')}"`,
  mysql: (id) => `\`${String(id).replace(/`/g, "``")}\``,
};
const placeholder = { postgres: (i) => `$${i + 1}`, mysql: () => "?" };

/** Quoting + placeholders for a server engine: an explicit switch, never a lookup by a client-sent name. */
function dialect(engine) {
  if (engine === "postgres") return { Q: quote.postgres, P: placeholder.postgres };
  if (engine === "mysql") return { Q: quote.mysql, P: placeholder.mysql };
  const err = new Error(`Unsupported engine: ${String(engine)}`);
  err.kind = "badRequest";
  throw err;
}

/**
 * The WHERE clause that names exactly one row: `pkColumn` is one key column, or
 * every column of a composite key (with `pkValue` the matching array). Matching
 * on only part of a composite key would edit/delete every row sharing it.
 */
function keyWhere(Q, P, pkColumn, pkValue, firstParam) {
  const cols = Array.isArray(pkColumn) ? pkColumn : [pkColumn];
  const vals = Array.isArray(pkColumn) ? pkValue : [pkValue];
  if (!cols.length || !Array.isArray(vals) || vals.length !== cols.length) {
    const err = new Error("The row key needs one value per key column.");
    err.kind = "badRequest";
    throw err;
  }
  return { sql: cols.map((c, i) => `${Q(c)} = ${P(firstParam + i)}`).join(" AND "), params: vals };
}

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
// Fail fast instead of sitting on the OS defaults: mysql2 waits 10s, but pg has
// no timeout of its own and inherits the kernel's SYN retry budget (~21s on
// Linux, longer elsewhere).
const CONNECT_TIMEOUT_MS = Number(process.env.CONNECT_TIMEOUT_MS) || 10_000;

// Every driver code we can actually explain. A dropped SYN in particular
// surfaces as a bare "connect ETIMEDOUT" with no address attached, which — once
// resolveHost() has quietly rewritten the host — tells the user nothing at all.
const CONNECT_HINTS = {
  ETIMEDOUT: "nothing answered. A firewall is dropping the connection, or the port is wrong — check which port the server actually publishes.",
  ETIMEOUT: "nothing answered. A firewall is dropping the connection, or the port is wrong — check which port the server actually publishes.",
  ECONNREFUSED: "the machine answered but nothing is listening on that port. Check the port, and that the server is running.",
  ENOTFOUND: "that hostname doesn't resolve. Compose service names (e.g. \"mysql\") only resolve from inside the same Docker network.",
  EAI_AGAIN: "that hostname couldn't be resolved (DNS failure).",
  EHOSTUNREACH: "no route to that host.",
  ENETUNREACH: "no route to that network.",
  ECONNRESET: "the server closed the connection during the handshake. It may require TLS, or be rejecting this client.",
};

// Codes that mean we never got a usable socket. Anything else (bad password,
// unsupported auth plugin, TLS refusal) means we DID reach the server, so
// "can't reach" would be actively misleading.
const UNREACHABLE_CODES = new Set(["ETIMEDOUT", "ETIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

function connectError(e, cfg, host, port) {
  // pg's happy-eyeballs hides the real code inside an AggregateError, and its
  // own connectionTimeoutMillis rejects with a bare "timeout expired" (no code).
  const codes = [e?.code, ...(Array.isArray(e?.errors) ? e.errors.map((x) => x?.code) : [])].filter(Boolean);
  let code = codes.find((c) => CONNECT_HINTS[c]) || codes[0] || "";
  if (!code && /timeout expired|connection timeout/i.test(String(e?.message || ""))) code = "ETIMEDOUT";

  // The user typed one host; resolveHost may have dialed another. Say so —
  // otherwise the error names an address that appears nowhere in their settings.
  const typed = String(cfg.host ?? "").trim();
  const via =
    IN_DOCKER && host !== typed
      ? ` (you entered ${typed ? `"${typed}"` : "no host"} — inside Docker that means the container itself, so the bridge dialed ${host} instead)`
      : "";

  const why = CONNECT_HINTS[code] || errMessage(e);
  const lead = UNREACHABLE_CODES.has(code)
    ? `Can't reach ${cfg.engine} at ${host}:${port}${via}`
    : `Reached ${cfg.engine} at ${host}:${port}${via}, but the connection was rejected`;
  const err = new Error(`${lead} — ${why}${code ? ` [${code}]` : ""}`);
  err.kind = "connectionError";
  err.code = code;
  // Not a dropped-mid-session connection: reopening won't help, so don't let the
  // client burn a reopen+retry cycle on an endpoint that was never reachable.
  err.connectFailed = true;
  return err;
}

async function connect(cfg, password) {
  const host = resolveHost(cfg.host);
  const port = cfg.port || (cfg.engine === "postgres" ? 5432 : 3306);
  try {
    if (cfg.engine === "postgres") {
      const client = new pg.Client({
        host,
        port,
        user: cfg.username || "postgres",
        password: password ?? undefined,
        database: cfg.database || "postgres",
        connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      });
      await client.connect();
      return client;
    }
    if (cfg.engine === "mysql") {
      return await mysql.createConnection({
        host,
        port,
        user: cfg.username || "root",
        password: password ?? undefined,
        database: cfg.database || undefined,
        multipleStatements: true,
        connectTimeout: CONNECT_TIMEOUT_MS,
      });
    }
  } catch (e) {
    // Log it too — until now a failed connection left no trace in `docker logs`.
    console.error(`[bridge] connect failed: ${cfg.engine} ${host}:${port} — ${e?.code || ""} ${errMessage(e)}`);
    throw connectError(e, cfg, host, port);
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
    if (cfg.engine === "sqlite") {
      await sqlJs();
      return { ok: true };
    }
    const conn = await connect(cfg, password);
    await closeConn({ engine: cfg.engine, conn });
    return { ok: true };
  },

  async databases({ cfg, password }) {
    if (cfg.engine === "sqlite") {
      return readdirSync(DATA_DIR)
        .filter((f) => f.endsWith(".sqlite"))
        .map((f) => f.replace(/\.sqlite$/, ""))
        .sort();
    }
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
    if (cfg.engine === "sqlite") {
      const key = sqliteFileKey(name);
      await openSqlite(key);
      persistSqlite(key);
      return { ok: true };
    }
    // Plain names only, used exactly as typed. Stripping the rest instead would
    // silently create a different database ("my-db" -> "mydb").
    const safe = String(name ?? "");
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(safe)) {
      const err = new Error(`Invalid database name "${safe}": use letters, digits and _ (not starting with a digit).`);
      err.kind = "badRequest";
      throw err;
    }
    const base = { ...cfg, database: cfg.engine === "postgres" ? "postgres" : "" };
    const conn = await connect(base, password);
    try {
      await conn.query(`CREATE DATABASE ${dialect(cfg.engine).Q(safe)}`);
      return { ok: true };
    } finally {
      await closeConn({ engine: cfg.engine, conn });
    }
  },

  async open({ id, cfg, password }) {
    if (cfg.engine === "sqlite") {
      const fileKey = sqliteFileKey(cfg.database);
      await openSqlite(fileKey);
      pools.set(id, { engine: "sqlite", conn: null, fileKey });
      return { ok: true };
    }
    const existing = pools.get(id);
    if (existing) await closeConn(existing);
    const conn = await connect(cfg, password);
    pools.set(id, { engine: cfg.engine, conn });
    return { ok: true };
  },

  async close({ id }) {
    const e = pools.get(id);
    if (e) {
      // Keep the shared sqlite db cached for other connections; just drop pg/mysql.
      if (e.engine !== "sqlite") await closeConn(e);
      pools.delete(id);
    }
    return { ok: true };
  },

  async query({ id, sql }) {
    const e = need(id);
    const started = performance.now();
    if (e.engine === "sqlite") return sqliteQuery(e.fileKey, sql, started);
    const raw = await rawArrayRows(e.engine, e.conn, sql);
    return toResult(raw, started);
  },

  async tables({ id }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      const r = sqliteDbs
        .get(fileKey)
        .exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const rows = r.length ? r[0].values : [];
      return rows.map((row) => ({ name: String(row[0]), kind: String(row[1]), schema: null }));
    }
    const sql =
      engine === "postgres"
        ? "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name"
        : "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = database() ORDER BY table_name";
    const raw = await rawArrayRows(engine, conn, sql);
    return raw.rows.map((r) => ({ name: String(r[0]), kind: /VIEW/i.test(String(r[1])) ? "view" : "table", schema: null }));
  },

  async columns({ id, table }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      const r = sqliteDbs.get(fileKey).exec(`PRAGMA table_info(${sqliteIdent(table)})`);
      const rows = r.length ? r[0].values : [];
      return rows.map((row) => ({
        name: String(row[1]),
        dataType: row[2] ? String(row[2]) : "",
        nullable: Number(row[3]) === 0,
        isPrimaryKey: Number(row[5]) > 0,
      }));
    }
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

  async foreignKeys({ id }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      const db = sqliteDbs.get(fileKey);
      const tr = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const names = (tr.length ? tr[0].values : []).map((r) => String(r[0]));
      const out = [];
      for (const t of names) {
        const r = db.exec(`PRAGMA foreign_key_list(${sqliteIdent(t)})`);
        for (const row of r.length ? r[0].values : []) {
          out.push({ table: t, column: String(row[3]), refTable: String(row[2]), refColumn: row[4] == null ? "" : String(row[4]) });
        }
      }
      return out;
    }
    const sql =
      engine === "postgres"
        ? `SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
           WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = current_schema()`
        : `SELECT table_name, column_name, referenced_table_name, referenced_column_name
           FROM information_schema.key_column_usage
           WHERE referenced_table_name IS NOT NULL AND table_schema = database()`;
    const raw = await rawArrayRows(engine, conn, sql);
    return raw.rows.map((r) => ({
      table: String(r[0]),
      column: String(r[1]),
      refTable: String(r[2]),
      refColumn: String(r[3]),
    }));
  },

  async updateCell({ id, table, pkColumn, pkValue, column, value }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      const key = keyWhere(sqliteIdent, () => "?", pkColumn, pkValue, 1);
      sqliteRun(fileKey, `UPDATE ${sqliteIdent(table)} SET ${sqliteIdent(column)} = ? WHERE ${key.sql}`, [value, ...key.params]);
      return { ok: true };
    }
    const { Q, P } = dialect(engine);
    const key = keyWhere(Q, P, pkColumn, pkValue, 1);
    await conn.query(`UPDATE ${Q(table)} SET ${Q(column)} = ${P(0)} WHERE ${key.sql}`, [value, ...key.params]);
    return { ok: true };
  },
  async deleteRow({ id, table, pkColumn, pkValue }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      const key = keyWhere(sqliteIdent, () => "?", pkColumn, pkValue, 0);
      sqliteRun(fileKey, `DELETE FROM ${sqliteIdent(table)} WHERE ${key.sql}`, key.params);
      return { ok: true };
    }
    const { Q, P } = dialect(engine);
    const key = keyWhere(Q, P, pkColumn, pkValue, 0);
    await conn.query(`DELETE FROM ${Q(table)} WHERE ${key.sql}`, key.params);
    return { ok: true };
  },
  async insertRow({ id, table, columns, values }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      if (columns.length === 0) {
        sqliteRun(fileKey, `INSERT INTO ${sqliteIdent(table)} DEFAULT VALUES`);
      } else {
        const cols = columns.map(sqliteIdent).join(", ");
        const ph = columns.map(() => "?").join(", ");
        sqliteRun(fileKey, `INSERT INTO ${sqliteIdent(table)} (${cols}) VALUES (${ph})`, values);
      }
      return { ok: true };
    }
    const { Q, P } = dialect(engine);
    const cols = columns.map(Q).join(", ");
    const ph = columns.map((_, i) => P(i)).join(", ");
    await conn.query(`INSERT INTO ${Q(table)} (${cols}) VALUES (${ph})`, values);
    return { ok: true };
  },
  async dropTable({ id, table }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      // A view needs DROP VIEW, not DROP TABLE — look up which it is.
      const db = sqliteDbs.get(fileKey);
      let type = "table";
      const st = db.prepare("SELECT type FROM sqlite_master WHERE name = ?");
      try {
        st.bind([table]);
        if (st.step()) type = String(st.get()[0] || "table");
      } finally {
        st.free();
      }
      sqliteRun(fileKey, `DROP ${/view/i.test(type) ? "VIEW" : "TABLE"} IF EXISTS ${sqliteIdent(table)}`);
      return { ok: true };
    }
    if (engine === "mysql") {
      // DROP TABLE silently no-ops a view (and vice-versa); issue both so either
      // a base table or a view is removed. IF EXISTS keeps the other a no-op.
      for (const kw of ["TABLE", "VIEW"]) {
        await conn.query(`DROP ${kw} IF EXISTS ${quote.mysql(table)}`);
      }
      return { ok: true };
    }
    // PostgreSQL: IF EXISTS doesn't suppress a wrong-type error, so pick the type.
    const tr = await conn.query({
      text: "SELECT table_type FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1",
      values: [table],
      rowMode: "array",
    });
    const rows = Array.isArray(tr) ? tr[tr.length - 1].rows : tr.rows;
    const isView = !!rows?.[0] && /VIEW/i.test(String(rows[0][0] ?? ""));
    await conn.query(`DROP ${isView ? "VIEW" : "TABLE"} IF EXISTS ${quote.postgres(table)}`);
    return { ok: true };
  },
  async createTable({ id, name, columns }) {
    const { engine, conn, fileKey } = need(id);
    const cols = columns.length ? columns : [{ name: "id", dataType: "INTEGER", nullable: false, primaryKey: true }];
    if (engine === "sqlite") {
      const defs = cols
        .map((c) => {
          const parts = [sqliteIdent(c.name), c.dataType || "TEXT"];
          if (c.primaryKey) parts.push("PRIMARY KEY");
          else if (!c.nullable) parts.push("NOT NULL");
          return parts.join(" ");
        })
        .join(", ");
      sqliteRun(fileKey, `CREATE TABLE ${sqliteIdent(name)} (${defs})`);
      return { ok: true };
    }
    const Q = dialect(engine).Q;
    const defs = cols
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
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      sqliteRun(fileKey, `ALTER TABLE ${sqliteIdent(table)} ADD COLUMN ${sqliteIdent(column.name)} ${column.dataType || "TEXT"}`);
      return { ok: true };
    }
    const Q = dialect(engine).Q;
    await conn.query(`ALTER TABLE ${Q(table)} ADD COLUMN ${Q(column.name)} ${column.dataType || "TEXT"}`);
    return { ok: true };
  },
  async dropColumn({ id, table, column }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      sqliteRun(fileKey, `ALTER TABLE ${sqliteIdent(table)} DROP COLUMN ${sqliteIdent(column)}`);
      return { ok: true };
    }
    const Q = dialect(engine).Q;
    await conn.query(`ALTER TABLE ${Q(table)} DROP COLUMN ${Q(column)}`);
    return { ok: true };
  },
  async renameColumn({ id, table, from, to }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      sqliteRun(fileKey, `ALTER TABLE ${sqliteIdent(table)} RENAME COLUMN ${sqliteIdent(from)} TO ${sqliteIdent(to)}`);
      return { ok: true };
    }
    const Q = dialect(engine).Q;
    await conn.query(`ALTER TABLE ${Q(table)} RENAME COLUMN ${Q(from)} TO ${Q(to)}`);
    return { ok: true };
  },
  async renameTable({ id, from, to }) {
    const { engine, conn, fileKey } = need(id);
    if (engine === "sqlite") {
      sqliteRun(fileKey, `ALTER TABLE ${sqliteIdent(from)} RENAME TO ${sqliteIdent(to)}`);
      return { ok: true };
    }
    const Q = dialect(engine).Q;
    const sql =
      engine === "mysql" ? `RENAME TABLE ${Q(from)} TO ${Q(to)}` : `ALTER TABLE ${Q(from)} RENAME TO ${Q(to)}`;
    await conn.query(sql);
    return { ok: true };
  },
};

/* ---- HTTP plumbing ---- */

/** The endpoints the bridge serves: exactly the handlers above, nothing inherited. */
const endpoints = new Map(Object.entries(handlers));

// The bridge opens database connections for whoever asks, so it must only
// answer the MamaSQL page itself — never another website the user happens to
// have open (a browser lets any page POST to localhost).
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
function hostnameOf(hostHeader) {
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}
/** The request's Origin when it may use the bridge, "" when it carries none, null when refused. */
function allowedOrigin(req) {
  const host = hostnameOf(req.headers.host || "");
  // Outside Docker the bridge is localhost-only; a foreign Host name means DNS
  // rebinding (evil.example resolved to 127.0.0.1).
  if (!IN_DOCKER && !LOOPBACK.has(host)) return null;
  const origin = req.headers.origin;
  if (!origin) return ""; // not a cross-site browser request (curl, a server-side proxy)
  let from;
  try {
    from = new URL(origin).hostname.toLowerCase();
  } catch {
    return null; // e.g. "null" from a sandboxed frame or file://
  }
  // The dev server's page (localhost), or in Docker the page nginx served
  // (same host name the browser used to reach the web container).
  if (LOOPBACK.has(from) || (IN_DOCKER && from === host)) return origin;
  return null;
}
function cors(res) {
  if (!res.allowedOrigin) return; // same-origin through the proxy: no CORS needed
  res.setHeader("Access-Control-Allow-Origin", res.allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function sendJson(res, status, obj) {
  // Serialize BEFORE touching the response, so a serialization failure becomes a
  // clean error instead of a half-sent 200 (which the proxy turns into a 500).
  let body;
  let code = status;
  try {
    body = JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  } catch (e) {
    code = 400;
    body = JSON.stringify({ error: { kind: "internal", message: `Result not serializable: ${errMessage(e)}` } });
  }
  if (res.headersSent) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
    return;
  }
  cors(res);
  res.setHeader("Content-Type", "application/json");
  res.writeHead(code);
  res.end(body);
}

// A DB connection dropped out from under us (idle timeout, server restart, …)?
// Distinct from "can't reach the DB at all" (ECONNREFUSED), which reopening
// won't fix.
function isConnLost(e) {
  if (!e) return false;
  if (e.connectFailed) return false; // never established — reopening can't fix it
  if (e.fatal) return true;
  if (["PROTOCOL_CONNECTION_LOST", "ECONNRESET", "EPIPE"].includes(e.code)) return true;
  return /closed state|server has gone away|connection lost|connection terminated|terminating connection/i.test(String(e.message || ""));
}

const server = createServer((req, res) => {
  const origin = allowedOrigin(req);
  if (origin === null) {
    console.error(`[bridge] refused ${req.method} ${req.url} from origin ${req.headers.origin ?? "-"} (host ${req.headers.host ?? "-"})`);
    return sendJson(res, 403, appError("forbidden", "This page may not use the MamaSQL engine bridge."));
  }
  res.allowedOrigin = origin;
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  const path = (req.url || "").replace(/^\/api\//, "").replace(/\?.*$/, "").replace(/^\//, "");
  // A Map, not handlers[path]: a plain object lookup would also reach inherited
  // methods such as /api/toString or /api/constructor.
  const handler = endpoints.get(path);
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
      // A dropped DB connection: forget it and report notConnected so the client
      // transparently reopens + retries (self-heals idle timeouts).
      if (isConnLost(e) && body && body.id) {
        const ent = pools.get(body.id);
        if (ent) {
          try {
            await closeConn(ent);
          } catch {
            /* ignore */
          }
          pools.delete(body.id);
        }
        return sendJson(res, 400, appError("notConnected", errMessage(e)));
      }
      sendJson(res, 400, appError(e.kind || (e.code ? "connectionError" : "queryError"), errMessage(e)));
    }
  });
});

// One bad request must never take the whole bridge down.
process.on("uncaughtException", (e) => console.error("[bridge] uncaughtException:", e));
process.on("unhandledRejection", (e) => console.error("[bridge] unhandledRejection:", e));

// Outside Docker, only this machine may connect. In Docker the web container
// reaches it over the compose network, and the published web port's BIND_ADDR
// decides who can reach that.
const LISTEN_HOST = IN_DOCKER ? "0.0.0.0" : "127.0.0.1";
server.listen(PORT, LISTEN_HOST, () => {
  console.log(`MamaSQL engine bridge listening on http://${LISTEN_HOST}:${PORT}  (PostgreSQL + MySQL)`);
});
