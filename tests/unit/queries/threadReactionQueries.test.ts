import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { applyOptimisticReactionToggle, useToggleThreadReaction } from "@/queries/reactionQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { Message } from "@/types/api";

const ROOT_IRI = "/api/messages/root-uuid";
const REPLY_IRI = "/api/messages/reply-uuid";

function reply(extra: Partial<Message> = {}): Message {
  return {
    "@id": REPLY_IRI,
    "@type": "Message",
    id: "reply-uuid",
    text: "hello",
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: "2026-05-20T10:00:00Z",
    createdBy: mockUser,
    reactions: null,
    pageNumber: 1,
    ...extra,
  };
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => configureApiClient(BASE));

describe("applyOptimisticReactionToggle", () => {
  it("adds a fresh reaction when none exists", () => {
    const m = reply({ reactions: null });
    const out = applyOptimisticReactionToggle(m, "👍", undefined, mockUser.id);
    expect(out.reactions).toEqual({ "👍": [{ id: 0, userId: mockUser.id }] });
  });

  it("appends to an existing emoji bucket", () => {
    const m = reply({ reactions: { "👍": [{ id: 1, userId: 99 }] } });
    const out = applyOptimisticReactionToggle(m, "👍", undefined, mockUser.id);
    expect(out.reactions?.["👍"]).toEqual([
      { id: 1, userId: 99 },
      { id: 0, userId: mockUser.id },
    ]);
  });

  it("removes the caller's entry when existingId is given", () => {
    const m = reply({
      reactions: {
        "👍": [
          { id: 7, userId: mockUser.id },
          { id: 8, userId: 99 },
        ],
      },
    });
    const out = applyOptimisticReactionToggle(m, "👍", 7, mockUser.id);
    expect(out.reactions?.["👍"]).toEqual([{ id: 8, userId: 99 }]);
  });

  it("drops the emoji bucket entirely when last entry removed", () => {
    const m = reply({ reactions: { "👍": [{ id: 7, userId: mockUser.id }] } });
    const out = applyOptimisticReactionToggle(m, "👍", 7, mockUser.id);
    expect(out.reactions).toBeNull();
  });
});

describe("useToggleThreadReaction", () => {
  function seedThread(qc: QueryClient, initial: Message[]) {
    qc.setQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI), initial);
  }

  it("optimistically patches the thread-replies cache when adding a reaction", async () => {
    server.use(
      http.post(`${BASE}/api/v1/messages/reply-uuid/reactions`, () =>
        HttpResponse.json({ "@id": "/api/reactions/42", id: 42 }, { status: 201 }),
      ),
    );

    const qc = makeQueryClient();
    seedThread(qc, [reply({ reactions: null })]);

    const { result } = renderHook(() => useToggleThreadReaction(ROOT_IRI, mockUser.id), {
      wrapper: makeWrapper(qc),
    });

    await act(() => result.current.mutateAsync({ messageIri: REPLY_IRI, emoji: "🎉" }));

    const after = qc.getQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI));
    expect(after?.[0]?.reactions).toEqual({ "🎉": [{ id: 42, userId: mockUser.id }] });
  });

  it("rolls back the thread cache when the request fails", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/messages/reply-uuid/reactions`,
        () => new HttpResponse(null, { status: 422 }),
      ),
    );

    const qc = makeQueryClient();
    seedThread(qc, [reply({ reactions: null })]);

    const { result } = renderHook(() => useToggleThreadReaction(ROOT_IRI, mockUser.id), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ messageIri: REPLY_IRI, emoji: "🎉" }).catch(() => {});
    });

    await waitFor(() => {
      const after = qc.getQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI));
      expect(after?.[0]?.reactions).toBeNull();
    });
  });
});
