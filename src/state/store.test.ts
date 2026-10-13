import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBackend } from "../ipc/backend";
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
      INSERT INTO orders (customer_id, total) VALUES (1, 9.5), (2, 20);
      CREATE TABLE order_items (order_id INTEGER, line INTEGER, qty INTEGER, PRIMARY KEY (order_id, line));
      INSERT INTO order_items VALUES (1, 1, 1), (1, 2, 2), (1, 3, 3);`,
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
    // Same contract as the real backends: one key column, or every column of a composite key.
    updateCell: async (id, table, pkColumn, pkValue, column, value) => {
      const keys = Array.isArray(pkColumn) ? pkColumn : [pkColumn];
      const vals = Array.isArray(pkColumn) ? (pkValue as unknown[]) : [pkValue];
      const where = keys.map((k) => `"${k}" = ?`).join(" AND ");
      db(id).run(`UPDATE "${table}" SET "${column}" = ? WHERE ${where}`, [value, ...vals] as never);
    },
    deleteRow: async (id, table, pkColumn, pkValue) => {
      const keys = Array.isArray(pkColumn) ? pkColumn : [pkColumn];
      const vals = Array.isArray(pkColumn) ? (pkValue as unknown[]) : [pkValue];
      const where = keys.map((k) => `"${k}" = ?`).join(" AND ");
      db(id).run(`DELETE FROM "${table}" WHERE ${where}`, vals as never);
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

// Row deletes ask for confirmation; the tests answer "yes".
vi.mock("./dialog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./dialog")>()),
  confirmDelete: async () => ({ ok: true, skipFk: false }),
}));

async function itemsRows(): Promise<unknown[][]> {
  const r = await getBackend().runQuery("fx-shop", "SELECT order_id, line, qty FROM order_items ORDER BY line");
  return r.rows;
}

async function openItems(): Promise<{ rowOf: (line: number) => number; qtyCol: number }> {
  await useStore.getState().loadConnections();
  await useStore.getState().openAndIntrospect("fx-shop");
  await useStore.getState().openTableData("order_items");
  const { result } = useStore.getState();
  const lineCol = result!.columns.findIndex((c) => c.name === "line");
  return {
    rowOf: (line) => result!.rows.findIndex((r) => r[lineCol] === line),
    qtyCol: result!.columns.findIndex((c) => c.name === "qty"),
  };
}

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
    expect(useStore.getState().schema.tables.map((t) => t.name)).toEqual(["customers", "order_items", "orders"]);
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

  it("editing a cell in a composite-key table changes only that row", async () => {
    const { rowOf, qtyCol } = await openItems();
    await useStore.getState().editCell(rowOf(2), qtyCol, 99);
    expect(useStore.getState().error).toBeNull();
    expect(await itemsRows()).toEqual([
      [1, 1, 1],
      [1, 2, 99],
      [1, 3, 3],
    ]);
  });

  it("deleting a row in a composite-key table deletes only that row", async () => {
    const { rowOf } = await openItems();
    await useStore.getState().deleteRowAt(rowOf(3));
    expect(useStore.getState().error).toBeNull();
    expect((await itemsRows()).map((r) => r[1])).toEqual([1, 2]);
  });

  it("editing a single-key table still sends one key column", async () => {
    await useStore.getState().loadConnections();
    await useStore.getState().openAndIntrospect("fx-shop");
    await useStore.getState().openTableData("customers");
    const { result } = useStore.getState();
    const nameCol = result!.columns.findIndex((c) => c.name === "name");
    const spy = vi.spyOn(getBackend(), "updateCell");
    await useStore.getState().editCell(0, nameCol, "Ada L.");
    expect(spy).toHaveBeenCalledWith("fx-shop", "customers", "id", 1, "name", "Ada L.");
    spy.mockRestore();
  });
});
