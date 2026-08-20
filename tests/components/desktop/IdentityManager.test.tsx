import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { IdentityManagerModal } from "@/desktop/IdentityManagerModal";
import {
  ConnectionsContext,
  type ConnectionsContextValue,
} from "@/desktop/connections/ConnectionsContext";
import type {
  ConnectionRegistry,
  RegistrySnapshot,
} from "@/desktop/connections/ConnectionRegistry";
import type { ConnectionSnapshot } from "@/desktop/connections/IdentityConnection";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import {
  addIdentity,
  createDefaultConfig,
  identityKind,
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  type DesktopIdentity,
} from "@/desktop/desktopConfig";

const ORIGIN_A = "https://alpha.example";
const ORIGIN_B = "https://beta.example";

function connectionSnapshot(overrides: Partial<ConnectionSnapshot> = {}): ConnectionSnapshot {
  return {
    identityId: "ia",
    kind: "identity" as const,
    status: "healthy",
    serverName: "Alpha",
    origin: ORIGIN_A,
    userId: 1,
    communities: [],
    unreadCounts: {},
    conversationActivityAt: null,
    error: null,
    ...overrides,
  };
}

function community(id: number, name: string, pinned: boolean) {
  return {
    id,
    identifier: name.toLowerCase(),
    name,
    logoUrl: null,
    accentColor: null,
    iri: null,
    member: true,
    pinned,
    isPrivate: false,
  };
}

function makeRegistry(
  connections: ConnectionSnapshot[],
  activeIdentityId: string | null,
  overrides: Partial<ConnectionRegistry> = {},
): ConnectionRegistry {
  const snapshot: RegistrySnapshot = { connections, activeIdentityId };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    getConnection: () => ({ serverInfo: () => ({ apiUrl: `${ORIGIN_A}/api` }) }),
    downgradeToGuestSession: vi.fn(),
    upgradeToIdentity: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  } as unknown as ConnectionRegistry;
}

function wrapper(registry: ConnectionRegistry, switchTo = vi.fn().mockResolvedValue(undefined)) {
  const value: ConnectionsContextValue = { registry, switchTo };
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <ConnectionsContext.Provider value={value}>{children}</ConnectionsContext.Provider>;
  };
}

async function seed(identities: DesktopIdentity[]) {
  const bridge = createFakePlatformBridge();
  setPlatformBridgeForTests(bridge);
  let cfg = createDefaultConfig();
  const pid = cfg.profiles[0]!.id;
  for (const identity of identities) cfg = addIdentity(cfg, pid, identity);
  await saveDesktopConfig(bridge, cfg);
  for (const identity of identities) {
    await bridge.secrets.set(secretKey(pid, identity.id, "refreshToken"), `r-${identity.id}`);
    await bridge.secrets.set(secretKey(pid, identity.id, "password"), `p-${identity.id}`);
  }
  return { bridge, pid };
}

const alpha: DesktopIdentity = {
  id: "ia",
  serverUrl: ORIGIN_A,
  email: "ada@example.com",
  userId: 1,
  displayName: "Ada Lovelace",
  avatarColorKey: "/api/profiles/1",
};

const betaGuest: DesktopIdentity = {
  id: "ib",
  serverUrl: ORIGIN_B,
  email: "",
  userId: null,
  displayName: null,
  kind: "guest",
};

