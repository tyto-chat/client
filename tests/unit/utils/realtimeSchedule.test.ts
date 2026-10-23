import { describe, expect, it } from "vitest";
import { realtimeRefreshDelay, realtimeRetryDelay } from "@/utils/realtimeSchedule";

describe("realtimeRefreshDelay", () => {
  const now = 1_000_000_000_000;
  const at = (secondsFromNow: number) => Math.floor(now / 1000) + secondsFromNow;

  it("refreshes two minutes before expiry, counted from the server's expiresIn", () => {
    expect(realtimeRefreshDelay({ expiresIn: 1800, expiresAt: at(1800) }, now)).toBe(1_680_000);
    expect(realtimeRefreshDelay({ expiresIn: 600 }, now)).toBe(480_000);
  });

  it("ignores the client clock when expiresIn is present", () => {
    expect(realtimeRefreshDelay({ expiresIn: 1800, expiresAt: at(-3600) }, now)).toBe(1_680_000);
  });

  it("waits at least thirty seconds", () => {
    expect(realtimeRefreshDelay({ expiresIn: 60 }, now)).toBe(30_000);
  });

  it("keeps the released expiresAt schedule for servers without expiresIn", () => {
    expect(realtimeRefreshDelay({ expiresAt: at(3600) }, now)).toBe(3_300_000);
    expect(realtimeRefreshDelay({ expiresAt: at(600) }, now)).toBe(300_000);
    expect(realtimeRefreshDelay({ expiresAt: at(60) }, now)).toBe(30_000);
  });

  it("falls back to 55 minutes without any expiry", () => {
    expect(realtimeRefreshDelay(null, now)).toBe(3_300_000);
    expect(realtimeRefreshDelay({ expiresAt: null }, now)).toBe(3_300_000);
  });
});

describe("realtimeRetryDelay", () => {
  it("backs off 5s, 15s, 30s, then 60s capped", () => {
    expect([0, 1, 2, 3, 4, 10].map(realtimeRetryDelay)).toEqual([
      5_000, 15_000, 30_000, 60_000, 60_000, 60_000,
    ]);
  });
});
