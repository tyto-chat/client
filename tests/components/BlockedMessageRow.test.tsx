import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BlockedMessageRow } from "@/components/chat/BlockedMessageRow";
import { MessageGroup } from "@/components/chat/MessageGroup";
import { useMessageGroups } from "@/hooks/useMessageGroups";
import { testIds } from "../e2e/testIds";
import { mockUser } from "../fixtures";
import type { Message, User } from "@/types/api";

vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/queries/blockQueries", () => ({ useBlockedUserIds: () => new Set([7]) }));

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function blockedMsg(id: string, text: string, extra: Partial<Message> = {}): Message {
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
    ...extra,
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
    const messages = [blockedMsg("a", "first hidden"), blockedMsg("b", "second hidden")];
    function Harness() {
      const { groups, reveal } = useMessageGroups(messages, mockUser);
      return (
        <>
          {groups.map((group, i) => (
            <MessageGroup
              key={group.msgs[0]!["@id"]}
              group={group}
              groupIndex={i}
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
              onShowBlocked={() => reveal(group.msgs)}
            />
          ))}
        </>
      );
    }
    render(<Harness />, { wrapper: Wrapper });

    expect(screen.getByTestId(testIds.blockedMessageRow)).toHaveTextContent(
      "2 messages from a blocked user",
    );
    expect(screen.queryByText("first hidden")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(testIds.blockedMessageShow));

    expect(screen.queryByTestId(testIds.blockedMessageRow)).not.toBeInTheDocument();
    expect(await screen.findByText("first hidden")).toBeInTheDocument();
    expect(screen.getByText("second hidden")).toBeInTheDocument();
  });

  it("names each Show button after the row it reveals", () => {
    render(
      <>
        <BlockedMessageRow count={1} onShow={noop} />
        <BlockedMessageRow count={3} onShow={noop} />
      </>,
    );
    expect(
      screen.getByRole("button", { name: "Show: Message from a blocked user" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show: 3 messages from a blocked user" }),
    ).toBeInTheDocument();
  });

  function renderCollapsedRoot(onOpenThread: (iri: string) => void, readOnly = false) {
    const group = {
      isOwn: false,
      blocked: true,
      msgs: [blockedMsg("a", "hidden root", { replyCount: 2 })],
    };
    render(
      <MessageGroup
        group={group}
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
        onOpenThread={onOpenThread}
        readOnly={readOnly}
      />,
      { wrapper: Wrapper },
    );
  }

  it("keeps the reply count on a collapsed root and opens its thread", async () => {
    const onOpenThread = vi.fn();
    renderCollapsedRoot(onOpenThread);

    expect(screen.queryByText("hidden root")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "2 replies" }));

    expect(onOpenThread).toHaveBeenCalledWith("/api/messages/a");
  });

  it("omits the reply chip on a read-only collapsed root", () => {
    renderCollapsedRoot(vi.fn(), true);
    expect(screen.queryByRole("button", { name: "2 replies" })).not.toBeInTheDocument();
  });
});
