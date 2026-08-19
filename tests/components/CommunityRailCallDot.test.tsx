import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CommunityRail } from "@/components/CommunityRail";
import type { Community } from "@/types/api";

let mockActiveCall: {
  identityKey?: string | null;
  communityId: string;
  channel: { identifier: string };
} | null = null;
let mockActiveIdentityKey: string | null = null;
let mockCommunities: Community[] = [];
let mockPinnedItems: { community: Community; position: number }[] = [];

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, title }: { children?: React.ReactNode; title?: string }) => (
    <a data-testid="community-tile" title={title}>
      {children}
    </a>
  ),
  useParams: () => ({}),
}));

vi.mock("@/queries/communityQueries", () => ({
  useCommunities: () => ({ data: mockCommunities }),
  usePinnedCommunities: () => ({ data: { items: mockPinnedItems } }),
  useReorderPinnedCommunities: () => ({ mutate: vi.fn() }),
  usePinCommunity: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/queries/membershipQueries", () => ({
  useMyCommunityMemberships: () => ({
    data: mockCommunities.map((c) => ({ communityId: c.id, communityIdentifier: c.identifier })),
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, roles: [] } }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({ activeCall: mockActiveCall }),
}));

vi.mock("@/platform/activeIdentity", () => ({
  getActiveIdentityKey: () => mockActiveIdentityKey,
}));

function community(id: number, identifier: string, name: string): Community {
  return { "@id": `/api/communities/${id}`, id, identifier, name } as unknown as Community;
}

describe("CommunityRail call dot", () => {
  beforeEach(() => {
    mockActiveCall = null;
    mockActiveIdentityKey = null;
    mockCommunities = [];
    mockPinnedItems = [];
  });

  it("shows a green call dot on the pinned community owning the call (web mode)", () => {
    const sw = community(1, "sw", "Software");
    mockCommunities = [sw];
    mockPinnedItems = [{ community: sw, position: 0 }];
    mockActiveCall = { identityKey: null, communityId: "sw", channel: { identifier: "general" } };

    render(<CommunityRail unreadCounts={{}} />);

    const dot = screen.getByTestId("community-call-dot");
    expect(dot.className).toContain("bg-success");
  });

  it("shows no dot when the call belongs to a different identity", () => {
    const sw = community(1, "sw", "Software");
    mockCommunities = [sw];
    mockPinnedItems = [{ community: sw, position: 0 }];
    mockActiveIdentityKey = "ia";
    mockActiveCall = { identityKey: "ib", communityId: "sw", channel: { identifier: "general" } };

    render(<CommunityRail unreadCounts={{}} />);

    expect(screen.queryByTestId("community-call-dot")).not.toBeInTheDocument();
  });

  it("force-shows an unpinned call community as a tile, excluded from the +N overflow", () => {
    const gm = community(1, "gm", "Games");
    const sw = community(2, "sw", "Software");
    const xx = community(3, "xx", "Xtra");
    const yy = community(4, "yy", "Ygg");
    mockCommunities = [gm, sw, xx, yy];
    mockPinnedItems = [{ community: gm, position: 0 }];
    mockActiveCall = { identityKey: null, communityId: "sw", channel: { identifier: "general" } };

    render(<CommunityRail unreadCounts={{}} />);

    const tiles = screen.getAllByTestId("community-tile");
    expect(tiles.map((t) => t.getAttribute("title"))).toEqual(["Games", "Software"]);
    const swWrapper = tiles[1]!.parentElement!;
    expect(within(swWrapper).getByTestId("community-call-dot")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});
