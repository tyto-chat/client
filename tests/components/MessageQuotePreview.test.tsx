import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../fixtures";
import { MessageQuotePreview } from "@/components/chat/MessageQuotePreview";
import { TimezoneProvider } from "@/context/TimezoneContext";
import { registerServerDirectory, type ServerEndpoint } from "@/platform/serverDirectory";
import { clearFakeDirectory, fakeEndpoint, registerFakeDirectory } from "../mocks/serverDirectory";

const navigateMock = vi.fn();
const switchMock = vi.hoisted(() => vi.fn());
vi.mock("@/platform/activeIdentity", async () => {
  const actual = await vi.importActual<typeof import("@/platform/activeIdentity")>(
    "@/platform/activeIdentity",
  );
  return { ...actual, requestIdentitySwitch: switchMock };
});
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

const TARGET_UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";
const TARGET = { origin: new URL(BASE).origin, uuid: TARGET_UUID };

const targetMessage = {
  "@id": `/api/messages/${TARGET_UUID}`,
  "@type": "Message",
  id: TARGET_UUID,
  text: "Hello from preview",
  isDeleted: false,
  edited: false,
  createdAt: "2026-05-19T10:00:00Z",
  createdBy: mockUser,
  reactions: null,
  pageNumber: 3,
  communityIdentifier: "demo",
  channelIdentifier: "general",
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TimezoneProvider>{children}</TimezoneProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  configureApiClient(BASE);
  navigateMock.mockReset();
  switchMock.mockReset().mockResolvedValue(true);
  server.use(
    http.get(
      `${BASE}/api/v1/communities/:community/channels/:channel`,
      () => new HttpResponse(null, { status: 404 }),
    ),
    http.get(
      `${BASE}/api/v1/communities/:community`,
      () => new HttpResponse(null, { status: 404 }),
    ),
  );
});

afterEach(clearFakeDirectory);

describe("MessageQuotePreview", () => {
  it("renders the linked message author and body on success", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () => HttpResponse.json(targetMessage)),
    );

    render(<MessageQuotePreview target={TARGET} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });
    expect(screen.getByText("Hello from preview")).toBeInTheDocument();
  });

  it("renders image attachments as thumbnails, two at most", async () => {
    const image = (n: number) => ({
      "@id": `/api/v1/media_objects/${n}`,
      "@type": "MediaObject",
      contentUrl: `https://cdn.example/${n}.png`,
      originalName: `shot-${n}.png`,
      mimeType: "image/png",
      size: 1,
      width: 10,
      height: 10,
    });
    const file = { ...image(9), mimeType: "application/pdf", originalName: "doc.pdf" };
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () =>
        HttpResponse.json({ ...targetMessage, attachments: [file, image(1), image(2), image(3)] }),
      ),
    );

    render(<MessageQuotePreview target={TARGET} />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByAltText("shot-1.png")).toBeInTheDocument());
    expect(screen.getByAltText("shot-2.png")).toHaveAttribute("src", "https://cdn.example/2.png");
    expect(screen.queryByAltText("shot-3.png")).not.toBeInTheDocument();
    expect(screen.queryByAltText("doc.pdf")).not.toBeInTheDocument();
  });

  it("renders an 'unavailable' fallback on 404", async () => {
    server.use(
      http.get(
        `${BASE}/api/v1/messages/${TARGET_UUID}`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    render(<MessageQuotePreview target={TARGET} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/doesn't exist or you don't have permission/i)).toBeInTheDocument();
    });
  });

  it("navigates through the permalink resolver when clicked", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () => HttpResponse.json(targetMessage)),
    );

    render(<MessageQuotePreview target={TARGET} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText("Test User")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Test User").closest("[role=button]")!);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/m/$messageId",
      params: { messageId: TARGET_UUID },
    });
  });

  it("renders nothing when the linked message is the host message itself (self-link guard)", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () => HttpResponse.json(targetMessage)),
    );

    const { container } = render(
      <MessageQuotePreview target={TARGET} selfMessageIri={targetMessage["@id"]} />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});

