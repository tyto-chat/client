import { describe, it, expect, vi, beforeEach } from "vitest";
import { reorderSections, reorderChannels } from "@/api/channels";
import { apiClient } from "@/api/client";

describe("reorder API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("PUTs the section order", async () => {
    const spy = vi.spyOn(apiClient, "put").mockResolvedValue(undefined as never);
    await reorderSections("my-community", [3, 1, 2]);
    expect(spy).toHaveBeenCalledWith("/api/communities/my-community/sections/order", {
      sections: [3, 1, 2],
    });
  });

  it("PUTs the channel order", async () => {
    const spy = vi.spyOn(apiClient, "put").mockResolvedValue(undefined as never);
    await reorderChannels("my-community", 7, [9, 8]);
    expect(spy).toHaveBeenCalledWith("/api/communities/my-community/sections/7/channels/order", {
      channels: [9, 8],
    });
  });
});
