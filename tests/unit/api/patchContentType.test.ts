import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { patchAdminServerConfig } from "@/api/adminServerConfig";
import { updateWebhook } from "@/api/webhooks";

// Regression guard: API Platform PATCH operations accept ONLY
// application/merge-patch+json. Sending application/json (apiClient.patchJson)
// makes the server respond 415. These admin endpoints must use apiClient.patch.

beforeEach(() => {
  configureApiClient(BASE);
});

describe("admin PATCH endpoints send merge-patch content-type", () => {
  it("patchAdminServerConfig uses application/merge-patch+json", async () => {
    let contentType: string | null = null;
    server.use(
      http.patch(`${BASE}/api/v1/admin/server-config`, ({ request }) => {
        contentType = request.headers.get("Content-Type");
        return HttpResponse.json({ serverName: "x" });
      }),
    );
    await patchAdminServerConfig({ serverName: "x" });
    expect(contentType).toBe("application/merge-patch+json");
  });

  it("updateWebhook uses application/merge-patch+json", async () => {
    let contentType: string | null = null;
    server.use(
      http.patch(`${BASE}/api/v1/admin/webhooks/1`, ({ request }) => {
        contentType = request.headers.get("Content-Type");
        return HttpResponse.json({ id: 1 });
      }),
    );
    await updateWebhook(1, { isActive: false });
    expect(contentType).toBe("application/merge-patch+json");
  });
});
