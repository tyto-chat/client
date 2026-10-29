import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationsSidebar } from "@/components/ConversationsSidebar";

const navigated = vi.fn();
const opened = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <a
      href="#dm"
      onClick={(e) => {
        e.preventDefault();
        navigated();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/context/MobileNavContext", () => ({
  useMobileNav: () => ({ navOpen: false, closeNav: vi.fn() }),
}));
vi.mock("@/hooks/useAutoHideScrollbar", () => ({
  useAutoHideScrollbar: () => ({ current: null }),
}));
vi.mock("@/queries/readStateQueries", () => ({
  useMarkAllDmsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/dm/ConversationProfileCard", () => ({
  useConversationProfileCard: () => ({
    openProfile: opened,
    profileCard: <div data-testid="profile-card" />,
  }),
}));
vi.mock("@/components/Avatar", () => ({ Avatar: () => <span /> }));
const members = [
  { id: 1, userId: 1, profile: { name: "Me", "@id": "/api/profiles/1" } },
  { id: 2, userId: 2, profile: { name: "Ann", "@id": "/api/profiles/2" } },
];
vi.mock("@/queries/conversationQueries", () => ({
  useConversations: () => ({
    isLoading: false,
    data: [
      { "@id": "/c/plain", identifier: "plain", unreadCount: 0, lastMessageAt: null, members },
      {
        "@id": "/c/secret",
        identifier: "secret",
        encrypted: true,
        unreadCount: 0,
        lastMessageAt: null,
        members,
      },
    ],
  }),
}));
const serverInfo = vi.hoisted(() => ({ mode: "enabled" as string | undefined }));
vi.mock("@/hooks/useServerInfo", () => ({
  useServerInfo: () => ({ encryptedDmsMode: serverInfo.mode }),
}));

describe("ConversationsSidebar encryption markers", () => {
  it.each(["enabled", "required"])("plain_dm_marker_shown_when_mode_%s", (mode) => {
    serverInfo.mode = mode;
    render(<ConversationsSidebar />);

    expect(screen.getAllByTestId("dm-plain-marker")).toHaveLength(1);
    expect(screen.getAllByTestId("dm-e2ee-row-badge")).toHaveLength(1);
  });

  it("no plain marker when encrypted DMs are disabled", () => {
    serverInfo.mode = "disabled";
    render(<ConversationsSidebar />);

    expect(screen.queryByTestId("dm-plain-marker")).toBeNull();
  });
});
