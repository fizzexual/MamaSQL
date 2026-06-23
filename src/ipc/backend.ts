import { tauriBackend } from "./tauri";
import { webBackend } from "./web";
import type {
  ColumnDef,
  ColumnInfo,
  ConnectionConfig,
  HistoryEntry,
  QueryResult,
  TableInfo,
} from "./types";

/** The single surface the UI uses to reach a database backend. */
export interface Backend {
  listConnections(): Promise<ConnectionConfig[]>;
  saveConnection(cfg: ConnectionConfig, password?: string | null): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  testConnection(cfg: ConnectionConfig, password?: string | null): Promise<void>;
  listDatabases(cfg: ConnectionConfig, password?: string | null): Promise<string[]>;
  createDatabase(cfg: ConnectionConfig, password: string | null, name: string): Promise<void>;
  openConnection(id: string): Promise<void>;
  closeConnection(id: string): Promise<void>;
  runQuery(connectionId: string, sql: string): Promise<QueryResult>;
  listTables(connectionId: string): Promise<TableInfo[]>;
  listColumns(connectionId: string, table: string): Promise<ColumnInfo[]>;
  recentHistory(limit: number): Promise<HistoryEntry[]>;
  updateCell(
    connectionId: string,
    table: string,
    pkColumn: string,
    pkValue: unknown,
    column: string,
    value: unknown,
  ): Promise<void>;
  deleteRow(connectionId: string, table: string, pkColumn: string, pkValue: unknown): Promise<void>;
  insertRow(connectionId: string, table: string, columns: string[], values: unknown[]): Promise<void>;
  dropTable(connectionId: string, table: string): Promise<void>;
  createTable(connectionId: string, name: string, columns: ColumnDef[]): Promise<void>;
  addColumn(connectionId: string, table: string, column: ColumnDef): Promise<void>;
  dropColumn(connectionId: string, table: string, column: string): Promise<void>;
  renameColumn(connectionId: string, table: string, from: string, to: string): Promise<void>;
  renameTable(connectionId: string, from: string, to: string): Promise<void>;
  createLocalDatabase(name: string): Promise<ConnectionConfig>;
  scanLocalDatabases(): Promise<ConnectionConfig[]>;
}

/** True when running inside the Tauri webview (vs a plain browser). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let active: Backend | null = null;

/**
 * Tauri backend on the desktop; in the browser, a router that runs SQLite
 * in-process (sql.js) and sends PostgreSQL/MySQL to the local engine bridge.
 */
export function getBackend(): Backend {
  if (!active) active = isTauri() ? tauriBackend : webBackend;
  return active;
}
