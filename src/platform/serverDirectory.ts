import { useSyncExternalStore } from "react";
import type { ConnectionCommunity } from "@/desktop/connections/IdentityConnection";
import type { ServerContext } from "@/desktop/connections/identityFetch";
import { pickConnection } from "@/utils/serverOrigins";

export interface ServerEndpoint {
  identityId: string;
  origin: string;
  apiOrigin: string | null;
  serverName: string | null;
  kind: string;
  status: string;
  communities: ConnectionCommunity[];
  ctx: ServerContext;
}

export interface ServerDirectorySource {
  list(): ServerEndpoint[];
  activeIdentityId(): string | null;
  subscribe(listener: () => void): () => void;
}

export interface ServerDirectorySnapshot {
  readonly version: number;
  find(origin: string): ServerEndpoint | null;
  origins(): string[];
  activeIdentityId(): string | null;
}

let source: ServerDirectorySource | null = null;
let unsubscribeSource: (() => void) | null = null;
let version = 0;
const listeners = new Set<() => void>();

function buildSnapshot(): ServerDirectorySnapshot {
  const current = source;
  return {
    version,
    find: (origin) =>
      current ? pickConnection(current.list(), origin, current.activeIdentityId()) : null,
    origins: () => {
      const all = new Set<string>();
      for (const endpoint of current?.list() ?? []) {
        all.add(endpoint.origin);
        if (endpoint.apiOrigin) all.add(endpoint.apiOrigin);
      }
      return [...all];
    },
    activeIdentityId: () => current?.activeIdentityId() ?? null,
  };
}

let snapshot: ServerDirectorySnapshot = buildSnapshot();
let fingerprint = "";

function fingerprintOf(current: ServerDirectorySource | null): string {
  if (!current) return "";
  return JSON.stringify([
    current.activeIdentityId(),
    current
      .list()
      .map((e) => [
        e.identityId,
        e.origin,
        e.apiOrigin,
        e.serverName,
        e.kind,
        e.status,
        e.communities.map((c) => [c.identifier, c.name]),
      ]),
  ]);
}

export function registerServerDirectory(next: ServerDirectorySource | null): void {
  unsubscribeSource?.();
  source = next;
  unsubscribeSource = next
    ? next.subscribe(() => {
        if (fingerprintOf(source) !== fingerprint) notifyAndRebuild();
      })
    : null;
  notifyAndRebuild();
}

function notifyAndRebuild(): void {
  fingerprint = fingerprintOf(source);
  version += 1;
  snapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function getServerDirectory(): ServerDirectorySnapshot {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useServerDirectory(): ServerDirectorySnapshot {
  return useSyncExternalStore(subscribe, getServerDirectory, getServerDirectory);
}
