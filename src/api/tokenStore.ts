import { useSyncExternalStore } from "react";

let accessToken: string | null = null;
const listeners = new Set<() => void>();

// The E2E harness serves a build (`--mode e2e`) rather than the dev server, so
// this seam has to survive that build. It stays out of real production bundles:
// `MODE` is only "e2e" when built explicitly for the test harness.
if ((import.meta.env.DEV || import.meta.env.MODE === "e2e") && typeof window !== "undefined") {
  const seeded = (window as unknown as { __TYTO_DEV_TOKEN__?: string }).__TYTO_DEV_TOKEN__;
  if (typeof seeded === "string" && seeded) accessToken = seeded;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  if (accessToken === token) return;
  accessToken = token;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Requests must not race the boot-time session restore: the first authed
// fetches would go out tokenless, 401 in the console, and run twice. The gate
// starts resolved so plain unit tests never block; main.tsx arms it before
// the router mounts and AuthProvider's init releases it.
let authRestore: Promise<void> = Promise.resolve();
let finishRestore: () => void = () => {};

export function beginAuthRestore(): void {
  authRestore = new Promise<void>((resolve) => {
    finishRestore = resolve;
  });
}

export function finishAuthRestore(): void {
  finishRestore();
}

export function authRestored(): Promise<void> {
  return authRestore;
}

export function useHasAccessToken(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => accessToken !== null,
    () => false,
  );
}
