// Runs the real bridge (server/bridge.mjs) as a child process and talks to it
// over HTTP, exactly the way the web app and the Docker nginx proxy do.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BRIDGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "bridge.mjs");
const running = [];

function freePort() {
  return new Promise((res) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

async function startBridge(env = {}) {
  const port = await freePort();
  const dataDir = mkdtempSync(path.join(tmpdir(), "mamasql-bridge-"));
  const child = spawn(process.execPath, [BRIDGE], {
    env: { ...process.env, BRIDGE_PORT: String(port), DATA_DIR: dataDir, BRIDGE_IN_DOCKER: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("bridge did not start")), 10_000);
    child.stdout.on("data", (d) => String(d).includes("listening") && (clearTimeout(t), res()));
    child.on("exit", (code) => rej(new Error(`bridge exited with ${code}`)));
  });
  const b = { port, dataDir, child };
  running.push(b);
  return b;
}

function stopBridge(b) {
  b.child.kill();
  try {
    rmSync(b.dataDir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold the file for a moment */
  }
}

// node:http rather than fetch: fetch silently drops a custom Host header, and the
// Host is exactly what the DNS-rebinding and Docker checks look at.
function call(b, endpoint, body, headers = {}, method = "POST") {
  const payload = method === "POST" ? JSON.stringify(body) : undefined;
  return new Promise((res, rej) => {
    const req = request(
      { host: "127.0.0.1", port: b.port, path: `/api/${endpoint}`, method, headers: { "Content-Type": "application/json", ...headers } },
      (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          } catch {
            /* empty body */
          }
          res({ status: r.statusCode, headers: new Headers(r.headers), body: json });
        });
      },
    );
    req.on("error", rej);
    req.end(payload);
  });
}

let SQL;
/** Read a bridge SQLite database straight from its file on disk. */
function onDisk(b, fileKey, sql) {
  const db = new SQL.Database(readFileSync(path.join(b.dataDir, `${fileKey}.sqlite`)));
  try {
    const res = db.exec(sql);
    return res.length ? res[0].values : [];
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  SQL = await initSqlJs();
});
afterAll(() => running.forEach(stopBridge));

