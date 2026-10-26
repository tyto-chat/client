import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("@/queries/conversationQueries", () => ({
  useConversations: () => ({
    isLoading: false,
    data: [
      {
        "@id": "/api/conversations/abc",
        identifier: "abc",
        unreadCount: 0,
        lastMessageAt: null,
        members: [
          { id: 1, userId: 1, profile: { name: "Me", "@id": "/api/profiles/1" } },
          { id: 2, userId: 2, profile: { name: "Ann", "@id": "/api/profiles/2" } },
        ],
      },
    ],
  }),
}));

describe("ConversationsSidebar", () => {
  it("opens the profile card from a real button outside the row link", async () => {
    render(<ConversationsSidebar />);
    const button = screen.getByTestId("dm-row-avatar");
    expect(button.tagName).toBe("BUTTON");
    expect(button.closest("a")).toBeNull();
    expect(button).toHaveAccessibleName("Open profile of Ann");
    await userEvent.click(button);
    expect(opened).toHaveBeenCalledWith(2);
    expect(navigated).not.toHaveBeenCalled();
  });

  it("opens the profile card with the keyboard", async () => {
    opened.mockClear();
    render(<ConversationsSidebar />);
    const button = screen.getByTestId("dm-row-avatar");
    for (let i = 0; i < 6 && document.activeElement !== button; i++) await userEvent.tab();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard("{Enter}");
    expect(opened).toHaveBeenCalledWith(2);
  });

  it("still navigates when the row is clicked", async () => {
    navigated.mockClear();
    render(<ConversationsSidebar />);
    await userEvent.click(screen.getByText("Ann"));
    expect(navigated).toHaveBeenCalled();
  });
});
