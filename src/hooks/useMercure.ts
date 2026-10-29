import { hashKey, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { dispatchE2eeEvent, isE2eeEvent, type E2eeEvent } from "@/e2ee/e2eeEvents";
import type { InfiniteData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { conversationActivityTopic, conversationTopic } from "@/api/topics";
import { queryKeys } from "@/queries/queryKeys";
import { patchMessageInPages } from "@/queries/messageQueries";
import { stripPendingReactionRemovals } from "@/queries/reactionQueries";
import { uuidFromIri } from "@/api/hydra";
import {
  channelTypingScope,
  clearTyper,
  conversationTypingScope,
  recordTyping,
} from "@/queries/typingQueries";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { inheritMessageKey } from "@/utils/messageKey";
import { parseMercureEvent } from "@/utils/parseMercureEvent";
import { isOptimisticMessage } from "@/utils/optimisticMessage";
import type {
  ChannelPage,
  Conversation,
  Message,
  MessageUpdateEvent,
  TypingMercureEvent,
} from "@/types/api";

const pendingReplays = new WeakMap<QueryClient, Map<string, Array<() => void>>>();

function reapplyAfterInFlightFetch(
  queryClient: QueryClient,
  key: readonly unknown[],
  apply: () => void,
): void {
  const queryHash = hashKey(key);
  let byQuery = pendingReplays.get(queryClient);
  if (!byQuery) {
    byQuery = new Map();
    pendingReplays.set(queryClient, byQuery);
  }
  const queued = byQuery.get(queryHash);
  if (queued) {
    queued.push(apply);
    return;
  }
  if (queryClient.isFetching({ queryKey: key, exact: true }) === 0) return;
  const queue = [apply];
  byQuery.set(queryHash, queue);
  const cache = queryClient.getQueryCache();
  const unsubscribe = cache.subscribe((event) => {
    if (event.query.queryHash !== queryHash) return;
    if (event.type !== "removed" && event.type !== "updated") return;
    if (event.type === "updated" && event.query.state.fetchStatus !== "idle") return;
    unsubscribe();
    byQuery.delete(queryHash);
    const replacedByFetch =
      event.type === "updated" && event.action.type === "success" && !event.action.manual;
    if (replacedByFetch) queue.forEach((replay) => replay());
  });
}

function containsMessage(data: InfiniteData<ChannelPage> | undefined, iri: string): boolean {
  return !!data?.pages.some((page) => page.messages?.some((m) => m["@id"] === iri));
}

function applyMessageEvent(
  queryClient: QueryClient,
  key: readonly unknown[],
  data: Message | MessageUpdateEvent,
  canReplay: () => boolean = () => true,
): void {
  patchMessagePages(queryClient, key, data);
  const isUpdate = "type" in data && data.type === "message.update";
  reapplyAfterInFlightFetch(queryClient, key, () => {
    if (!canReplay()) return;
    if (!isUpdate && containsMessage(queryClient.getQueryData(key), data["@id"])) return;
    patchMessagePages(queryClient, key, data);
  });
  if (isUpdate) {
    const detailKey = queryKeys.message(uuidFromIri(data["@id"]));
    const patchDetail = () =>
      queryClient.setQueryData<Message>(detailKey, (old) =>
        old ? { ...old, ...updatePatch(data) } : old,
      );
    patchDetail();
    reapplyAfterInFlightFetch(queryClient, detailKey, patchDetail);
  }
}

function updatePatch(data: MessageUpdateEvent): Partial<Message> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { type: _type, "@id": _id, ...rest } = data;
  return "reactions" in rest
    ? { ...rest, reactions: stripPendingReactionRemovals(data["@id"], rest.reactions) }
    : rest;
}

function patchMessagePages(
  queryClient: QueryClient,
  key: readonly unknown[],
  data: Message | MessageUpdateEvent,
): void {
  if ("type" in data && data.type === "message.update") {
    queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) =>
      patchMessageInPages(old, data["@id"], updatePatch(data)),
    );
    return;
  }

  const message = data as Message;
  const targetPageNumber = message.pageNumber;

  queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) => {
    if (!old || old.pages.length === 0) {
      const pageNum = targetPageNumber ?? 1;
      const page: ChannelPage = {
        "@id": `page-${pageNum}`,
        "@type": "ChannelPage",
        id: -1,
        pageNumber: pageNum,
        messageCount: 1,
        prevPageId: null,
        nextPageId: null,
        messages: [message],
      };
      return { pages: [page], pageParams: [pageNum] };
    }

    const optimisticAuthorId = message.createdBy?.id;
    if (optimisticAuthorId != null) {
      let replaced = false;
      const next = {
        ...old,
        pages: old.pages.map((page) => {
          if (replaced || !page.messages) return page;
          const idx = page.messages.findIndex(
            (m) => isOptimisticMessage(m["@id"]) && m.createdBy?.id === optimisticAuthorId,
          );
          const stale = idx < 0 ? undefined : page.messages[idx];
          if (!stale) return page;
          replaced = true;
          inheritMessageKey(stale["@id"], message["@id"]);
          const messages = [...page.messages];
          messages[idx] = message;
          return { ...page, messages };
        }),
      };
      if (replaced) return next;
    }

    const pageIndex = old.pages.findIndex((p) => p.pageNumber === targetPageNumber);

    if (pageIndex >= 0) {
      return {
        ...old,
        pages: old.pages.map((page, i) => {
          if (i !== pageIndex) return page;
          const alreadyExists = page.messages?.some((m) => m["@id"] === message["@id"]);
          if (alreadyExists) {
            return {
              ...page,
              messages: page.messages?.map((m) => {
                if (m["@id"] !== message["@id"]) return m;
                if (message.text != null || message.isDeleted) return { ...m, ...message };
                return {
                  ...m,
                  reactions: stripPendingReactionRemovals(m["@id"], message.reactions),
                };
              }),
            };
          }
          return {
            ...page,
            messages: [...(page.messages ?? []), message],
            messageCount: page.messageCount + 1,
          };
        }),
      };
    }

    const lastPage = old.pages.at(-1);
    const newPageNum = targetPageNumber ?? (lastPage ? lastPage.pageNumber + 1 : 1);
    return {
      ...old,
      pages: [
        ...old.pages,
        {
          "@id": `page-${newPageNum}`,
          "@type": "ChannelPage",
          id: -1,
          pageNumber: newPageNum,
          messageCount: 1,
          prevPageId: null,
          nextPageId: null,
          messages: [message],
        } satisfies ChannelPage,
      ],
      pageParams: [...old.pageParams, newPageNum],
    };
  });
}

