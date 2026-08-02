/**
 * Minimal fake EventSource for Vitest (happy-dom).
 * MSW doesn't intercept EventSource; we install this fake on globalThis
 * so tests can dispatch synthetic events and simulate errors.
 */

export type FakeEventSourceInstance = {
  url: string;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  close: () => void;
  dispatch: (data: string) => void;
  triggerError: () => void;
};

const instances: FakeEventSourceInstance[] = [];

/** All EventSource instances created during the current test. */
export function getFakeEventSourceInstances(): FakeEventSourceInstance[] {
  return instances;
}

/** The most recently created EventSource instance. */
export function getLastFakeEventSource(): FakeEventSourceInstance | undefined {
  return instances[instances.length - 1];
}

class FakeEventSource {
  readonly url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  private _closed = false;

  constructor(url: string) {
    this.url = url;
    instances.push(this as unknown as FakeEventSourceInstance);
  }

  close() {
    this._closed = true;
  }

  dispatch(data: string) {
    if (this._closed) return;
    const e = new MessageEvent("message", { data });
    this.onmessage?.(e);
  }

  triggerError() {
    if (this._closed) return;
    this.onerror?.();
  }
}

(FakeEventSource as unknown as Record<string, number>).CONNECTING = 0;
(FakeEventSource as unknown as Record<string, number>).OPEN = 1;
(FakeEventSource as unknown as Record<string, number>).CLOSED = 2;

let _original: typeof EventSource | undefined;

export function installFakeEventSource(): void {
  _original = globalThis.EventSource as typeof EventSource;
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
}

export function uninstallFakeEventSource(): void {
  if (_original !== undefined) {
    globalThis.EventSource = _original;
  }
}

beforeEach(() => {
  instances.length = 0;
});
