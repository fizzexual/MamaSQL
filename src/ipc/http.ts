// Browser-side client for the engine bridge (server/bridge.mjs). Routes real
// PostgreSQL / MySQL traffic to the local bridge over HTTP. Connection configs
// live in localStorage (shared with the local SQLite backend); passwords are
// kept in a separate localStorage key so connections can be re-opened after a
// reload or a bridge restart.
import type { Backend } from "./backend";
import type { AppError, ConnectionConfig } from "./types";

// Same-origin by default: the dev server (vite proxy) and the Docker web
// container (nginx) both forward "/api" to the bridge, so no host/port is
// baked in. Override with localStorage "mamasql.bridge" to point elsewhere.
const DEFAULT_BRIDGE = "";
const CONNS_KEY = "mamasql.connections";
const SECRETS_KEY = "mamasql.secrets";

export function bridgeUrl(): string {
  try {
    return localStorage.getItem("mamasql.bridge") ?? DEFAULT_BRIDGE;
  } catch {
    return DEFAULT_BRIDGE;
  }
}

function loadConns(): ConnectionConfig[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CONNS_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as ConnectionConfig[]) : [];
  } catch {
    return [];
  }
}

function secrets(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SECRETS_KEY) ?? "{}") || {};
  } catch {
    return {};
  }
}
function writeSecrets(s: Record<string, string>): void {
  try {
    localStorage.setItem(SECRETS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// Passwords are encrypted with AES-GCM. The key is a non-extractable CryptoKey
// kept in IndexedDB — it never touches localStorage, so it can't be read out
// the way the stored ciphertext could. (SubtleCrypto needs a secure context;
// over plain http on a LAN IP we fall back to base64.)
const KEY_DB = "mamasql-keys";
let _keyPromise: Promise<CryptoKey> | null = null;
function keyDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(KEY_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function getKey(): Promise<CryptoKey> {
  if (_keyPromise) return _keyPromise;
  _keyPromise = (async () => {
    const db = await keyDb();
    const existing = await new Promise<CryptoKey | undefined>((res, rej) => {
      const t = db.transaction("keys", "readonly").objectStore("keys").get("k");
      t.onsuccess = () => res(t.result as CryptoKey | undefined);
      t.onerror = () => rej(t.error);
    });
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise<void>((res, rej) => {
      const t = db.transaction("keys", "readwrite").objectStore("keys").put(key, "k");
      t.onsuccess = () => res();
      t.onerror = () => rej(t.error);
    });
    return key;
  })();
  return _keyPromise;
}
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function saveSecret(id: string, password: string | null): Promise<void> {
  const s = secrets();
  if (!password) {
    delete s[id];
    writeSecrets(s);
    return;
  }
  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(password));
    s[id] = `enc:${b64(iv.buffer)}:${b64(ct)}`;
  } catch {
    s[id] = `b64:${btoa(unescape(encodeURIComponent(password)))}`;
  }
  writeSecrets(s);
}

export async function loadSecret(id: string): Promise<string | null> {
  const v = secrets()[id];
  if (!v) return null;
  if (v.startsWith("b64:")) {
    try {
      return decodeURIComponent(escape(atob(v.slice(4))));
    } catch {
      return null;
    }
  }
  if (v.startsWith("enc:")) {
    const [, ivb, ctb] = v.split(":");
    try {
      const key = await getKey();
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivb) }, key, unb64(ctb).buffer);
      return new TextDecoder().decode(pt);
    } catch {
      return null;
    }
  }
  // legacy plain base64 (pre-encryption)
  try {
    return decodeURIComponent(escape(atob(v)));
  } catch {
    return null;
  }
}

export function deleteSecret(id: string): void {
  const s = secrets();
  delete s[id];
  writeSecrets(s);
}

async function rpc<T>(path: string, body: unknown): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${bridgeUrl()}/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw { kind: "bridgeDown", message: "Engine server isn't running. Start it with `npm run bridge`." } as AppError;
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || (data && data.error)) {
    throw (data?.error ?? { kind: "internal", message: `HTTP ${resp.status}` }) as AppError;
  }
  return data as T;
}

async function openById(id: string): Promise<void> {
  const cfg = loadConns().find((c) => c.id === id);
  if (!cfg) throw { kind: "notFound", message: "Unknown connection" } as AppError;
  await rpc("open", { id, cfg, password: await loadSecret(id) });
}

/** Run an op; if the bridge lost the pool (restart), re-open once and retry. */
async function withReopen<T>(id: string, path: string, body: unknown): Promise<T> {
  try {
    return await rpc<T>(path, body);
  } catch (e) {
    if ((e as AppError)?.kind === "notConnected") {
      await openById(id);
      return await rpc<T>(path, body);
    }
    throw e;
  }
}

export async function bridgeHealthy(): Promise<boolean> {
  try {
    const r = await fetch(`${bridgeUrl()}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

/** Backend over the bridge. Connection-registry methods are no-ops — the web
 *  router owns the localStorage registry and delegates only engine work here. */
export const httpBackend: Backend = {
  listConnections: async () => [],
  saveConnection: async () => {},
  deleteConnection: async () => {},
  testConnection: (cfg, password = null) => rpc<void>("test", { cfg, password }).then(() => {}),
  listDatabases: (cfg, password = null) => rpc<string[]>("databases", { cfg, password }),
  createDatabase: (cfg, password, name) => rpc<void>("createDatabase", { cfg, password, name }).then(() => {}),
  openConnection: (id) => openById(id),
  closeConnection: (id) => rpc<void>("close", { id }).then(() => {}),
  runQuery: (id, sql) => withReopen(id, "query", { id, sql }),
  listTables: (id) => withReopen(id, "tables", { id }),
  listColumns: (id, table) => withReopen(id, "columns", { id, table }),
  listForeignKeys: (id) => withReopen(id, "foreignKeys", { id }),
  recentHistory: async () => [],
  updateCell: (id, table, pkColumn, pkValue, column, value) =>
    withReopen<void>(id, "updateCell", { id, table, pkColumn, pkValue, column, value }).then(() => {}),
  deleteRow: (id, table, pkColumn, pkValue) =>
    withReopen<void>(id, "deleteRow", { id, table, pkColumn, pkValue }).then(() => {}),
  insertRow: (id, table, columns, values) =>
    withReopen<void>(id, "insertRow", { id, table, columns, values }).then(() => {}),
  dropTable: (id, table) => withReopen<void>(id, "dropTable", { id, table }).then(() => {}),
  createTable: (id, name, columns) => withReopen<void>(id, "createTable", { id, name, columns }).then(() => {}),
  addColumn: (id, table, column) => withReopen<void>(id, "addColumn", { id, table, column }).then(() => {}),
  dropColumn: (id, table, column) => withReopen<void>(id, "dropColumn", { id, table, column }).then(() => {}),
  renameColumn: (id, table, from, to) => withReopen<void>(id, "renameColumn", { id, table, from, to }).then(() => {}),
  renameTable: (id, from, to) => withReopen<void>(id, "renameTable", { id, from, to }).then(() => {}),
  createLocalDatabase: async () => {
    throw { kind: "notSupported", message: "Local databases are created in-browser." } as AppError;
  },
  scanLocalDatabases: async () => [],
};
