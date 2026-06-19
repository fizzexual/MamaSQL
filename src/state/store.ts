import { create } from "zustand";
import { getBackend } from "../ipc/backend";
import type {
  AppError,
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

export interface AppStore {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  schema: SchemaState;
  sql: string;
  result: QueryResult | null;
  error: AppError | null;
  running: boolean;
  history: HistoryEntry[];

  loadConnections: () => Promise<void>;
  saveConnection: (cfg: ConnectionConfig, password?: string | null) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  openAndIntrospect: (id: string) => Promise<void>;
  expandTable: (table: string) => Promise<void>;
  setSql: (sql: string) => void;
  run: () => Promise<void>;
  loadHistory: () => Promise<void>;
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
    await backend.openConnection(id);
    const tables = await backend.listTables(id);
    set({ activeConnectionId: id, schema: { tables, columnsByTable: {} } });
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
      set({ result, running: false });
      await get().loadHistory();
    } catch (e) {
      set({ error: normalizeError(e), result: null, running: false });
    }
  },

  loadHistory: async () => {
    set({ history: await backend.recentHistory(50) });
  },
}));

function normalizeError(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e) return e as AppError;
  return { kind: "internal", message: String(e) };
}
