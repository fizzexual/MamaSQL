import { describe, expect, it } from "vitest";
import { mockBackend } from "./mock";

describe("mock backend", () => {
  it("seeds a demo sqlite connection", async () => {
    const conns = await mockBackend.listConnections();
    expect(conns.length).toBeGreaterThan(0);
    expect(conns[0].engine).toBe("sqlite");
  });

  it("runs SELECT * and returns seeded columns and rows", async () => {
    const id = (await mockBackend.listConnections())[0].id;
    await mockBackend.openConnection(id);
    const r = await mockBackend.runQuery(id, "SELECT * FROM customers");
    expect(r.columns.map((c) => c.name)).toContain("name");
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it("honours LIMIT", async () => {
    const r = await mockBackend.runQuery("demo", "SELECT * FROM customers LIMIT 2");
    expect(r.rows.length).toBe(2);
    expect(r.truncated).toBe(true);
  });

  it("introspects tables and columns", async () => {
    const tables = await mockBackend.listTables("demo");
    expect(tables.map((t) => t.name)).toContain("customers");
    const cols = await mockBackend.listColumns("demo", "customers");
    expect(cols.some((c) => c.isPrimaryKey)).toBe(true);
  });

  it("throws an AppError-shaped error for unknown tables", async () => {
    await expect(mockBackend.runQuery("demo", "SELECT * FROM nope")).rejects.toMatchObject({
      kind: "queryError",
    });
  });

  it("records query history newest-first", async () => {
    await mockBackend.runQuery("demo", "SELECT * FROM orders");
    const h = await mockBackend.recentHistory(10);
    expect(h[0].sql).toContain("orders");
  });
});
