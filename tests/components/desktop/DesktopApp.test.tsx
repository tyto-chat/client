import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { router } from "@/appShell";
import { DesktopApp } from "@/desktop/DesktopApp";
import {
  useConnectionRegistry,
  useConnectionsSnapshot,
  useSwitchIdentity,
} from "@/desktop/connections/ConnectionsContext";
import type { ConnectionRegistry } from "@/desktop/connections/ConnectionRegistry";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import {
  addIdentity,
  createDefaultConfig,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
} from "@/desktop/desktopConfig";
import { getAccessToken, setAccessToken } from "@/api/tokenStore";
import { __resetRefreshStateForTests, refreshAccessToken } from "@/api/auth";
import { _resetNegotiationForTests } from "@/api/apiVersion";
import { getBaseUrl } from "@/api/client";
import { executeIdentityRequest } from "@/platform/activeIdentity";

const ORIGIN_A = "https://a.example";
const ORIGIN_B = "https://b.example";

function stubHealthyServer(origin: string, name: string) {
  server.use(
    http.get(`${origin}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${origin}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${origin}/api`, name }),
    ),
    http.post(`${origin}/api/token/refresh`, () =>
      HttpResponse.json({ token: "jwt-live", refresh_token: "r2" }),
    ),
    http.get(`${origin}/api/v1/me`, () => HttpResponse.json({ id: 1 })),
    http.get(`${origin}/api/v1/me/community-memberships`, () =>
      HttpResponse.json({ "hydra:member": [] }),
    ),
    http.get(`${origin}/api/v1/me/pinned-communities`, () =>
      HttpResponse.json({ "hydra:member": [] }),
    ),
    http.get(`${origin}/api/v1/communities`, () => HttpResponse.json({ "hydra:member": [] })),
    http.get(`${origin}/api/v1/notifications/unread-counts`, () =>
      HttpResponse.json({ counts: {} }),
    ),
    http.get(`${origin}/api/v1/realtime/token`, () =>
      HttpResponse.json({ token: "rt", expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
    ),
  );
}

interface ProbeInfo {
  activeIdentityId: string;
  registry: ConnectionRegistry;
  queryClient: QueryClient;
  switchTo: ReturnType<typeof useSwitchIdentity>;
}

function Probe({
  activeIdentityId,
  onRender,
}: {
  activeIdentityId: string;
  onRender: (info: ProbeInfo) => void;
}) {
  const registry = useConnectionRegistry();
  const snapshot = useConnectionsSnapshot();
  const queryClient = useQueryClient();
  const switchTo = useSwitchIdentity();
  onRender({ activeIdentityId, registry, queryClient, switchTo });
  return (
    <div data-testid="probe" data-active={snapshot.activeIdentityId ?? ""}>
      {snapshot.connections.length}
    </div>
  );
}

async function seedTwoIdentities(bridge: ReturnType<typeof createFakePlatformBridge>) {
  let cfg = createDefaultConfig();
  const pid = cfg.profiles[0]!.id;
  cfg = addIdentity(cfg, pid, {
    id: "ia",
    serverUrl: ORIGIN_A,
    email: "a@x.io",
    userId: null,
    displayName: null,
  });
  cfg = addIdentity(cfg, pid, {
    id: "ib",
    serverUrl: ORIGIN_B,
    email: "b@x.io",
    userId: null,
    displayName: null,
  });
  cfg = setLastActiveIdentity(cfg, pid, "ia");
  await saveDesktopConfig(bridge, cfg);
  await bridge.secrets.set(secretKey(pid, "ia", "refreshToken"), "r1");
  await bridge.secrets.set(secretKey(pid, "ib", "refreshToken"), "r2");
  return pid;
}

async function seedOneIdentity(bridge: ReturnType<typeof createFakePlatformBridge>) {
  let cfg = createDefaultConfig();
  const pid = cfg.profiles[0]!.id;
  cfg = addIdentity(cfg, pid, {
    id: "ia",
    serverUrl: ORIGIN_A,
    email: "a@x.io",
    userId: null,
    displayName: null,
  });
  cfg = setLastActiveIdentity(cfg, pid, "ia");
  await saveDesktopConfig(bridge, cfg);
  await bridge.secrets.set(secretKey(pid, "ia", "refreshToken"), "r1");
  return pid;
}

