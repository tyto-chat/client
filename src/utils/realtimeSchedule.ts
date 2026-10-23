const REFRESH_MARGIN_MS = 2 * 60 * 1000;
const MIN_DELAY_MS = 30_000;
const LEGACY_MARGIN_MS = 5 * 60 * 1000;
const LEGACY_MAX_DELAY_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

export interface RealtimeTokenExpiry {
  expiresAt?: number | null;
  expiresIn?: number | null;
}

export function realtimeRefreshDelay(
  expiry: RealtimeTokenExpiry | null | undefined,
  now: number = Date.now(),
): number {
  if (expiry?.expiresIn) {
    return Math.max(expiry.expiresIn * 1000 - REFRESH_MARGIN_MS, MIN_DELAY_MS);
  }
  if (!expiry?.expiresAt) return LEGACY_MAX_DELAY_MS;
  const raw = expiry.expiresAt * 1000 - now - LEGACY_MARGIN_MS;
  return Math.min(Math.max(raw, MIN_DELAY_MS), LEGACY_MAX_DELAY_MS);
}

export function realtimeRetryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? LEGACY_MAX_DELAY_MS;
}
