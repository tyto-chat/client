import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  PlainWriteRefusedError,
  admitMessages,
  admitPlainContent,
  assertPlainWriteAllowed,
  knownPlainMessages,
  plainWriteRefusal,
  reapplyAdmission,
  setActiveSecurity,
  wasDeclined,
  type AdmissionConversation,
} from "@/e2ee/admission";
import { encodeEnvelope } from "@/e2ee/envelope";
import type { LocalSecuritySnapshot } from "@/e2ee/localSecurityState";
import { queryKeys } from "@/queries/queryKeys";
import type { ChannelPage, Message, MessageUpdateEvent } from "@/types/api";

const ME = 1;

function snapshot(patch: Partial<LocalSecuritySnapshot> = {}): LocalSecuritySnapshot {
  return {
    scope: { serverOrigin: "https://chat.example.org", serverUserId: ME, profileId: "p" },
    refusal: { on: false, since: 0 },
    knownBeforeRefusal: new Map(),
    acceptedPlainConversations: new Set(),
    pinnedUserIds: new Set(),
    ...patch,
  };
}

const refusing = (known: [string, number][] = []) =>
  snapshot({ refusal: { on: true, since: 1 }, knownBeforeRefusal: new Map(known) });

function conversation(
  id: number,
  patch: Partial<AdmissionConversation> = {},
): AdmissionConversation {
  return {
    id,
    identifier: `c${id}`,
    encrypted: false,
    members: [{ userId: ME }, { userId: 2 }],
    ...patch,
  };
}

function message(id: string, revisionCount = 1, patch: Partial<Message> = {}): Message {
  return {
    "@id": `/api/messages/${id}`,
    "@type": "Message",
    id,
    text: "hello",
    isDeleted: false,
    edited: revisionCount > 1,
    revisionCount,
    kind: "standard",
    createdAt: "2026-10-29T10:00:00+00:00",
    reactions: null,
    pageNumber: 1,
    ...patch,
  } as Message;
}

function update(id: string, patch: Partial<MessageUpdateEvent>): MessageUpdateEvent {
  return { type: "message.update", "@id": `/api/messages/${id}`, ...patch } as MessageUpdateEvent;
}

afterEach(() => setActiveSecurity(null));

describe("admitPlainContent", () => {
  it("shows everything without local security state", () => {
    expect(admitPlainContent(conversation(1), message("new"))).toBe("show");
  });

  it("shows everything while the refusal is off", () => {
    setActiveSecurity(snapshot());

    expect(admitPlainContent(conversation(1), message("new"))).toBe("show");
  });

  it("always shows encrypted conversations", () => {
    setActiveSecurity(refusing());

    expect(admitPlainContent(conversation(1, { encrypted: true }), message("new"))).toBe("show");
  });

  it("own_refusal_drops_new_root_reply_edit_history_page_and_attachment", () => {
    setActiveSecurity(refusing([["old", 1]]));
    const plain = conversation(3);

    expect(admitPlainContent(plain, message("new"))).toBe("drop");
    expect(admitPlainContent(plain, message("reply", 1, { parent: message("old") }))).toBe("drop");
    expect(admitPlainContent(plain, update("old", { text: "edited", revisionCount: 2 }))).toBe(
      "drop",
    );
    expect(admitPlainContent(plain, update("old", { text: "edited" }))).toBe("drop");
    expect(admitPlainContent(plain, update("old", { attachments: [] }))).toBe("drop");
    expect(admitMessages(plain, [message("old"), message("older-page")])).toEqual([message("old")]);
    expect(wasDeclined("c3")).toBe(true);
  });

  it("own_refusal_keeps_locally_known_messages_at_known_revision", () => {
    setActiveSecurity(refusing([["old", 2]]));
    const plain = conversation(4);

    expect(admitPlainContent(plain, message("old", 2))).toBe("show");
    expect(admitPlainContent(plain, message("old", 3))).toBe("drop");
    expect(admitPlainContent(plain, update("old", { reactions: {} }))).toBe("show");
    expect(admitPlainContent(plain, update("old", { isDeleted: true, text: null }))).toBe("show");
    expect(admitPlainContent(plain, update("unknown", { reactions: {} }))).toBe("drop");
  });

  it("treats an unknown conversation as plain unless the text is an envelope", () => {
    setActiveSecurity(refusing());

    expect(admitPlainContent(undefined, message("x"))).toBe("drop");
    const envelope = encodeEnvelope({
      g: 1,
      n: new Uint8Array(12),
      c: new Uint8Array(4),
      m: new Uint8Array(4),
    });
    expect(admitPlainContent(undefined, message("y", 1, { text: envelope }))).toBe("show");
  });
});

