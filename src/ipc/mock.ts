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
type Db = Record<string, SampleTable>;

const col = (name: string, dataType: string, opts: Partial<ColumnInfo> = {}): ColumnInfo => ({
  name,
  dataType,
  nullable: opts.nullable ?? true,
  isPrimaryKey: opts.isPrimaryKey ?? false,
});

/**
 * Seeded sample databases so the UI is fully explorable in a plain browser.
 * Keyed by connection id, then by table name.
 */
const DATA: Record<string, Db> = {
  demo: {
    customers: {
      columns: [
        col("id", "INTEGER", { nullable: false, isPrimaryKey: true }),
        col("name", "TEXT", { nullable: false }),
        col("city", "TEXT"),
        col("signup", "TEXT"),
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
        col("id", "INTEGER", { nullable: false, isPrimaryKey: true }),
        col("customer_id", "INTEGER", { nullable: false }),
        col("total", "REAL", { nullable: false }),
        col("status", "TEXT", { nullable: false }),
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
        col("sku", "TEXT", { nullable: false, isPrimaryKey: true }),
        col("title", "TEXT", { nullable: false }),
        col("price", "REAL", { nullable: false }),
        col("in_stock", "INTEGER", { nullable: false }),
      ],
      rows: [
        ["SKU-001", "Mechanical Keyboard", 89.0, 1],
        ["SKU-002", "USB-C Cable", 11.5, 1],
        ["SKU-003", "Laptop Stand", 39.0, 0],
        ["SKU-004", "Noise-cancelling Headphones", 199.0, 1],
      ],
    },
  },
  hr: {
    employees: {
      columns: [
        col("id", "INTEGER", { nullable: false, isPrimaryKey: true }),
        col("name", "VARCHAR", { nullable: false }),
        col("email", "VARCHAR", { nullable: false }),
        col("role", "VARCHAR"),
        col("department", "VARCHAR"),
        col("hourly_rate", "DECIMAL", { nullable: false }),
        col("active", "TINYINT", { nullable: false }),
      ],
      rows: [
        [1, "Sarah Growth", "growth@budibase.com", "Growth Lead", "Marketing", 45.0, 1],
        [2, "Jane Smith", "jane.smith@example.com", "Engineer", "Engineering", 60.0, 1],
        [3, "John Doe", "john.doe@example.com", "Designer", "Design", 52.5, 1],
        [4, "Maria Garcia", "maria.garcia@example.com", "Analyst", "Data", 48.0, 1],
        [5, "Tom Baker", "tom.baker@example.com", "Support", "Customer Success", 33.0, 0],
        [6, "Priya Patel", "priya.patel@example.com", "Manager", "Operations", 70.0, 1],
      ],
    },
    submissions: {
      columns: [
        col("id", "INTEGER", { nullable: false, isPrimaryKey: true }),
        col("email", "VARCHAR", { nullable: false }),
        col("day_of_week", "VARCHAR"),
        col("in_hours", "INTEGER"),
        col("in_mins", "INTEGER"),
        col("out_hours", "INTEGER"),
        col("out_mins", "INTEGER"),
        col("comments", "TEXT"),
        col("employee_id", "INTEGER"),
      ],
      rows: [
        [1, "growth@budibase.com", "Monday", 9, 30, 15, 30, null, 1],
        [2, "growth@budibase.com", "Tuesday", 9, 30, 17, 30, null, 1],
        [3, "growth@budibase.com", "Wednesday", 8, 30, 19, 30, null, 1],
        [4, "jane.smith@example.com", "Monday", 8, 30, 17, 0, null, 2],
        [5, "jane.smith@example.com", "Tuesday", 9, 0, 17, 30, null, 2],
        [6, "jane.smith@example.com", "Wednesday", 8, 30, 16, 30, null, 2],
        [7, "jane.smith@example.com", "Thursday", 9, 0, 17, 0, null, 2],
        [8, "jane.smith@example.com", "Friday", 8, 0, 16, 0, null, 2],
        [9, "john.doe@example.com", "Monday", 10, 0, 18, 0, null, 3],
        [10, "john.doe@example.com", "Wednesday", 9, 0, 16, 0, null, 3],
        [11, "john.doe@example.com", "Friday", 8, 30, 15, 30, "Code review", 3],
      ],
    },
  },
};

const SEED_CONNECTIONS: ConnectionConfig[] = [
  { id: "demo", name: "Demo (SQLite)", engine: "sqlite", database: "demo.db", host: null, port: null, username: null },
  { id: "hr", name: "HR (MySQL)", engine: "mysql", host: "localhost", port: 3306, database: "hr", username: "root" },
];

