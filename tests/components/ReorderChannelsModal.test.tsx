import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReorderChannelsModal } from "@/components/ReorderChannelsModal";
import type { Channel, ChannelSection } from "@/types/api";

const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/queries/channelQueries", () => ({
  useReorderChannels: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const section: ChannelSection = {
  "@id": "/api/sections/1",
  "@type": "ChannelSection",
  id: 1,
  name: "General",
  identifier: "general",
  position: 0,
};

const channel1: Channel = {
  "@id": "/api/channels/10",
  "@type": "Channel",
  id: 10,
  name: "announcements",
  identifier: "announcements",
  position: 0,
  section,
};

const channel2: Channel = {
  "@id": "/api/channels/11",
  "@type": "Channel",
  id: 11,
  name: "general",
  identifier: "general",
  position: 1,
  section,
};

const channel3: Channel = {
  "@id": "/api/channels/12",
  "@type": "Channel",
  id: 12,
  name: "off-topic",
  identifier: "off-topic",
  position: 2,
  section,
};

beforeEach(() => {
  mutateAsyncMock.mockReset();
  mutateAsyncMock.mockResolvedValue(undefined);
});

describe("ReorderChannelsModal", () => {
  it("renders a sortable row for each channel", () => {
    render(
      <ReorderChannelsModal
        communityId="test-community"
        sectionId={1}
        sectionName="General"
        channels={[channel1, channel2, channel3]}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    const rows = screen.getAllByTestId("sortable-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("announcements");
    expect(rows[1]).toHaveTextContent("general");
    expect(rows[2]).toHaveTextContent("off-topic");
  });

  it("calls mutateAsync with the current draft order when Save is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ReorderChannelsModal
        communityId="test-community"
        sectionId={1}
        sectionName="General"
        channels={[channel1, channel2, channel3]}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(mutateAsyncMock).toHaveBeenCalledOnce();
    expect(mutateAsyncMock).toHaveBeenCalledWith([10, 11, 12]);
  });

  it("does not call mutateAsync when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ReorderChannelsModal
        communityId="test-community"
        sectionId={1}
        sectionName="General"
        channels={[channel1, channel2, channel3]}
        onClose={onClose}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
