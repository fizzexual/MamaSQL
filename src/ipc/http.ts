// Browser-side client for the engine bridge (server/bridge.mjs). Routes real
// PostgreSQL / MySQL traffic to the local bridge over HTTP. Connection configs
// live in localStorage (shared with the local SQLite backend); passwords are
// kept encrypted in IndexedDB (see ./secrets) so connections can be re-opened
// after a reload or a bridge restart.
import type { Backend } from "./backend";
import { displayRows } from "../lib/cell";
import { loadSecret } from "./secrets";
import type { AppError, ConnectionConfig, QueryResult } from "./types";

export { deleteSecret, loadSecret, saveSecret } from "./secrets";

// Same-origin by default: the dev server (vite proxy) and the Docker web
// container (nginx) both forward "/api" to the bridge, so no host/port is
// baked in. Override with localStorage "mamasql.bridge" to point elsewhere.
const DEFAULT_BRIDGE = "";
const CONNS_KEY = "mamasql.connections";

export function bridgeUrl(): string {
  try {
    return localStorage.getItem("mamasql.bridge") ?? DEFAULT_BRIDGE;
  } catch {
    return DEFAULT_BRIDGE;
  }
}

function loadConns(): ConnectionConfig[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CONNS_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as ConnectionConfig[]) : [];
  } catch {
    return [];
  }
}

// The bridge itself only ever replies 200 / 400 / 404. A 5xx therefore means the
// proxy (vite or nginx) couldn't reach the bridge — i.e. it's down or restarting
// — and the request never executed, so it's safe to retry. We retry a few times
// with backoff so a brief bridge restart is invisible instead of a raw HTTP 500.
const BRIDGE_DOWN_MSG = "Engine server isn't responding. Start it with `npm start` (or `docker compose up -d`).";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc<T>(path: string, body: unknown): Promise<T> {
  const url = `${bridgeUrl()}/api/${path}`;
  const payload = JSON.stringify(body);
  let downErr: AppError = { kind: "bridgeDown", message: BRIDGE_DOWN_MSG };
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(200 * 2 ** (attempt - 1)); // 200, 400, 800, 1600ms
    let resp: Response;
    try {
      resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    } catch {
      downErr = { kind: "bridgeDown", message: BRIDGE_DOWN_MSG };
      continue; // network error → bridge unreachable → retry
    }
    if (resp.status >= 500) {
      downErr = { kind: "bridgeDown", message: BRIDGE_DOWN_MSG };
      continue; // proxy couldn't reach the bridge → retry
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || (data && data.error)) {
      throw (data?.error ?? { kind: "internal", message: `HTTP ${resp.status}` }) as AppError;
    }
    return data as T;
  }
  throw downErr; // still unreachable after retries
}

async function openById(id: string): Promise<void> {
  const cfg = loadConns().find((c) => c.id === id);
  if (!cfg) throw { kind: "notFound", message: "Unknown connection" } as AppError;
  await rpc("open", { id, cfg, password: await loadSecret(id) });
}

/** Run an op; if the bridge lost the pool (restart), re-open once and retry. */
async function withReopen<T>(id: string, path: string, body: unknown): Promise<T> {
  try {
    return await rpc<T>(path, body);
  } catch (e) {
    if ((e as AppError)?.kind === "notConnected") {
      await openById(id);
      return await rpc<T>(path, body);
    }
    throw e;
  }
}

export async function bridgeHealthy(): Promise<boolean> {
  try {
    const r = await fetch(`${bridgeUrl()}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

// Normalize JSON/binary cells to display text at the data boundary (the grid also
// does this defensively). See lib/cell.
function textifyCells(r: QueryResult): QueryResult {
  if (!r?.rows?.length) return r;
  const rows = displayRows(r.rows);
  return rows === r.rows ? r : { ...r, rows };
}

/** Backend over the bridge. Connection-registry methods are no-ops — the web
 *  router owns the localStorage registry and delegates only engine work here. */
export const httpBackend: Backend = {
  listConnections: async () => [],
  saveConnection: async () => {},
  deleteConnection: async () => {},
  testConnection: (cfg, password = null) => rpc<void>("test", { cfg, password }).then(() => {}),
  listDatabases: (cfg, password = null) => rpc<string[]>("databases", { cfg, password }),
  createDatabase: (cfg, password, name) => rpc<void>("createDatabase", { cfg, password, name }).then(() => {}),
  openConnection: (id) => openById(id),
  closeConnection: (id) => rpc<void>("close", { id }).then(() => {}),
  runQuery: (id, sql) => withReopen<QueryResult>(id, "query", { id, sql }).then(textifyCells),
  listTables: (id) => withReopen(id, "tables", { id }),
  listColumns: (id, table) => withReopen(id, "columns", { id, table }),
  listForeignKeys: (id) => withReopen(id, "foreignKeys", { id }),
  recentHistory: async () => [],
  updateCell: (id, table, pkColumn, pkValue, column, value) =>
    withReopen<void>(id, "updateCell", { id, table, pkColumn, pkValue, column, value }).then(() => {}),
  deleteRow: (id, table, pkColumn, pkValue) =>
    withReopen<void>(id, "deleteRow", { id, table, pkColumn, pkValue }).then(() => {}),
  insertRow: (id, table, columns, values) =>
    withReopen<void>(id, "insertRow", { id, table, columns, values }).then(() => {}),
  dropTable: (id, table) => withReopen<void>(id, "dropTable", { id, table }).then(() => {}),
  createTable: (id, name, columns) => withReopen<void>(id, "createTable", { id, name, columns }).then(() => {}),
  addColumn: (id, table, column) => withReopen<void>(id, "addColumn", { id, table, column }).then(() => {}),
  dropColumn: (id, table, column) => withReopen<void>(id, "dropColumn", { id, table, column }).then(() => {}),
  renameColumn: (id, table, from, to) => withReopen<void>(id, "renameColumn", { id, table, from, to }).then(() => {}),
  renameTable: (id, from, to) => withReopen<void>(id, "renameTable", { id, from, to }).then(() => {}),
  createLocalDatabase: async () => {
    throw { kind: "notSupported", message: "Local databases are created in-browser." } as AppError;
  },
  scanLocalDatabases: async () => [],
};
