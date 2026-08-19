import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../fixtures";
import { ThreadPanel } from "@/components/chat/ThreadPanel";

const COMMUNITY = "comm-1";
const CHANNEL = "chan-1";
const ROOT_UUID = "3b2c10a4-9f5e-4c1a-8d2b-1f3e4a5b6c7d";
const ROOT_IRI = `/api/v1/messages/${ROOT_UUID}`;

vi.mock("@/context/AuthContext", () => ({ useAuthContext: () => ({ user: mockUser }) }));
vi.mock("@/context/TimezoneContext", () => ({ useTimezone: () => ({ timezone: "UTC" }) }));
vi.mock("@/hooks/useMercure", () => ({ useThreadMercure: () => {} }));
// Mock MessageGroup so reaction wiring can be probed without rendering the
// full pipeline (DOMPurify, Tiptap state, etc.). The reaction button is only
// surfaced when the group is interactive (replies), not read-only (root).
vi.mock("@/components/chat/MessageGroup", () => ({
  MessageGroup: ({
    group,
    onToggleReaction,
    onEditMessage,
    onDeleteMessage,
    readOnly,
    canReact,
  }: {
    group: { msgs: Array<{ "@id": string; text: string | null }> };
    onToggleReaction: (iri: string, emoji: string) => void;
    onEditMessage: (iri: string, text: string) => void;
    onDeleteMessage: (iri: string) => void;
    readOnly?: boolean;
    canReact?: boolean;
  }) => (
    <div data-testid="msg">
      {/* Mirror the real MessageGroup's per-row `data-message-id`, which the
       *  focus effect queries by IRI suffix. */}
      {group.msgs.map((m) => (
        <span key={m["@id"]} data-message-id={m["@id"]}>
          {m.text}
        </span>
      ))}
      {!readOnly && (
        <>
          {canReact !== false && (
            <button
              data-testid={`react-${group.msgs[0]!["@id"]}`}
              onClick={() => onToggleReaction(group.msgs[0]!["@id"], "🎉")}
            >
              react
            </button>
          )}
          <button
            data-testid={`edit-${group.msgs[0]!["@id"]}`}
            onClick={() => onEditMessage(group.msgs[0]!["@id"], "edited body")}
          >
            edit
          </button>
          <button
            data-testid={`delete-${group.msgs[0]!["@id"]}`}
            onClick={() => onDeleteMessage(group.msgs[0]!["@id"])}
          >
            delete
          </button>
        </>
      )}
    </div>
  ),
}));
vi.mock("@/components/chat/MessageEditor", () => ({
  MessageEditor: ({ onSend }: { onSend: (t: string) => void }) => (
    <button onClick={() => onSend("a reply")}>send-stub</button>
  ),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function msg(id: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text,
    isDeleted: false,
    edited: false,
    createdAt: "2026-05-19T10:00:00Z",
    createdBy: mockUser,
    reactions: null,
    pageNumber: 1,
    ...extra,
  };
}

function threadResponse(items: unknown[]) {
  return HttpResponse.json({
    "@context": "/api/contexts/Message",
    "@id": `${ROOT_IRI}/thread`,
    "@type": "Collection",
    "hydra:member": items,
    totalItems: items.length,
  });
}

beforeEach(() => {
  configureApiClient(BASE);
  server.use(
    http.get(`${BASE}${ROOT_IRI}`, () =>
      HttpResponse.json(msg(ROOT_UUID, "root", { replyCount: 0 })),
    ),
  );
});

describe("ThreadPanel", () => {
  it("shows the empty state when there are no replies", async () => {
    server.use(http.get(`${BASE}${ROOT_IRI}/thread`, () => threadResponse([])));

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText(/No replies yet/i)).toBeInTheDocument());
  });

  it("renders replies", async () => {
    server.use(
      http.get(`${BASE}${ROOT_IRI}/thread`, () =>
        threadResponse([msg("a", "first reply"), msg("b", "second reply")]),
      ),
    );

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText(/first reply/)).toBeInTheDocument());
    expect(screen.getByText(/second reply/)).toBeInTheDocument();
  });

  it("posts a reply when the composer sends", async () => {
    let posted = false;
    server.use(
      http.get(`${BASE}${ROOT_IRI}/thread`, () => threadResponse([])),
      http.post(`${BASE}${ROOT_IRI}/replies`, () => {
        posted = true;
        return HttpResponse.json(msg("new", "a reply"), { status: 201 });
      }),
    );

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("send-stub")).toBeInTheDocument());
    await userEvent.click(screen.getByText("send-stub"));

    await waitFor(() => expect(posted).toBe(true));
  });

  it("calls onClose when the close button is clicked", async () => {
    server.use(http.get(`${BASE}${ROOT_IRI}/thread`, () => threadResponse([])));
    const onClose = vi.fn();

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={onClose}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("send-stub")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("posts a reaction when a reply's react button is clicked", async () => {
    const replyMsg = msg("reply-a", "first reply");
    let reactionCalls = 0;
    server.use(
      http.get(`${BASE}${ROOT_IRI}/thread`, () => threadResponse([replyMsg])),
      http.post(`${BASE}/api/v1/messages/reply-a/reactions`, () => {
        reactionCalls++;
        return HttpResponse.json({ "@id": "/api/reactions/1", id: 1 }, { status: 201 });
      }),
    );

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("first reply")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`react-${replyMsg["@id"]}`));

    await waitFor(() => expect(reactionCalls).toBe(1));
  });

  it("hides the composer and reply reactions when canParticipate is false", async () => {
    const replyMsg = msg("reply-a", "first reply");
    server.use(http.get(`${BASE}${ROOT_IRI}/thread`, () => threadResponse([replyMsg])));

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
        canParticipate={false}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("first reply")).toBeInTheDocument());
    expect(screen.queryByText("send-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`react-${replyMsg["@id"]}`)).not.toBeInTheDocument();
  });

  it("renders the root read-only (no reaction control)", async () => {
    server.use(http.get(`${BASE}${ROOT_IRI}/thread`, () => threadResponse([])));

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    // Root renders inside ThreadPanel (the mock outputs text "root"). The
    // root's MessageGroup is read-only, so no react-* test id is produced.
    await waitFor(() => expect(screen.getByText("root")).toBeInTheDocument());
    expect(screen.queryByTestId(`react-${ROOT_IRI}`)).not.toBeInTheDocument();
  });

  it("edits a reply when the edit button is clicked", async () => {
    const replyMsg = msg("edit-target", "before edit");
    let patched = false;
    server.use(
      http.get(`${BASE}${ROOT_IRI}/thread`, () => threadResponse([replyMsg])),
      http.patch(`${BASE}/api/v1/messages/edit-target`, () => {
        patched = true;
        return HttpResponse.json({ ...replyMsg, text: "edited body", edited: true });
      }),
    );

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("before edit")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`edit-${replyMsg["@id"]}`));

    await waitFor(() => expect(patched).toBe(true));
  });

  it("deletes a reply when the delete button is clicked", async () => {
    const replyMsg = msg("delete-target", "to be deleted");
    let deleted = false;
    server.use(
      http.get(`${BASE}${ROOT_IRI}/thread`, () => threadResponse([replyMsg])),
      http.delete(`${BASE}/api/v1/messages/delete-target`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(screen.getByText("to be deleted")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`delete-${replyMsg["@id"]}`));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("focuses + flashes the target reply when focusReplyId is set, then notifies", async () => {
    const targetUuid = "reply-uuid-1";
    const targetIri = `/api/messages/${targetUuid}`;
    server.use(
      http.get(`${BASE}${ROOT_IRI}/thread`, () =>
        threadResponse([msg(targetUuid, "focused reply"), msg("other", "another reply")]),
      ),
    );

    // jsdom doesn't implement scrollIntoView; stub it on the prototype.
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy as unknown as Element["scrollIntoView"];
    vi.useFakeTimers();

    const onReplyFocusComplete = vi.fn();
    render(
      <ThreadPanel
        communityId={COMMUNITY}
        channelIdentifier={CHANNEL}
        rootIri={ROOT_IRI}
        members={[]}
        channels={[]}
        allowAttachments={false}
        onClose={vi.fn()}
        focusReplyId={targetUuid}
        onReplyFocusComplete={onReplyFocusComplete}
      />,
      { wrapper: makeWrapper() },
    );

    // Replies are loaded async — drive the query without blocking on jest timers.
    // Wrapped in act: the query resolving mid-wait sets React state.
    const { act } = await import("react");
    await act(async () => {
      await vi.waitFor(() => expect(screen.getByText("focused reply")).toBeInTheDocument());
    });

    // Focus effect runs: scrollIntoView called + the row is marked.
    const target = document.querySelector<HTMLElement>(`[data-message-id="${targetIri}"]`);
    expect(target).not.toBeNull();
    expect(scrollSpy).toHaveBeenCalled();
    expect(target!.getAttribute("data-focus")).toBe("");

    // 1.6s later — flash clears + caller notified.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1700);
    });
    expect(target!.hasAttribute("data-focus")).toBe(false);
    expect(onReplyFocusComplete).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
