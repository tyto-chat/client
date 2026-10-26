import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { ConversationReadOnlyBanner } from "@/components/dm/ConversationReadOnlyBanner";
import { MessageReactions } from "@/components/chat/MessageReactions";
import type { Message } from "@/types/api";

vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: null }) }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify }) }));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  notify.mockClear();
  configureApiClient(BASE);
  setAccessToken("test-token");
});

describe("ConversationReadOnlyBanner", () => {
  it("banner shows Unblock for reason blocked and generic text otherwise", async () => {
    let unblocked = false;
    server.use(
      http.delete(`${BASE}/api/v1/me/blocks/7`, () => {
        unblocked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { rerender } = render(<ConversationReadOnlyBanner reason="blocked" otherUserId={7} />, {
      wrapper: Wrapper,
    });
    expect(
      screen.getByText("You blocked this person. Unblock to send messages."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(unblocked).toBe(true));

    rerender(<ConversationReadOnlyBanner reason="unavailable" otherUserId={7} />);
    expect(screen.getByText("You can't send messages in this conversation.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unblock" })).not.toBeInTheDocument();

    rerender(<ConversationReadOnlyBanner reason={null} otherUserId={null} />);
    expect(screen.getByText("You can't send messages in this conversation.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unblock" })).not.toBeInTheDocument();
  });
});

describe("ConversationReadOnlyBanner failure", () => {
  it("shows an error toast when unblocking fails", async () => {
    server.use(
      http.delete(`${BASE}/api/v1/me/blocks/7`, () => new HttpResponse(null, { status: 500 })),
    );
    render(<ConversationReadOnlyBanner reason="blocked" otherUserId={7} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Couldn't update the block", "error"));
  });
});

describe("MessageReactions removeOnly", () => {
  it("removeOnly keeps own reaction chip clickable and disables others", async () => {
    const onToggle = vi.fn();
    const message = {
      "@id": "/api/messages/m1",
      reactions: {
        "👍": [{ id: 11, userId: 1 }],
        "🎉": [{ id: 12, userId: 2 }],
      },
    } as unknown as Message;

    render(
      <MessageReactions
        show
        message={message}
        currentUserId={1}
        communityIdentifier=""
        removeOnly
        onToggle={onToggle}
      />,
      { wrapper: Wrapper },
    );

    const own = screen.getByText("👍").closest("button")!;
    const other = screen.getByText("🎉").closest("button")!;
    expect(own).not.toBeDisabled();
    expect(other).toBeDisabled();
    expect(screen.queryByTitle(/add reaction/i)).not.toBeInTheDocument();

    await userEvent.click(own);
    expect(onToggle).toHaveBeenCalledWith("👍", 11);
  });
});
