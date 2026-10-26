import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BlockedMessageRow } from "@/components/chat/BlockedMessageRow";
import { MessageGroup } from "@/components/chat/MessageGroup";
import { testIds } from "../e2e/testIds";
import { mockUser } from "../fixtures";
import type { Message, User } from "@/types/api";

vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify: vi.fn() }) }));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function blockedMsg(id: string, text: string): Message {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text,
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: "2026-05-20T10:00:00Z",
    createdBy: {
      "@id": "/api/users/7",
      "@type": "User",
      id: 7,
      email: "b@b",
      roles: ["ROLE_USER"],
      profile: { "@id": "/api/profiles/7", "@type": "UserProfile", name: "Blocked", avatar: null },
    } as User,
    reactions: null,
    pageNumber: 1,
  } as Message;
}

const noop = () => {};

describe("BlockedMessageRow", () => {
  it("renders the singular and plural copy and calls onShow", async () => {
    const onShow = vi.fn();
    const { rerender } = render(<BlockedMessageRow count={1} onShow={onShow} />);
    expect(screen.getByTestId(testIds.blockedMessageRow)).toHaveTextContent(
      "Message from a blocked user",
    );
    rerender(<BlockedMessageRow count={3} onShow={onShow} />);
    expect(screen.getByTestId(testIds.blockedMessageRow)).toHaveTextContent(
      "3 messages from a blocked user",
    );
    await userEvent.click(screen.getByTestId(testIds.blockedMessageShow));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("renders the collapsed row with a count and reveals on Show", async () => {
    render(
      <MessageGroup
        group={{
          isOwn: false,
          blocked: true,
          msgs: [blockedMsg("a", "first hidden"), blockedMsg("b", "second hidden")],
        }}
        groupIndex={0}
        user={mockUser}
        isChannelModerator={false}
        moderatorUserIds={new Set()}
        groupsByUserId={new Map()}
        timezone="UTC"
        onToggleReaction={noop}
        onDeleteMessage={noop}
        onEditMessage={noop}
        onViewHistory={noop}
        onDeleteAttachment={noop}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId(testIds.blockedMessageRow)).toHaveTextContent(
      "2 messages from a blocked user",
    );
    expect(screen.queryByText("first hidden")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(testIds.blockedMessageShow));

    expect(screen.queryByTestId(testIds.blockedMessageRow)).not.toBeInTheDocument();
    expect(await screen.findByText("first hidden")).toBeInTheDocument();
    expect(screen.getByText("second hidden")).toBeInTheDocument();
  });
});
