const FAILURE_THRESHOLD = 3;

let consecutiveFailures = 0;
let unreachable = false;
const listeners = new Set<() => void>();

function setUnreachable(next: boolean): void {
  if (next === unreachable) return;
  unreachable = next;
  listeners.forEach((listener) => listener());
}

export function recordNetworkFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_THRESHOLD) setUnreachable(true);
}

export function recordNetworkSuccess(): void {
  consecutiveFailures = 0;
  setUnreachable(false);
}

export function isServerUnreachable(): boolean {
  return unreachable;
}

export function subscribeReachability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