describe("plain writes", () => {
  it("own_refusal_blocks_send_reply_edit_react_attach_regardless_of_server_flags", () => {
    setActiveSecurity(refusing());
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.conversation("c5"), {
      ...conversation(5),
      readOnly: false,
      readOnlyReason: null,
    });

    expect(() => assertPlainWriteAllowed(qc, "c5")).toThrow(PlainWriteRefusedError);
    expect(() => assertPlainWriteAllowed(qc, "missing")).toThrow(PlainWriteRefusedError);
  });

  it("refuses a plain conversation with a pinned peer that was never accepted", () => {
    setActiveSecurity(snapshot({ pinnedUserIds: new Set([2]) }));

    expect(plainWriteRefusal(conversation(6))).toBe("pinned_peer");
    expect(plainWriteRefusal(conversation(6, { members: [{ userId: ME }, { userId: 3 }] }))).toBe(
      null,
    );
  });

  it("allows an accepted plain conversation with a pinned peer", () => {
    setActiveSecurity(
      snapshot({ pinnedUserIds: new Set([2]), acceptedPlainConversations: new Set([6]) }),
    );

    expect(plainWriteRefusal(conversation(6))).toBe(null);
  });

  it("ignores a pin on the user's own account", () => {
    setActiveSecurity(snapshot({ pinnedUserIds: new Set([ME]) }));

    expect(plainWriteRefusal(conversation(6))).toBe(null);
  });
});

describe("cache helpers", () => {
  it("collects every cached message with its revision", () => {
    const qc = new QueryClient();
    qc.setQueryData<InfiniteData<ChannelPage>>(queryKeys.conversationPages("c1"), {
      pages: [{ messages: [message("a", 2)] } as ChannelPage],
      pageParams: [1],
    });
    qc.setQueryData<Message[]>(queryKeys.threadReplies("/api/messages/a"), [message("r", 1)]);
    qc.setQueryData<Message>(queryKeys.message("p"), message("p", 4));

    expect(knownPlainMessages(qc)).toEqual(
      expect.arrayContaining([
        { id: "a", revisionCount: 2 },
        { id: "r", revisionCount: 1 },
        { id: "p", revisionCount: 4 },
      ]),
    );
  });

  it("filters content already in the cache when the state changes", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.conversation("c1"), conversation(1));
    qc.setQueryData<InfiniteData<ChannelPage>>(queryKeys.conversationPages("c1"), {
      pages: [{ messages: [message("keep"), message("drop")] } as ChannelPage],
      pageParams: [1],
    });
    qc.setQueryData<Message[]>(queryKeys.threadReplies("/api/messages/keep"), [message("r")]);
    setActiveSecurity(refusing([["keep", 1]]));

    reapplyAdmission(qc);

    const pages = qc.getQueryData<InfiniteData<ChannelPage>>(queryKeys.conversationPages("c1"));
    expect(pages?.pages[0]?.messages?.map((m) => m.id)).toEqual(["keep"]);
    expect(qc.getQueryData(queryKeys.threadReplies("/api/messages/keep"))).toBeUndefined();
  });
});
