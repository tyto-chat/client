import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { DesktopApp } from "@/desktop/DesktopApp";
import { useAgentRegistry, useAgentsSnapshot } from "@/desktop/agents/AgentsContext";
import type { AgentRegistry } from "@/desktop/agents/AgentRegistry";
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
  registry: AgentRegistry;
  queryClient: QueryClient;
}

function Probe({
  activeIdentityId,
  onRender,
}: {
  activeIdentityId: string;
  onRender: (info: ProbeInfo) => void;
}) {
  const registry = useAgentRegistry();
  const snapshot = useAgentsSnapshot();
  const queryClient = useQueryClient();
  onRender({ activeIdentityId, registry, queryClient });
  return (
    <div data-testid="probe" data-active={snapshot.activeIdentityId ?? ""}>
      {snapshot.agents.length}
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
      expect(renders.at(-1)?.registry.getSnapshot().agents).toHaveLength(2);
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
    const clientForB = renders.at(-1)!.queryClient;
    expect(clientForB).not.toBe(clientForA);

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

    let capturedRegistry: AgentRegistry | null = null;
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
    await waitFor(() => expect(capturedRegistry?.getSnapshot().agents[0]?.status).toBe("healthy"));

    const stopAllSpy = vi.spyOn(capturedRegistry!, "stopAll");
    unmount();
    expect(stopAllSpy).toHaveBeenCalledTimes(1);
  });

  it("ends boot with the registry's delegating refresh executor, overriding the bootstrap-window one", async () => {
    stubHealthyServer(ORIGIN_A, "Alpha");
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seedOneIdentity(bridge);

    let capturedRegistry: AgentRegistry | null = null;
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
    await waitFor(() => expect(capturedRegistry?.getSnapshot().agents[0]?.status).toBe("healthy"));

    const agent = capturedRegistry!.getAgent("ia")!;
    const refreshSpy = vi.spyOn(agent, "refreshNow");

    setAccessToken("stale");
    await refreshAccessToken();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("renders the DesktopBootstrap wizard when there is no persisted identity, with no renderApp override", async () => {
    render(<DesktopApp />);
    expect(await screen.findByTestId("wizard-server-input")).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });
});
