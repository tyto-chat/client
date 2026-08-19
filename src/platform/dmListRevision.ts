let revision = 0;
const listeners = new Set<() => void>();

export function getDmListRevision(): number {
  return revision;
}

export function subscribeDmListRevision(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bumpDmListRevision(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function resetDmListRevisionForTests(): void {
  revision = 0;
}
