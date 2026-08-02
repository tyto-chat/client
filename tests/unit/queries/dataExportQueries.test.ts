import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useDataExportStatus, useRequestDataExport } from "@/queries/dataExportQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { DataExportRequest } from "@/api/dataExport";

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

describe("useDataExportStatus", () => {
  it("returns pending:false when no active export", async () => {
    server.use(
      http.get(`${BASE}/api/v1/me/data-export`, () => HttpResponse.json({ pending: false })),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useDataExportStatus(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pending).toBe(false);
  });
});

describe("useRequestDataExport", () => {
  it("primes the status cache with the response", async () => {
    const response: DataExportRequest = {
      pending: true,
      id: 1,
      status: "ready",
      requestedAt: "2026-05-30T12:00:00Z",
      readyAt: "2026-05-30T12:00:01Z",
      expiresAt: "2026-06-06T12:00:01Z",
      fileSize: 1024,
      downloadUrl: "/api/me/data-export/download?token=abc",
    };
    server.use(
      http.post(`${BASE}/api/v1/me/data-export`, () =>
        HttpResponse.json(response, { status: 201 }),
      ),
    );

    const qc = makeQueryClient();
    const { result } = renderHook(() => useRequestDataExport(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync();
    });

    const cached = qc.getQueryData<DataExportRequest>(queryKeys.dataExport());
    expect(cached?.status).toBe("ready");
    expect(cached?.downloadUrl).toBe("/api/me/data-export/download?token=abc");
  });
});
