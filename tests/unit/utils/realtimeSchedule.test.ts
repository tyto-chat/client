import { describe, expect, it } from "vitest";
import { realtimeRefreshDelay, realtimeRetryDelay } from "@/utils/realtimeSchedule";

describe("realtimeRefreshDelay", () => {
  const now = 1_000_000_000_000;
  const at = (secondsFromNow: number) => Math.floor(now / 1000) + secondsFromNow;

  it("refreshes five minutes before expiry", () => {
    expect(realtimeRefreshDelay(at(600), now)).toBe(300_000);
  });

  it("never waits longer than five minutes, so a slow client clock cannot overshoot the hub kill", () => {
    expect(realtimeRefreshDelay(at(1200), now)).toBe(300_000);
    expect(realtimeRefreshDelay(at(3600), now)).toBe(300_000);
  });

  it("waits at least thirty seconds", () => {
    expect(realtimeRefreshDelay(at(60), now)).toBe(30_000);
    expect(realtimeRefreshDelay(at(-60), now)).toBe(30_000);
  });

  it("falls back to the cap without an expiry", () => {
    expect(realtimeRefreshDelay(null, now)).toBe(300_000);
    expect(realtimeRefreshDelay(undefined, now)).toBe(300_000);
  });
});

describe("realtimeRetryDelay", () => {
  it("backs off 5s, 15s, 30s, then 60s capped", () => {
    expect([0, 1, 2, 3, 4, 10].map(realtimeRetryDelay)).toEqual([
      5_000, 15_000, 30_000, 60_000, 60_000, 60_000,
    ]);
  });
});
