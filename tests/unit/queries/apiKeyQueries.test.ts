import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useApiKeys, useIssueApiKey, useRevokeApiKey } from "@/queries/apiKeyQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { ApiKey, IssuedApiKey } from "@/types/api";

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

function keyFixture(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    "@id": "/api/api_keys/1",
    "@type": "ApiKey",
    id: 1,
    name: "CI bot",
    prefix: "pat_abc12345",
    scopes: ["profile:read"],
    createdAt: "2026-05-30T12:00:00Z",
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("useApiKeys", () => {
  it("fetches the current user's keys", async () => {
    server.use(
      http.get(`${BASE}/api/v1/me/api-keys`, () =>
        HttpResponse.json({ "hydra:member": [keyFixture()] }),
      ),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useApiKeys(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.name).toBe("CI bot");
  });
});

describe("useIssueApiKey", () => {
  it("returns the plaintext token from the server response", async () => {
    const issued: IssuedApiKey = {
      id: 42,
      name: "CI bot",
      prefix: "pat_xyz98765",
      scopes: ["messages:read"],
      plainToken: "pat_xyz98765aaaabbbbccccddddeeeeffff111122223333",
      createdAt: "2026-05-30T12:00:00Z",
      expiresAt: null,
    };
    server.use(http.post(`${BASE}/api/v1/me/api-keys`, () => HttpResponse.json(issued)));

    const qc = makeQueryClient();
    const { result } = renderHook(() => useIssueApiKey(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      const out = await result.current.mutateAsync({
        name: "CI bot",
        scopes: ["messages:read"],
      });
      expect(out.plainToken).toBe(issued.plainToken);
    });
  });
});

describe("useRevokeApiKey", () => {
  it("optimistically marks the key as revoked in the cache", async () => {
    const qc = makeQueryClient();
    qc.setQueryData<ApiKey[]>(queryKeys.apiKeys(), [keyFixture()]);

    server.use(
      http.delete(`${BASE}/api/v1/me/api-keys/1`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${BASE}/api/v1/me/api-keys`, () =>
        HttpResponse.json({ "hydra:member": [keyFixture({ revokedAt: "2026-05-30T13:00:00Z" })] }),
      ),
    );

    const { result } = renderHook(() => useRevokeApiKey(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    const cached = qc.getQueryData<ApiKey[]>(queryKeys.apiKeys());
    expect(cached?.[0]?.revokedAt).not.toBeNull();
  });
});
