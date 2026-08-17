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

export interface IdentitySwitchNavigateTarget {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
}

type IdentitySwitchHandler = (
  identityKey: string,
  navigateTo?: IdentitySwitchNavigateTarget,
) => Promise<void>;

let switchHandler: IdentitySwitchHandler | null = null;

export function registerIdentitySwitchHandler(handler: IdentitySwitchHandler | null): void {
  switchHandler = handler;
}

export async function requestIdentitySwitch(
  identityKey: string,
  navigateTo?: IdentitySwitchNavigateTarget,
): Promise<boolean> {
  if (!switchHandler) return false;
  await switchHandler(identityKey, navigateTo);
  return true;
}
