import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommunityRail } from "@/components/CommunityRail";
import type { Community } from "@/types/api";

let mockCommunities: Community[] = [];
let mockPinnedItems: { community: Community; position: number }[] = [];
let mockMemberCommunityIds: number[] = [];
let mockRoles: string[] = [];

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    title,
    className,
  }: {
    children?: React.ReactNode;
    title?: string;
    className?: string;
  }) => (
    <a data-testid="community-tile" title={title} className={className}>
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
    data: mockMemberCommunityIds.map((id) => ({ communityId: id, communityIdentifier: `c${id}` })),
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, roles: mockRoles } }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock("@/context/AudioCallContext", () => ({
  useAudioCall: () => ({ activeCall: null }),
}));

vi.mock("@/platform/activeIdentity", () => ({
  getActiveIdentityKey: () => null,
}));

function community(id: number, identifier: string, name: string): Community {
  return { "@id": `/api/communities/${id}`, id, identifier, name } as unknown as Community;
}

describe("CommunityRail membership fade", () => {
  beforeEach(() => {
    mockCommunities = [];
    mockPinnedItems = [];
    mockMemberCommunityIds = [];
    mockRoles = [];
  });

  it("fades pinned communities the user has not joined", () => {
    const joined = community(1, "joined", "Joined");
    const browsed = community(2, "browsed", "Browsed");
    mockCommunities = [joined, browsed];
    mockPinnedItems = [
      { community: joined, position: 0 },
      { community: browsed, position: 1 },
    ];
    mockMemberCommunityIds = [1];

    render(<CommunityRail unreadCounts={{}} />);

    const tiles = screen.getAllByTestId("community-tile");
    expect(tiles[0]!.className).not.toContain("opacity-50");
    expect(tiles[1]!.className).toContain("opacity-50");
  });

  it("still fades non-joined communities for a global admin", () => {
    const browsed = community(2, "browsed", "Browsed");
    mockCommunities = [browsed];
    mockPinnedItems = [{ community: browsed, position: 0 }];
    mockMemberCommunityIds = [];
    mockRoles = ["ROLE_ADMIN"];

    render(<CommunityRail unreadCounts={{}} />);

    expect(screen.getByTestId("community-tile").className).toContain("opacity-50");
  });
});
