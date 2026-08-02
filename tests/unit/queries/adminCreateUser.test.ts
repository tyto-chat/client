import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useCreateAdminUser } from "@/queries/adminUserQueries";
import type { AdminUserDetail } from "@/api/adminUsers";

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

function adminUserDetailFixture(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 42,
    email: "a@b.com",
    displayName: "A",
    isAdmin: false,
    isBot: false,
    isPendingDeletion: false,
    createdAt: "2026-06-04T00:00:00Z",
    apiKeyCount: 0,
    pushSubscriptionCount: 0,
    roles: ["ROLE_USER"],
    twoFactorEnabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("useCreateAdminUser", () => {
  it("posts the body and resolves with the created user", async () => {
    const created = adminUserDetailFixture({ id: 42, displayName: "A", email: "a@b.com" });
    let capturedBody: unknown = null;

    server.use(
      http.post(`${BASE}/api/v1/admin/users`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useCreateAdminUser(), { wrapper: makeWrapper(qc) });

    let out: AdminUserDetail | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({ name: "A", email: "a@b.com", communityIds: [1] });
    });

    expect(capturedBody).toEqual({ name: "A", email: "a@b.com", communityIds: [1] });
    expect(out).toEqual(created);
  });

  it("invalidates the admin users list on success", async () => {
    const created = adminUserDetailFixture();

    server.use(
      http.post(`${BASE}/api/v1/admin/users`, async () => {
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useCreateAdminUser(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ name: "A", email: "a@b.com" });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin", "users"], exact: false });
    });
  });
});