describe("DesktopApp", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetNegotiationForTests();
    __resetRefreshStateForTests();
    setAccessToken(null);
    setPlatformBridgeForTests(createFakePlatformBridge());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("boots the registry from the persisted identities and hands renderApp the active identity", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    stubHealthyServer(ORIGIN_B, "Beta");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedTwoIdentities(bridge);

    const renders: ProbeInfo[] = [];

    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe activeIdentityId={activeIdentityId} onRender={(info) => renders.push(info)} />
        )}
      />,
    );

    await screen.findByTestId("probe");
    expect(getAccessToken()).toBe("jwt-live");

    await waitFor(() => {
      expect(renders.at(-1)?.registry.getSnapshot().connections).toHaveLength(2);
    });

    expect(renders[0]?.activeIdentityId).toBe("ia");
    expect(renders.at(-1)?.registry.getSnapshot().activeIdentityId).toBe("ia");

    const clientForA = renders.at(-1)!.queryClient;

    act(() => {
      renders.at(-1)!.registry.setActiveIdentity("ib");
    });

    await waitFor(() => {
      expect(renders.at(-1)?.activeIdentityId).toBe("ib");
    });
    expect(renders.at(-1)!.queryClient).toBe(clientForA);

    act(() => {
      renders.at(-1)!.registry.setActiveIdentity("ia");
    });
    await waitFor(() => {
      expect(renders.at(-1)?.activeIdentityId).toBe("ia");
    });
    expect(renders.at(-1)!.queryClient).toBe(clientForA);
  });

  it("stops the registry on unmount", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedOneIdentity(bridge);

    let capturedRegistry: ConnectionRegistry | null = null;
    const { unmount } = render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe
            activeIdentityId={activeIdentityId}
            onRender={(info) => {
              capturedRegistry = info.registry;
            }}
          />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() =>
      expect(capturedRegistry?.getSnapshot().connections[0]?.status).toBe("healthy"),
    );

    const stopAllSpy = vi.spyOn(capturedRegistry!, "stopAll");
    unmount();
    expect(stopAllSpy).toHaveBeenCalledTimes(1);
  });

  it("ends boot with the registry's delegating refresh executor, overriding the bootstrap-window one", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedOneIdentity(bridge);

    let capturedRegistry: ConnectionRegistry | null = null;
    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe
            activeIdentityId={activeIdentityId}
            onRender={(info) => {
              capturedRegistry = info.registry;
            }}
          />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() =>
      expect(capturedRegistry?.getSnapshot().connections[0]?.status).toBe("healthy"),
    );

    const connection = capturedRegistry!.getConnection("ia")!;
    const refreshSpy = vi.spyOn(connection, "refreshNow");

    setAccessToken("stale");
    await refreshAccessToken();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("renders the DesktopBootstrap wizard when there is no persisted identity, with no renderApp override", async () => {
    render(<DesktopApp />);
    expect(await screen.findByTestId("wizard-server-input")).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });

  it("switchTo keeps one stable QueryClient and transplants the per-identity cache, then navigates", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    stubHealthyServer(ORIGIN_B, "Beta");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedTwoIdentities(bridge);

    const renders: ProbeInfo[] = [];
    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe activeIdentityId={activeIdentityId} onRender={(info) => renders.push(info)} />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() => {
      expect(renders.at(-1)?.registry.getSnapshot().connections).toHaveLength(2);
    });
    await waitFor(() => {
      expect(
        renders
          .at(-1)
          ?.registry.getSnapshot()
          .connections.map((a) => a.status),
      ).toEqual(["healthy", "healthy"]);
    });

    const clientForA = renders.at(-1)!.queryClient;
    clientForA.setQueryData(["communities"], [{ id: 1, name: "Alpha club" }]);
    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(undefined);

    await act(async () => {
      await renders.at(-1)!.switchTo("ib");
    });

    await waitFor(() => {
      expect(renders.at(-1)?.activeIdentityId).toBe("ib");
    });

    expect(renders.at(-1)!.queryClient).toBe(clientForA);
    expect(clientForA.getQueryData(["communities"])).not.toEqual([{ id: 1, name: "Alpha club" }]);
    expect(getBaseUrl()).toBe(`${ORIGIN_B}/api`);
    expect(getAccessToken()).toBe("jwt-live");

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({ to: "/", replace: true });
    });

    await act(async () => {
      await renders.at(-1)!.switchTo("ia");
    });
    await waitFor(() => {
      expect(renders.at(-1)?.activeIdentityId).toBe("ia");
    });
    expect(clientForA.getQueryData(["communities"])).toEqual([{ id: 1, name: "Alpha club" }]);

    navigateSpy.mockRestore();
  });

  it("drops transplanted entries except rail keys so route loaders fetch fresh after a dormancy gap", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    stubHealthyServer(ORIGIN_B, "Beta");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedTwoIdentities(bridge);

    const renders: ProbeInfo[] = [];
    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe activeIdentityId={activeIdentityId} onRender={(info) => renders.push(info)} />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() => {
      expect(
        renders
          .at(-1)
          ?.registry.getSnapshot()
          .connections.map((a) => a.status),
      ).toEqual(["healthy", "healthy"]);
    });

    const client = renders.at(-1)!.queryClient;
    const participantsKey = ["channels", "alpha", "general", "participants"];
    client.setQueryData(participantsKey, [{ userId: 1 }]);
    client.setQueryData(["notifications", "unread-counts"], { counts: {} });
    client.setQueryData(["communities"], [{ id: 1 }]);
    client.setQueryData(["me", "pinned-communities"], { items: [] });
    client.setQueryData(["me", "community-memberships"], []);
    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(undefined);

    await act(async () => {
      await renders.at(-1)!.switchTo("ib");
    });
    await act(async () => {
      await renders.at(-1)!.switchTo("ia");
    });
    await waitFor(() => {
      expect(renders.at(-1)?.activeIdentityId).toBe("ia");
    });

    expect(client.getQueryData(participantsKey)).toBeUndefined();
    expect(client.getQueryData(["notifications", "unread-counts"])).toBeUndefined();
    expect(client.getQueryData(["communities"])).toEqual([{ id: 1 }]);
    expect(client.getQueryState(["communities"])?.isInvalidated).toBe(true);
    expect(client.getQueryData(["me", "pinned-communities"])).toEqual({ items: [] });
    expect(client.getQueryData(["me", "community-memberships"])).toEqual([]);

    navigateSpy.mockRestore();
  });

  it("switchTo navigates to the caller-supplied target once the new identity is active", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    stubHealthyServer(ORIGIN_B, "Beta");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedTwoIdentities(bridge);

    const renders: ProbeInfo[] = [];
    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe activeIdentityId={activeIdentityId} onRender={(info) => renders.push(info)} />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() => {
      expect(
        renders
          .at(-1)
          ?.registry.getSnapshot()
          .connections.map((a) => a.status),
      ).toEqual(["healthy", "healthy"]);
    });

    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(undefined);

    await act(async () => {
      await renders.at(-1)!.switchTo("ib", { to: "/$communityId", params: { communityId: "x" } });
    });

    await waitFor(() => {
      expect(renders.at(-1)?.activeIdentityId).toBe("ib");
    });
    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({
        to: "/$communityId",
        params: { communityId: "x" },
        replace: true,
      });
    });

    navigateSpy.mockRestore();
  });

  it("parks the router on /switching before the identity flips so the old route's observers unmount", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    stubHealthyServer(ORIGIN_B, "Beta");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedTwoIdentities(bridge);

    const renders: ProbeInfo[] = [];
    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe activeIdentityId={activeIdentityId} onRender={(info) => renders.push(info)} />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() => {
      expect(
        renders
          .at(-1)
          ?.registry.getSnapshot()
          .connections.map((a) => a.status),
      ).toEqual(["healthy", "healthy"]);
    });

    const activeAtHop: (string | null)[] = [];
    const navigateSpy = vi.spyOn(router, "navigate").mockImplementation((opts) => {
      if ((opts as { to?: string }).to === "/switching") {
        activeAtHop.push(renders.at(-1)!.registry.getSnapshot().activeIdentityId);
      }
      return Promise.resolve(undefined);
    });

    await act(async () => {
      await renders.at(-1)!.switchTo("ib", { to: "/$communityId", params: { communityId: "x" } });
    });
    await waitFor(() => {
      expect(renders.at(-1)?.activeIdentityId).toBe("ib");
    });

    expect(navigateSpy.mock.calls[0]![0]).toEqual({ to: "/switching" });
    expect(activeAtHop).toEqual(["ia"]);
    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({
        to: "/$communityId",
        params: { communityId: "x" },
        replace: true,
      });
    });

    navigateSpy.mockRestore();
  });

  it("returns the router to the previous location when the switch fails after the hop", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    stubHealthyServer(ORIGIN_B, "Beta");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedTwoIdentities(bridge);

    const renders: ProbeInfo[] = [];
    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe activeIdentityId={activeIdentityId} onRender={(info) => renders.push(info)} />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() => {
      expect(
        renders
          .at(-1)
          ?.registry.getSnapshot()
          .connections.map((a) => a.status),
      ).toEqual(["healthy", "healthy"]);
    });

    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(undefined);
    const backSpy = vi.spyOn(router.history, "back").mockImplementation(() => {});
    const connectionB = renders.at(-1)!.registry.getConnection("ib")!;
    vi.spyOn(connectionB, "getAccessToken").mockReturnValue(null);
    server.use(
      http.post(`${ORIGIN_B}/api/token/refresh`, () =>
        HttpResponse.json({ error: "invalid_refresh_token" }, { status: 401 }),
      ),
    );

    await expect(
      act(async () => {
        await renders.at(-1)!.switchTo("ib");
      }),
    ).rejects.toThrow();

    expect(navigateSpy.mock.calls[0]![0]).toEqual({ to: "/switching" });
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(renders.at(-1)?.activeIdentityId).toBe("ia");

    navigateSpy.mockRestore();
    backSpy.mockRestore();
  });

  it("switchTo to the already-active identity navigates directly without a pending re-render", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedOneIdentity(bridge);

    const renders: ProbeInfo[] = [];
    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe activeIdentityId={activeIdentityId} onRender={(info) => renders.push(info)} />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() => {
      expect(renders.at(-1)?.registry.getSnapshot().connections[0]?.status).toBe("healthy");
    });

    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(undefined);

    await act(async () => {
      await renders.at(-1)!.switchTo("ia", { to: "/$communityId", params: { communityId: "x" } });
    });

    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/$communityId",
      params: { communityId: "x" },
    });
    expect(renders.at(-1)?.activeIdentityId).toBe("ia");

    navigateSpy.mockRestore();
  });

  it("routes a cross-identity executeIdentityRequest through the registered executor to the owning server's correctly versioned URL", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    stubHealthyServer(ORIGIN_B, "Beta");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedTwoIdentities(bridge);

    let received: { url: string; method: string; authorization: string | null } | null = null;
    server.use(
      http.delete(`${ORIGIN_B}/api/v1/communities/alpha/channels/general/call`, ({ request }) => {
        received = {
          url: request.url,
          method: request.method,
          authorization: request.headers.get("Authorization"),
        };
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const renders: ProbeInfo[] = [];
    render(
      <DesktopApp
        renderApp={(activeIdentityId) => (
          <Probe activeIdentityId={activeIdentityId} onRender={(info) => renders.push(info)} />
        )}
      />,
    );

    await screen.findByTestId("probe");
    await waitFor(() => {
      expect(
        renders
          .at(-1)
          ?.registry.getSnapshot()
          .connections.map((a) => a.status),
      ).toEqual(["healthy", "healthy"]);
    });

    const handled = await executeIdentityRequest("ib", "/communities/alpha/channels/general/call", {
      method: "DELETE",
      keepalive: true,
    });

    expect(handled).toBe(true);
    await waitFor(() => expect(received).not.toBeNull());
    expect(received).toEqual({
      url: `${ORIGIN_B}/api/v1/communities/alpha/channels/general/call`,
      method: "DELETE",
      authorization: "Bearer jwt-live",
    });
  });
});
