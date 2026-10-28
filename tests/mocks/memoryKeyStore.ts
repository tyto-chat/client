import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { KeyStore, type ScopeLocks } from "@/e2ee/keyStore";

class MemorySecrets {
  readonly values = new Map<string, string>();
  get = async (key: string) => this.values.get(key) ?? null;
  set = async (key: string, value: string) => void this.values.set(key, value);
  delete = async (key: string) => void this.values.delete(key);
}

class MemoryLocks implements ScopeLocks {
  private readonly tails = new Map<string, Promise<unknown>>();
  request = <T>(name: string, task: () => Promise<T>): Promise<T> => {
    const result = (this.tails.get(name) ?? Promise.resolve()).then(task, task);
    this.tails.set(
      name,
      result.catch(() => undefined),
    );
    return result;
  };
}

export function memoryKeyStoreFactory(): () => KeyStore {
  const idb = new IDBFactory();
  const secrets = new MemorySecrets();
  const locks = new MemoryLocks();
  return () => new KeyStore(secrets, idb, IDBKeyRange, locks);
}
