import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactNode } from "react";
import { useSectionCollapsed } from "@/queries/userPreferencesQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { UserPreferences } from "@/api/userPreferences";
import { setAccessToken } from "@/api/tokenStore";

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

function seed(qc: QueryClient, sectionCollapse: Record<string, boolean> | null) {
  qc.setQueryData<UserPreferences>(queryKeys.userPreferences(), {
    theme: null,
    submitKey: null,
    locale: null,
    timezone: null,
    convertEmoticons: null,
    resumeLastLocation: null,
    sendTypingIndicator: null,
    desktopNotifications: null,
    sectionCollapse,
    updatedAt: "2026-06-03T00:00:00Z",
  });
}

beforeEach(() => {
  setAccessToken("test-token");
});

afterEach(() => {
  // Unmount before clearing the token: this afterEach runs before RTL's
  // auto-cleanup (LIFO), and the token-store change would otherwise update
  // still-mounted hooks outside act.
  cleanup();
  setAccessToken(null);
});

describe("useSectionCollapsed", () => {
  it("defaults Hidden to collapsed, others to expanded", () => {
    const qc = makeQueryClient();
    seed(qc, null);

    const { result: r1 } = renderHook(() => useSectionCollapsed("hidden:c1"), {
      wrapper: makeWrapper(qc),
    });
    expect(r1.current).toBe(true);

    const { result: r2 } = renderHook(() => useSectionCollapsed("fav:c1"), {
      wrapper: makeWrapper(qc),
    });
    expect(r2.current).toBe(false);

    const { result: r3 } = renderHook(() => useSectionCollapsed("42"), {
      wrapper: makeWrapper(qc),
    });
    expect(r3.current).toBe(false);
  });

  it("explicit map value overrides the default", () => {
    const qc = makeQueryClient();
    seed(qc, { "hidden:c1": false, "42": true });

    const { result: r1 } = renderHook(() => useSectionCollapsed("hidden:c1"), {
      wrapper: makeWrapper(qc),
    });
    expect(r1.current).toBe(false);

    const { result: r2 } = renderHook(() => useSectionCollapsed("42"), {
      wrapper: makeWrapper(qc),
    });
    expect(r2.current).toBe(true);
  });
});
