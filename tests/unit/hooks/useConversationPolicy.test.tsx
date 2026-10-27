import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

let captured: ((e: MessageEvent) => void) | null = null;
vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (_t: string | null, onMessage: (e: MessageEvent) => void) => {
    captured = onMessage;
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { useConversationActivityMercure } from "@/hooks/useMercure";
import { queryKeys } from "@/queries/queryKeys";
import type { Conversation } from "@/types/api";

const base = {
  identifier: "abc",
  readOnly: false,
  readOnlyReason: null,
} as unknown as Conversation;

describe("conversation.policy", () => {
  it("patches cached detail and list", () => {
    const qc = new QueryClient();
    vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    qc.setQueryData(queryKeys.conversation("abc"), base);
    qc.setQueryData(queryKeys.conversations(), [base]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useConversationActivityMercure(7), { wrapper });

    captured?.({
      data: JSON.stringify({
        type: "conversation.policy",
        conversationIdentifier: "abc",
        readOnly: true,
        readOnlyReason: "unavailable",
      }),
    } as MessageEvent);

    const detail = qc.getQueryData<Conversation>(queryKeys.conversation("abc"));
    const list = qc.getQueryData<Conversation[]>(queryKeys.conversations());
    expect(detail?.readOnly).toBe(true);
    expect(detail?.readOnlyReason).toBe("unavailable");
    expect(list?.[0]?.readOnly).toBe(true);
    expect(list?.[0]?.readOnlyReason).toBe("unavailable");
    expect(qc.invalidateQueries).toHaveBeenCalled();
  });
});
