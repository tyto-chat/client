/**
 * @vitest-environment jsdom
 *
 * DOMPurify only sanitizes fully under jsdom; the autolinker needs its output.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { DesktopApp } from "@/desktop/DesktopApp";
import { MessageContent } from "@/components/chat/MessageContent";
import { TimezoneProvider } from "@/context/TimezoneContext";
import { createFakePlatformBridge } from "@/platform/fakePlatformBridge";
import { setPlatformBridgeForTests } from "@/platform/bridge";
import {
  addIdentity,
  createDefaultConfig,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
} from "@/desktop/desktopConfig";
import { setAccessToken } from "@/api/tokenStore";
import { __resetRefreshStateForTests } from "@/api/auth";
import { _resetNegotiationForTests } from "@/api/apiVersion";
import { mockUser } from "../../fixtures";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => vi.fn() };
});

const ORIGIN_A = "https://a.example";
const ORIGIN_B = "https://b.example";
const UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";

function stubServer(origin: string, name: string) {
  server.use(
    http.get(`${origin}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${origin}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${origin}/api`, name }),
    ),
    http.post(`${origin}/api/token/refresh`, () =>
      HttpResponse.json({ token: `jwt-${name}`, refresh_token: "r2" }),
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

async function seed(bridge: ReturnType<typeof createFakePlatformBridge>) {
  let cfg = createDefaultConfig();
  const pid = cfg.profiles[0]!.id;
  for (const [id, origin] of [
    ["ia", ORIGIN_A],
    ["ib", ORIGIN_B],
  ] as const) {
    cfg = addIdentity(cfg, pid, {
      id,
      serverUrl: origin,
      email: `${id}@x.io`,
      userId: null,
      displayName: null,
    });
    await bridge.secrets.set(secretKey(pid, id, "refreshToken"), `r-${id}`);
  }
  cfg = setLastActiveIdentity(cfg, pid, "ia");
  await saveDesktopConfig(bridge, cfg);
}

beforeEach(() => {
  localStorage.clear();
  _resetNegotiationForTests();
  __resetRefreshStateForTests();
  setAccessToken(null);
  setPlatformBridgeForTests(createFakePlatformBridge());
});

describe("cross-server preview inside the desktop app", () => {
  it("renders a pasted link to the second connection's server as a card with a three-part header and the foreign emoji", async () => {
    stubServer(ORIGIN_A, "Alpha");
    stubServer(ORIGIN_B, "Beta");
    let auth: string | null = null;
    server.use(
      http.get(`${ORIGIN_B}/api/v1/messages/${UUID}`, ({ request }) => {
        auth = request.headers.get("Authorization");
        return HttpResponse.json({
          "@id": `/api/messages/${UUID}`,
          "@type": "Message",
          id: UUID,
          text: "Greetings :owl: from Beta",
          isDeleted: false,
          edited: false,
          createdAt: "2026-05-19T10:00:00Z",
          createdBy: mockUser,
          reactions: null,
          pageNumber: 1,
          communityIdentifier: "friends",
          channelIdentifier: "lounge",
        });
      }),
      http.get(`${ORIGIN_B}/api/v1/communities/friends/channels/lounge`, () =>
        HttpResponse.json({ name: "lounge" }),
      ),
      http.get(`${ORIGIN_B}/api/v1/communities/friends`, () =>
        HttpResponse.json({ name: "Friends HQ" }),
      ),
      http.get(`${ORIGIN_B}/api/v1/communities/friends/emojis`, () =>
        HttpResponse.json({
          "hydra:member": [
            { shortcode: ":owl:", image: { contentUrl: `${ORIGIN_B}/media/owl.png` } },
          ],
        }),
      ),
    );
    const bridge = createFakePlatformBridge();
    setPlatformBridgeForTests(bridge);
    await seed(bridge);

    render(
      <DesktopApp
        renderApp={() => (
          <TimezoneProvider>
            <MessageContent text={`look ${ORIGIN_B}/m/${UUID}`} communityId="demo" />
          </TimezoneProvider>
        )}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("linked-message-header")).toHaveTextContent(
        "#lounge · Friends HQ · Beta",
      ),
    );
    expect(screen.getByAltText(":owl:")).toHaveAttribute("src", `${ORIGIN_B}/media/owl.png`);
    expect(auth).toBe("Bearer jwt-Beta");
  });
});
