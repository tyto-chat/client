import { getActiveIdentityKey } from "@/platform/activeIdentity";

const listeners = new Set<() => void>();
const parsedByKey = new Map<string, { raw: string; ids: readonly number[] | null }>();

function storageKey(userId: number): string {
  return `tyto:blocked-ids:${getActiveIdentityKey() ?? "web"}:${userId}`;
}

function parse(raw: string): readonly number[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "number") ? parsed : null;
  } catch {
    return null;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeStoredBlockedIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readStoredBlockedIds(userId: number): readonly number[] | null {
  const key = storageKey(userId);
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const cached = parsedByKey.get(key);
  if (cached?.raw === raw) return cached.ids;
  const ids = parse(raw);
  parsedByKey.set(key, { raw, ids });
  return ids;
}

export function writeStoredBlockedIds(userId: number, ids: readonly number[]): void {
  const current = readStoredBlockedIds(userId);
  if (current && current.length === ids.length && current.every((id, i) => id === ids[i])) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
  notify();
}

export function updateStoredBlockedIds(
  userId: number,
  update: (ids: readonly number[]) => readonly number[],
): void {
  writeStoredBlockedIds(userId, update(readStoredBlockedIds(userId) ?? []));
}

export function clearStoredBlockedIds(userId: number): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* storage unavailable */
  }
  notify();
}
