// Saved connection passwords for the web build.
//
// Each password is encrypted with AES-GCM under a non-extractable key and only
// the ciphertext is stored, in IndexedDB — never in localStorage. Where the
// browser offers no encryption (SubtleCrypto needs a secure context: https or
// localhost, not plain http on a LAN IP) a password is kept in memory for this
// page only, and must be typed again after a reload.

const DB_NAME = "mamasql-keys";
const DB_VERSION = 2; // v1 held only the key; v2 adds the "secrets" store
// Passwords used to live here, in localStorage. Moved out on first use, then removed.
const LEGACY_KEY = "mamasql.secrets";

type Sealed = { iv: Uint8Array; ct: ArrayBuffer };

const memory = new Map<string, string>();
let _db: Promise<IDBDatabase> | null = null;
let _key: Promise<CryptoKey> | null = null;
let _migrated: Promise<void> | null = null;

function canEncrypt(): boolean {
  return typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle;
}

function db(): Promise<IDBDatabase> {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      for (const store of ["keys", "secrets"]) {
        if (!r.result.objectStoreNames.contains(store)) r.result.createObjectStore(store);
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return _db;
}

function request<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const r = op(d.transaction(store, mode).objectStore(store));
        r.onsuccess = () => res(r.result as T);
        r.onerror = () => rej(r.error);
      }),
  );
}

function key(): Promise<CryptoKey> {
  if (_key) return _key;
  _key = (async () => {
    const existing = await request<CryptoKey | undefined>("keys", "readonly", (s) => s.get("k"));
    if (existing) return existing;
    const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await request("keys", "readwrite", (s) => s.put(k, "k"));
    return k;
  })();
  return _key;
}

async function seal(password: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(password));
  return { iv, ct };
}

async function unseal(v: Sealed): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: v.iv }, await key(), v.ct);
  return new TextDecoder().decode(pt);
}

/** Encrypt into IndexedDB, or keep in memory when this browser can't encrypt. */
async function store(id: string, password: string): Promise<void> {
  if (canEncrypt()) {
    try {
      const sealed = await seal(password);
      await request("secrets", "readwrite", (s) => s.put(sealed, id));
      memory.delete(id);
      return;
    } catch {
      /* IndexedDB/crypto refused (e.g. private mode): fall back to memory */
    }
  }
  memory.set(id, password);
}

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Move passwords out of the old localStorage entry, then delete it. */
async function migrateLegacy(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return;
  }
  if (raw == null) return;
  let old: Record<string, unknown> = {};
  try {
    old = JSON.parse(raw) || {};
  } catch {
    /* unreadable: nothing to move */
  }
  for (const [id, v] of Object.entries(old)) {
    if (typeof v !== "string" || !v) continue;
    try {
      if (v.startsWith("enc:")) {
        // Already encrypted under the stored key: move the ciphertext as it is.
        const [, ivb, ctb] = v.split(":");
        if (canEncrypt()) await request("secrets", "readwrite", (s) => s.put({ iv: unb64(ivb), ct: unb64(ctb).buffer }, id));
      } else {
        const text = atob(v.startsWith("b64:") ? v.slice(4) : v);
        await store(id, new TextDecoder().decode(Uint8Array.from(text, (c) => c.charCodeAt(0))));
      }
    } catch {
      /* one unreadable entry must not block the rest */
    }
  }
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function migrated(): Promise<void> {
  if (!_migrated) _migrated = migrateLegacy();
  return _migrated;
}

/** Remember a connection's password (null forgets it). */
export async function saveSecret(id: string, password: string | null): Promise<void> {
  await migrated();
  if (!password) return deleteSecret(id);
  await store(id, password);
}

export async function loadSecret(id: string): Promise<string | null> {
  await migrated();
  const inMemory = memory.get(id);
  if (inMemory !== undefined) return inMemory;
  if (!canEncrypt()) return null;
  try {
    const sealed = await request<Sealed | undefined>("secrets", "readonly", (s) => s.get(id));
    return sealed ? await unseal(sealed) : null;
  } catch {
    return null;
  }
}

export async function deleteSecret(id: string): Promise<void> {
  await migrated();
  memory.delete(id);
  if (!canEncrypt()) return;
  try {
    await request("secrets", "readwrite", (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}