interface UseChannelMercureOptions {
  isLatestLoaded?: () => boolean;
  onNewMessageWhileHistorical?: () => void;
}

export function useChannelMercure(
  channelTopic: string,
  communityId: string,
  channelIdentifier: string,
  options: UseChannelMercureOptions = {},
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");
  const { isLatestLoaded, onNewMessageWhileHistorical } = options;

  useMercureSubscription(
    channelTopic || null,
    (event) => {
      const data = parseMercureEvent<Message | MessageUpdateEvent | TypingMercureEvent>(event);
      if (!data) return;
      if ("type" in data && data.type === "typing") {
        recordTyping(channelTypingScope(communityId, channelIdentifier), data);
        return;
      }
      const isUpdate = "type" in data && data.type === "message.update";
      if (!isUpdate) {
        const senderId = (data as Message).createdBy?.id;
        if (senderId != null) {
          clearTyper(channelTypingScope(communityId, channelIdentifier), senderId);
        }
      }
      if (!isUpdate && isLatestLoaded && !isLatestLoaded()) {
        onNewMessageWhileHistorical?.();
        return;
      }
      if (!isUpdate && "@type" in data && data["@type"] !== "Message") {
        return;
      }
      applyMessageEvent(
        queryClient,
        queryKeys.channelPages(communityId, channelIdentifier),
        data,
        () => isUpdate || !isLatestLoaded || isLatestLoaded(),
      );
      if (isUpdate && "pinned" in data) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.pinnedMessages(communityId, channelIdentifier),
        });
      }
    },
    t("realtime_error"),
    () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.channelPages(communityId, channelIdentifier),
      }),
  );
}

