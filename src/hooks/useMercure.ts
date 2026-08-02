import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import type {
  ChannelPage,
  Conversation,
  Message,
  MessageUpdateEvent,
  TypingMercureEvent,
} from "@/types/api";

function applyMessageEvent(
  queryClient: QueryClient,
  key: readonly unknown[],
  data: Message | MessageUpdateEvent,
): void {
  if ("type" in data && data.type === "message.update") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { type: _type, "@id": _id, ...rest } = data;
    const patch =
      "reactions" in rest
        ? { ...rest, reactions: stripPendingReactionRemovals(data["@id"], rest.reactions) }
        : rest;
    queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) =>
      patchMessageInPages(old, data["@id"], patch),
    );
    queryClient.setQueryData<Message>(queryKeys.message(uuidFromIri(data["@id"])), (old) =>
      old ? { ...old, ...patch } : old,
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
            (m) => m["@id"].startsWith("optimistic-") && m.createdBy?.id === optimisticAuthorId,
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
      applyMessageEvent(queryClient, queryKeys.channelPages(communityId, channelIdentifier), data);
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

export function useConversationMercure(conversationIdentifier: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");
  const topic = conversationIdentifier ? `/api/conversations/${conversationIdentifier}` : null;

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

export function useThreadMercure(rootIri: string | null, topic: string | null) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<Message | MessageUpdateEvent>(event);
      if (!data) return;
      const key = queryKeys.threadReplies(rootIri!);

      queryClient.setQueryData<Message[]>(key, (old) => {
        const list = old ?? [];
        if ("type" in data && data.type === "message.update") {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { type: _type, "@id": _id, ...patch } = data;
          return list.map((m) => (m["@id"] === data["@id"] ? { ...m, ...patch } : m));
        }
        const msg = data as Message;
        if (list.some((m) => m["@id"] === msg["@id"])) return list;
        const optIdx = list.findIndex(
          (m) => m["@id"].startsWith("optimistic-") && m.createdBy?.id === msg.createdBy?.id,
        );
        if (optIdx >= 0) {
          const next = [...list];
          next[optIdx] = msg;
          return next;
        }
        return [...list, msg];
      });
    },
    t("realtime_error"),
  );
}

export function useConversationActivityMercure(userId: number | undefined) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("channel");
  const topic = userId ? `/api/users/${userId}/conversation-activity` : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<{
        type?: string;
        conversationIdentifier?: string;
        lastMessageAt?: string | null;
      }>(event);
      if (!data || data.type !== "conversation.activity" || !data.conversationIdentifier) return;
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
