import type { Backend } from "./backend";
import type {
  AppError,
  ColumnDef,
  ColumnInfo,
  ConnectionConfig,
  HistoryEntry,
  QueryResult,
  TableInfo,
} from "./types";

interface SampleTable {
  columns: ColumnInfo[];
  rows: unknown[][];
}

/** Seeded sample database so the UI is fully explorable in a plain browser. */
const SAMPLE: Record<string, SampleTable> = {
  customers: {
    columns: [
      { name: "id", dataType: "INTEGER", nullable: false, isPrimaryKey: true },
      { name: "name", dataType: "TEXT", nullable: false, isPrimaryKey: false },
      { name: "city", dataType: "TEXT", nullable: true, isPrimaryKey: false },
      { name: "signup", dataType: "TEXT", nullable: true, isPrimaryKey: false },
    ],
    rows: [
      [1, "Ada Lovelace", "London", "2023-01-04"],
      [2, "Alan Turing", "Manchester", "2023-02-11"],
      [3, "Grace Hopper", "New York", "2023-03-19"],
      [4, "Katherine Johnson", "Hampton", null],
      [5, "Linus Torvalds", "Helsinki", "2023-05-30"],
      [6, "Margaret Hamilton", "Boston", "2023-06-02"],
    ],
  },
  orders: {
    columns: [
      { name: "id", dataType: "INTEGER", nullable: false, isPrimaryKey: true },
      { name: "customer_id", dataType: "INTEGER", nullable: false, isPrimaryKey: false },
      { name: "total", dataType: "REAL", nullable: false, isPrimaryKey: false },
      { name: "status", dataType: "TEXT", nullable: false, isPrimaryKey: false },
    ],
    rows: [
      [1001, 1, 49.99, "shipped"],
      [1002, 3, 129.5, "pending"],
      [1003, 2, 12.0, "shipped"],
      [1004, 5, 999.0, "refunded"],
      [1005, 1, 8.75, "pending"],
    ],
  },
  products: {
    columns: [
      { name: "sku", dataType: "TEXT", nullable: false, isPrimaryKey: true },
      { name: "title", dataType: "TEXT", nullable: false, isPrimaryKey: false },
      { name: "price", dataType: "REAL", nullable: false, isPrimaryKey: false },
      { name: "in_stock", dataType: "INTEGER", nullable: false, isPrimaryKey: false },
    ],
    rows: [
      ["SKU-001", "Mechanical Keyboard", 89.0, 1],
      ["SKU-002", "USB-C Cable", 11.5, 1],
      ["SKU-003", "Laptop Stand", 39.0, 0],
      ["SKU-004", "Noise-cancelling Headphones", 199.0, 1],
    ],
  },
};

class MockBackend implements Backend {
  private connections = new Map<string, ConnectionConfig>();
  private history: HistoryEntry[] = [];
  private histId = 0;

  constructor() {
    this.connections.set("demo", {
      id: "demo",
      name: "Demo (SQLite)",
      engine: "sqlite",
      database: "demo.db",
      host: null,
      port: null,
      username: null,
    });
  }

  async listConnections(): Promise<ConnectionConfig[]> {
    return [...this.connections.values()];
  }
  async saveConnection(cfg: ConnectionConfig): Promise<void> {
    this.connections.set(cfg.id, cfg);
  }
  async deleteConnection(id: string): Promise<void> {
    this.connections.delete(id);
  }
  async testConnection(): Promise<void> {}
  async openConnection(): Promise<void> {}
  async closeConnection(): Promise<void> {}

  async runQuery(connectionId: string, sql: string): Promise<QueryResult> {
    const started = performance.now();
    this.history.unshift({
      id: ++this.histId,
      connectionId,
      sql,
      ranAt: new Date().toISOString(),
    });
    const elapsed = () => Math.max(1, Math.round(performance.now() - started));
    const head = sql.trim().toUpperCase();
    if (!head.startsWith("SELECT") && !head.startsWith("WITH") && !head.startsWith("PRAGMA")) {
      return { columns: [], rows: [], rowsAffected: 0, elapsedMs: elapsed(), truncated: false };
    }
    const table = /from\s+["'`]?([a-z_][a-z0-9_]*)/i.exec(sql)?.[1]?.toLowerCase();
    const t = table ? SAMPLE[table] : undefined;
    if (!t) {
      const err: AppError = {
        kind: "queryError",
        message: "unrecognized table — try: SELECT * FROM customers",
      };
      throw err;
    }
    if (/count\s*\(\s*\*\s*\)/i.test(sql)) {
      return {
        columns: [{ name: "count(*)", dataType: "INTEGER" }],
        rows: [[t.rows.length]],
        rowsAffected: 0,
        elapsedMs: elapsed(),
        truncated: false,
      };
    }
    const limit = Number(/limit\s+(\d+)/i.exec(sql)?.[1] ?? t.rows.length);
    return {
      columns: t.columns.map((c) => ({ name: c.name, dataType: c.dataType })),
      rows: t.rows.slice(0, limit),
      rowsAffected: 0,
      elapsedMs: elapsed(),
      truncated: t.rows.length > limit,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    return Object.keys(SAMPLE).map((name) => ({ name, kind: "table", schema: null }));
  }
  async listColumns(_connectionId: string, table: string): Promise<ColumnInfo[]> {
    return SAMPLE[table.toLowerCase()]?.columns ?? [];
  }
  async recentHistory(limit: number): Promise<HistoryEntry[]> {
    return this.history.slice(0, limit);
  }

  async updateCell(
    _c: string,
    table: string,
    pkColumn: string,
    pkValue: unknown,
    column: string,
    value: unknown,
  ): Promise<void> {
    const t = SAMPLE[table.toLowerCase()];
    if (!t) return;
    const pkIdx = t.columns.findIndex((c) => c.name === pkColumn);
    const colIdx = t.columns.findIndex((c) => c.name === column);
    const row = t.rows.find((r) => String(r[pkIdx]) === String(pkValue));
    if (row && colIdx >= 0) row[colIdx] = value;
  }

  async deleteRow(_c: string, table: string, pkColumn: string, pkValue: unknown): Promise<void> {
    const t = SAMPLE[table.toLowerCase()];
    if (!t) return;
    const pkIdx = t.columns.findIndex((c) => c.name === pkColumn);
    t.rows = t.rows.filter((r) => String(r[pkIdx]) !== String(pkValue));
  }

  async insertRow(
    _c: string,
    table: string,
    columns: string[],
    values: unknown[],
  ): Promise<void> {
    const t = SAMPLE[table.toLowerCase()];
    if (!t) return;
    const row = t.columns.map((col) => {
      const i = columns.indexOf(col.name);
      return i >= 0 ? values[i] : null;
    });
    t.rows.push(row);
  }

  async dropTable(_c: string, table: string): Promise<void> {
    Reflect.deleteProperty(SAMPLE, table.toLowerCase());
  }

  async createTable(_c: string, name: string, columns: ColumnDef[]): Promise<void> {
    SAMPLE[name.toLowerCase()] = {
      columns: columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        nullable: c.nullable,
        isPrimaryKey: c.primaryKey,
      })),
      rows: [],
    };
  }
}

export const mockBackend: Backend = new MockBackend();