/** Small artificial latency so the browser demo exercises loading/skeleton states. */
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class MockBackend implements Backend {
  private connections = new Map<string, ConnectionConfig>();
  private history: HistoryEntry[] = [];
  private histId = 0;
  private serverDbs = new Map<string, string[]>();

  constructor() {
    for (const c of SEED_CONNECTIONS) this.connections.set(c.id, c);
  }

  private db(connectionId: string): Db {
    return (DATA[connectionId] ??= {});
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

  private databasesFor(cfg: ConnectionConfig): string[] {
    const key = `${cfg.host ?? "localhost"}:${cfg.port ?? 0}:${cfg.engine}`;
    let list = this.serverDbs.get(key);
    if (!list) {
      list =
        cfg.engine === "mysql"
          ? ["information_schema", "mysql", "performance_schema", "sys", "hr", "shop"]
          : cfg.engine === "postgres"
            ? ["postgres", "app", "analytics"]
            : [];
      this.serverDbs.set(key, list);
    }
    return list;
  }

  async listDatabases(cfg: ConnectionConfig): Promise<string[]> {
    await wait(220);
    if (cfg.engine === "sqlite") return [];
    return [...this.databasesFor(cfg)];
  }

  async createDatabase(cfg: ConnectionConfig, _password: string | null, name: string): Promise<void> {
    await wait(180);
    const list = this.databasesFor(cfg);
    const safe = name.trim();
    if (safe && !list.includes(safe)) list.push(safe);
  }

  async openConnection(): Promise<void> {}
  async closeConnection(): Promise<void> {}

  async runQuery(connectionId: string, sql: string): Promise<QueryResult> {
    const started = performance.now();
    await wait(300);
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
    const db = this.db(connectionId);
    const table = /from\s+["'`]?([a-z_][a-z0-9_]*)/i.exec(sql)?.[1]?.toLowerCase();
    const t = table ? db[table] : undefined;
    if (!t) {
      const sample = Object.keys(db)[0] ?? "table";
      const err: AppError = {
        kind: "queryError",
        message: `unrecognized table — try: SELECT * FROM ${sample}`,
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

  async listTables(connectionId: string): Promise<TableInfo[]> {
    await wait(260);
    return Object.keys(this.db(connectionId)).map((name) => ({ name, kind: "table", schema: null }));
  }
  async listColumns(connectionId: string, table: string): Promise<ColumnInfo[]> {
    await wait(120);
    return this.db(connectionId)[table.toLowerCase()]?.columns ?? [];
  }
  async recentHistory(limit: number): Promise<HistoryEntry[]> {
    return this.history.slice(0, limit);
  }

  async updateCell(
    connectionId: string,
    table: string,
    pkColumn: string,
    pkValue: unknown,
    column: string,
    value: unknown,
  ): Promise<void> {
    const t = this.db(connectionId)[table.toLowerCase()];
    if (!t) return;
    const pkIdx = t.columns.findIndex((c) => c.name === pkColumn);
    const colIdx = t.columns.findIndex((c) => c.name === column);
    const row = t.rows.find((r) => String(r[pkIdx]) === String(pkValue));
    if (row && colIdx >= 0) row[colIdx] = value;
  }

  async deleteRow(connectionId: string, table: string, pkColumn: string, pkValue: unknown): Promise<void> {
    const t = this.db(connectionId)[table.toLowerCase()];
    if (!t) return;
    const pkIdx = t.columns.findIndex((c) => c.name === pkColumn);
    t.rows = t.rows.filter((r) => String(r[pkIdx]) !== String(pkValue));
  }

  async insertRow(
    connectionId: string,
    table: string,
    columns: string[],
    values: unknown[],
  ): Promise<void> {
    const t = this.db(connectionId)[table.toLowerCase()];
    if (!t) return;
    const row = t.columns.map((col) => {
      const i = columns.indexOf(col.name);
      return i >= 0 ? values[i] : null;
    });
    t.rows.push(row);
  }

  async dropTable(connectionId: string, table: string): Promise<void> {
    Reflect.deleteProperty(this.db(connectionId), table.toLowerCase());
  }

  async createTable(connectionId: string, name: string, columns: ColumnDef[]): Promise<void> {
    this.db(connectionId)[name.toLowerCase()] = {
      columns: columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        nullable: c.nullable,
        isPrimaryKey: c.primaryKey,
      })),
      rows: [],
    };
  }

  async addColumn(connectionId: string, table: string, column: ColumnDef): Promise<void> {
    const t = this.db(connectionId)[table.toLowerCase()];
    if (!t) return;
    t.columns.push({
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      isPrimaryKey: column.primaryKey,
    });
    t.rows.forEach((r) => r.push(null));
  }

  async dropColumn(connectionId: string, table: string, column: string): Promise<void> {
    const t = this.db(connectionId)[table.toLowerCase()];
    if (!t) return;
    const i = t.columns.findIndex((c) => c.name === column);
    if (i < 0) return;
    t.columns.splice(i, 1);
    t.rows.forEach((r) => r.splice(i, 1));
  }

  async renameColumn(connectionId: string, table: string, from: string, to: string): Promise<void> {
    const c = this.db(connectionId)[table.toLowerCase()]?.columns.find((c) => c.name === from);
    if (c) c.name = to;
  }

  async renameTable(connectionId: string, from: string, to: string): Promise<void> {
    const db = this.db(connectionId);
    const t = db[from.toLowerCase()];
    if (!t) return;
    db[to.toLowerCase()] = t;
    Reflect.deleteProperty(db, from.toLowerCase());
  }

  async createLocalDatabase(name: string): Promise<ConnectionConfig> {
    const safe = name.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "database";
    const cfg: ConnectionConfig = {
      id: `local-${safe}`,
      name: name.trim() || "Local DB",
      engine: "sqlite",
      database: `${safe}.sqlite`,
      host: null,
      port: null,
      username: null,
    };
    this.connections.set(cfg.id, cfg);
    this.db(cfg.id);
    return cfg;
  }

  async scanLocalDatabases(): Promise<ConnectionConfig[]> {
    return [
      { id: "detected-5432", name: "Postgres on localhost:5432", engine: "postgres", host: "localhost", port: 5432, database: "postgres", username: "postgres" },
    ];
  }
}

export const mockBackend: Backend = new MockBackend();
