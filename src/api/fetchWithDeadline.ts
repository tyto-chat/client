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

export function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestDeadlineError()), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

export async function fetchWithDeadline(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestDeadlineError());
    }, timeoutMs);
  });
  deadline.catch(() => {});
  try {
    const response = await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      deadline,
    ]);
    const body = NULL_BODY_STATUSES.has(response.status)
      ? null
      : await Promise.race([response.arrayBuffer(), deadline]);
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new RequestDeadlineError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
