// Web router backend: in a browser tab, SQLite runs in-process (sql.js) while
// PostgreSQL / MySQL are routed to the local engine bridge over HTTP. The
// connection registry + query history live in localStorage and are shared by
// both, so the connection list and history are unified regardless of engine.
import type { Backend } from "./backend";
import { httpBackend, deleteSecret, saveSecret } from "./http";
import { localBackend } from "./local";
import type { ColumnDef, ConnectionConfig, HistoryEntry } from "./types";

const CONNS_KEY = "mamasql.connections";
const HIST_KEY = "mamasql.history";

function loadConns(): ConnectionConfig[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CONNS_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as ConnectionConfig[]) : [];
  } catch {
    return [];
  }
}
function engineOf(id: string): string | undefined {
  return loadConns().find((c) => c.id === id)?.engine;
}
/** The backend that owns a given connection (sqlite → in-browser, else bridge). */
function sub(id: string): Backend {
  return engineOf(id) === "sqlite" ? localBackend : httpBackend;
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HIST_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}
let histId = readHistory().reduce((m, h) => Math.max(m, h.id), 0);
function pushHistory(connectionId: string, sql: string): void {
  const list = readHistory();
  list.unshift({ id: ++histId, connectionId, sql, ranAt: new Date().toISOString() });
  if (list.length > 200) list.length = 200;
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export const webBackend: Backend = {
  /* connection registry — always the localStorage-backed local store */
  listConnections: () => localBackend.listConnections(),
  saveConnection: async (cfg, password = null) => {
    await localBackend.saveConnection(cfg, password);
    if (cfg.engine !== "sqlite") saveSecret(cfg.id, password);
  },
  deleteConnection: async (id) => {
    try {
      await httpBackend.closeConnection(id);
    } catch {
      /* bridge may be down — ignore */
    }
    deleteSecret(id);
    await localBackend.deleteConnection(id);
  },

  /* cfg-driven ops route by the cfg's engine */
  testConnection: (cfg, password = null) => (cfg.engine === "sqlite" ? localBackend : httpBackend).testConnection(cfg, password),
  listDatabases: (cfg, password = null) => (cfg.engine === "sqlite" ? localBackend : httpBackend).listDatabases(cfg, password),
  createDatabase: (cfg, password, name) => (cfg.engine === "sqlite" ? localBackend : httpBackend).createDatabase(cfg, password, name),

  /* id-driven ops route by the connection's engine */
  openConnection: (id) => sub(id).openConnection(id),
  closeConnection: (id) => sub(id).closeConnection(id),
  runQuery: async (id, sql) => {
    const r = await sub(id).runQuery(id, sql);
    pushHistory(id, sql);
    return r;
  },
  listTables: (id) => sub(id).listTables(id),
  listColumns: (id, table) => sub(id).listColumns(id, table),
  listForeignKeys: (id) => sub(id).listForeignKeys(id),
  recentHistory: async (limit) => readHistory().slice(0, limit),

  updateCell: (id, table, pkColumn, pkValue, column, value) =>
    sub(id).updateCell(id, table, pkColumn, pkValue, column, value),
  deleteRow: (id, table, pkColumn, pkValue) => sub(id).deleteRow(id, table, pkColumn, pkValue),
  insertRow: (id, table, columns, values) => sub(id).insertRow(id, table, columns, values),
  dropTable: (id, table) => sub(id).dropTable(id, table),
  createTable: (id, name, columns: ColumnDef[]) => sub(id).createTable(id, name, columns),
  addColumn: (id, table, column: ColumnDef) => sub(id).addColumn(id, table, column),
  dropColumn: (id, table, column) => sub(id).dropColumn(id, table, column),
  renameColumn: (id, table, from, to) => sub(id).renameColumn(id, table, from, to),
  renameTable: (id, from, to) => sub(id).renameTable(id, from, to),

  createLocalDatabase: (name) => localBackend.createLocalDatabase(name),
  scanLocalDatabases: () => localBackend.scanLocalDatabases(),
};
