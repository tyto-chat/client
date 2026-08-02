import type { ServerInfo } from "@/types/api";

let _serverInfo: ServerInfo | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export async function fetchServerInfo(url: string): Promise<ServerInfo> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Server info fetch failed: ${res.status}`);
  _serverInfo = (await res.json()) as ServerInfo;
  emit();
  return _serverInfo;
}

export function getServerInfo(): ServerInfo | null {
  return _serverInfo;
}

export function updateServerInfo(patch: Partial<ServerInfo>): void {
  if (!_serverInfo) return;
  _serverInfo = { ..._serverInfo, ...patch };
  emit();
}

export function subscribeServerInfo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
