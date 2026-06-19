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
  openConnection: (id) => invoke<void>("open_connection", { id }),
  closeConnection: (id) => invoke<void>("close_connection", { id }),
  runQuery: (connectionId, sql) =>
    invoke<QueryResult>("run_query", { connectionId, sql }),
  listTables: (connectionId) =>
    invoke<TableInfo[]>("list_tables", { connectionId }),
  listColumns: (connectionId, table) =>
    invoke<ColumnInfo[]>("list_columns", { connectionId, table }),
  recentHistory: (limit) => invoke<HistoryEntry[]>("recent_history", { limit }),
};
