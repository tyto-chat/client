import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { ChannelModal } from "@/components/ChannelModal";
import type { Channel, ChannelSection } from "@/types/api";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouteContext: () => ({ serverInfo: { voiceEnabled: true } }),
}));

const notifyMock = vi.fn();
vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: notifyMock }),
}));

const COMMUNITY = "comm-1";

const section: ChannelSection = {
  "@id": `/api/communities/${COMMUNITY}/sections/1`,
  "@type": "ChannelSection",
  id: 1,
  name: "General",
  identifier: "general",
  position: 0,
};

const channel: Channel = {
  "@id": `/api/communities/${COMMUNITY}/channels/general-chat`,
  "@type": "Channel",
  id: 10,
  name: "general-chat",
  identifier: "general-chat",
  position: 0,
  section,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderEdit() {
  return render(
    <ChannelModal mode="edit" channel={channel} communityId={COMMUNITY} onClose={vi.fn()} />,
    { wrapper: makeWrapper() },
  );
}

beforeEach(() => {
  configureApiClient(BASE);
  navigateMock.mockReset();
  notifyMock.mockReset();
});

describe("ChannelModal delete danger zone", () => {
  it("edit mode shows a Delete channel button", () => {
    renderEdit();
    expect(screen.getByRole("button", { name: "Delete channel" })).toBeInTheDocument();
  });

  it("create mode has no Delete channel button", () => {
    render(
      <ChannelModal mode="create" communityId={COMMUNITY} section={section} onClose={vi.fn()} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByRole("button", { name: "Delete channel" })).not.toBeInTheDocument();
  });

  it("clicking Delete channel reveals confirm input with disabled confirm button", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole("button", { name: "Delete channel" }));

    expect(screen.getByPlaceholderText("general-chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeDisabled();
  });

  it("confirm button stays disabled on wrong name, enables on exact match", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole("button", { name: "Delete channel" }));
    const input = screen.getByPlaceholderText("general-chat");

    await user.type(input, "general");
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "general-chat");
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeEnabled();
  });

  it("confirming calls DELETE, closes modal and navigates to community root", async () => {
    let deleteCalled = false;
    server.use(
      http.delete(`${BASE}/api/v1/communities/${COMMUNITY}/channels/general-chat`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole("button", { name: "Delete channel" }));
    await user.type(screen.getByPlaceholderText("general-chat"), "general-chat");
    await user.click(screen.getByRole("button", { name: "Delete forever" }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/$communityId",
        params: { communityId: COMMUNITY },
      }),
    );
  });

  it("cancel returns to the delete button without calling the API", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole("button", { name: "Delete channel" }));
    await user.click(screen.getByRole("button", { name: "Keep channel" }));

    expect(screen.queryByPlaceholderText("general-chat")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete channel" })).toBeInTheDocument();
  });

  it("shows an error message when delete fails", async () => {
    server.use(
      http.delete(
        `${BASE}/api/v1/communities/${COMMUNITY}/channels/general-chat`,
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    const user = userEvent.setup();
    renderEdit();

    await user.click(screen.getByRole("button", { name: "Delete channel" }));
    await user.type(screen.getByPlaceholderText("general-chat"), "general-chat");
    await user.click(screen.getByRole("button", { name: "Delete forever" }));

    await waitFor(() =>
      expect(screen.getByText("Failed to delete the channel.")).toBeInTheDocument(),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
