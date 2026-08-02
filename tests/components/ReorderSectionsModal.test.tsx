import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReorderSectionsModal } from "@/components/ReorderSectionsModal";
import type { ChannelSection } from "@/types/api";

const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/queries/channelQueries", () => ({
  useReorderSections: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
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

const section1: ChannelSection = {
  "@id": "/api/sections/1",
  "@type": "ChannelSection",
  id: 1,
  name: "General",
  identifier: "general",
  position: 0,
};

const section2: ChannelSection = {
  "@id": "/api/sections/2",
  "@type": "ChannelSection",
  id: 2,
  name: "Announcements",
  identifier: "announcements",
  position: 1,
};

beforeEach(() => {
  mutateAsyncMock.mockReset();
  mutateAsyncMock.mockResolvedValue(undefined);
});

describe("ReorderSectionsModal", () => {
  it("renders a sortable row for each section", () => {
    render(
      <ReorderSectionsModal
        communityId="test-community"
        sections={[section1, section2]}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    const rows = screen.getAllByTestId("sortable-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("General");
    expect(rows[1]).toHaveTextContent("Announcements");
  });

  it("calls mutateAsync with the current draft order when Save is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ReorderSectionsModal
        communityId="test-community"
        sections={[section1, section2]}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(mutateAsyncMock).toHaveBeenCalledOnce();
    expect(mutateAsyncMock).toHaveBeenCalledWith([1, 2]);
  });

  it("does not call mutateAsync when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ReorderSectionsModal
        communityId="test-community"
        sections={[section1, section2]}
        onClose={onClose}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
