import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { usePreferenceSync } from "@/hooks/usePreferenceSync";
import { useUserPreferences } from "@/queries/userPreferencesQueries";

const SERVER_PREFS = {
  theme: "dark",
  fontSize: null,
  submitKey: null,
  locale: null,
  timezone: null,
  sendTypingIndicator: null,
  desktopNotifications: null,
  convertEmoticons: null,
  resumeLastLocation: true,
  sectionCollapse: null,
  updatedAt: "2026-07-20T00:00:00Z",
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

let patchBodies: unknown[];
let preferenceFetches: number;

beforeEach(() => {
  patchBodies = [];
  preferenceFetches = 0;
  configureApiClient(BASE);
  setAccessToken("test-token");
  server.use(
    http.get(`${BASE}/api/v1/me/preferences`, () => {
      preferenceFetches += 1;
      return HttpResponse.json(SERVER_PREFS);
    }),
    http.patch(`${BASE}/api/v1/me/preferences`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patchBodies.push(body);
      return HttpResponse.json({ ...SERVER_PREFS, ...body });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function useHarness<K extends "theme" | "resumeLastLocation">(key: K, apply: (v: never) => void) {
  const prefs = useUserPreferences();
  const sync = usePreferenceSync(key, apply as never);
  return { loaded: prefs.isSuccess, writeToServer: sync.writeToServer };
}

describe("usePreferenceSync", () => {
  it("applies the server value and writes back in web mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "web");
    const apply = vi.fn();
    const { result } = renderHook(() => useHarness("theme", apply), { wrapper: makeWrapper() });

    await waitFor(() => expect(apply).toHaveBeenCalledWith("dark"));

    act(() => result.current.writeToServer("light" as never));
    await waitFor(() => expect(patchBodies).toEqual([{ theme: "light" }]));
  });

  it("neither applies nor writes a device-scoped key in managed mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const apply = vi.fn();
    const { result } = renderHook(() => useHarness("theme", apply), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.writeToServer("light" as never));
    await new Promise((r) => setTimeout(r, 50));

    expect(apply).not.toHaveBeenCalled();
    expect(patchBodies).toEqual([]);
  });

  it("does not fetch preferences for a device-scoped key in managed mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    renderHook(() => usePreferenceSync("theme", vi.fn()), { wrapper: makeWrapper() });

    await new Promise((r) => setTimeout(r, 50));

    expect(preferenceFetches).toBe(0);
  });

  it("keeps syncing account-scoped keys in managed mode", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    const apply = vi.fn();
    const { result } = renderHook(() => useHarness("resumeLastLocation", apply), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(apply).toHaveBeenCalledWith(true));

    act(() => result.current.writeToServer(false as never));
    await waitFor(() => expect(patchBodies).toEqual([{ resumeLastLocation: false }]));
  });
});
