import { mockBackend } from "./mock";
import { tauriBackend } from "./tauri";
import type {
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
}

/** True when running inside the Tauri webview (vs a plain browser). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let active: Backend | null = null;

/** Returns the Tauri backend under Tauri, else the in-memory browser mock. */
export function getBackend(): Backend {
  if (!active) active = isTauri() ? tauriBackend : mockBackend;
  return active;
}