describe("bridge: who may use it", () => {
  let b;
  beforeAll(async () => {
    b = await startBridge();
  });

  it("refuses a request sent by another website", async () => {
    const r = await call(b, "health", {}, { Origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(r.body.error.kind).toBe("forbidden");
  });

  it("never answers with a wildcard CORS header", async () => {
    const r = await call(b, "health", {}, { Origin: "http://localhost:1420" });
    expect(r.headers.get("access-control-allow-origin")).not.toBe("*");
  });

  it("allows the app itself (a localhost origin) and echoes that origin", async () => {
    const r = await call(b, "health", {}, { Origin: "http://localhost:1420" });
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:1420");
  });

  it("allows requests with no Origin (curl, the dev proxy's server side)", async () => {
    expect((await call(b, "health", {})).status).toBe(200);
  });

  it("refuses a DNS-rebinding request (a foreign Host name pointed at 127.0.0.1)", async () => {
    const r = await call(b, "health", {}, { Origin: "http://evil.example:1234", Host: `evil.example:${b.port}` });
    expect(r.status).toBe(403);
  });

  it("only dispatches to its own endpoints, never inherited object methods", async () => {
    for (const name of ["toString", "constructor", "hasOwnProperty", "__proto__", "valueOf"]) {
      const r = await call(b, name, {});
      expect(r.status, name).toBe(404);
      expect(r.body.error.kind, name).toBe("notFound");
    }
  });

  it("refuses an engine it does not know, without touching the pool", async () => {
    const r = await call(b, "open", { id: "odd", cfg: { engine: "toString", host: "127.0.0.1" } });
    expect(r.status).toBe(400);
    const after = await call(b, "updateCell", { id: "odd", table: "t", pkColumn: "a", pkValue: 1, column: "v", value: 1 });
    expect(after.body.error.kind).toBe("notConnected");
  });

  it("refuses a cross-site CORS preflight", async () => {
    const r = await call(b, "query", null, { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" }, "OPTIONS");
    expect(r.status).toBe(403);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });

  const lanIp = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  it.skipIf(!lanIp)("is not reachable from the network outside Docker (binds to loopback)", async () => {
    await expect(fetch(`http://${lanIp}:${b.port}/api/health`)).rejects.toThrow();
  });
});

describe("bridge: error replies carry a message, never a stack trace", () => {
  let b;
  beforeAll(async () => {
    b = await startBridge();
  });

  it.each([
    ["a SQL error", "query", { id: "e1", sql: "SELEC 1" }, { open: { id: "e1", cfg: { engine: "sqlite", database: "errs" } }, kind: "queryError" }],
    ["an unknown connection", "query", { id: "nope", sql: "SELECT 1" }, { kind: "notConnected" }],
    ["a refused connection", "test", { cfg: { engine: "postgres", host: "127.0.0.1", port: 1 } }, { kind: "connectionError" }],
    ["an unknown engine", "open", { id: "x", cfg: { engine: "toString" } }, { kind: "queryError" }],
  ])("%s", async (_label, endpoint, body, { open, kind }) => {
    if (open) await call(b, "open", open);
    const r = await call(b, endpoint, body);
    expect(r.status).toBe(400);
    expect(r.body.error.kind).toBe(kind);
    expect(typeof r.body.error.message).toBe("string");
    expect(r.body.error.message).not.toMatch(/\n\s*at\s|\.mjs:\d+/);
  });
});

describe("bridge: creating a database", () => {
  let b;
  beforeAll(async () => {
    b = await startBridge();
  });
  const env = process.env;
  const pg = () => ({
    engine: "postgres",
    host: env.MAMASQL_PG_HOST || "localhost",
    port: Number(env.MAMASQL_PG_PORT) || 5432,
    database: env.MAMASQL_PG_DB || "postgres",
    username: env.MAMASQL_PG_USER || "postgres",
  });
  const names = async () => (await call(b, "databases", { cfg: pg(), password: env.MAMASQL_PG_PASS })).body;

  it.skipIf(!env.MAMASQL_PG_TEST)("refuses a name it would have to change, instead of creating another database", async () => {
    const r = await call(b, "createDatabase", { cfg: pg(), password: env.MAMASQL_PG_PASS, name: "my-db; x" });
    expect(r.status).toBe(400);
    expect(r.body.error.kind).toBe("badRequest");
    expect(await names()).not.toContain("mydbx");
  });

  it.skipIf(!env.MAMASQL_PG_TEST)("creates a plain name as given", async () => {
    const name = `mamasql_t_${Date.now()}`;
    expect((await call(b, "createDatabase", { cfg: pg(), password: env.MAMASQL_PG_PASS, name })).status).toBe(200);
    expect(await names()).toContain(name);
  });
});

describe("bridge in Docker: the web container proxies with the page's own Host", () => {
  let b;
  beforeAll(async () => {
    b = await startBridge({ BRIDGE_IN_DOCKER: "true" });
  });

  it("allows a page whose Origin matches the Host it was served from", async () => {
    const r = await call(b, "health", {}, { Origin: "http://myserver:5001", Host: "myserver:5001" });
    expect(r.status).toBe(200);
  });

  it("refuses another website even in Docker", async () => {
    const r = await call(b, "health", {}, { Origin: "https://evil.example", Host: "myserver:5001" });
    expect(r.status).toBe(403);
  });
});

describe("bridge: SQLite writes reach the file on disk", () => {
  let b;
  beforeAll(async () => {
    b = await startBridge();
  });

  async function freshDb(name) {
    const cfg = { engine: "sqlite", database: name };
    expect((await call(b, "open", { id: name, cfg })).status).toBe(200);
    await call(b, "query", { id: name, sql: "CREATE TABLE t (x INTEGER)" });
    return name;
  }

  it("persists a plain INSERT", async () => {
    const id = await freshDb("plain");
    await call(b, "query", { id, sql: "INSERT INTO t VALUES (1)" });
    expect(onDisk(b, id, "SELECT x FROM t")).toEqual([[1]]);
  });

  it("persists a write that starts with WITH", async () => {
    const id = await freshDb("cte");
    await call(b, "query", { id, sql: "WITH a(v) AS (SELECT 7) INSERT INTO t SELECT v FROM a" });
    expect(onDisk(b, id, "SELECT x FROM t")).toEqual([[7]]);
  });

  it("keeps saving after a one-shot BEGIN; …; COMMIT; script", async () => {
    const id = await freshDb("script");
    await call(b, "query", { id, sql: "BEGIN; INSERT INTO t VALUES (1); COMMIT;" });
    await call(b, "query", { id, sql: "INSERT INTO t VALUES (2)" });
    await call(b, "updateCell", { id, table: "t", pkColumn: "x", pkValue: 2, column: "x", value: 5 });
    expect(onDisk(b, id, "SELECT x FROM t ORDER BY x")).toEqual([[1], [5]]);
  });

  it("does not save a transaction until it is committed, then saves it", async () => {
    const id = await freshDb("txn");
    await call(b, "query", { id, sql: "BEGIN" });
    await call(b, "query", { id, sql: "INSERT INTO t VALUES (1)" });
    expect(onDisk(b, id, "SELECT x FROM t")).toEqual([]);
    await call(b, "query", { id, sql: "COMMIT" });
    expect(onDisk(b, id, "SELECT x FROM t")).toEqual([[1]]);
  });

  it("drops a rolled-back transaction", async () => {
    const id = await freshDb("rollback");
    await call(b, "query", { id, sql: "INSERT INTO t VALUES (1)" });
    await call(b, "query", { id, sql: "BEGIN; INSERT INTO t VALUES (2); ROLLBACK;" });
    await call(b, "query", { id, sql: "INSERT INTO t VALUES (3)" });
    expect(onDisk(b, id, "SELECT x FROM t ORDER BY x")).toEqual([[1], [3]]);
  });

  it("saves the statements that ran before a failing one in the same script", async () => {
    const id = await freshDb("partial");
    const r = await call(b, "query", { id, sql: "INSERT INTO t VALUES (1); INSERT INTO nope VALUES (2);" });
    expect(r.status).toBe(400);
    expect(onDisk(b, id, "SELECT x FROM t")).toEqual([[1]]);
  });

  it("persists schema-only changes (DDL, user_version)", async () => {
    const id = await freshDb("ddl");
    await call(b, "query", { id, sql: "CREATE INDEX ix ON t (x)" });
    await call(b, "query", { id, sql: "PRAGMA user_version = 7" });
    expect(onDisk(b, id, "SELECT name FROM sqlite_master WHERE type = 'index'")).toEqual([["ix"]]);
    expect(onDisk(b, id, "PRAGMA user_version")).toEqual([[7]]);
  });
});

// Composite primary keys: the edit/delete must name every key column.
const KEYED = "CREATE TABLE ck (a INTEGER, b INTEGER, v TEXT, PRIMARY KEY (a, b))";
const KEYED_ROWS = "INSERT INTO ck VALUES (1, 1, 'x'), (1, 2, 'y'), (1, 3, 'z')";

async function compositeKeyChecks(b, id) {
  await call(b, "query", { id, sql: "DROP TABLE IF EXISTS ck" });
  await call(b, "query", { id, sql: KEYED });
  await call(b, "query", { id, sql: KEYED_ROWS });
  const upd = await call(b, "updateCell", { id, table: "ck", pkColumn: ["a", "b"], pkValue: [1, 2], column: "v", value: "EDITED" });
  expect(upd.status).toBe(200);
  const del = await call(b, "deleteRow", { id, table: "ck", pkColumn: ["a", "b"], pkValue: [1, 3] });
  expect(del.status).toBe(200);
  const r = await call(b, "query", { id, sql: "SELECT a, b, v FROM ck ORDER BY b" });
  expect(r.body.rows).toEqual([
    [1, 1, "x"],
    [1, 2, "EDITED"],
  ]);
  // A single key column (the old call shape) keeps working.
  await call(b, "updateCell", { id, table: "ck", pkColumn: "b", pkValue: 1, column: "v", value: "one" });
  expect((await call(b, "query", { id, sql: "SELECT v FROM ck WHERE b = 1" })).body.rows).toEqual([["one"]]);
  // A key with the wrong number of values is refused, not widened.
  const bad = await call(b, "deleteRow", { id, table: "ck", pkColumn: ["a", "b"], pkValue: [1] });
  expect(bad.status).toBe(400);
  // count(*) is a bigint: Postgres sends it as the string "2".
  expect(Number((await call(b, "query", { id, sql: "SELECT count(*) FROM ck" })).body.rows[0][0])).toBe(2);
}

describe("bridge: composite primary keys", () => {
  let b;
  beforeAll(async () => {
    b = await startBridge();
  });

  it("SQLite: edits and deletes exactly one row", async () => {
    await call(b, "open", { id: "ck", cfg: { engine: "sqlite", database: "ck" } });
    await compositeKeyChecks(b, "ck");
  });

  // Live engines: run with the same variables as the Rust integration tests.
  // Skipped (shown as skipped, not passed) when they are not set.
  const env = process.env;
  it.skipIf(!env.MAMASQL_PG_TEST)("PostgreSQL: edits and deletes exactly one row", async () => {
    const cfg = {
      engine: "postgres",
      host: env.MAMASQL_PG_HOST || "localhost",
      port: Number(env.MAMASQL_PG_PORT) || 5432,
      database: env.MAMASQL_PG_DB || "postgres",
      username: env.MAMASQL_PG_USER || "postgres",
    };
    expect((await call(b, "open", { id: "pg", cfg, password: env.MAMASQL_PG_PASS })).status).toBe(200);
    await compositeKeyChecks(b, "pg");
  });

  it.skipIf(!env.MAMASQL_MYSQL_TEST)("MySQL: edits and deletes exactly one row", async () => {
    const cfg = {
      engine: "mysql",
      host: env.MAMASQL_MYSQL_HOST || "localhost",
      port: Number(env.MAMASQL_MYSQL_PORT) || 3306,
      database: env.MAMASQL_MYSQL_DB || "mamasql_test",
      username: env.MAMASQL_MYSQL_USER || "root",
    };
    expect((await call(b, "open", { id: "my", cfg, password: env.MAMASQL_MYSQL_PASS })).status).toBe(200);
    await compositeKeyChecks(b, "my");
  });
});
