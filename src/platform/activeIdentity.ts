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

let switchInProgress = false;

export function setIdentitySwitchInProgress(value: boolean): void {
  switchInProgress = value;
}

export function isIdentitySwitchInProgress(): boolean {
  return switchInProgress;
}

export interface IdentitySwitchNavigateTarget {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
}

let switchTarget: IdentitySwitchNavigateTarget | null = null;

export function setIdentitySwitchTarget(target: IdentitySwitchNavigateTarget | null): void {
  switchTarget = target;
}

export function getIdentitySwitchTarget(): IdentitySwitchNavigateTarget | null {
  return switchTarget;
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

export interface IdentityDisplayInfo {
  serverName: string | null;
  origin: string;
}

type IdentityInfoProvider = (identityKey: string) => IdentityDisplayInfo | null;

let infoProvider: IdentityInfoProvider | null = null;

export function registerIdentityInfoProvider(fn: IdentityInfoProvider | null): void {
  infoProvider = fn;
}

export function getIdentityDisplayInfo(identityKey: string): IdentityDisplayInfo | null {
  return infoProvider ? infoProvider(identityKey) : null;
}

type IdentityRequestExecutor = (
  identityKey: string,
  path: string,
  init?: RequestInit,
) => Promise<void>;

let requestExecutor: IdentityRequestExecutor | null = null;

export function registerIdentityRequestExecutor(fn: IdentityRequestExecutor | null): void {
  requestExecutor = fn;
}

export async function executeIdentityRequest(
  identityKey: string,
  path: string,
  init?: RequestInit,
): Promise<boolean> {
  if (!requestExecutor) return false;
  await requestExecutor(identityKey, path, init);
  return true;
}
