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
  vi.unstubAllGlobals();
  setRefreshExecutor(null);
  setAccessToken(null);
  __setRequestTimeoutsForTests(null);
  __resetRefreshStateForTests();
});

describe("installRefreshExecutor", () => {
  it("recovers once a hung keychain read starts answering again", async () => {
    __setRequestTimeoutsForTests({ request: 10, boot: 1000 });
    setAccessToken("still-valid");
    const get = vi
      .fn<() => Promise<string | null>>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue("stored-refresh");
    const set = vi.fn().mockResolvedValue(undefined);
    const bridge = { secrets: { get, set, delete: vi.fn() } } as unknown as PlatformBridge;
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: "fresh", refresh_token: "rotated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    installRefreshExecutor(bridge, "refresh-key");

    await expect(refreshAccessToken()).rejects.toSatisfy(isRefreshTransient);
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(refreshAccessToken()).resolves.toBe("fresh");
    expect(get).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith("refresh-key", "rotated");
  });

  it("does not rotate the token when a timed-out keychain read answers late", async () => {
    __setRequestTimeoutsForTests({ request: 10, boot: 1000 });
    setAccessToken("still-valid");
    let answer: (value: string | null) => void = () => {};
    const get = vi.fn(() => new Promise<string | null>((resolve) => (answer = resolve)));
    const bridge = { secrets: { get, set: vi.fn(), delete: vi.fn() } } as unknown as PlatformBridge;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    installRefreshExecutor(bridge, "refresh-key");

    await expect(refreshAccessToken()).rejects.toSatisfy(isRefreshTransient);
    answer("stored-refresh");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
