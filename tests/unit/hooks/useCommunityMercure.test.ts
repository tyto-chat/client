import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

let captured: ((e: MessageEvent) => void) | null = null;
vi.mock("@/hooks/useMercureSubscription", () => ({
  useMercureSubscription: (_topic: string | null, onMessage: (e: MessageEvent) => void) => {
    captured = onMessage;
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { useCommunityMercure } from "@/hooks/useCommunityMercure";
import { queryKeys } from "@/queries/queryKeys";

function fire(payload: unknown) {
  captured?.({ data: JSON.stringify(payload) } as MessageEvent);
}

describe("useCommunityMercure", () => {
  let qc: QueryClient;
  let spy: ReturnType<typeof vi.spyOn>;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);

  beforeEach(() => {
    captured = null;
    qc = new QueryClient();
    spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined as never);
    renderHook(() => useCommunityMercure("my-com"), { wrapper });
  });

  it("invalidates community-scoped keys on community.structure", () => {
    fire({ type: "community.structure", communityIdentifier: "my-com" });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.community("my-com") });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.communityMembers("my-com") });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.communityPresenceSummary("my-com") });
  });

  it("refreshes the per-viewer membership queries on community.structure", () => {
    fire({ type: "community.structure", communityIdentifier: "my-com" });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.communityMembership("my-com") });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.myMemberships() });
  });

  it("invalidates on raw Channel entity events", () => {
    fire({ "@type": "Channel", "@id": "/api/channels/1" });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.community("my-com") });
  });

  it("ignores unrelated payloads", () => {
    fire({ type: "typing" });
    expect(spy).not.toHaveBeenCalled();
  });
});
