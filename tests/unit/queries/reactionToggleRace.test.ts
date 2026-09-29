import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { stripPendingReactionRemovals, useToggleThreadReaction } from "@/queries/reactionQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { Message } from "@/types/api";

const ROOT_IRI = "/api/messages/root-uuid";
let replySeq = 0;
let replyIri: string;

function reply(iri: string): Message {
  return {
    "@id": iri,
    "@type": "Message",
    id: iri.split("/").pop()!,
    text: "hello",
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: "2026-05-20T10:00:00Z",
    createdBy: mockUser,
    reactions: null,
    pageNumber: 1,
  };
}

let requests: string[];
let releaseAdd: () => void;
let deleteStatus: number;

function setup(options: { holdAdd: boolean }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(queryKeys.threadReplies(ROOT_IRI), [reply(replyIri)]);
  const held = new Promise<void>((resolve) => {
    releaseAdd = resolve;
  });
  server.use(
    http.post(`${BASE}/api/v1/messages/:id/reactions`, async () => {
      requests.push("POST");
      if (options.holdAdd) await held;
      return HttpResponse.json({ id: 41 }, { status: 201 });
    }),
    http.delete(`${BASE}/api/v1/reactions/:id`, ({ params }) => {
      requests.push(`DELETE ${String(params.id)}`);
      return new HttpResponse(null, { status: deleteStatus });
    }),
  );
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const { result } = renderHook(() => useToggleThreadReaction(ROOT_IRI, mockUser.id), { wrapper });
  const reactions = () =>
    qc.getQueryData<Message[]>(queryKeys.threadReplies(ROOT_IRI))?.[0]?.reactions ?? null;
  return { result, reactions };
}

beforeEach(() => {
  configureApiClient(BASE);
  requests = [];
  deleteStatus = 204;
  replySeq += 1;
  replyIri = `/api/messages/reply-${replySeq}`;
});

describe("toggling off a reaction that was rendered unconfirmed", () => {
  it("deletes on the server when the add is still in flight", async () => {
    const { result, reactions } = setup({ holdAdd: true });

    act(() => result.current.mutate({ messageIri: replyIri, emoji: "🎉" }));
    await waitFor(() => expect(requests).toEqual(["POST"]));
    act(() => result.current.mutate({ messageIri: replyIri, emoji: "🎉", existingId: 0 }));
    await waitFor(() => expect(reactions()).toBeNull());

    releaseAdd();

    await waitFor(() => expect(requests).toEqual(["POST", "DELETE 41"]));
    expect(reactions()).toBeNull();
  });

  it("deletes on the server when the add confirmed just before the click landed", async () => {
    const { result, reactions } = setup({ holdAdd: false });

    act(() => result.current.mutate({ messageIri: replyIri, emoji: "🎉" }));
    await waitFor(() => expect(reactions()).toEqual({ "🎉": [{ id: 41, userId: mockUser.id }] }));

    act(() => result.current.mutate({ messageIri: replyIri, emoji: "🎉", existingId: 0 }));

    await waitFor(() => expect(requests).toEqual(["POST", "DELETE 41"]));
    expect(reactions()).toBeNull();
  });

  it("stops hiding the reaction from realtime updates once the removal settles", async () => {
    const { result } = setup({ holdAdd: false });
    const fromServer = { "🎉": [{ id: 41, userId: mockUser.id }] };

    act(() => result.current.mutate({ messageIri: replyIri, emoji: "🎉" }));
    await waitFor(() => expect(requests).toEqual(["POST"]));
    act(() => result.current.mutate({ messageIri: replyIri, emoji: "🎉", existingId: 0 }));
    await waitFor(() => expect(requests).toEqual(["POST", "DELETE 41"]));

    await waitFor(() =>
      expect(stripPendingReactionRemovals(replyIri, fromServer)).toEqual(fromServer),
    );
  });

  it("restores the pill when the server refuses the removal", async () => {
    deleteStatus = 500;
    const { result, reactions } = setup({ holdAdd: false });

    act(() => result.current.mutate({ messageIri: replyIri, emoji: "🎉" }));
    await waitFor(() => expect(reactions()).toEqual({ "🎉": [{ id: 41, userId: mockUser.id }] }));
    act(() => result.current.mutate({ messageIri: replyIri, emoji: "🎉", existingId: 0 }));

    await waitFor(() => expect(requests).toEqual(["POST", "DELETE 41"]));
    await waitFor(() => expect(reactions()).toEqual({ "🎉": [{ id: 41, userId: mockUser.id }] }));
  });
});
