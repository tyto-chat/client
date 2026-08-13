import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../fixtures";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import type { Community } from "@/types/api";

const COMMUNITY_ID = "dragon";

const fixtureCommunity = {
  id: 1,
  identifier: COMMUNITY_ID,
  name: "Dragon Community",
  channelSections: [],
  channels: [],
} as unknown as Community;

let mockAuthUser: typeof mockUser | null = null;
let mockIsAdmin = false;
let mockMembership: { role: string | null; hasMembership: boolean } = {
  role: null,
  hasMembership: false,
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  useParams: () => ({}),
}));

vi.mock("@/queries/communityQueries", () => ({
  useCommunity: () => ({ data: fixtureCommunity }),
}));

vi.mock("@/queries/membershipQueries", () => ({
  useCommunityMembership: () => ({ data: mockMembership }),
}));

vi.mock("@/queries/channelQueries", () => ({
  useDeleteSection: () => ({ mutateAsync: vi.fn() }),
  useChannelUnread: () => ({ data: [] }),
  useArchiveChannel: () => ({ mutateAsync: vi.fn() }),
  useUnarchiveChannel: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/queries/notificationQueries", () => ({
  useNotificationUnreadCounts: () => ({ data: { counts: {} } }),
  useUnreadMentionChannels: () => new Set<string>(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockAuthUser }),
}));

vi.mock("@/hooks/useIsCommunityAdmin", () => ({
  useIsCommunityAdmin: () => mockIsAdmin,
}));

vi.mock("@/queries/groupQueries", () => ({
  useGroups: () => ({ data: [] }),
}));

vi.mock("@/context/NotificationContext", () => ({
  useNotification: () => ({ notify: vi.fn() }),
}));

vi.mock("@/hooks/useCommunityActivityMercure", () => ({
  useCommunityActivityMercure: () => {},
}));

vi.mock("@/hooks/useCommunityEmojiMercure", () => ({
  useCommunityEmojiMercure: () => {},
}));

vi.mock("@/hooks/useCommunityMercure", () => ({
  useCommunityMercure: () => {},
}));

vi.mock("@/queries/notificationPreferenceQueries", () => ({
  useChannelNotificationLevel: () => "all",
  useIsCommunityMuted: () => false,
  useNotificationPreferences: () => ({ data: { channels: [] } }),
  useChannelPinState: () => null,
  useSetChannelPinState: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/queries/userPreferencesQueries", () => ({
  useUserPreferences: () => ({ data: { sectionCollapse: {} } }),
  useToggleSectionCollapse: () => vi.fn(),
}));

vi.mock("@/queries/readStateQueries", () => ({
  useMarkCommunityAllRead: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/context/MobileNavContext", () => ({
  useMobileNav: () => ({ navOpen: false, closeNav: vi.fn() }),
}));

beforeEach(() => {
  configureApiClient(BASE);
  mockAuthUser = null;
  mockIsAdmin = false;
  mockMembership = { role: null, hasMembership: false };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ChannelSidebar community menu — desktop server origin", () => {
  it("desktop mode shows the community menu with only the server origin as a non-interactive last entry", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    render(<ChannelSidebar communityId={COMMUNITY_ID} />);

    const trigger = screen.getByTestId("community-actions-btn");
    await userEvent.click(trigger);

    const origin = await screen.findByTestId("community-menu-server-origin");
    expect(origin.textContent).toBe(BASE);
    expect(origin.tagName).toBe("DIV");
    expect(origin).toHaveAttribute("role", "presentation");
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("web mode never shows the community menu when the user has no other actions", () => {
    vi.stubEnv("VITE_APP_MODE", "");
    render(<ChannelSidebar communityId={COMMUNITY_ID} />);
    expect(screen.queryByTestId("community-actions-btn")).toBeNull();
  });

  it("desktop mode appends the server origin as the last menu entry after existing items", async () => {
    vi.stubEnv("VITE_APP_MODE", "desktop");
    mockAuthUser = mockUser;
    mockIsAdmin = true;
    mockMembership = { role: "admin", hasMembership: true };
    render(<ChannelSidebar communityId={COMMUNITY_ID} />);

    await userEvent.click(screen.getByTestId("community-actions-btn"));

    const menu = await screen.findByRole("menu");
    const children = Array.from(menu.children);
    const last = children[children.length - 1];
    const secondToLast = children[children.length - 2];
    expect(last).toHaveAttribute("data-testid", "community-menu-server-origin");
    expect(secondToLast).toHaveAttribute("role", "separator");
  });

  it("web mode keeps the community menu unchanged (no server origin entry)", async () => {
    vi.stubEnv("VITE_APP_MODE", "");
    mockAuthUser = mockUser;
    mockIsAdmin = true;
    mockMembership = { role: "admin", hasMembership: true };
    render(<ChannelSidebar communityId={COMMUNITY_ID} />);

    await userEvent.click(screen.getByTestId("community-actions-btn"));

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.queryByTestId("community-menu-server-origin")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });
});