const FOREIGN = "https://b.example";
const FOREIGN_TARGET = { origin: FOREIGN, uuid: TARGET_UUID };
const foreignMessage = {
  ...targetMessage,
  text: "Hello from a friend",
  communityIdentifier: "friends",
  channelIdentifier: "lounge",
};

function stubForeignPlaces() {
  server.use(
    http.get(`${FOREIGN}/api/v1/communities/friends/channels/lounge`, () =>
      HttpResponse.json({ name: "lounge" }),
    ),
    http.get(`${FOREIGN}/api/v1/communities/friends`, () =>
      HttpResponse.json({ name: "Friends HQ" }),
    ),
    http.get(`${FOREIGN}/api/v1/communities/friends/emojis`, () =>
      HttpResponse.json({ "hydra:member": [] }),
    ),
  );
}

describe("MessageQuotePreview header", () => {
  it("names only the channel for a link inside the same community", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () => HttpResponse.json(targetMessage)),
      http.get(`${BASE}/api/v1/communities/demo/channels/general`, () =>
        HttpResponse.json({ name: "general" }),
      ),
    );
    render(<MessageQuotePreview target={TARGET} hostCommunityId="demo" />, {
      wrapper: makeWrapper(),
    });
    expect(await screen.findByTestId("linked-message-header")).toHaveTextContent(/^#general$/);
  });

  it("adds the community for another community on the same server", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () => HttpResponse.json(targetMessage)),
      http.get(`${BASE}/api/v1/communities/demo/channels/general`, () =>
        HttpResponse.json({ name: "general" }),
      ),
      http.get(`${BASE}/api/v1/communities/demo`, () => HttpResponse.json({ name: "Demo Land" })),
    );
    render(<MessageQuotePreview target={TARGET} hostCommunityId="elsewhere" />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("linked-message-header")).toHaveTextContent("#general · Demo Land"),
    );
  });

  it("shows no header for a same-server direct message", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () =>
        HttpResponse.json({
          ...targetMessage,
          communityIdentifier: null,
          channelIdentifier: null,
          conversationIdentifier: "c-1",
        }),
      ),
    );
    render(<MessageQuotePreview target={TARGET} />, { wrapper: makeWrapper() });
    expect(await screen.findByText("Hello from preview")).toBeInTheDocument();
    expect(screen.queryByTestId("linked-message-header")).not.toBeInTheDocument();
  });
});

