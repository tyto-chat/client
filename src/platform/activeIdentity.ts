let current: string | null = null;
const listeners = new Set<() => void>();

export function setActiveIdentityKey(id: string | null): void {
  if (id === current) return;
  current = id;
  for (const listener of listeners) listener();
}

export function getActiveIdentityKey(): string | null {
  return current;
}

export function subscribeActiveIdentity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
