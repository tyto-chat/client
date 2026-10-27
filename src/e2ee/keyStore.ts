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
}

type Secrets = PlatformBridge["secrets"];

interface SealedRecord {
  iv: Uint8Array;
  data: Uint8Array;
}

const DEVICE_STATE = "deviceState";
const MESSAGE_KEYS = "messageKeys";
const OUTBOX = "outbox";
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

    const db = await this.open();
    const tx = db.transaction([DEVICE_STATE, MESSAGE_KEYS, OUTBOX], "readwrite", STRICT);
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
    } catch (error) {
      tx.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  }

  deleteScope(scope: KeyStoreScope): Promise<void> {
    const key = scopeKey(scope);
    return this.inScopeOrder(key, async () => {
      const db = await this.open();
      const tx = db.transaction([DEVICE_STATE, MESSAGE_KEYS, OUTBOX], "readwrite", STRICT);
      tx.objectStore(DEVICE_STATE).delete(key);
      tx.objectStore(MESSAGE_KEYS).delete(this.scopeRange(key));
      tx.objectStore(OUTBOX).delete(this.scopeRange(key));
      await completion(tx);
      await this.withLock(`${STORE_KEY_PREFIX}${key}`, () =>
        this.secrets.delete(`${STORE_KEY_PREFIX}${key}`),
      );
    });
  }

  private scopeRange(key: string): IDBKeyRange {
    return this.keyRange.bound([key], [key, []]);
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
    const tx = db.transaction([DEVICE_STATE, MESSAGE_KEYS, OUTBOX]);
    const counts = await Promise.all([
      request(tx.objectStore(DEVICE_STATE).count(key)),
      request(tx.objectStore(MESSAGE_KEYS).count(this.scopeRange(key))),
      request(tx.objectStore(OUTBOX).count(this.scopeRange(key))),
    ]);
    return counts.some((count) => count > 0);
  }

  private open(): Promise<IDBDatabase> {
    if (this.db === null) {
      this.db = new Promise((resolve, reject) => {
        const req = this.factory.open(KeyStore.DATABASE, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore(DEVICE_STATE);
          db.createObjectStore(MESSAGE_KEYS);
          db.createObjectStore(OUTBOX);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
      });
    }
    return this.db;
  }
}
