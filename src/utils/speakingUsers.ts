import { useSyncExternalStore } from "react";

const EMPTY: ReadonlySet<number> = new Set();

let speaking: ReadonlySet<number> = EMPTY;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function sameMembers(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function setSpeakingUsers(next: ReadonlySet<number>): void {
  if (sameMembers(speaking, next)) return;
  speaking = next;
  listeners.forEach((l) => l());
}

export function resetSpeakingUsers(): void {
  setSpeakingUsers(EMPTY);
}

export function useSpeakingUsers(): ReadonlySet<number> {
  return useSyncExternalStore(
    subscribe,
    () => speaking,
    () => EMPTY,
  );
}
