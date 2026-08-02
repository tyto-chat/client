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
  useAccountDeletionStatus,
  useCancelAccountDeletion,
  useRequestAccountDeletion,
} from "@/queries/accountDeletionQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { AccountDeletionStatus } from "@/api/accountDeletion";

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

beforeEach(() => {
  configureApiClient(BASE);
});

describe("useAccountDeletionStatus", () => {
  it("returns pending:false when not scheduled", async () => {
    server.use(
      http.get(`${BASE}/api/v1/me/account-deletion`, () => HttpResponse.json({ pending: false })),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useAccountDeletionStatus(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pending).toBe(false);
  });
});

describe("useRequestAccountDeletion", () => {
  it("primes the status cache from the response", async () => {
    server.use(
      http.post(`${BASE}/api/v1/me/account-deletion`, () =>
        HttpResponse.json({ pending: true, purgeAt: "2026-06-06T00:00:00Z" }),
      ),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useRequestAccountDeletion(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      const out = await result.current.mutateAsync();
      expect(out.pending).toBe(true);
    });

    const cached = qc.getQueryData<AccountDeletionStatus>(queryKeys.accountDeletion());
    expect(cached?.pending).toBe(true);
    expect(cached?.purgeAt).toBe("2026-06-06T00:00:00Z");
  });
});

describe("useCancelAccountDeletion", () => {
  it("flips the cached status back to pending:false", async () => {
    const qc = makeQueryClient();
    qc.setQueryData<AccountDeletionStatus>(queryKeys.accountDeletion(), {
      pending: true,
      purgeAt: "2026-06-06T00:00:00Z",
    });

    server.use(
      http.delete(
        `${BASE}/api/v1/me/account-deletion`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const { result } = renderHook(() => useCancelAccountDeletion(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(qc.getQueryData<AccountDeletionStatus>(queryKeys.accountDeletion())?.pending).toBe(
      false,
    );
  });
});
