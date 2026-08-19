import type { PlatformBridge } from "@/platform/PlatformBridge";
import { loadDesktopConfig, saveDesktopConfig, setServerOrder } from "@/desktop/desktopConfig";

type Listener = () => void;

let currentOrder: string[] = [];
const listeners = new Set<Listener>();

export function getServerOrderSnapshot(): string[] {
  return currentOrder;
}

export function setServerOrderSnapshot(order: string[]): void {
  currentOrder = order;
  for (const listener of listeners) listener();
}

export function subscribeServerOrder(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function persistServerOrder(bridge: PlatformBridge, order: string[]): Promise<void> {
  const config = await loadDesktopConfig(bridge);
  const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
  if (!profileId) return;
  const next = setServerOrder(config, profileId, order);
  await saveDesktopConfig(bridge, next);
  setServerOrderSnapshot(order);
}

export function __resetServerOrderStoreForTests(): void {
  currentOrder = [];
  listeners.clear();
}
