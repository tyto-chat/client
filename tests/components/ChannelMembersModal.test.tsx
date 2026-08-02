import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../fixtures";
import { ChannelMembersModal } from "@/components/ChannelMembersModal";
import type { Channel, ChannelMember } from "@/types/api";

const COMMUNITY = "comm-1";
const CHANNEL_ID = "priv-ch";

const mockChannel: Channel = {
  "@id": `/api/communities/${COMMUNITY}/channels/${CHANNEL_ID}`,
  "@type": "Channel",
  id: 10,
  name: "priv-ch",
  identifier: CHANNEL_ID,
  position: 0,
  section: {
    "@id": `/api/communities/${COMMUNITY}/sections/1`,
    "@type": "ChannelSection",
    id: 1,
    name: "General",
    identifier: "general",
    position: 0,
  },
  isPrivate: true,
};

function makeChannelMember(overrides: Partial<ChannelMember> = {}): ChannelMember {
  return {
    "@id": "/api/channel_members/1",
    "@type": "ChannelMember",
    id: 1,
    userId: 1,
    profile: {
      "@id": "/api/profiles/1",
      "@type": "UserProfile",
      name: "Alice",
      avatar: null,
    },
    addedAt: "2025-01-01T00:00:00Z",
    role: "member",
    ...overrides,
  };
}

function setupMembersHandler(members: ChannelMember[]) {
  server.use(
    http.get(`${BASE}/api/v1/communities/${COMMUNITY}/channels/${CHANNEL_ID}/members`, () =>
      HttpResponse.json({
        "@context": "/api/contexts/ChannelMember",
        "@id": `/api/communities/${COMMUNITY}/channels/${CHANNEL_ID}/members`,
        "@type": "Collection",
        "hydra:member": members,
        totalItems: members.length,
      }),
    ),
  );
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  configureApiClient(BASE);
});

describe("ChannelMembersModal", () => {
  it("renders the channel name in the modal title", () => {
    setupMembersHandler([]);

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={1}
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText("#priv-ch — members")).toBeInTheDocument();
  });

  it('shows "No members yet." when the member list is empty', async () => {
    setupMembersHandler([]);

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={1}
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("No members yet.")).toBeInTheDocument());
  });

  it("renders each member's name", async () => {
    setupMembersHandler([
      makeChannelMember({
        id: 1,
        userId: 1,
        profile: { "@id": "/api/profiles/1", "@type": "UserProfile", name: "Alice", avatar: null },
      }),
      makeChannelMember({
        id: 2,
        userId: 2,
        profile: { "@id": "/api/profiles/2", "@type": "UserProfile", name: "Bob", avatar: null },
      }),
    ]);

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={1}
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it('shows "Mod" badge for moderator members', async () => {
    setupMembersHandler([makeChannelMember({ role: "moderator" })]);

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={1}
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("Mod")).toBeInTheDocument());
  });

  it('does not show "Mod" badge for regular members', async () => {
    setupMembersHandler([makeChannelMember({ role: "member" })]);

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={1}
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.queryByText("Mod")).not.toBeInTheDocument();
  });

  it('shows "Leave channel" button when current user is a non-admin member', async () => {
    setupMembersHandler([makeChannelMember({ userId: 42 })]);

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={42}
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Leave channel" })).toBeInTheDocument(),
    );
  });

  it('does not show "Leave channel" button for admins', async () => {
    setupMembersHandler([makeChannelMember({ userId: 42 })]);

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={42}
        isAdmin={true}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Leave channel" })).not.toBeInTheDocument();
  });

  it('does not show "Leave channel" button when current user is not in the member list', async () => {
    setupMembersHandler([makeChannelMember({ userId: 99 })]);

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={42} // not in list
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Leave channel" })).not.toBeInTheDocument();
  });

  it('clicking "Cancel" on the confirm step returns to the leave button', async () => {
    setupMembersHandler([makeChannelMember({ userId: 42 })]);
    const user = userEvent.setup();

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={42}
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Leave channel" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Leave channel" }));

    await waitFor(() => expect(screen.getByText("Leave this channel?")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Leave channel" })).toBeInTheDocument(),
    );
  });

  it("confirming leave calls the DELETE API and invokes onLeft", async () => {
    setupMembersHandler([makeChannelMember({ userId: 42 })]);

    let deleteCalled = false;
    server.use(
      http.delete(
        `${BASE}/api/v1/communities/${COMMUNITY}/channels/${CHANNEL_ID}/members/42`,
        () => {
          deleteCalled = true;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    const onLeft = vi.fn();
    const user = userEvent.setup();

    render(
      <ChannelMembersModal
        channel={mockChannel}
        communityId={COMMUNITY}
        currentUserId={42}
        isAdmin={false}
        onClose={vi.fn()}
        onLeft={onLeft}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Leave channel" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Leave channel" }));

    await waitFor(() => expect(screen.getByText("Leave this channel?")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(onLeft).toHaveBeenCalledOnce());
  });
});
