import type { SessionLocks } from "@/e2ee/conversationSession";

type Mode = "shared" | "exclusive";

interface LockState {
  mode: Mode | null;
  holders: number;
  waiting: { mode: Mode; grant: () => void }[];
}

export class MemorySessionLocks implements SessionLocks {
  private readonly locks = new Map<string, LockState>();

  async request<T>(name: string, mode: Mode, task: () => Promise<T>): Promise<T> {
    await this.acquire(name, mode);
    try {
      return await task();
    } finally {
      this.release(name);
    }
  }

  private state(name: string): LockState {
    let state = this.locks.get(name);
    if (state === undefined) {
      state = { mode: null, holders: 0, waiting: [] };
      this.locks.set(name, state);
    }
    return state;
  }

  private acquire(name: string, mode: Mode): Promise<void> {
    const state = this.state(name);
    const free = state.holders === 0;
    const joinShared = mode === "shared" && state.mode === "shared" && state.waiting.length === 0;
    if (free || joinShared) {
      state.mode = mode;
      state.holders += 1;
      return Promise.resolve();
    }
    return new Promise((grant) => state.waiting.push({ mode, grant }));
  }

  private release(name: string): void {
    const state = this.state(name);
    state.holders -= 1;
    if (state.holders > 0) return;
    state.mode = null;
    const next = state.waiting[0];
    if (next === undefined) return;
    if (next.mode === "exclusive") {
      state.waiting.shift();
      state.mode = "exclusive";
      state.holders = 1;
      next.grant();
      return;
    }
    state.mode = "shared";
    while (state.waiting[0]?.mode === "shared") {
      state.holders += 1;
      state.waiting.shift()?.grant();
    }
  }
}
