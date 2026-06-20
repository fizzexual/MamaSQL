import { invoke } from "@tauri-apps/api/core";
import type { Backend } from "./backend";
import type {
  ColumnInfo,
  ConnectionConfig,
  HistoryEntry,
  QueryResult,
  TableInfo,
} from "./types";

/** Real backend: thin typed wrappers over Tauri commands. */
export const tauriBackend: Backend = {
  listConnections: () => invoke<ConnectionConfig[]>("list_connections"),
  saveConnection: (cfg, password = null) =>
    invoke<void>("save_connection", { cfg, password }),
  deleteConnection: (id) => invoke<void>("delete_connection", { id }),
  testConnection: (cfg, password = null) =>
    invoke<void>("test_connection", { cfg, password }),
  listDatabases: (cfg, password = null) =>
    invoke<string[]>("list_databases", { cfg, password }),
  createDatabase: (cfg, password, name) =>
    invoke<void>("create_database", { cfg, password, name }),
  openConnection: (id) => invoke<void>("open_connection", { id }),
  closeConnection: (id) => invoke<void>("close_connection", { id }),
  runQuery: (connectionId, sql) =>
    invoke<QueryResult>("run_query", { connectionId, sql }),
  listTables: (connectionId) =>
    invoke<TableInfo[]>("list_tables", { connectionId }),
  listColumns: (connectionId, table) =>
    invoke<ColumnInfo[]>("list_columns", { connectionId, table }),
  recentHistory: (limit) => invoke<HistoryEntry[]>("recent_history", { limit }),
  updateCell: (connectionId, table, pkColumn, pkValue, column, value) =>
    invoke<void>("update_cell", { connectionId, table, pkColumn, pkValue, column, value }),
  deleteRow: (connectionId, table, pkColumn, pkValue) =>
    invoke<void>("delete_row", { connectionId, table, pkColumn, pkValue }),
  insertRow: (connectionId, table, columns, values) =>
    invoke<void>("insert_row", { connectionId, table, columns, values }),
  dropTable: (connectionId, table) => invoke<void>("drop_table", { connectionId, table }),
  createTable: (connectionId, name, columns) =>
    invoke<void>("create_table", { connectionId, name, columns }),
  addColumn: (connectionId, table, column) =>
    invoke<void>("add_column", { connectionId, table, column }),
  dropColumn: (connectionId, table, column) =>
    invoke<void>("drop_column", { connectionId, table, column }),
  renameColumn: (connectionId, table, from, to) =>
    invoke<void>("rename_column", { connectionId, table, from, to }),
  renameTable: (connectionId, from, to) =>
    invoke<void>("rename_table", { connectionId, from, to }),
  createLocalDatabase: (name) => invoke<ConnectionConfig>("create_local_database", { name }),
  scanLocalDatabases: () => invoke<ConnectionConfig[]>("scan_local_databases"),
};
