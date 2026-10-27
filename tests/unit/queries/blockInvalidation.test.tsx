import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { useBlockUser, useUnblockUser } from "@/queries/blockQueries";
import { queryKeys } from "@/queries/queryKeys";

const keys = {
  list: queryKeys.conversations(),
  detail: queryKeys.conversation("dm1"),
  pages: queryKeys.conversationPages("dm1"),
  messages: queryKeys.conversationMessages("dm1"),
};

function seeded() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const key of Object.values(keys)) qc.setQueryData(key, []);
  return qc;
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.post(`${BASE}/api/v1/me/blocks`, () =>
      HttpResponse.json({ userId: 7, name: "x", avatarUrl: null, blockedAt: "", inEffect: true }),
    ),
    http.delete(`${BASE}/api/v1/me/blocks/7`, () => new HttpResponse(null, { status: 204 })),
  );
});

describe.each([
  ["block", useBlockUser],
  ["unblock", useUnblockUser],
] as const)("%s mutation", (_name, useMutationHook) => {
  it("refetches the conversation list and details but not loaded DM pages", async () => {
    const qc = seeded();
    const { result } = renderHook(() => useMutationHook(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    await result.current.mutateAsync(7);

    await waitFor(() => expect(qc.getQueryState(keys.list)?.isInvalidated).toBe(true));
    expect(qc.getQueryState(keys.detail)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(keys.pages)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(keys.messages)?.isInvalidated).toBe(false);
  });
});
