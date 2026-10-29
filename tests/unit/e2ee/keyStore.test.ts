import { IDBDatabase, IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

class MemoryLocks {
  readonly names: string[] = [];
  private readonly tails = new Map<string, Promise<unknown>>();
  request = <T>(name: string, task: () => Promise<T>): Promise<T> => {
    this.names.push(name);
    const result = (this.tails.get(name) ?? Promise.resolve()).then(task, task);
    this.tails.set(
      name,
      result.catch(() => undefined),
    );
    return result;
  };
}

let idb: IDBFactory;
let secrets: MemorySecrets;
let locks: MemoryLocks;

beforeEach(() => {
  idb = new IDBFactory();
  secrets = new MemorySecrets();
  locks = new MemoryLocks();
});

const store = () => new KeyStore(secrets, idb, IDBKeyRange, locks);

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
        new KeyStore(wrapper(), idb, IDBKeyRange, locks).saveMessageKey(
          scope,
          { id: `m-${i}`, rev: 0 },
          new Uint8Array(32).fill(i),
          sender,
        ),
      ),
    );

    const fresh = new KeyStore(wrapper(), idb, IDBKeyRange, locks);
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

  it("orders saves and deletion through the browser lock manager", async () => {
    const keys = store();
    await keys.saveMessageKey(alice, { id: "m-1", rev: 0 }, new Uint8Array(32), sender);
    await keys.deleteScope(alice);

    expect(locks.names.filter((name) => name.startsWith("tyto-e2ee-scope:"))).toHaveLength(2);
    expect(locks.names.some((name) => name.startsWith("e2ee-store-key:"))).toBe(true);
  });

  it("keeps backup records from two windows apart even within the same millisecond", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    try {
      const windows = [];
      for (let i = 0; i < 2; i++) {
        vi.resetModules();
        const { KeyStore: Fresh } = await import("@/e2ee/keyStore");
        windows.push(new Fresh(secrets, idb, IDBKeyRange, locks));
      }

      await windows[0]!.commitTransaction(alice, { backupRecords: [Uint8Array.of(1)] });
      await windows[1]!.commitTransaction(alice, {
        deviceState: Uint8Array.of(7),
        backupRecords: [Uint8Array.of(2)],
      });

      expect(await store().loadDeviceState(alice)).toEqual(Uint8Array.of(7));
      expect(await store().pendingBackupRecords(alice)).toHaveLength(2);
    } finally {
      now.mockRestore();
    }
  });

  it("waits for every key write to reach disk before reporting it saved", async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, "transaction");
    try {
      const keys = store();
      await keys.saveDeviceState(alice, Uint8Array.of(1));
      await keys.saveMessageKey(alice, { id: "m-1", rev: 0 }, new Uint8Array(32), sender);
      await keys.deleteScope(alice);

      const writes = transaction.mock.results
        .map((r) => r.value as IDBTransaction)
        .filter((tx) => tx.mode === "readwrite");
      expect(writes.length).toBeGreaterThanOrEqual(3);
      expect(writes.every((tx) => tx.durability === "strict")).toBe(true);
    } finally {
      transaction.mockRestore();
    }
  });

  it("refuses to run without cross-context locks instead of risking two keys", async () => {
    const unlocked = new KeyStore(secrets, idb, IDBKeyRange, null);

    await expect(unlocked.saveDeviceState(alice, Uint8Array.of(1))).rejects.toThrow("Web Locks");
    await expect(unlocked.loadDeviceState(alice)).rejects.toThrow("Web Locks");
    await expect(unlocked.deleteScope(alice)).rejects.toThrow("Web Locks");
    expect(secrets.values.size).toBe(0);
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

    await keys.putRecords(alice, "pins", [{ id: "7", data: Uint8Array.of(9) }]);

    await keys.deleteScope(alice);

    expect(await store().loadRecords(alice, "pins")).toEqual([]);
    expect(await store().loadDeviceState(alice)).toBeNull();
    expect(await store().getMessageKey(alice, { id: "m-1", rev: 0 })).toBeNull();
    expect([...secrets.values.keys()]).toEqual([]);
  });

  it("keeps pins and revocations encrypted and apart per account", async () => {
    const pin = new Uint8Array(40).map((_, i) => (i * 11 + 5) % 256);
    const revocation = new Uint8Array(40).map((_, i) => (i * 13 + 1) % 256);

    await store().putRecords(alice, "pins", [{ id: "7", data: pin }]);
    await store().putRecords(alice, "revocations", [{ id: "7/d/1", data: revocation }]);

    expect(await store().loadRecords(alice, "pins")).toEqual([{ id: "7", data: pin }]);
    expect(await store().loadRecords(alice, "revocations")).toEqual([
      { id: "7/d/1", data: revocation },
    ]);
    expect(await store().loadRecords(bob, "pins")).toEqual([]);
    expect(containsBytes(await readAll(), pin)).toBe(false);
    expect(containsBytes(await readAll(), revocation)).toBe(false);
  });

  it("upgrades a database created before pins existed", async () => {
    (await openVersionOne()).close();

    await store().putRecords(alice, "pins", [{ id: "7", data: Uint8Array.of(1) }]);
    await store().saveDeviceState(alice, Uint8Array.of(2));

    expect(await store().loadRecords(alice, "pins")).toEqual([{ id: "7", data: Uint8Array.of(1) }]);
    expect(await store().loadDeviceState(alice)).toEqual(Uint8Array.of(2));
  });

  it("writes an updated record and its backup entries together", async () => {
    const keys = store();

    await keys.updateRecord(alice, "security", "refusal", () => ({
      data: Uint8Array.of(1),
      result: undefined,
      backupRecords: [Uint8Array.of(5)],
    }));
    await keys.updateRecord(alice, "security", "refusal", () => ({
      data: null,
      result: undefined,
      backupRecords: [Uint8Array.of(6)],
    }));

    expect(await keys.getRecord(alice, "security", "refusal")).toEqual(Uint8Array.of(1));
    expect(await keys.pendingBackupRecords(alice)).toEqual([Uint8Array.of(5)]);
    expect(await keys.pendingBackupRecords(bob)).toEqual([]);
  });

  it("fails instead of waiting when an older window blocks the upgrade", async () => {
    const old = await openVersionOne();
    const keys = store();

    await expect(keys.loadRecords(alice, "pins")).rejects.toThrow(/close other windows/);

    old.close();
    await expect(keys.loadRecords(alice, "pins")).resolves.toEqual([]);
  });

  it("writes group records in the same transaction as message keys", async () => {
    const keys = store();
    const ref = { id: "m-1", rev: 0 };
    const group = { kind: "groups" as const, id: "conv-1", data: Uint8Array.of(1) };
    await keys.commitTransaction(alice, { messageKeys: [{ ref, key: Uint8Array.of(9), sender }] });

    await expect(
      keys.commitTransaction(alice, {
        messageKeys: [{ ref, key: Uint8Array.of(8), sender }],
        records: [group],
      }),
    ).rejects.toThrow();
    expect(await keys.getRecord(alice, "groups", "conv-1")).toBeNull();

    await keys.commitTransaction(alice, { records: [group] });
    expect(await keys.getRecord(alice, "groups", "conv-1")).toEqual(Uint8Array.of(1));
  });

  it("steps aside when a newer version needs the database", async () => {
    const keys = store();
    await keys.saveDeviceState(alice, Uint8Array.of(1));

    const newer = await new Promise<string>((resolve) => {
      const open = idb.open(KeyStore.DATABASE, 5);
      open.onblocked = () => resolve("blocked");
      open.onsuccess = () => {
        open.result.close();
        resolve("opened");
      };
    });

    expect(newer).toBe("opened");
    await expect(keys.loadDeviceState(alice)).rejects.toThrow();
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

function openVersionOne(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = idb.open(KeyStore.DATABASE, 1);
    open.onupgradeneeded = () => {
      for (const name of ["deviceState", "messageKeys", "outbox"]) {
        open.result.createObjectStore(name);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(open.result);
  });
}

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
