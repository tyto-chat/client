import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { KeyStore, type KeyStoreScope, type MessageKeySender } from "@/e2ee/keyStore";

class MemorySecrets {
  readonly values = new Map<string, string>();
  get = async (key: string) => this.values.get(key) ?? null;
  set = async (key: string, value: string) => void this.values.set(key, value);
  delete = async (key: string) => void this.values.delete(key);
}

const ORIGIN = "https://chat.example.org";
const alice: KeyStoreScope = { serverOrigin: ORIGIN, serverUserId: 1, profileId: "p1" };
const bob: KeyStoreScope = { serverOrigin: ORIGIN, serverUserId: 2, profileId: "p1" };
const sender: MessageKeySender = { userId: 1, accountKeyFingerprint: "fp", deviceId: "d1" };

let idb: IDBFactory;
let secrets: MemorySecrets;

beforeEach(() => {
  idb = new IDBFactory();
  secrets = new MemorySecrets();
});

const store = () => new KeyStore(secrets, idb, IDBKeyRange);

function readAll(): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const open = idb.open(KeyStore.DATABASE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const names = Array.from(db.objectStoreNames);
      const tx = db.transaction(names, "readonly");
      const rows: unknown[] = [];
      for (const name of names) {
        const cursor = tx.objectStore(name).openCursor();
        cursor.onsuccess = () => {
          if (cursor.result) {
            rows.push(cursor.result.value, cursor.result.key);
            cursor.result.continue();
          }
        };
      }
      tx.oncomplete = () => {
        db.close();
        resolve(rows);
      };
    };
  });
}

function containsBytes(haystack: unknown, needle: Uint8Array): boolean {
  const hex = Buffer.from(needle).toString("hex");
  const visit = (value: unknown): boolean => {
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      return Buffer.from(value as Uint8Array)
        .toString("hex")
        .includes(hex);
    }
    if (typeof value === "string")
      return value.includes(hex) || value.includes(Buffer.from(needle).toString("base64"));
    if (Array.isArray(value)) return value.some(visit);
    if (value !== null && typeof value === "object") return Object.values(value).some(visit);
    return false;
  };
  return visit(haystack);
}

