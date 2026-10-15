// Saved connection passwords in the web build. Runs in Node with an in-memory
// IndexedDB (fake-indexeddb) and Node's real WebCrypto.
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Node has no localStorage: a minimal in-memory one with the same API. */
class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  dump() {
    return [...this.m.values()].join("\n");
  }
}
const storage = new MemoryStorage();
vi.stubGlobal("localStorage", storage);

const LEGACY = "mamasql.secrets";
const PW = "hunter-2 pässword";

/** A fresh copy of the module, as after a page reload (IndexedDB and localStorage persist). */
async function reload() {
  vi.resetModules();
  return import("./http");
}

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("mamasql-keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
/** Every value in the "secrets" store ([] when there is none). */
async function storedSecrets(): Promise<unknown[]> {
  const db = await idbOpen();
  try {
    if (!db.objectStoreNames.contains("secrets")) return [];
    return await new Promise((res, rej) => {
      const r = db.transaction("secrets", "readonly").objectStore("secrets").getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}
async function storedKey(): Promise<CryptoKey> {
  const db = await idbOpen();
  try {
    return await new Promise((res, rej) => {
      const r = db.transaction("keys", "readonly").objectStore("keys").get("k");
      r.onsuccess = () => res(r.result as CryptoKey);
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const utf8b64 = (s: string) => b64(new TextEncoder().encode(s));

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", storage);
});

describe("saved connection passwords (web build)", () => {
  it("round-trip, and never reach localStorage in any form", async () => {
    const m = await reload();
    await m.saveSecret("c1", PW);
    expect(await m.loadSecret("c1")).toBe(PW);
    expect(storage.getItem(LEGACY)).toBeNull();
    expect(storage.dump()).not.toContain(PW);
    expect(storage.dump()).not.toContain(utf8b64(PW));
  });

  it("are kept in IndexedDB as ciphertext only", async () => {
    const m = await reload();
    await m.saveSecret("c1", PW);
    const stored = await storedSecrets();
    expect(stored).toHaveLength(1);
    const text = JSON.stringify(stored, (_k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? b64(new Uint8Array(v as ArrayBuffer)) : v));
    expect(text).not.toContain(PW);
    expect(text).not.toContain(utf8b64(PW));
  });

  it("survive a reload", async () => {
    await (await reload()).saveSecret("c1", PW);
    expect(await (await reload()).loadSecret("c1")).toBe(PW);
  });

  it("are forgotten when deleted or cleared", async () => {
    const m = await reload();
    await m.saveSecret("c1", PW);
    await m.saveSecret("c2", PW);
    await m.deleteSecret("c1");
    await m.saveSecret("c2", null);
    expect(await m.loadSecret("c1")).toBeNull();
    expect(await m.loadSecret("c2")).toBeNull();
    expect(await storedSecrets()).toHaveLength(0);
  });

  it("move out of the old localStorage entry (base64 forms), which is then removed", async () => {
    storage.setItem(LEGACY, JSON.stringify({ a: `b64:${utf8b64("pw-a")}`, b: utf8b64("pw-b") }));
    const m = await reload();
    expect(await m.loadSecret("a")).toBe("pw-a");
    expect(await m.loadSecret("b")).toBe("pw-b");
    expect(storage.getItem(LEGACY)).toBeNull();
    expect(await storedSecrets()).toHaveLength(2);
  });

  it("move out of the old localStorage entry (already encrypted form)", async () => {
    await (await reload()).saveSecret("seed", "x"); // creates the stored key
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await storedKey(), new TextEncoder().encode("pw-enc")));
    storage.setItem(LEGACY, JSON.stringify({ c: `enc:${b64(iv)}:${b64(ct)}` }));
    const m = await reload();
    expect(await m.loadSecret("c")).toBe("pw-enc");
    expect(storage.getItem(LEGACY)).toBeNull();
  });

  it("without encryption (plain http on a LAN IP) stay in memory for this page only", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a }); // no crypto.subtle
    const m = await reload();
    await m.saveSecret("c1", PW);
    expect(await m.loadSecret("c1")).toBe(PW);
    expect(storage.dump()).not.toContain(utf8b64(PW));
    expect(storage.getItem(LEGACY)).toBeNull();
    expect(await (await reload()).loadSecret("c1")).toBeNull();
  });
});

/** Everything stored in every IndexedDB database, as text (binary as base64). */
async function idbDump(): Promise<string> {
  const out: unknown[] = [];
  for (const info of await indexedDB.databases()) {
    if (!info.name) continue;
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(info.name!);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    try {
      for (const name of [...db.objectStoreNames]) {
        out.push(
          await new Promise((res, rej) => {
            const r = db.transaction(name, "readonly").objectStore(name).getAll();
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          }),
        );
      }
    } finally {
      db.close();
    }
  }
  return JSON.stringify(out, (_k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? b64(new Uint8Array(v as ArrayBuffer)) : v));
}

/** Plain http on a LAN IP: not a secure context, so the page has no crypto.subtle. */
const insecureContext = () => vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a });

