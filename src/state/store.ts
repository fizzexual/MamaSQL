import { create } from "zustand";
import { getBackend } from "../ipc/backend";
import type {
  AppError,
  ColumnDef,
  ColumnInfo,
  ConnectionConfig,
  HistoryEntry,
  QueryResult,
  TableInfo,
} from "../ipc/types";

interface SchemaState {
  tables: TableInfo[];
  columnsByTable: Record<string, ColumnInfo[]>;
}

export type TopView = "data" | "design" | "automation" | "settings";
export type AppScreen = "dashboard" | "workspace";
export type DashPage = "home" | "connections" | "logs";
export type FilterOp = "=" | "!=" | "contains" | ">" | "<";
export interface ViewFilter {
  column: string;
  op: FilterOp;
  value: string;
}
export interface ViewDef {
  id: string;
  connectionId: string;
  table: string;
  name: string;
  filter: ViewFilter | null;
}

/** Apply a saved view's single-condition filter to a row set (client-side). */
function applyViewFilter(rows: unknown[][], columns: { name: string }[], filter: ViewFilter | null): unknown[][] {
  if (!filter) return rows;
  const idx = columns.findIndex((c) => c.name === filter.column);
  if (idx < 0) return rows;
  const target = filter.value;
  const targetNum = Number.parseFloat(target);
  return rows.filter((r) => {
    const s = r[idx] == null ? "" : String(r[idx]);
    switch (filter.op) {
      case "=":
        return s === target;
      case "!=":
        return s !== target;
      case "contains":
        return s.toLowerCase().includes(target.toLowerCase());
      case ">":
        return Number.parseFloat(s) > targetNum;
      case "<":
        return Number.parseFloat(s) < targetNum;
      default:
        return true;
    }
  });
}

export interface AppStore {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  schema: SchemaState;
  sql: string;
  result: QueryResult | null;
  error: AppError | null;
  running: boolean;
  history: HistoryEntry[];
  editTable: { table: string; pkColumn: string | null } | null;
  detected: ConnectionConfig[];
  loadingTables: boolean;
  loadingResult: boolean;
  view: "data" | "sql" | "history";
  inspectorRow: number | null;
  topView: TopView;
  screen: AppScreen;
  dashPage: DashPage;
  views: ViewDef[];
  activeViewId: string | null;
  selection: number[];

  loadConnections: () => Promise<void>;
  saveConnection: (cfg: ConnectionConfig, password?: string | null) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  openAndIntrospect: (id: string) => Promise<void>;
  expandTable: (table: string) => Promise<void>;
  setSql: (sql: string) => void;
  run: () => Promise<void>;
  loadHistory: () => Promise<void>;
  openTableData: (table: string) => Promise<void>;
  editCell: (rowIndex: number, colIndex: number, value: unknown) => Promise<void>;
  deleteRowAt: (rowIndex: number) => Promise<void>;
  addRow: (columns: string[], values: unknown[]) => Promise<void>;
  dropTable: (table: string) => Promise<void>;
  createTable: (name: string, columns: ColumnDef[]) => Promise<void>;
  createLocalDatabase: (name: string) => Promise<void>;
  scanLocal: () => Promise<void>;
  addDetected: (cfg: ConnectionConfig) => Promise<void>;
  setView: (v: "data" | "sql" | "history") => void;
  refresh: () => Promise<void>;
  reload: (table: string) => Promise<void>;
  addColumn: (table: string, column: ColumnDef) => Promise<void>;
  dropColumn: (table: string, column: string) => Promise<void>;
  renameColumn: (table: string, from: string, to: string) => Promise<void>;
  renameTable: (from: string, to: string) => Promise<void>;
  importCsv: (table: string, headers: string[], rows: string[][]) => Promise<void>;
  openInspector: (rowIndex: number) => void;
  closeInspector: () => void;
  setTopView: (v: TopView) => void;
  setScreen: (s: AppScreen) => void;
  setDashPage: (p: DashPage) => void;
  addView: (table: string, name: string, filter: ViewFilter | null) => void;
  deleteView: (id: string) => void;
  openView: (view: ViewDef) => Promise<void>;
  toggleRow: (i: number) => void;
  selectAllRows: () => void;
  clearSelection: () => void;
  deleteSelected: () => Promise<void>;
  duplicateSelected: () => Promise<void>;
}

