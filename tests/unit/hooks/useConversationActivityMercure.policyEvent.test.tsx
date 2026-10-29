import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { getServerInfo, setServerInfo } from "@/api/serverInfo";
import { useConversationActivityMercure } from "@/hooks/useMercure";
import { useSendConversationMessage } from "@/queries/conversationQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { ServerInfo } from "@/types/api";

let captured: ((event: MessageEvent) => void) | null = null;
vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (_topic: string | null, onMessage: (event: MessageEvent) => void) => {
    captured = onMessage;
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setServerInfo({ apiUrl: BASE, encryptedDmsMode: "enabled" } as ServerInfo);
});

afterEach(() => vi.restoreAllMocks());

describe("server-wide policy events", () => {
  it("server_scope_policy_event_refetches_server_info", async () => {
    server.use(
      http.get(`${BASE}/api/v1/server-info`, () =>
        HttpResponse.json({ apiUrl: BASE, encryptedDmsMode: "required" }),
      ),
    );
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useConversationActivityMercure(7), { wrapper });

    captured?.({
      data: JSON.stringify({ type: "conversation.policy", scope: "server" }),
    } as MessageEvent);

    await waitFor(() => expect(getServerInfo()?.encryptedDmsMode).toBe("required"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["conversationPreflight"] });
  });

  it("read_only_422_triggers_refresh", async () => {
    server.use(
      http.post(`${BASE}/api/v1/conversations/c1/messages`, () =>
        HttpResponse.json({ error: "This conversation is read-only." }, { status: 422 }),
      ),
    );
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSendConversationMessage("c1", null), { wrapper });

    await expect(result.current.mutateAsync({ text: "hi" })).rejects.toBeDefined();

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.conversation("c1"),
      exact: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.conversations(), exact: true });
  });
});