describe("KeyStore", () => {
  it("keeps device state encrypted at rest", async () => {
    const state = new Uint8Array(64).map((_, i) => (i * 7 + 3) % 256);

    await store().saveDeviceState(alice, state);

    expect(await store().loadDeviceState(alice)).toEqual(state);
    expect(containsBytes(await readAll(), state)).toBe(false);
  });

  it("round-trips a message key by message id and revision", async () => {
    const keys = store();
    const first = new Uint8Array(32).fill(1);
    const edited = new Uint8Array(32).fill(2);

    await keys.saveMessageKey(alice, { id: "m-1", rev: 0 }, first, sender);
    await keys.saveMessageKey(alice, { id: "m-1", rev: 1 }, edited, sender);

    expect(await keys.getMessageKey(alice, { id: "m-1", rev: 0 })).toEqual({ key: first, sender });
    expect(await keys.getMessageKey(alice, { id: "m-1", rev: 1 })).toEqual({ key: edited, sender });
    expect(await keys.getMessageKey(alice, { id: "m-2", rev: 0 })).toBeNull();
    expect(containsBytes(await readAll(), edited)).toBe(false);
  });

  it("writes state, message keys and backup records atomically", async () => {
    const keys = store();
    const before = Uint8Array.of(1, 1, 1);
    await keys.saveDeviceState(alice, before);

    await expect(
      keys.commitTransaction(alice, {
        deviceState: Uint8Array.of(2, 2, 2),
        messageKeys: [
          { ref: { id: "m-1", rev: 0 }, key: new Uint8Array(32), sender },
          { ref: { id: "m-1", rev: 0 }, key: new Uint8Array(32), sender },
        ],
        backupRecords: [Uint8Array.of(9)],
      }),
    ).rejects.toThrow();

    expect(await keys.loadDeviceState(alice)).toEqual(before);
    expect(await keys.getMessageKey(alice, { id: "m-1", rev: 0 })).toBeNull();
    expect(await keys.pendingBackupRecords(alice)).toEqual([]);

    await keys.commitTransaction(alice, {
      deviceState: Uint8Array.of(3),
      messageKeys: [{ ref: { id: "m-1", rev: 0 }, key: new Uint8Array(32).fill(5), sender }],
      backupRecords: [Uint8Array.of(9)],
    });
    expect(await keys.loadDeviceState(alice)).toEqual(Uint8Array.of(3));
    expect((await keys.getMessageKey(alice, { id: "m-1", rev: 0 }))?.key).toEqual(
      new Uint8Array(32).fill(5),
    );
    expect(await keys.pendingBackupRecords(alice)).toEqual([Uint8Array.of(9)]);
  });

  it("creates one encryption key even when several stores start at once", async () => {
    const stores = [store(), store(), store()];

    await Promise.all(
      stores.map((keys, i) =>
        keys.saveMessageKey(alice, { id: `m-${i}`, rev: 0 }, new Uint8Array(32).fill(i), sender),
      ),
    );

    const fresh = store();
    for (let i = 0; i < stores.length; i++) {
      expect((await fresh.getMessageKey(alice, { id: `m-${i}`, rev: 0 }))?.key).toEqual(
        new Uint8Array(32).fill(i),
      );
    }
  });

  it("creates one encryption key across separate bridge objects over the same secrets", async () => {
    const shared = new Map<string, string>();
    const wrapper = () => ({
      get: async (key: string) => shared.get(key) ?? null,
      set: async (key: string, value: string) => void shared.set(key, value),
      delete: async (key: string) => void shared.delete(key),
    });
    const scope = { serverOrigin: ORIGIN, serverUserId: 77, profileId: "shared" };

    await Promise.all(
      [0, 1].map((i) =>
        new KeyStore(wrapper(), idb, IDBKeyRange).saveMessageKey(
          scope,
          { id: `m-${i}`, rev: 0 },
          new Uint8Array(32).fill(i),
          sender,
        ),
      ),
    );

    const fresh = new KeyStore(wrapper(), idb, IDBKeyRange);
    expect((await fresh.getMessageKey(scope, { id: "m-0", rev: 0 }))?.key).toEqual(
      new Uint8Array(32).fill(0),
    );
    expect((await fresh.getMessageKey(scope, { id: "m-1", rev: 0 }))?.key).toEqual(
      new Uint8Array(32).fill(1),
    );
  });

  it("finishes a save already under way before the account's data is deleted", async () => {
    const keys = store();
    const scope = { serverOrigin: ORIGIN, serverUserId: 78, profileId: "p" };

    const saving = keys.saveMessageKey(
      scope,
      { id: "m-1", rev: 0 },
      new Uint8Array(32).fill(3),
      sender,
    );
    const deleting = keys.deleteScope(scope);
    await Promise.all([saving, deleting]);

    expect(await store().getMessageKey(scope, { id: "m-1", rev: 0 })).toBeNull();
    expect(
      [...secrets.values.keys()].some((name) => name.includes('"p"') && name.includes("78")),
    ).toBe(false);
    expect(containsBytes(await readAll(), new Uint8Array(32).fill(3))).toBe(false);
  });

  it("orders saves and deletion through the browser lock manager when one exists", async () => {
    const names: string[] = [];
    const locks = {
      request: (name: string, task: () => Promise<unknown>) => {
        names.push(name);
        return task();
      },
    };
    Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
    try {
      const keys = store();
      await keys.saveMessageKey(alice, { id: "m-1", rev: 0 }, new Uint8Array(32), sender);
      await keys.deleteScope(alice);
    } finally {
      Object.defineProperty(navigator, "locks", { value: null, configurable: true });
    }

    expect(names.filter((name) => name.startsWith("tyto-e2ee-scope:"))).toHaveLength(2);
    expect(names.some((name) => name.startsWith("e2ee-store-key:"))).toBe(true);
  });

  it("fails closed instead of replacing a key it cannot read while records exist", async () => {
    await store().saveDeviceState(alice, Uint8Array.of(5));
    const [name, value] = [...secrets.values.entries()][0]!;
    secrets.values.delete(name);

    await expect(store().saveDeviceState(alice, Uint8Array.of(6))).rejects.toThrow("unavailable");
    expect(secrets.values.has(name)).toBe(false);

    secrets.values.set(name, value);
    expect(await store().loadDeviceState(alice)).toEqual(Uint8Array.of(5));
  });

  it("isolates two accounts on the same server", async () => {
    const keys = store();
    await keys.saveDeviceState(alice, Uint8Array.of(1));
    await keys.saveMessageKey(alice, { id: "m-1", rev: 0 }, new Uint8Array(32).fill(1), sender);

    expect(await keys.loadDeviceState(bob)).toBeNull();
    expect(await keys.getMessageKey(bob, { id: "m-1", rev: 0 })).toBeNull();
  });

  it("finds the same account's data again after logging out and back in", async () => {
    await store().saveDeviceState(alice, Uint8Array.of(4, 2));

    expect(await store().loadDeviceState(alice)).toEqual(Uint8Array.of(4, 2));
  });

  it("starts empty when a server is removed and added again", async () => {
    const keys = store();
    await keys.saveDeviceState(alice, Uint8Array.of(1));
    await keys.saveMessageKey(alice, { id: "m-1", rev: 0 }, new Uint8Array(32), sender);

    await keys.deleteScope(alice);

    expect(await store().loadDeviceState(alice)).toBeNull();
    expect(await store().getMessageKey(alice, { id: "m-1", rev: 0 })).toBeNull();
    expect([...secrets.values.keys()]).toEqual([]);
  });

  it("refuses records copied from another account", async () => {
    await store().saveDeviceState(alice, Uint8Array.of(1));
    await store().saveDeviceState(bob, Uint8Array.of(2));
    await swapDeviceStates();

    await expect(store().loadDeviceState(alice)).rejects.toThrow();
  });

  it("stores only its own encryption keys in the secret store", async () => {
    const keys = store();
    await keys.saveDeviceState(alice, Uint8Array.of(1));
    await keys.saveDeviceState(bob, Uint8Array.of(1));

    const names = [...secrets.values.keys()];
    expect(names).toHaveLength(2);
    expect(names.every((name) => name.startsWith("e2ee-store-key:"))).toBe(true);
    expect(
      Object.getOwnPropertyNames(KeyStore.prototype).some((name) => /account|private/i.test(name)),
    ).toBe(false);
  });
});

function swapDeviceStates(): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = idb.open(KeyStore.DATABASE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("deviceState", "readwrite");
      const states = tx.objectStore("deviceState");
      const all = states.getAll();
      const keys = states.getAllKeys();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      keys.onsuccess = () => {
        const [a, b] = keys.result;
        const [va, vb] = all.result;
        states.put(vb, a!);
        states.put(va, b!);
      };
    };
  });
}
