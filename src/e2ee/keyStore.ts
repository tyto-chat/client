import type { BridgeE2eeScope, PlatformBridge } from "@/platform/PlatformBridge";

export type KeyStoreScope = BridgeE2eeScope;

export interface MessageKeySender {
  userId: number;
  accountKeyFingerprint: string;
  deviceId: string;
}

export interface MessageKeyRef {
  id: string;
  rev: number;
}

export interface StoredMessageKey {
  key: Uint8Array;
  sender: MessageKeySender;
}

export interface KeyStoreTransaction {
  deviceState?: Uint8Array;
  messageKeys?: { ref: MessageKeyRef; key: Uint8Array; sender: MessageKeySender }[];
  backupRecords?: Uint8Array[];
  records?: { kind: RecordKind; id: string; data: Uint8Array }[];
}

type Secrets = PlatformBridge["secrets"];

export type RecordKind = typeof PINS | typeof REVOCATIONS | typeof GROUPS | typeof PENDING_KEYS;

export interface KeyedRecord {
  id: string;
  data: Uint8Array;
}

interface SealedRecord {
  iv: Uint8Array;
  data: Uint8Array;
}

const DEVICE_STATE = "deviceState";
const MESSAGE_KEYS = "messageKeys";
const OUTBOX = "outbox";
const PINS = "pins";
const REVOCATIONS = "revocations";
const GROUPS = "groups";
const PENDING_KEYS = "pendingKeys";
const ALL_STORES = [DEVICE_STATE, MESSAGE_KEYS, OUTBOX, PINS, REVOCATIONS, GROUPS, PENDING_KEYS];
const STORE_KEY_PREFIX = "e2ee-store-key:";
const STRICT: IDBTransactionOptions = { durability: "strict" };

