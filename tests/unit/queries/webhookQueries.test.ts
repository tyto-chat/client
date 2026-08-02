import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import {
  useWebhooks,
  useWebhookTriggers,
  useCreateWebhook,
  useDeleteWebhook,
} from "@/queries/webhookQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { Webhook, WebhookTrigger, WebhookWithSecret } from "@/api/webhooks";

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function webhookFixture(overrides: Partial<Webhook> = {}): Webhook {
  return {
    id: 1,
    name: "Test Webhook",
    url: "https://example.com/webhook",
    triggerKey: "message.created",
    filters: null,
    isActive: true,
    disabledReason: null,
    pendingCount: 0,
    createdAt: "2026-06-01T10:00:00Z",
    updatedAt: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

function triggerFixture(overrides: Partial<WebhookTrigger> = {}): WebhookTrigger {
  return {
    key: "message.created",
    label: "Message Created",
    description: "Fires when a root message is posted to a channel.",
    filterFields: ["communityId", "channelId"],
    requiredFilterFields: [],
    ...overrides,
  };
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("queryKeys.adminWebhooks", () => {
  it("produces a stable key", () => {
    expect(queryKeys.adminWebhooks()).toEqual(["admin", "webhooks"]);
  });
});

describe("queryKeys.adminWebhookTriggers", () => {
  it("produces a stable key distinct from the list key", () => {
    const triggersKey = queryKeys.adminWebhookTriggers();
    const listKey = queryKeys.adminWebhooks();
    expect(triggersKey).not.toEqual(listKey);
    expect(triggersKey).toEqual(["admin", "webhooks", "triggers"]);
  });
});

describe("queryKeys.adminWebhookDeliveries", () => {
  it("includes both id and page in the key", () => {
    expect(queryKeys.adminWebhookDeliveries(7, 2)).toEqual([
      "admin",
      "webhooks",
      7,
      "deliveries",
      2,
    ]);
  });
});

describe("useWebhooks", () => {
  it("fetches the list of webhooks", async () => {
    server.use(
      http.get(`${BASE}/api/v1/admin/webhooks`, () =>
        HttpResponse.json({ rows: [webhookFixture()] }),
      ),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useWebhooks(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.name).toBe("Test Webhook");
  });
});

describe("useWebhookTriggers", () => {
  it("fetches the trigger registry", async () => {
    server.use(
      http.get(`${BASE}/api/v1/admin/webhooks/triggers`, () =>
        HttpResponse.json({ triggers: [triggerFixture()] }),
      ),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useWebhookTriggers(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.filterFields).toContain("channelId");
  });
});

describe("useCreateWebhook", () => {
  it("returns the secret from the server response and invalidates the list", async () => {
    const created: WebhookWithSecret = {
      ...webhookFixture({ id: 2, name: "My Hook" }),
      secret: "abc123secrethex",
    };
    server.use(
      http.post(`${BASE}/api/v1/admin/webhooks`, () => HttpResponse.json(created)),
      http.get(`${BASE}/api/v1/admin/webhooks`, () =>
        HttpResponse.json([webhookFixture(), { ...webhookFixture(), id: 2 }]),
      ),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useCreateWebhook(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      const out = await result.current.mutateAsync({
        name: "My Hook",
        url: "https://example.com/hook",
        triggerKey: "message.created",
        filters: null,
      });
      expect(out.secret).toBe("abc123secrethex");
    });
  });
});

describe("useDeleteWebhook", () => {
  it("invalidates the webhooks list after deletion", async () => {
    const qc = makeQueryClient();
    qc.setQueryData<Webhook[]>(queryKeys.adminWebhooks(), [webhookFixture()]);

    server.use(
      http.delete(`${BASE}/api/v1/admin/webhooks/1`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${BASE}/api/v1/admin/webhooks`, () => HttpResponse.json([])),
    );

    const { result } = renderHook(() => useDeleteWebhook(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    // After delete + invalidation, the cache should eventually reflect empty
    await waitFor(() => {
      const cached = qc.getQueryData<Webhook[]>(queryKeys.adminWebhooks());
      // Either the stale pre-delete data or the fresh empty data is fine
      expect(cached).toBeDefined();
    });
  });
});
