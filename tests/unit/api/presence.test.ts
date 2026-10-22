import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/api/client";
import { fetchPresence, PRESENCE_BATCH_SIZE } from "@/api/presence";

describe("fetchPresence", () => {
  afterEach(() => vi.restoreAllMocks());

  it("splits large id lists into batches the server accepts and merges the results", async () => {
    const getJson = vi.spyOn(apiClient, "getJson").mockImplementation(async (path: string) => {
      const ids = [...path.matchAll(/userIds\[\]=(\d+)/g)].map((m) => Number(m[1]));
      return { presences: ids.map((userId) => ({ userId, state: "online" })) };
    });
    const ids = Array.from({ length: PRESENCE_BATCH_SIZE * 2 + 5 }, (_, i) => i + 1);

    const result = await fetchPresence(ids);

    expect(getJson).toHaveBeenCalledTimes(3);
    for (const [path] of getJson.mock.calls) {
      expect((path as string).match(/userIds\[\]=/g)!.length).toBeLessThanOrEqual(
        PRESENCE_BATCH_SIZE,
      );
    }
    expect(result.presences.map((p) => p.userId)).toEqual(ids);
  });

  it("makes no request for an empty list", async () => {
    const getJson = vi.spyOn(apiClient, "getJson");
    expect(await fetchPresence([])).toEqual({ presences: [] });
    expect(getJson).not.toHaveBeenCalled();
  });
});
