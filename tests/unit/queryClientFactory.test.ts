import { describe, it, expect, beforeEach } from "vitest";
import type { AnyRouter } from "@tanstack/react-router";
import { createAppQueryClient } from "@/queryClientFactory";
import { ApiError } from "@/api/client";
import { recordNetworkFailure, recordNetworkSuccess } from "@/api/reachability";

const retry = createAppQueryClient({
  navigate: () => {},
} as unknown as AnyRouter).getDefaultOptions().queries?.retry as (
  failureCount: number,
  error: unknown,
) => boolean;

describe("query retry policy", () => {
  beforeEach(() => recordNetworkSuccess());

  it("retries a network failure once", () => {
    const error = new TypeError("Failed to fetch");
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(false);
  });

  it("does not retry network failures while the server is unreachable", () => {
    for (let i = 0; i < 3; i++) recordNetworkFailure();
    expect(retry(0, new TypeError("Failed to fetch"))).toBe(false);
  });

  it("keeps three retries for other errors", () => {
    const error = new ApiError(500, {});
    expect(retry(2, error)).toBe(true);
    expect(retry(3, error)).toBe(false);
  });
});