const backend = getBackend();

export const useStore = create<AppStore>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  schema: { tables: [], columnsByTable: {} },
  sql: "SELECT * FROM customers LIMIT 100;",
  result: null,
  error: null,
  running: false,
  history: [],
  editTable: null,
  detected: [],
  loadingTables: false,
  loadingResult: false,
  view: "data",
  inspectorRow: null,
  topView: "data",
  screen: "dashboard",
  dashPage: "home",
  views: [],
  activeViewId: null,
  selection: [],

  loadConnections: async () => {
    set({ connections: await backend.listConnections() });
  },

  saveConnection: async (cfg, password = null) => {
    await backend.saveConnection(cfg, password);
    await get().loadConnections();
  },

  deleteConnection: async (id) => {
    await backend.deleteConnection(id);
    if (get().activeConnectionId === id) set({ activeConnectionId: null });
    await get().loadConnections();
  },

  openAndIntrospect: async (id) => {
    // Reset everything tied to the previous source so its tables/data don't
    // bleed through while the new source introspects (or if it errors).
    set({
      activeConnectionId: id,
      loadingTables: true,
      error: null,
      schema: { tables: [], columnsByTable: {} },
      editTable: null,
      result: null,
      view: "data",
      activeViewId: null,
      selection: [],
      inspectorRow: null,
    });
    try {
      await backend.openConnection(id);
      const tables = await backend.listTables(id);
      set({ schema: { tables, columnsByTable: {} }, loadingTables: false });
    } catch (e) {
      set({ error: normalizeError(e), loadingTables: false });
    }
  },

  expandTable: async (table) => {
    const id = get().activeConnectionId;
    if (!id || get().schema.columnsByTable[table]) return;
    const cols = await backend.listColumns(id, table);
    set((s) => ({
      schema: {
        ...s.schema,
        columnsByTable: { ...s.schema.columnsByTable, [table]: cols },
      },
    }));
  },

  setSql: (sql) => set({ sql }),

  run: async () => {
    const { activeConnectionId, sql } = get();
    if (!activeConnectionId) {
      set({ error: { kind: "notConnected", message: "Open a connection first." }, result: null });
      return;
    }
    set({ running: true, error: null });
    try {
      const result = await backend.runQuery(activeConnectionId, sql);
      set({ result, running: false, editTable: null });
      await get().loadHistory();
    } catch (e) {
      set({ error: normalizeError(e), result: null, running: false });
    }
  },

  loadHistory: async () => {
    set({ history: await backend.recentHistory(50) });
  },

  openTableData: async (table) => {
    const id = get().activeConnectionId;
    if (!id) return;
    const sql = `SELECT * FROM ${table} LIMIT 200;`;
    set({
      view: "data",
      topView: "data",
      loadingResult: true,
      error: null,
      sql,
      editTable: { table, pkColumn: null },
      inspectorRow: null,
      activeViewId: null,
      selection: [],
    });
    try {
      // Column introspection is best-effort — it must never block the data load.
      try {
        await get().expandTable(table);
      } catch {
        /* fall back to the columns the query itself returns */
      }
      const cols = get().schema.columnsByTable[table] ?? [];
      const pkColumn = cols.find((c) => c.isPrimaryKey)?.name ?? null;
      let result = await backend.runQuery(id, sql);
      // Empty tables yield no columns from the row set — show the schema's columns.
      if (result.columns.length === 0 && cols.length > 0) {
        result = { ...result, columns: cols.map((c) => ({ name: c.name, dataType: c.dataType })) };
      }
      set({ result, editTable: { table, pkColumn }, loadingResult: false });
      await get().loadHistory();
    } catch (e) {
      set({ error: normalizeError(e), result: null, loadingResult: false });
    }
  },

  editCell: async (rowIndex, colIndex, value) => {
    const { activeConnectionId, result, editTable } = get();
    if (!activeConnectionId || !result || !editTable?.pkColumn) return;
    const pkIdx = result.columns.findIndex((c) => c.name === editTable.pkColumn);
    if (pkIdx < 0) return;
    const pkValue = result.rows[rowIndex][pkIdx];
    const column = result.columns[colIndex].name;
    try {
      await backend.updateCell(
        activeConnectionId,
        editTable.table,
        editTable.pkColumn,
        pkValue,
        column,
        value,
      );
      const rows = result.rows.map((r, i) =>
        i === rowIndex ? r.map((c, j) => (j === colIndex ? value : c)) : r,
      );
      set({ result: { ...result, rows }, error: null });
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  deleteRowAt: async (rowIndex) => {
    const { activeConnectionId, result, editTable } = get();
    if (!activeConnectionId || !result || !editTable?.pkColumn) return;
    const pkIdx = result.columns.findIndex((c) => c.name === editTable.pkColumn);
    if (pkIdx < 0) return;
    const pkValue = result.rows[rowIndex][pkIdx];
    try {
      await backend.deleteRow(activeConnectionId, editTable.table, editTable.pkColumn, pkValue);
      const rows = result.rows.filter((_, i) => i !== rowIndex);
      set((s) => ({
        result: { ...result, rows },
        error: null,
        inspectorRow:
          s.inspectorRow === null || s.inspectorRow === rowIndex
            ? null
            : s.inspectorRow > rowIndex
              ? s.inspectorRow - 1
              : s.inspectorRow,
      }));
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  addRow: async (columns, values) => {
    const { activeConnectionId, editTable } = get();
    if (!activeConnectionId || !editTable) return;
    try {
      await backend.insertRow(activeConnectionId, editTable.table, columns, values);
      await get().openTableData(editTable.table); // refresh to show the new row + its PK
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  dropTable: async (table) => {
    const id = get().activeConnectionId;
    if (!id) return;
    try {
      await backend.dropTable(id, table);
      const tables = await backend.listTables(id);
      set((s) => ({
        schema: { tables, columnsByTable: {} },
        editTable: s.editTable?.table === table ? null : s.editTable,
        result: s.editTable?.table === table ? null : s.result,
      }));
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  createTable: async (name, columns) => {
    const id = get().activeConnectionId;
    if (!id) return;
    try {
      await backend.createTable(id, name, columns);
      const tables = await backend.listTables(id);
      set({ schema: { tables, columnsByTable: {} } });
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  createLocalDatabase: async (name) => {
    try {
      const cfg = await backend.createLocalDatabase(name);
      await get().loadConnections();
      await get().openAndIntrospect(cfg.id);
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  scanLocal: async () => {
    try {
      set({ detected: await backend.scanLocalDatabases() });
    } catch {
      set({ detected: [] });
    }
  },

  addDetected: async (cfg) => {
    try {
      await backend.saveConnection(cfg, null);
      await get().loadConnections();
      await get().openAndIntrospect(cfg.id);
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  setView: (v) => set({ view: v }),

  refresh: async () => {
    const t = get().editTable?.table;
    if (t) await get().openTableData(t);
  },

  reload: async (table) => {
    const id = get().activeConnectionId;
    if (!id) return;
    const tables = await backend.listTables(id);
    set((s) => {
      const columnsByTable = { ...s.schema.columnsByTable };
      delete columnsByTable[table];
      return { schema: { tables, columnsByTable } };
    });
    await get().openTableData(table);
  },

  addColumn: async (table, column) => {
    const id = get().activeConnectionId;
    if (!id) return;
    try {
      await backend.addColumn(id, table, column);
      await get().reload(table);
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  dropColumn: async (table, column) => {
    const id = get().activeConnectionId;
    if (!id) return;
    try {
      await backend.dropColumn(id, table, column);
      await get().reload(table);
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  renameColumn: async (table, from, to) => {
    const id = get().activeConnectionId;
    if (!id) return;
    try {
      await backend.renameColumn(id, table, from, to);
      await get().reload(table);
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  renameTable: async (from, to) => {
    const id = get().activeConnectionId;
    if (!id) return;
    try {
      await backend.renameTable(id, from, to);
      const tables = await backend.listTables(id);
      set({ schema: { tables, columnsByTable: {} } });
      await get().openTableData(to);
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  importCsv: async (table, headers, rows) => {
    const id = get().activeConnectionId;
    if (!id) return;
    try {
      for (const r of rows) await backend.insertRow(id, table, headers, r);
      await get().reload(table);
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  openInspector: (rowIndex) => set({ inspectorRow: rowIndex }),
  closeInspector: () => set({ inspectorRow: null }),

  setTopView: (v) => set({ topView: v }),

  setScreen: (s) => set({ screen: s }),

  setDashPage: (p) => set({ dashPage: p, screen: "dashboard" }),

  addView: (table, name, filter) => {
    const id = get().activeConnectionId;
    if (!id) return;
    const view: ViewDef = {
      id: `view-${id}-${table}-${get().views.length + 1}-${name.replace(/\s+/g, "_")}`,
      connectionId: id,
      table,
      name,
      filter,
    };
    set((s) => ({ views: [...s.views, view] }));
    void get().openView(view);
  },

  deleteView: (id) => {
    set((s) => ({
      views: s.views.filter((v) => v.id !== id),
      activeViewId: s.activeViewId === id ? null : s.activeViewId,
    }));
  },

  openView: async (view) => {
    const id = get().activeConnectionId;
    if (!id || id !== view.connectionId) return;
    const sql = `SELECT * FROM ${view.table} LIMIT 200;`;
    set({
      view: "data",
      topView: "data",
      loadingResult: true,
      error: null,
      sql,
      editTable: { table: view.table, pkColumn: null },
      inspectorRow: null,
      activeViewId: view.id,
      selection: [],
    });
    try {
      try {
        await get().expandTable(view.table);
      } catch {
        /* fall back to query columns */
      }
      const cols = get().schema.columnsByTable[view.table] ?? [];
      const pkColumn = cols.find((c) => c.isPrimaryKey)?.name ?? null;
      let result = await backend.runQuery(id, sql);
      if (result.columns.length === 0 && cols.length > 0) {
        result = { ...result, columns: cols.map((c) => ({ name: c.name, dataType: c.dataType })) };
      }
      result = { ...result, rows: applyViewFilter(result.rows, result.columns, view.filter) };
      set({ result, editTable: { table: view.table, pkColumn }, loadingResult: false });
      await get().loadHistory();
    } catch (e) {
      set({ error: normalizeError(e), result: null, loadingResult: false });
    }
  },

  toggleRow: (i) =>
    set((s) => ({
      selection: s.selection.includes(i) ? s.selection.filter((x) => x !== i) : [...s.selection, i],
    })),

  selectAllRows: () =>
    set((s) => ({
      selection:
        s.result && s.selection.length < s.result.rows.length ? s.result.rows.map((_, i) => i) : [],
    })),

  clearSelection: () => set({ selection: [] }),

  deleteSelected: async () => {
    const { activeConnectionId, result, editTable, selection } = get();
    if (!activeConnectionId || !result || !editTable?.pkColumn || selection.length === 0) return;
    const pkIdx = result.columns.findIndex((c) => c.name === editTable.pkColumn);
    if (pkIdx < 0) return;
    const pks = selection.map((i) => result.rows[i][pkIdx]);
    try {
      for (const pk of pks) {
        await backend.deleteRow(activeConnectionId, editTable.table, editTable.pkColumn, pk);
      }
      set({ selection: [] });
      await get().refresh();
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },

  duplicateSelected: async () => {
    const { activeConnectionId, result, editTable, selection } = get();
    if (!activeConnectionId || !result || !editTable || selection.length === 0) return;
    const pkIdx = editTable.pkColumn ? result.columns.findIndex((c) => c.name === editTable.pkColumn) : -1;
    // Compute the next integer id when the PK looks like an auto-increment integer.
    let nextId = 0;
    let intPk = false;
    if (pkIdx >= 0) {
      const nums = result.rows.map((r) => Number(r[pkIdx]));
      if (nums.length > 0 && nums.every((n) => Number.isInteger(n))) {
        intPk = true;
        nextId = Math.max(0, ...nums) + 1;
      }
    }
    try {
      for (const i of [...selection].sort((a, b) => a - b)) {
        const src = result.rows[i];
        const columns: string[] = [];
        const values: unknown[] = [];
        result.columns.forEach((c, j) => {
          columns.push(c.name);
          if (j === pkIdx) values.push(intPk ? nextId++ : `${String(src[j])}-copy`);
          else values.push(src[j]);
        });
        await backend.insertRow(activeConnectionId, editTable.table, columns, values);
      }
      set({ selection: [] });
      await get().refresh();
    } catch (e) {
      set({ error: normalizeError(e) });
    }
  },
}));

function normalizeError(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e) return e as AppError;
  return { kind: "internal", message: String(e) };
}