export function useConversationMercure(
  conversationIdentifier: string,
  conversationId: number | undefined,
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");
  const topic = conversationId != null ? conversationTopic(conversationId) : null;

  useMercureSubscription(
    topic,
    (event) => {
      const raw = parseMercureEvent<
        {
          type?: string;
          "@type"?: string;
          "@id"?: string;
        } & Record<string, unknown>
      >(event);
      if (!raw) return;

      if (raw.type === "typing") {
        recordTyping(
          conversationTypingScope(conversationIdentifier),
          raw as unknown as TypingMercureEvent,
        );
        return;
      }

      if (isE2eeEvent(raw)) {
        dispatchE2eeEvent(raw as E2eeEvent);
        return;
      }

      if (raw.type && raw.type !== "message.update") {
        return;
      }

      if (raw["@type"] === "Conversation") {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversation(conversationIdentifier),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
        return;
      }

      if (!raw.type) {
        const senderId = (raw as unknown as Message).createdBy?.id;
        if (senderId != null) {
          clearTyper(conversationTypingScope(conversationIdentifier), senderId);
        }
      }

      applyMessageEvent(
        queryClient,
        queryKeys.conversationPages(conversationIdentifier),
        raw as Message | MessageUpdateEvent,
      );
    },
    t("realtime_error"),
    () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversationPages(conversationIdentifier),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversation(conversationIdentifier),
      });
    },
  );
}

function parentIri(msg: Message): string | null {
  const parent = msg.parent as Message | string | null | undefined;
  if (!parent) return null;
  return typeof parent === "string" ? parent : (parent["@id"] ?? null);
}

export function useThreadMercure(rootIri: string | null, topic: string | null) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<Message | MessageUpdateEvent>(event);
      if (!data) return;
      const key = queryKeys.threadReplies(rootIri!);

      const applyThreadEvent = () => {
        queryClient.setQueryData<Message[]>(key, (old) => {
          const list = old ?? [];
          if ("type" in data && data.type === "message.update") {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { type: _type, "@id": _id, ...patch } = data;
            return list.map((m) => (m["@id"] === data["@id"] ? { ...m, ...patch } : m));
          }
          const msg = data as Message;
          const parent = parentIri(msg);
          if (!parent || !rootIri || uuidFromIri(parent) !== uuidFromIri(rootIri)) return list;
          if (list.some((m) => m["@id"] === msg["@id"])) return list;
          const optIdx = list.findIndex(
            (m) => isOptimisticMessage(m["@id"]) && m.createdBy?.id === msg.createdBy?.id,
          );
          if (optIdx >= 0) {
            const next = [...list];
            next[optIdx] = msg;
            return next;
          }
          return [...list, msg];
        });
      };
      applyThreadEvent();
      reapplyAfterInFlightFetch(queryClient, key, applyThreadEvent);
    },
    t("realtime_error"),
  );
}

export function useConversationActivityMercure(userId: number | undefined) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");
  const topic = userId ? conversationActivityTopic(userId) : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<{
        type?: string;
        conversationIdentifier?: string;
        lastMessageAt?: string | null;
        readOnly?: boolean;
        readOnlyReason?: Conversation["readOnlyReason"];
      }>(event);
      if (!data?.conversationIdentifier) return;
      if (data.type === "conversation.policy") {
        const policy = {
          readOnly: data.readOnly ?? false,
          readOnlyReason: data.readOnlyReason ?? null,
        };
        queryClient.setQueryData<Conversation>(
          queryKeys.conversation(data.conversationIdentifier),
          (old) => (old ? { ...old, ...policy } : old),
        );
        queryClient.setQueryData<Conversation[]>(queryKeys.conversations(), (old) =>
          old?.map((c) => (c.identifier === data.conversationIdentifier ? { ...c, ...policy } : c)),
        );
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversation(data.conversationIdentifier),
          exact: true,
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(), exact: true });
        return;
      }
      if (data.type !== "conversation.activity") return;
      queryClient.setQueryData<Conversation[]>(queryKeys.conversations(), (old) => {
        if (!old) return old;
        return old.map((c) =>
          c.identifier === data.conversationIdentifier
            ? { ...c, lastMessageAt: data.lastMessageAt ?? null }
            : c,
        );
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
    },
    t("realtime_error"),
  );
}
