const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 5 * 60 * 1000;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

export function realtimeRefreshDelay(
  expiresAt: number | null | undefined,
  now: number = Date.now(),
): number {
  if (!expiresAt) return MAX_DELAY_MS;
  const raw = expiresAt * 1000 - now - REFRESH_MARGIN_MS;
  return Math.min(Math.max(raw, MIN_DELAY_MS), MAX_DELAY_MS);
}

export function realtimeRetryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? MAX_DELAY_MS;
}