beforeEach(() => {
  vi.stubEnv("VITE_APP_MODE", "desktop");
  localStorage.clear();
  server.use(
    http.post(`${ORIGIN_A}/api/logout`, () => new HttpResponse(null, { status: 204 })),
    http.post(`${ORIGIN_B}/api/logout`, () => new HttpResponse(null, { status: 204 })),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  setPlatformBridgeForTests(null);
});

describe("IdentityManagerModal", () => {
  it("shows the cached identity, its server and its pinned communities", async () => {
    await seed([alpha]);
    const registry = makeRegistry(
      [
        connectionSnapshot({
          communities: [community(1, "Design", true), community(2, "Ops", false)],
        }),
      ],
      "ia",
    );

    render(<IdentityManagerModal onClose={vi.fn()} />, { wrapper: wrapper(registry) });

    const card = await screen.findByTestId("identity-card");
    expect(within(card).getByTestId("identity-card-name")).toHaveTextContent("Ada Lovelace");
    expect(within(card).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(card).getByText("Alpha")).toBeInTheDocument();
    expect(within(card).getByText(ORIGIN_A)).toBeInTheDocument();
    expect(within(card).getByTestId("identity-card-active")).toBeInTheDocument();

    const tiles = within(card).getByTestId("identity-card-communities");
    expect(within(tiles).getAllByRole("listitem")).toHaveLength(1);
    expect(within(tiles).getByTitle("Design")).toBeInTheDocument();
  });

  it("keeps the cached identity visible on a signed-out entry, labelled as signed out", async () => {
    await seed([{ ...alpha, kind: "guest" }]);
    const registry = makeRegistry([connectionSnapshot({ kind: "guest" })], "ia");

    render(<IdentityManagerModal onClose={vi.fn()} />, { wrapper: wrapper(registry) });

    const card = await screen.findByTestId("identity-card");
    expect(within(card).getByTestId("identity-card-name")).toHaveTextContent("Ada Lovelace");
    expect(within(card).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(card).getByTestId("identity-card-signed-out")).toHaveTextContent("Signed out");
    expect(within(card).getByTestId("identity-sign-in")).toBeInTheDocument();
    expect(within(card).queryByText("Not signed in")).not.toBeInTheDocument();
  });

  it("labels a never-signed-in guest entry as not signed in and offers sign-in instead of sign-out", async () => {
    await seed([betaGuest]);
    const registry = makeRegistry(
      [
        connectionSnapshot({
          identityId: "ib",
          kind: "guest",
          serverName: "Beta",
          origin: ORIGIN_B,
        }),
      ],
      "ib",
    );

    render(<IdentityManagerModal onClose={vi.fn()} />, { wrapper: wrapper(registry) });

    const card = await screen.findByTestId("identity-card");
    expect(within(card).getByTestId("identity-card-name")).toHaveTextContent("Not signed in");
    expect(within(card).queryByTestId("identity-card-signed-out")).not.toBeInTheDocument();
    expect(within(card).getByTestId("identity-sign-in")).toBeInTheDocument();
    expect(within(card).queryByTestId("identity-sign-out")).not.toBeInTheDocument();
  });

  it("switches to a background identity and closes", async () => {
    await seed([alpha, betaGuest]);
    const switchTo = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const registry = makeRegistry(
      [
        connectionSnapshot(),
        connectionSnapshot({ identityId: "ib", serverName: "Beta", origin: ORIGIN_B }),
      ],
      "ia",
    );
    const user = userEvent.setup();

    render(<IdentityManagerModal onClose={onClose} />, { wrapper: wrapper(registry, switchTo) });

    const cards = await screen.findAllByTestId("identity-card");
    expect(within(cards[0]!).queryByTestId("identity-switch")).not.toBeInTheDocument();
    await user.click(within(cards[1]!).getByTestId("identity-switch"));

    expect(switchTo).toHaveBeenCalledWith("ib");
  });

  it("signs an identity out, flipping it to a guest entry and wiping both secrets", async () => {
    const { bridge, pid } = await seed([alpha]);
    const downgrade = vi.fn();
    const registry = makeRegistry([connectionSnapshot()], "ia", {
      downgradeToGuestSession: downgrade,
    });
    const user = userEvent.setup();

    render(<IdentityManagerModal onClose={vi.fn()} />, { wrapper: wrapper(registry) });

    await user.click(await screen.findByTestId("identity-sign-out"));

    await waitFor(() =>
      expect(downgrade).toHaveBeenCalledWith(expect.objectContaining({ id: "ia" })),
    );
    const saved = await loadDesktopConfig(bridge);
    expect(identityKind(saved.profiles[0]!.identities[0]!)).toBe("guest");
    expect(await bridge.secrets.get(secretKey(pid, "ia", "password"))).toBeNull();
    expect(await bridge.secrets.get(secretKey(pid, "ia", "refreshToken"))).toBeNull();
  });

  it("removes an identity only after the destructive confirmation is accepted", async () => {
    const { bridge } = await seed([alpha, betaGuest]);
    const remove = vi.fn();
    const registry = makeRegistry(
      [
        connectionSnapshot(),
        connectionSnapshot({
          identityId: "ib",
          kind: "guest",
          serverName: "Beta",
          origin: ORIGIN_B,
        }),
      ],
      "ia",
      { remove },
    );
    const user = userEvent.setup();

    render(<IdentityManagerModal onClose={vi.fn()} />, { wrapper: wrapper(registry) });

    const cards = await screen.findAllByTestId("identity-card");
    await user.click(within(cards[1]!).getByTestId("identity-remove"));
    const dialog = (await screen.findByText(/Remove your identity/)).closest(
      "[role=dialog]",
    ) as HTMLElement;
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(cards[1]!).getByTestId("identity-remove"));
    const again = (await screen.findByText(/Remove your identity/)).closest(
      "[role=dialog]",
    ) as HTMLElement;
    await user.click(within(again).getByRole("button", { name: "Remove identity" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("ib"));
    const saved = await loadDesktopConfig(bridge);
    expect(saved.profiles[0]!.identities.map((i) => i.id)).toEqual(["ia"]);
  });
});
