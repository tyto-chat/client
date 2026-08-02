import { describe, it, expect, vi, beforeEach } from "vitest";
import { issueAdminUserApiKey } from "@/api/adminUsers";
import { apiClient } from "@/api/client";

describe("issueAdminUserApiKey", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("POSTs to the bot's admin api-keys endpoint", async () => {
    const spy = vi.spyOn(apiClient, "postJson").mockResolvedValue({
      id: 1,
      name: "k",
      prefix: "pat_abc",
      scopes: [],
      plainToken: "pat_x",
      createdAt: "",
      expiresAt: null,
    });

    await issueAdminUserApiKey(42, { name: "k", scopes: ["profile:read"], expiresAt: null });

    expect(spy).toHaveBeenCalledWith("/api/admin/users/42/api-keys", {
      name: "k",
      scopes: ["profile:read"],
      expiresAt: null,
    });
  });
});
