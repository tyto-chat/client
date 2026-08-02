import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { TypingMercureEvent } from "@/types/api";

export const TYPING_TTL_MS = 5000;
export const TYPING_PING_INTERVAL_MS = 3000;

export interface ActiveTyper {
  userId: number;
  name: string;
}

export function channelTypingScope(communityId: string, channelIdentifier: string): string {
  return `channel:${communityId}:${channelIdentifier}`;
}

export function conversationTypingScope(conversationIdentifier: string): string {
  return `conversation:${conversationIdentifier}`;
}

interface Entry {
  name: string;
  expiresAt: number;
}

const EMPTY: ActiveTyper[] = [];
const entriesByScope = new Map<string, Map<number, Entry>>();
const snapshotByScope = new Map<string, ActiveTyper[]>();
const listenersByScope = new Map<string, Set<() => void>>();
let sweeper: ReturnType<typeof setInterval> | undefined;

function rebuild(scope: string): void {
  const entries = entriesByScope.get(scope);
  const next: ActiveTyper[] =
    entries && entries.size > 0
      ? Array.from(entries, ([userId, e]) => ({ userId, name: e.name }))
      : EMPTY;
  snapshotByScope.set(scope, next);
  listenersByScope.get(scope)?.forEach((cb) => cb());
}

function ensureSweeper(): void {
  if (sweeper != null) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    let anyLeft = false;
    for (const [scope, entries] of entriesByScope) {
      let changed = false;
      for (const [userId, entry] of entries) {
        if (entry.expiresAt <= now) {
          entries.delete(userId);
          changed = true;
        }
      }
      if (changed) rebuild(scope);
      if (entries.size > 0) anyLeft = true;
    }
    if (!anyLeft && sweeper != null) {
      clearInterval(sweeper);
      sweeper = undefined;
    }
  }, 500);
}

export function recordTyping(scope: string, event: TypingMercureEvent): void {
  let entries = entriesByScope.get(scope);
  if (!entries) {
    entries = new Map();
    entriesByScope.set(scope, entries);
  }
  entries.set(event.userId, { name: event.name, expiresAt: Date.now() + TYPING_TTL_MS });
  rebuild(scope);
  ensureSweeper();
}

export function clearTyper(scope: string, userId: number): void {
  const entries = entriesByScope.get(scope);
  if (!entries?.delete(userId)) return;
  rebuild(scope);
}

function subscribe(scope: string, cb: () => void): () => void {
  let set = listenersByScope.get(scope);
  if (!set) {
    set = new Set();
    listenersByScope.set(scope, set);
  }
  set.add(cb);
  return () => set.delete(cb);
}

export function useTypingIndicator(
  scope: string | null,
  selfUserId: number | null | undefined,
): ActiveTyper[] {
  const sub = useCallback((cb: () => void) => (scope ? subscribe(scope, cb) : () => {}), [scope]);
  const getSnapshot = useCallback(
    () => (scope ? (snapshotByScope.get(scope) ?? EMPTY) : EMPTY),
    [scope],
  );
  const all = useSyncExternalStore(sub, getSnapshot, getSnapshot);

  return useMemo(() => all.filter((typer) => typer.userId !== selfUserId), [all, selfUserId]);
}
