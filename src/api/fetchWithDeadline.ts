export const REQUEST_TIMEOUT_MS = 30_000;
export const BOOT_REQUEST_TIMEOUT_MS = 10_000;

interface TimeoutOverrides {
  request?: number;
  boot?: number;
}

let overrides: TimeoutOverrides = {};

export function requestTimeoutMs(): number {
  return overrides.request ?? REQUEST_TIMEOUT_MS;
}

export function bootRequestTimeoutMs(): number {
  return overrides.boot ?? BOOT_REQUEST_TIMEOUT_MS;
}

export function __setRequestTimeoutsForTests(next: TimeoutOverrides | null): void {
  overrides = next ?? {};
}

export class RequestDeadlineError extends Error {
  constructor() {
    super("request deadline exceeded");
    this.name = "RequestDeadlineError";
  }
}

export async function fetchWithDeadline(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new RequestDeadlineError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
