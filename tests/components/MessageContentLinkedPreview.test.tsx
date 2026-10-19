/**
 * @vitest-environment jsdom
 *
 * DOMPurify only sanitizes fully under jsdom; the autolinker needs its output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { MessageContent } from "@/components/chat/MessageContent";
import { TimezoneProvider } from "@/context/TimezoneContext";
import { configureApiClient } from "@/api/client";
import { mockUser } from "../fixtures";
import { clearFakeDirectory, fakeEndpoint, registerFakeDirectory } from "../mocks/serverDirectory";

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
  return { ...actual, useNavigate: () => vi.fn() };
});

const FOREIGN = "https://b.example";
const UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TimezoneProvider>{children}</TimezoneProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  configureApiClient("https://server.example.com/api/v1");
  switchMock.mockReset().mockResolvedValue(true);
  registerFakeDirectory([fakeEndpoint("ib", FOREIGN, { serverName: "Beta" })], "ia");
  server.use(
    http.get(`${FOREIGN}/api/v1/messages/${UUID}`, () =>
      HttpResponse.json({
        "@id": `/api/messages/${UUID}`,
        "@type": "Message",
        id: UUID,
        text: "From the other side",
        isDeleted: false,
        edited: false,
        createdAt: "2026-05-19T10:00:00Z",
        createdBy: mockUser,
        reactions: null,
        pageNumber: 1,
        communityIdentifier: "friends",
        channelIdentifier: "lounge",
      }),
    ),
    http.get(`${FOREIGN}/api/v1/communities/friends/channels/lounge`, () =>
      HttpResponse.json({ name: "lounge" }),
    ),
    http.get(`${FOREIGN}/api/v1/communities/friends`, () =>
      HttpResponse.json({ name: "Friends HQ" }),
    ),
  );
});
afterEach(clearFakeDirectory);

describe("MessageContent with a link to another added server", () => {
  it("renders the card above the body", async () => {
    render(<MessageContent text={`look ${FOREIGN}/m/${UUID}`} communityId="demo" />, { wrapper });

    await waitFor(() => expect(screen.getByText("From the other side")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId("linked-message-header")).toHaveTextContent(
        "#lounge · Friends HQ · Beta",
      ),
    );
  });

  it("renders no card for a host that is not an added server", () => {
    render(<MessageContent text={`look https://stranger.example/m/${UUID}`} />, { wrapper });
    expect(screen.queryByTestId("linked-message-header")).not.toBeInTheDocument();
    expect(document.querySelector("a[data-external-link]")).not.toBeNull();
  });

  it("switches to that server when the link in the body is clicked", async () => {
    render(<MessageContent text={`look ${FOREIGN}/m/${UUID}`} renderPermalinkPreview={false} />, {
      wrapper,
    });
    fireEvent.click(document.querySelector("a[data-internal-link]")!);
    expect(switchMock).toHaveBeenCalledWith("ib", {
      to: "/m/$messageId",
      params: { messageId: UUID },
    });
  });

  it("links an added server that registers after the first render", async () => {
    clearFakeDirectory();
    render(<MessageContent text={`look ${FOREIGN}/m/${UUID}`} renderPermalinkPreview={false} />, {
      wrapper,
    });
    expect(document.querySelector("a[data-external-link]")).not.toBeNull();

    registerFakeDirectory([fakeEndpoint("ib", FOREIGN)], "ia");

    await waitFor(() => expect(document.querySelector("a[data-internal-link]")).not.toBeNull());
  });
});
