import { afterEach, describe, expect, it, vi } from "vitest";
import { installRefreshExecutor } from "@/desktop/connectIdentity";
import {
  __resetRefreshStateForTests,
  isRefreshTransient,
  refreshAccessToken,
  setRefreshExecutor,
} from "@/api/auth";
import { __setRequestTimeoutsForTests } from "@/api/fetchWithDeadline";
import { setAccessToken } from "@/api/tokenStore";
import type { PlatformBridge } from "@/platform/PlatformBridge";

afterEach(() => {
  setRefreshExecutor(null);
  setAccessToken(null);
  __setRequestTimeoutsForTests(null);
  __resetRefreshStateForTests();
});

describe("installRefreshExecutor", () => {
  it("gives up on a hung keychain without starting a second refresh behind it", async () => {
    __setRequestTimeoutsForTests({ request: 10 });
    setAccessToken("still-valid");
    const get = vi.fn(() => new Promise<string | null>(() => {}));
    const bridge = { secrets: { get, set: vi.fn(), delete: vi.fn() } } as unknown as PlatformBridge;
    installRefreshExecutor(bridge, "refresh-key");

    await expect(refreshAccessToken()).rejects.toSatisfy(isRefreshTransient);
    await expect(refreshAccessToken()).rejects.toSatisfy(isRefreshTransient);

    expect(get).toHaveBeenCalledTimes(1);
  });
});
