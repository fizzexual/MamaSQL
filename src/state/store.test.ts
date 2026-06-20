import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";

describe("store", () => {
  beforeEach(() => {
    useStore.setState({ result: null, error: null, running: false, activeConnectionId: null });
  });

  it("loads seeded connections", async () => {
    await useStore.getState().loadConnections();
    expect(useStore.getState().connections.length).toBeGreaterThan(0);
  });

  it("openAndIntrospect sets the active connection and tables", async () => {
    await useStore.getState().loadConnections();
    const id = useStore.getState().connections[0].id;
    await useStore.getState().openAndIntrospect(id);
    expect(useStore.getState().activeConnectionId).toBe(id);
    expect(useStore.getState().schema.tables.length).toBeGreaterThan(0);
  });

  it("run() populates result and clears error", async () => {
    await useStore.getState().loadConnections();
    const id = useStore.getState().connections[0].id;
    await useStore.getState().openAndIntrospect(id);
    useStore.getState().setSql("SELECT * FROM customers");
    await useStore.getState().run();
    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().result?.rows.length).toBeGreaterThan(0);
  });

  it("run() sets a typed error and clears result for a bad query", async () => {
    await useStore.getState().loadConnections();
    const id = useStore.getState().connections[0].id;
    await useStore.getState().openAndIntrospect(id);
    useStore.getState().setSql("SELECT * FROM nope");
    await useStore.getState().run();
    expect(useStore.getState().error?.kind).toBe("queryError");
    expect(useStore.getState().result).toBeNull();
  });

  it("run() without a connection reports notConnected", async () => {
    useStore.getState().setSql("SELECT 1");
    await useStore.getState().run();
    expect(useStore.getState().error?.kind).toBe("notConnected");
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
