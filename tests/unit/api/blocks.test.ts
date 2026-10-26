import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/api/client";
import { blockUser, fetchBlockedUsers, unblockUser } from "@/api/blocks";
import { fetchInvitableUsers } from "@/api/conversations";

describe("blocks api", () => {
  afterEach(() => vi.restoreAllMocks());

  it("blockUser posts plain JSON to /api/me/blocks", async () => {
    const postJson = vi.spyOn(apiClient, "postJson").mockResolvedValue({ userId: 7 });
    await blockUser(7);
    expect(postJson).toHaveBeenCalledWith("/api/me/blocks", { userId: 7 });
  });

  it("unblockUser sends DELETE /api/me/blocks/7", async () => {
    const del = vi.spyOn(apiClient, "delete").mockResolvedValue(undefined);
    await unblockUser(7);
    expect(del).toHaveBeenCalledWith("/api/me/blocks/7");
  });

  it("fetchBlockedUsers unwraps items", async () => {
    vi.spyOn(apiClient, "getJson").mockResolvedValue({ items: [{ userId: 2 }] });
    expect(await fetchBlockedUsers()).toEqual([{ userId: 2 }]);
  });

  it("compose search requests purpose=dm", async () => {
    const getJson = vi.spyOn(apiClient, "getJson").mockResolvedValue({ items: [], total: 0 });
    await fetchInvitableUsers("bo", "dm");
    expect(getJson.mock.calls[0]![0]).toContain("purpose=dm");
    await fetchInvitableUsers("bo");
    expect(getJson.mock.calls[1]![0]).not.toContain("purpose");
  });
});