function scopeKey(scope: KeyStoreScope): string {
  return JSON.stringify([scope.serverOrigin, scope.serverUserId, scope.profileId]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export interface ScopeLocks {
  request<T>(name: string, task: () => Promise<T>): Promise<T>;
}

let outboxSequence = 0;

const keyLoads = new Map<string, Promise<CryptoKey>>();

function browserLocks(): ScopeLocks | null {
  return typeof navigator === "undefined" ? null : (navigator.locks ?? null);
}

export class KeyStore {
  static readonly DATABASE = "tyto-e2ee";

  private db: Promise<IDBDatabase> | null = null;
  private readonly secrets: Secrets;
  private readonly factory: IDBFactory;
  private readonly keyRange: typeof IDBKeyRange;
  private readonly locks: ScopeLocks | null;

  constructor(
    secrets: Secrets,
    factory: IDBFactory = indexedDB,
    keyRange: typeof IDBKeyRange = IDBKeyRange,
    locks: ScopeLocks | null = browserLocks(),
  ) {
    this.secrets = secrets;
    this.factory = factory;
    this.keyRange = keyRange;
    this.locks = locks;
  }

  private requireLocks(): ScopeLocks {
    if (this.locks === null) {
      throw new Error("the key store needs Web Locks to keep its keys consistent");
    }
    return this.locks;
  }

  private async withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
    return this.requireLocks().request(name, task);
  }

  private inScopeOrder<T>(key: string, task: () => Promise<T>): Promise<T> {
    return this.withLock(`tyto-e2ee-scope:${key}`, task);
  }

  async loadDeviceState(scope: KeyStoreScope): Promise<Uint8Array | null> {
    this.requireLocks();
    const key = scopeKey(scope);
    const db = await this.open();
    const record = await request<SealedRecord | undefined>(
      db.transaction(DEVICE_STATE).objectStore(DEVICE_STATE).get(key),
    );
    return record === undefined ? null : this.unseal(scope, `${key}|${DEVICE_STATE}`, record);
  }

  saveDeviceState(scope: KeyStoreScope, state: Uint8Array): Promise<void> {
    return this.commitTransaction(scope, { deviceState: state });
  }

  saveMessageKey(
    scope: KeyStoreScope,
    ref: MessageKeyRef,
    key: Uint8Array,
    sender: MessageKeySender,
  ): Promise<void> {
    return this.inScopeOrder(scopeKey(scope), async () => {
      const sealed = await this.sealMessageKey(scope, ref, key, sender);
      const db = await this.open();
      const tx = db.transaction(MESSAGE_KEYS, "readwrite", STRICT);
      tx.objectStore(MESSAGE_KEYS).put(sealed, [scopeKey(scope), ref.id, ref.rev]);
      await completion(tx);
    });
  }

  async getMessageKey(scope: KeyStoreScope, ref: MessageKeyRef): Promise<StoredMessageKey | null> {
    this.requireLocks();
    const db = await this.open();
    const record = await request<SealedRecord | undefined>(
      db
        .transaction(MESSAGE_KEYS)
        .objectStore(MESSAGE_KEYS)
        .get([scopeKey(scope), ref.id, ref.rev]),
    );
    if (record === undefined) return null;
    const plain = await this.unseal(scope, this.messageKeyContext(scope, ref), record);
    const { k, s } = JSON.parse(new TextDecoder().decode(plain)) as {
      k: string;
      s: MessageKeySender;
    };
    return { key: fromBase64(k), sender: s };
  }

  async pendingBackupRecords(scope: KeyStoreScope): Promise<Uint8Array[]> {
    this.requireLocks();
    const key = scopeKey(scope);
    const db = await this.open();
    const records = await request<SealedRecord[]>(
      db.transaction(OUTBOX).objectStore(OUTBOX).getAll(this.scopeRange(key)),
    );
    return Promise.all(records.map((record) => this.unseal(scope, `${key}|${OUTBOX}`, record)));
  }

  commitTransaction(scope: KeyStoreScope, change: KeyStoreTransaction): Promise<void> {
    return this.inScopeOrder(scopeKey(scope), () => this.writeTransaction(scope, change));
  }

  private async writeTransaction(scope: KeyStoreScope, change: KeyStoreTransaction): Promise<void> {
    const key = scopeKey(scope);
    const deviceState =
      change.deviceState === undefined
        ? undefined
        : await this.seal(scope, `${key}|${DEVICE_STATE}`, change.deviceState);
    const messageKeys = await Promise.all(
      (change.messageKeys ?? []).map(async (m) => ({
        storeKey: [key, m.ref.id, m.ref.rev],
        sealed: await this.sealMessageKey(scope, m.ref, m.key, m.sender),
      })),
    );
    const backupRecords = await Promise.all(
      (change.backupRecords ?? []).map((record) => this.seal(scope, `${key}|${OUTBOX}`, record)),
    );
    const records = await Promise.all(
      (change.records ?? []).map(async ({ kind, id, data }) => ({
        kind,
        id,
        sealed: await this.seal(scope, this.recordContext(key, kind, id), data),
      })),
    );

    const db = await this.open();
    const tx = db.transaction(
      [DEVICE_STATE, MESSAGE_KEYS, OUTBOX, ...new Set(records.map((r) => r.kind))],
      "readwrite",
      STRICT,
    );
    const done = completion(tx);
    try {
      if (deviceState !== undefined) tx.objectStore(DEVICE_STATE).put(deviceState, key);
      for (const { storeKey, sealed } of messageKeys) {
        tx.objectStore(MESSAGE_KEYS).add(sealed, storeKey);
      }
      for (const sealed of backupRecords) {
        outboxSequence += 1;
        tx.objectStore(OUTBOX).add(sealed, [
          key,
          `${Date.now().toString(36).padStart(10, "0")}-${outboxSequence.toString(36).padStart(6, "0")}-${crypto.randomUUID()}`,
        ]);
      }
      for (const { kind, id, sealed } of records) tx.objectStore(kind).put(sealed, [key, id]);
    } catch (error) {
      tx.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  }

  async loadRecords(scope: KeyStoreScope, kind: RecordKind): Promise<KeyedRecord[]> {
    this.requireLocks();
    const key = scopeKey(scope);
    const db = await this.open();
    const store = db.transaction(kind).objectStore(kind);
    const [keys, records] = await Promise.all([
      request(store.getAllKeys(this.scopeRange(key))),
      request<SealedRecord[]>(store.getAll(this.scopeRange(key))),
    ]);
    return Promise.all(
      records.map(async (record, i) => {
        const id = String((keys[i] as [string, string])[1]);
        return { id, data: await this.unseal(scope, this.recordContext(key, kind, id), record) };
      }),
    );
  }

  async getRecord(scope: KeyStoreScope, kind: RecordKind, id: string): Promise<Uint8Array | null> {
    this.requireLocks();
    const key = scopeKey(scope);
    const db = await this.open();
    const stored = await request<SealedRecord | undefined>(
      db.transaction(kind).objectStore(kind).get([key, id]),
    );
    return stored === undefined
      ? null
      : this.unseal(scope, this.recordContext(key, kind, id), stored);
  }

  putRecords(scope: KeyStoreScope, kind: RecordKind, records: KeyedRecord[]): Promise<void> {
    const key = scopeKey(scope);
    return this.inScopeOrder(key, async () => {
      const sealed = await Promise.all(
        records.map(async ({ id, data }) => ({
          id,
          record: await this.seal(scope, this.recordContext(key, kind, id), data),
        })),
      );
      const db = await this.open();
      const tx = db.transaction(kind, "readwrite", STRICT);
      for (const { id, record } of sealed) tx.objectStore(kind).put(record, [key, id]);
      await completion(tx);
    });
  }

  updateRecord<R>(
    scope: KeyStoreScope,
    kind: RecordKind,
    id: string,
    change: (current: Uint8Array | null) => { data: Uint8Array | null; result: R },
  ): Promise<R> {
    const key = scopeKey(scope);
    const context = this.recordContext(key, kind, id);
    return this.inScopeOrder(key, async () => {
      const db = await this.open();
      const stored = await request<SealedRecord | undefined>(
        db.transaction(kind).objectStore(kind).get([key, id]),
      );
      const current = stored === undefined ? null : await this.unseal(scope, context, stored);
      const { data, result } = change(current);
      if (data !== null) {
        const sealed = await this.seal(scope, context, data);
        const tx = db.transaction(kind, "readwrite", STRICT);
        tx.objectStore(kind).put(sealed, [key, id]);
        await completion(tx);
      }
      return result;
    });
  }

  deleteScope(scope: KeyStoreScope): Promise<void> {
    const key = scopeKey(scope);
    return this.inScopeOrder(key, async () => {
      const db = await this.open();
      const tx = db.transaction(ALL_STORES, "readwrite", STRICT);
      tx.objectStore(DEVICE_STATE).delete(key);
      for (const store of ALL_STORES.slice(1)) {
        tx.objectStore(store).delete(this.scopeRange(key));
      }
      await completion(tx);
      await this.withLock(`${STORE_KEY_PREFIX}${key}`, () =>
        this.secrets.delete(`${STORE_KEY_PREFIX}${key}`),
      );
    });
  }

  private scopeRange(key: string): IDBKeyRange {
    return this.keyRange.bound([key], [key, []]);
  }

  private recordContext(key: string, kind: RecordKind, id: string): string {
    return `${key}|${kind}|${JSON.stringify(id)}`;
  }

  private messageKeyContext(scope: KeyStoreScope, ref: MessageKeyRef): string {
    return `${scopeKey(scope)}|${MESSAGE_KEYS}|${JSON.stringify([ref.id, ref.rev])}`;
  }

  private sealMessageKey(
    scope: KeyStoreScope,
    ref: MessageKeyRef,
    key: Uint8Array,
    sender: MessageKeySender,
  ): Promise<SealedRecord> {
    const plain = new TextEncoder().encode(JSON.stringify({ k: toBase64(key), s: sender }));
    return this.seal(scope, this.messageKeyContext(scope, ref), plain);
  }

  private async seal(
    scope: KeyStoreScope,
    context: string,
    plain: Uint8Array,
  ): Promise<SealedRecord> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
      await this.cryptoKey(scope),
      new Uint8Array(plain),
    );
    return { iv, data: new Uint8Array(data) };
  }

  private async unseal(
    scope: KeyStoreScope,
    context: string,
    record: SealedRecord,
  ): Promise<Uint8Array> {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(record.iv),
        additionalData: new TextEncoder().encode(context),
      },
      await this.cryptoKey(scope),
      new Uint8Array(record.data),
    );
    return new Uint8Array(plain);
  }

  private cryptoKey(scope: KeyStoreScope): Promise<CryptoKey> {
    const key = scopeKey(scope);
    let pending = keyLoads.get(key);
    if (pending === undefined) {
      pending = this.withLock(`${STORE_KEY_PREFIX}${key}`, () => this.loadOrCreateKey(key));
      keyLoads.set(key, pending);
      const settled = () => {
        if (keyLoads.get(key) === pending) keyLoads.delete(key);
      };
      pending.then(settled, settled);
    }
    return pending;
  }

  private async loadOrCreateKey(key: string): Promise<CryptoKey> {
    const name = `${STORE_KEY_PREFIX}${key}`;
    let raw = await this.secrets.get(name);
    if (raw === null) {
      if (await this.hasRecords(key))
        throw new Error("the key store's encryption key is unavailable");
      raw = toBase64(crypto.getRandomValues(new Uint8Array(32)));
      await this.secrets.set(name, raw);
    }
    return crypto.subtle.importKey("raw", new Uint8Array(fromBase64(raw)), "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }

  private async hasRecords(key: string): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction(ALL_STORES);
    const counts = await Promise.all([
      request(tx.objectStore(DEVICE_STATE).count(key)),
      ...ALL_STORES.slice(1).map((store) =>
        request(tx.objectStore(store).count(this.scopeRange(key))),
      ),
    ]);
    return counts.some((count) => count > 0);
  }

  private open(): Promise<IDBDatabase> {
    if (this.db === null) {
      const opening = new Promise<IDBDatabase>((resolve, reject) => {
        let gaveUp = false;
        const req = this.factory.open(KeyStore.DATABASE, 3);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const store of ALL_STORES) {
            if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
          }
        };
        req.onblocked = () => {
          gaveUp = true;
          reject(new Error("the key store is being upgraded; close other windows and reload"));
        };
        req.onsuccess = () => {
          const db = req.result;
          if (gaveUp) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            if (this.db === opening) this.db = null;
          };
          resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
      });
      this.db = opening;
      opening.catch(() => {
        if (this.db === opening) this.db = null;
      });
    }
    return this.db;
  }
}
