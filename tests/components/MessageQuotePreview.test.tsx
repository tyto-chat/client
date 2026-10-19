import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../fixtures";
import { MessageQuotePreview } from "@/components/chat/MessageQuotePreview";
import { TimezoneProvider } from "@/context/TimezoneContext";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

const TARGET_UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";

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
});

describe("MessageQuotePreview", () => {
  it("renders the linked message author and body on success", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () => HttpResponse.json(targetMessage)),
    );

    render(<MessageQuotePreview messageId={TARGET_UUID} />, { wrapper: makeWrapper() });

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

    render(<MessageQuotePreview messageId={TARGET_UUID} />, { wrapper: makeWrapper() });

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

    render(<MessageQuotePreview messageId={TARGET_UUID} />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/doesn't exist or you don't have permission/i)).toBeInTheDocument();
    });
  });

  it("navigates through the permalink resolver when clicked", async () => {
    server.use(
      http.get(`${BASE}/api/v1/messages/${TARGET_UUID}`, () => HttpResponse.json(targetMessage)),
    );

    render(<MessageQuotePreview messageId={TARGET_UUID} />, { wrapper: makeWrapper() });
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
      <MessageQuotePreview messageId={TARGET_UUID} selfMessageIri={targetMessage["@id"]} />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
