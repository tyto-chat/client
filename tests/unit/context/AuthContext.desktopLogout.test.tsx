import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import {
  addIdentity,
  createDefaultConfig,
  identityKind,
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
} from "@/desktop/desktopConfig";
import * as authApi from "@/api/auth";

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe("AuthContext logout in desktop mode", () => {
  beforeEach(() => {
    configureApiClient(BASE);
    setAccessToken("test-token");
    vi.stubEnv("VITE_APP_MODE", "desktop");
    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    server.use(
      http.get(`${BASE}/api/v1/realtime/public-token`, () =>
        HttpResponse.json({ token: null, expiresAt: null }),
      ),
      http.get(`${BASE}/api/v1/me`, () => HttpResponse.json(mockUser)),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    authApi.setRefreshExecutor(null);
    setPlatformBridgeForTests(null);
  });

  it("wipes both secrets, downgrades the identity to a guest entry, clears the executor, and hard-navigates home", async () => {
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);

    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "i1",
      serverUrl: "https://srv.example",
      email: "a@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "i1");
    await saveDesktopConfig(bridge, cfg);

    const refreshKey = secretKey(pid, "i1", "refreshToken");
    const passwordKey = secretKey(pid, "i1", "password");
    await bridge.secrets.set(refreshKey, "refresh-secret");
    await bridge.secrets.set(passwordKey, "password-secret");

    const executorSpy = vi.spyOn(authApi, "setRefreshExecutor");

    let capturedLogoutBody: unknown = null;
    server.use(
      http.post(`${BASE}/logout`, async ({ request }) => {
        capturedLogoutBody = await request.json();

        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useAuthContext(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(await bridge.secrets.get(refreshKey)).toBeNull();
    expect(await bridge.secrets.get(passwordKey)).toBeNull();
    expect(executorSpy).toHaveBeenCalledWith(null);
    expect(window.location.replace).toHaveBeenCalledWith("/");
    expect(capturedLogoutBody).toEqual({ refresh_token: "refresh-secret" });

    const saved = await loadDesktopConfig(bridge);
    const identity = saved.profiles.find((p) => p.id === pid)!.identities[0]!;
    expect(identityKind(identity)).toBe("guest");
    expect(identity.email).toBe("a@b.c");
  });

  it("does not call /logout when no refreshToken secret is stored", async () => {
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);

    let cfg = createDefaultConfig();
    const pid = cfg.profiles[0]!.id;
    cfg = addIdentity(cfg, pid, {
      id: "i1",
      serverUrl: "https://srv.example",
      email: "a@b.c",
      userId: null,
      displayName: null,
    });
    cfg = setLastActiveIdentity(cfg, pid, "i1");
    await saveDesktopConfig(bridge, cfg);

    let logoutCalled = false;
    server.use(
      http.post(`${BASE}/logout`, () => {
        logoutCalled = true;

        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useAuthContext(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(logoutCalled).toBe(false);
  });
});

describe("AuthContext logout in web mode", () => {
  beforeEach(() => {
    configureApiClient(BASE);
    setAccessToken("test-token");
    vi.stubEnv("VITE_APP_MODE", "");
    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    server.use(
      http.get(`${BASE}/api/v1/realtime/public-token`, () =>
        HttpResponse.json({ token: null, expiresAt: null }),
      ),
      http.get(`${BASE}/api/v1/me`, () => HttpResponse.json(mockUser)),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    setPlatformBridgeForTests(null);
  });

  it("revokes via the cookie endpoint, touches no desktop config, and never hard-navigates", async () => {
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);

    let bodylessRevokes = 0;
    server.use(
      http.post(`${BASE}/logout`, async ({ request }) => {
        const raw = await request.text();
        if (!raw) bodylessRevokes += 1;

        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useAuthContext(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(bodylessRevokes).toBe(1);
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(await bridge.config.get()).toBeNull();
  });
});
