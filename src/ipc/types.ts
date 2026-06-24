// TypeScript mirrors of the Rust DTOs (camelCase, matching serde output).

export type Engine = "postgres" | "mysql" | "sqlite";

/** Environment tag for a connection — drives the colour dot and the prod guard. */
export type ConnEnv = "dev" | "staging" | "prod";

export interface ConnectionConfig {
  id: string;
  name: string;
  engine: Engine;
  host?: string | null;
  port?: number | null;
  database: string;
  username?: string | null;
  env?: ConnEnv | null;
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

/** A foreign-key relationship: table.column references refTable.refColumn. */
export interface ForeignKey {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
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