describe("old localStorage passwords on plain http (no crypto.subtle)", () => {
  // Clearly fake values; the non-ASCII letter checks the UTF-8 decoding.
  const FAKE_A = "fake-test-pw-ä";
  const FAKE_B = "fake-test-pw-b";

  it("are moved to memory for this page only, and the readable entry is deleted", async () => {
    storage.setItem(LEGACY, JSON.stringify({ a: `b64:${utf8b64(FAKE_A)}`, b: utf8b64(FAKE_B) }));
    insecureContext();
    const m = await reload();

    // (2) usable for the current session
    expect(await m.loadSecret("a")).toBe(FAKE_A);
    expect(await m.loadSecret("b")).toBe(FAKE_B);

    // (1) the readable legacy entry is gone, and (3) nothing readable is left in localStorage
    expect(storage.getItem(LEGACY)).toBeNull();
    expect(storage.length).toBe(0);

    // (3) nothing readable was written to IndexedDB either
    const idb = await idbDump();
    for (const pw of [FAKE_A, FAKE_B]) {
      expect(idb).not.toContain(pw);
      expect(idb).not.toContain(utf8b64(pw));
    }
    expect(await storedSecrets()).toHaveLength(0);

    // (2) ...and for this session only: after a reload they must be typed again
    const after = await reload();
    expect(await after.loadSecret("a")).toBeNull();
    expect(await after.loadSecret("b")).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("delete the readable entry on first use, even before that connection's password is asked for", async () => {
    storage.setItem(LEGACY, JSON.stringify({ a: `b64:${utf8b64(FAKE_A)}` }));
    insecureContext();
    const m = await reload();
    expect(await m.loadSecret("some-other-connection")).toBeNull();
    expect(storage.getItem(LEGACY)).toBeNull();
    expect(storage.dump()).not.toContain(utf8b64(FAKE_A));
  });

  it("an already-encrypted (enc:) entry is dropped: it can't be decrypted here, so the password must be typed again", async () => {
    // The enc: form was written by a secure context under the key kept in IndexedDB.
    await (await reload()).saveSecret("seed", "x");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await storedKey(), new TextEncoder().encode(FAKE_A)));
    await (await reload()).deleteSecret("seed");
    // ...next to an old base64 one, which must still be moved.
    storage.setItem(LEGACY, JSON.stringify({ c: `enc:${b64(iv)}:${b64(ct)}`, b: `b64:${utf8b64(FAKE_B)}` }));

    insecureContext();
    const m = await reload();
    expect(await m.loadSecret("c")).toBeNull(); // no error, just no password
    expect(await m.loadSecret("b")).toBe(FAKE_B); // the sibling entry is not lost
    expect(storage.getItem(LEGACY)).toBeNull();
    expect(storage.length).toBe(0);
    expect(await storedSecrets()).toHaveLength(0); // the ciphertext was not copied into IndexedDB
    expect(await idbDump()).not.toContain(utf8b64(FAKE_B));
  });
});
