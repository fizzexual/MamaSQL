// TypeScript mirrors of the Rust DTOs (camelCase, matching serde output).

export type Engine = "postgres" | "mysql" | "sqlite";

export interface ConnectionConfig {
  id: string;
  name: string;
  engine: Engine;
  host?: string | null;
  port?: number | null;
  database: string;
  username?: string | null;
}

export interface Column {
  name: string;
  dataType: string;
}

export interface QueryResult {
  columns: Column[];
  rows: unknown[][];
  rowsAffected: number;
  elapsedMs: number;
  truncated: boolean;
}

export interface TableInfo {
  name: string;
  kind: string; // "table" | "view"
  schema: string | null;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface ColumnDef {
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
}

export interface HistoryEntry {
  id: number;
  connectionId: string;
  sql: string;
  ranAt: string;
}

/** Mirror of the Rust `AppError` flattened serialization. */
export interface AppError {
  kind: string;
  message?: string;
  position?: number | null;
}