describe("MessageQuotePreview on another added server", () => {
  beforeEach(() => {
    registerFakeDirectory([fakeEndpoint("ib", FOREIGN, { serverName: "Beta" })], "ia");
    stubForeignPlaces();
  });

  it("renders author, body, thumbnails and a three-part header through the foreign connection", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${TARGET_UUID}`, ({ request }) => {
        auth = request.headers.get("Authorization");
        return HttpResponse.json({
          ...foreignMessage,
          attachments: [
            {
              "@id": "/api/v1/media_objects/1",
              "@type": "MediaObject",
              contentUrl: `${FOREIGN}/media/1.png`,
              originalName: "shot-1.png",
              mimeType: "image/png",
              size: 1,
              width: 10,
              height: 10,
            },
          ],
        });
      }),
    );
    render(<MessageQuotePreview target={FOREIGN_TARGET} hostCommunityId="demo" />, {
      wrapper: makeWrapper(),
    });

    expect(await screen.findByText("Hello from a friend")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByAltText("shot-1.png")).toHaveAttribute("src", `${FOREIGN}/media/1.png`);
    await waitFor(() =>
      expect(screen.getByTestId("linked-message-header")).toHaveTextContent(
        "#lounge · Friends HQ · Beta",
      ),
    );
    expect(auth).toBe("Bearer token-ib");
  });

  it.each([
    ["404", () => new HttpResponse(null, { status: 404 })],
    ["401", () => new HttpResponse(null, { status: 401 })],
    ["403", () => new HttpResponse(null, { status: 403 })],
    ["a network error", () => HttpResponse.error()],
    ["a malformed payload", () => HttpResponse.text("not json")],
  ])("renders nothing at all on %s", async (_label, respond) => {
    server.use(http.get(`${FOREIGN}/api/v1/messages/${TARGET_UUID}`, respond));
    const { container } = render(<MessageQuotePreview target={FOREIGN_TARGET} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(screen.queryByText(/unavailable|doesn't exist/i)).not.toBeInTheDocument();
  });

  it("renders nothing for a direct message on another server", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${TARGET_UUID}`, () =>
        HttpResponse.json({
          ...foreignMessage,
          communityIdentifier: null,
          channelIdentifier: null,
          conversationIdentifier: "c-9",
        }),
      ),
    );
    const { container } = render(<MessageQuotePreview target={FOREIGN_TARGET} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders the foreign community's custom emoji as an image", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${TARGET_UUID}`, () =>
        HttpResponse.json({ ...foreignMessage, text: "hi :owl: there" }),
      ),
      http.get(`${FOREIGN}/api/v1/communities/friends/emojis`, () =>
        HttpResponse.json({
          "hydra:member": [
            { shortcode: ":owl:", image: { contentUrl: `${FOREIGN}/media/owl.png` } },
          ],
        }),
      ),
    );
    render(<MessageQuotePreview target={FOREIGN_TARGET} />, { wrapper: makeWrapper() });
    const emoji = await screen.findByAltText(":owl:");
    expect(emoji).toHaveAttribute("src", `${FOREIGN}/media/owl.png`);
  });

  it("falls back to shortcode text when the emoji list cannot be read, keeping the card", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${TARGET_UUID}`, () =>
        HttpResponse.json({ ...foreignMessage, text: "hi :owl: there" }),
      ),
      http.get(
        `${FOREIGN}/api/v1/communities/friends/emojis`,
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    render(<MessageQuotePreview target={FOREIGN_TARGET} />, { wrapper: makeWrapper() });
    expect(await screen.findByText(/hi :owl: there/)).toBeInTheDocument();
    expect(screen.queryByAltText(":owl:")).not.toBeInTheDocument();
  });

  it("requests an identity switch to that server when clicked", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${TARGET_UUID}`, () =>
        HttpResponse.json(foreignMessage),
      ),
    );
    render(<MessageQuotePreview target={FOREIGN_TARGET} />, { wrapper: makeWrapper() });
    await userEvent.click(
      (await screen.findByText("Hello from a friend")).closest("[role=button]")!,
    );
    expect(switchMock).toHaveBeenCalledWith("ib", {
      to: "/m/$messageId",
      params: { messageId: TARGET_UUID },
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("degrades to nothing, without throwing, when the connection goes unhealthy while shown", async () => {
    server.use(
      http.get(`${FOREIGN}/api/v1/messages/${TARGET_UUID}`, () =>
        HttpResponse.json(foreignMessage),
      ),
    );
    const state: { endpoints: ServerEndpoint[] } = {
      endpoints: [fakeEndpoint("ib", FOREIGN, { serverName: "Beta" })],
    };
    let notify = () => {};
    registerServerDirectory({
      list: () => state.endpoints,
      activeIdentityId: () => "ia",
      subscribe: (listener) => {
        notify = listener;
        return () => {};
      },
    });
    const { container } = render(<MessageQuotePreview target={FOREIGN_TARGET} />, {
      wrapper: makeWrapper(),
    });
    expect(await screen.findByText("Hello from a friend")).toBeInTheDocument();

    state.endpoints = [fakeEndpoint("ib", FOREIGN, { status: "unreachable" })];
    act(() => notify());

    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
