import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "./store";
import { useToast } from "./toast";

// The app starts with no connections: the seeded demo mock was removed in
// 2dbce08 ("real local SQLite engine + persistent connections (remove demos)").
// So these tests bring their own fixture: a Backend that runs two small, real
// SQLite databases in-process with sql.js. `vi.mock` is hoisted, so the store
// picks this backend up when it calls getBackend() at import time.
vi.mock("../ipc/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ipc/backend")>();
  const { default: initSqlJs } = await import("sql.js");
  type Backend = import("../ipc/backend").Backend;
  type ConnectionConfig = import("../ipc/types").ConnectionConfig;

  const SQL = await initSqlJs();
  const connections: ConnectionConfig[] = [
    { id: "fx-shop", name: "Shop", engine: "sqlite", database: "shop" },
    { id: "fx-analytics", name: "Analytics", engine: "sqlite", database: "analytics" },
  ];
  const seed: Record<string, string> = {
    "fx-shop": `
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO customers (name) VALUES ('Ada'), ('Grace'), ('Linus');
      CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), total REAL);
      INSERT INTO orders (customer_id, total) VALUES (1, 9.5), (2, 20);`,
    "fx-analytics": `
      CREATE TABLE events (id INTEGER PRIMARY KEY, kind TEXT);
      INSERT INTO events (kind) VALUES ('signup'), ('login');`,
  };
  const dbs = new Map(
    connections.map((c) => {
      const db = new SQL.Database();
      db.run(seed[c.id]);
      return [c.id, db] as const;
    }),
  );
  const db = (id: string) => {
    const d = dbs.get(id);
    if (!d) throw { kind: "notConnected", message: `no fixture database ${id}` };
    return d;
  };

  const impl: Partial<Backend> = {
    listConnections: async () => connections.map((c) => ({ ...c })),
    openConnection: async (id) => void db(id),
    closeConnection: async () => {},
    recentHistory: async () => [],
    listForeignKeys: async () => [],
    runQuery: async (id, sql) => {
      try {
        const res = db(id).exec(sql);
        const last = res[res.length - 1];
        return {
          columns: (last?.columns ?? []).map((name) => ({ name, dataType: "" })),
          rows: (last?.values ?? []) as unknown[][],
          rowsAffected: db(id).getRowsModified(),
          elapsedMs: 1,
          truncated: false,
        };
      } catch (e) {
        throw { kind: "queryError", message: e instanceof Error ? e.message : String(e) };
      }
    },
    listTables: async (id) => {
      const res = db(id).exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name");
      return (res[0]?.values ?? []).map((r) => ({ name: String(r[0]), kind: String(r[1]), schema: null }));
    },
    listColumns: async (id, table) => {
      const res = db(id).exec(`PRAGMA table_info("${table.replace(/"/g, '""')}")`);
      return (res[0]?.values ?? []).map((r) => ({
        name: String(r[1]),
        dataType: r[2] ? String(r[2]) : "",
        nullable: Number(r[3]) === 0,
        isPrimaryKey: Number(r[5]) > 0,
      }));
    },
  };
  // Anything the store calls that the fixture doesn't cover fails loudly.
  const fixture = new Proxy(impl, {
    get: (target, prop) =>
      (target as Record<PropertyKey, unknown>)[prop] ??
      (() => Promise.reject(new Error(`fixture backend: ${String(prop)} not implemented`))),
  }) as Backend;

  return { ...actual, getBackend: () => fixture };
});

describe("store", () => {
  beforeEach(() => {
    useStore.setState({ result: null, error: null, running: false, activeConnectionId: null });
    useToast.setState({ toasts: [] });
  });

  it("loads the saved connections from the backend", async () => {
    await useStore.getState().loadConnections();
    expect(useStore.getState().connections.map((c) => c.id)).toEqual(["fx-shop", "fx-analytics"]);
  });

  it("openAndIntrospect sets the active connection and tables", async () => {
    await useStore.getState().loadConnections();
    const id = useStore.getState().connections[0].id;
    await useStore.getState().openAndIntrospect(id);
    expect(useStore.getState().activeConnectionId).toBe(id);
    expect(useStore.getState().schema.tables.map((t) => t.name)).toEqual(["customers", "orders"]);
  });

  // Since 9698408 (multiple SQL editor tabs) a query's result/error is stored per
  // editor tab, in editorResults/editorErrors, so it survives tab switches.
  it("run() stores the result for the active editor and clears its error", async () => {
    await useStore.getState().loadConnections();
    const id = useStore.getState().connections[0].id;
    await useStore.getState().openAndIntrospect(id);
    useStore.getState().setSql("SELECT * FROM customers");
    await useStore.getState().run();
    const { activeEditorId, editorResults, editorErrors, running } = useStore.getState();
    expect(editorErrors[activeEditorId]).toBeNull();
    expect(editorResults[activeEditorId]?.rows.length).toBe(3);
    expect(running).toBe(false);
  });

  it("run() stores a typed error and clears the result for a bad query", async () => {
    await useStore.getState().loadConnections();
    const id = useStore.getState().connections[0].id;
    await useStore.getState().openAndIntrospect(id);
    useStore.getState().setSql("SELECT * FROM customers");
    await useStore.getState().run(); // a previous good result must not survive the failure
    useStore.getState().setSql("SELECT * FROM nope");
    await useStore.getState().run();
    const { activeEditorId, editorResults, editorErrors, running } = useStore.getState();
    expect(editorErrors[activeEditorId]?.kind).toBe("queryError");
    expect(editorResults[activeEditorId]).toBeNull();
    expect(running).toBe(false);
  });

  it("run() without a connection tells the user to open one and runs nothing", async () => {
    // Since 5cf7fec this is a toast, not a `notConnected` error in the result pane.
    useStore.getState().setSql("SELECT 1");
    await useStore.getState().run();
    expect(useToast.getState().toasts).toContainEqual(
      expect.objectContaining({ message: "Open a connection first.", kind: "error" }),
    );
    expect(useStore.getState().running).toBe(false);
    expect(useStore.getState().result).toBeNull();
    expect(useStore.getState().error).toBeNull();
  });

  it("switching sources clears the previous source's tables and open table", async () => {
    await useStore.getState().loadConnections();
    const ids = useStore.getState().connections.map((c) => c.id);
    expect(ids.length).toBeGreaterThan(1);

    // Open the first source and a table inside it.
    await useStore.getState().openAndIntrospect(ids[0]);
    const firstTable = useStore.getState().schema.tables[0].name;
    await useStore.getState().openTableData(firstTable);
    expect(useStore.getState().editTable).not.toBeNull();
    expect(useStore.getState().result).not.toBeNull();

    // Switch to a different source: the prior source's tables/open table must not bleed through.
    await useStore.getState().openAndIntrospect(ids[1]);
    expect(useStore.getState().editTable).toBeNull();
    expect(useStore.getState().result).toBeNull();
    expect(useStore.getState().schema.tables.map((t) => t.name)).not.toContain(firstTable);
  });
});
