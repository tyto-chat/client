import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../../mocks/server";
import { TEST_BASE_URL as BASE, mockUser } from "../../fixtures";
import { configureApiClient } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";
import { PlainWriteRefusedError, setActiveSecurity } from "@/e2ee/admission";
import type { LocalSecuritySnapshot } from "@/e2ee/localSecurityState";
import {
  useEditConversationMessage,
  useSendConversationMessage,
} from "@/queries/conversationQueries";
import { useToggleConversationReaction, useToggleThreadReaction } from "@/queries/reactionQueries";
import { useEditThreadReply, useReplyToMessage } from "@/queries/threadQueries";
import { usePendingAttachments } from "@/hooks/usePendingAttachments";
import { queryKeys } from "@/queries/queryKeys";
import type { Conversation } from "@/types/api";

const notify = vi.fn();
vi.mock("@/context/NotificationContext", () => ({ useNotification: () => ({ notify }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const IDENT = "plain-c";
const ROOT = "/api/messages/root";
let client: QueryClient;
let requests: string[];

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

function refusing(): LocalSecuritySnapshot {
  return {
    scope: { serverOrigin: BASE, serverUserId: mockUser.id, profileId: "p" },
    refusal: { on: true, since: 1 },
    knownBeforeRefusal: new Map(),
    acceptedPlainConversations: new Set(),
    pinnedUserIds: new Set(),
  };
}

beforeEach(() => {
  configureApiClient(BASE);
  setAccessToken("jwt");
  notify.mockReset();
  requests = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.conversation(IDENT), {
    id: 50,
    identifier: IDENT,
    encrypted: false,
    readOnly: false,
    readOnlyReason: null,
    members: [{ userId: mockUser.id }, { userId: 2 }],
  } as unknown as Conversation);
  server.use(
    http.all(`${BASE}/api/v1/*`, ({ request }) => {
      requests.push(`${request.method} ${new URL(request.url).pathname}`);
      return HttpResponse.json({}, { status: 201 });
    }),
  );
  setActiveSecurity(refusing());
});

afterEach(() => setActiveSecurity(null));

describe("own_refusal_blocks_send_reply_edit_react_attach_regardless_of_server_flags", () => {
  it("refuses a send", async () => {
    const { result } = renderHook(() => useSendConversationMessage(IDENT, mockUser), { wrapper });
    await expect(result.current.mutateAsync({ text: "hi" })).rejects.toBeInstanceOf(
      PlainWriteRefusedError,
    );
    expect(requests).toEqual([]);
  });

  it("refuses a reply", async () => {
    const { result } = renderHook(
      () => useReplyToMessage(queryKeys.conversationPages(IDENT), ROOT, mockUser, IDENT),
      { wrapper },
    );
    await expect(result.current.mutateAsync({ text: "hi" })).rejects.toBeInstanceOf(
      PlainWriteRefusedError,
    );
    expect(requests).toEqual([]);
  });

  it("refuses edits of roots and replies", async () => {
    const root = renderHook(() => useEditConversationMessage(IDENT), { wrapper });
    const reply = renderHook(() => useEditThreadReply(ROOT, null, IDENT), { wrapper });

    await expect(
      root.result.current.mutateAsync({ messageIri: ROOT, text: "x" }),
    ).rejects.toBeInstanceOf(PlainWriteRefusedError);
    await expect(
      reply.result.current.mutateAsync({ messageIri: "/api/messages/r", text: "x" }),
    ).rejects.toBeInstanceOf(PlainWriteRefusedError);
    expect(requests).toEqual([]);
  });

  it("refuses new reactions but lets the user remove their own", async () => {
    const root = renderHook(() => useToggleConversationReaction(IDENT, mockUser.id), { wrapper });
    const reply = renderHook(() => useToggleThreadReaction(ROOT, mockUser.id, IDENT), { wrapper });

    await expect(
      root.result.current.mutateAsync({ messageIri: ROOT, emoji: "👍" }),
    ).rejects.toBeInstanceOf(PlainWriteRefusedError);
    await expect(
      reply.result.current.mutateAsync({ messageIri: "/api/messages/r", emoji: "👍" }),
    ).rejects.toBeInstanceOf(PlainWriteRefusedError);
    expect(requests).toEqual([]);

    await root.result.current.mutateAsync({ messageIri: ROOT, emoji: "👍", existingId: 9 });
    expect(requests).toEqual(["DELETE /api/v1/reactions/9"]);
  });

  it("refuses attachments", async () => {
    const { result } = renderHook(() => usePendingAttachments({ conversationIdentifier: IDENT }), {
      wrapper,
    });
    const files = [new File(["x"], "a.txt", { type: "text/plain" })] as unknown as FileList;

    await act(() => result.current.handleFiles(files));

    expect(notify).toHaveBeenCalledWith("conversation:e2ee_plain_write_refused", "error");
    expect(result.current.pendingAttachments).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("leaves channel writes alone", async () => {
    const { result } = renderHook(
      () => useReplyToMessage(queryKeys.channelPages("k", "general"), ROOT, mockUser),
      { wrapper },
    );

    await result.current.mutateAsync({ text: "hi" });

    expect(requests).toEqual(["POST /api/v1/messages/root/replies"]);
  });
});
