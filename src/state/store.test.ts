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
});
