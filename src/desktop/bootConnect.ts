export interface BootTiming {
  retryDelaysMs: readonly number[];
  unreachableRetryMs: number;
}

const DEFAULT_TIMING: BootTiming = {
  retryDelaysMs: [2_000, 3_000, 5_000, 5_000, 5_000, 10_000],
  unreachableRetryMs: 15_000,
};

let timing: BootTiming = DEFAULT_TIMING;

export function getBootTiming(): BootTiming {
  return timing;
}

export function _setBootTimingForTests(next: Partial<BootTiming> | null): void {
  timing = next ? { ...DEFAULT_TIMING, ...next } : DEFAULT_TIMING;
}

export function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener("online", done);
    signal.addEventListener("abort", done);
  });
}
