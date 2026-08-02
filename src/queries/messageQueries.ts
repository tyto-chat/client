import { StaleTime } from "./staleTimes";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import {
  createMessage,
  deleteMessage,
  editMessage,
  fetchMessage,
  fetchMessageHistory,
} from "@/api/messages";
import { deleteAttachment } from "@/api/attachments";
import { fetchChannelPage } from "@/api/pages";
import { isRateLimited } from "@/api/client";
import { queryKeys } from "@/queries/queryKeys";
import { inheritMessageKey } from "@/utils/messageKey";
import type { ChannelPage, Message, User } from "@/types/api";

let optimisticSeq = 0;

export function makeOptimisticMessage(text: string, createdBy: User): Message {
  const optimisticId = `optimistic-${Date.now()}-${++optimisticSeq}`;
  return {
    "@id": optimisticId,
    "@type": "Message",
    id: optimisticId,
    text,
    isDeleted: false,
    edited: false,
    kind: "standard",
    createdAt: new Date().toISOString(),
    createdBy,
    reactions: null,
    pageNumber: null,
  };
}

export function patchMessageInPages(
  old: InfiniteData<ChannelPage> | undefined,
  messageIri: string,
  patch: Partial<Message>,
): InfiniteData<ChannelPage> | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      messages: page.messages?.map((m) => (m["@id"] === messageIri ? { ...m, ...patch } : m)),
    })),
  };
}

export function useSendMessageForKey(
  key: readonly unknown[],
  mutationFn: (vars: { text: string; attachmentIris?: string[] }) => Promise<Message>,
  currentUser: User | null,
  onRateLimit?: () => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: async ({ text }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<ChannelPage>>(key);

      if (!currentUser) return { previous };

      const optimistic = makeOptimisticMessage(text, currentUser);

      queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) => {
        const optimisticPage: ChannelPage = {
          "@id": "page-1",
          "@type": "ChannelPage",
          id: -1,
          pageNumber: 1,
          messageCount: 1,
          prevPageId: null,
          nextPageId: null,
          messages: [optimistic],
        };
        if (!old || old.pages.length === 0) {
          return { pages: [optimisticPage], pageParams: [1] };
        }
        const lastIdx = old.pages.length - 1;
        return {
          ...old,
          pages: old.pages.map((page, i) =>
            i === lastIdx ? { ...page, messages: [...(page.messages ?? []), optimistic] } : page,
          ),
        };
      });

      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      if (isRateLimited(err)) onRateLimit?.();
    },
    onSuccess: (realMessage) => {
      queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) => {
        if (!old || old.pages.length === 0) {
          const pageNum = realMessage.pageNumber ?? 1;
          const page: ChannelPage = {
            "@id": `page-${pageNum}`,
            "@type": "ChannelPage",
            id: -1,
            pageNumber: pageNum,
            messageCount: 1,
            prevPageId: null,
            nextPageId: null,
            messages: [realMessage],
          };
          return { pages: [page], pageParams: [pageNum] };
        }
        return {
          ...old,
          pages: old.pages.map((page) => {
            const messages = page.messages ?? [];
            const alreadyHasReal = messages.some((m) => m["@id"] === realMessage["@id"]);
            if (alreadyHasReal) {
              return {
                ...page,
                messages: messages
                  .filter((m) => !m["@id"].startsWith("optimistic-"))
                  .map((m) => (m["@id"] === realMessage["@id"] ? { ...m, ...realMessage } : m)),
              };
            }
            return {
              ...page,
              messages: messages.map((m) => {
                if (!m["@id"].startsWith("optimistic-")) return m;
                inheritMessageKey(m["@id"], realMessage["@id"]);
                return realMessage;
              }),
            };
          }),
        };
      });
    },
  });
}

export function useEditMessageForKey(key: readonly unknown[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageIri, text }: { messageIri: string; text: string }) =>
      editMessage(messageIri, text),
    onSuccess: (updated, { messageIri }) => {
      queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) =>
        patchMessageInPages(old, messageIri, { text: updated.text, edited: true }),
      );
    },
  });
}

export function useDeleteMessageForKey(key: readonly unknown[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageIri: string) => deleteMessage(messageIri),
    onMutate: async (messageIri) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<ChannelPage>>(key);
      queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) =>
        patchMessageInPages(old, messageIri, { isDeleted: true, text: null }),
      );
      return { previous };
    },
    onError: (_err, _messageIri, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key, refetchType: "none" });
    },
  });
}

export function useDeleteAttachmentForKey(key: readonly unknown[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentIri: string) => deleteAttachment(attachmentIri),
    onSuccess: (_data, attachmentIri) => {
      queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages?.map((m) => ({
              ...m,
              attachments: m.attachments?.filter((a) => a["@id"] !== attachmentIri),
            })),
          })),
        };
      });
    },
  });
}

export function useMessage(uuid: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.message(uuid ?? ""),
    queryFn: () => fetchMessage(uuid!),
    enabled: !!uuid,
    staleTime: StaleTime.long,
    retry: false,
    meta: { noGlobalRedirect: true },
  });
}

export function useInfiniteChannelMessages(
  communityId: string,
  channelIdentifier: string,
  initialPageParam: number,
  latestPageNumber: number,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.channelPages(communityId, channelIdentifier),
    queryFn: ({ pageParam }) => fetchChannelPage(communityId, channelIdentifier, pageParam),
    initialPageParam,
    getPreviousPageParam: (firstPage) =>
      firstPage.pageNumber > 1 ? firstPage.pageNumber - 1 : undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pageNumber < latestPageNumber ? lastPage.pageNumber + 1 : undefined,
    staleTime: StaleTime.long,
    enabled: enabled && !!communityId && !!channelIdentifier,
  });
}

export function useSendMessage(
  communityId: string,
  channelIdentifier: string,
  currentUser: User | null,
  onRateLimit?: () => void,
) {
  return useSendMessageForKey(
    queryKeys.channelPages(communityId, channelIdentifier),
    ({ text, attachmentIris }) =>
      createMessage(communityId, channelIdentifier, text, attachmentIris),
    currentUser,
    onRateLimit,
  );
}

export function useEditMessage(communityId: string, channelIdentifier: string) {
  return useEditMessageForKey(queryKeys.channelPages(communityId, channelIdentifier));
}

export function useMessageHistory(messageIri: string | null) {
  return useQuery({
    queryKey: queryKeys.messageHistory(messageIri ?? ""),
    queryFn: () => fetchMessageHistory(messageIri!),
    enabled: !!messageIri,
  });
}

export function useDeleteMessage(communityId: string, channelIdentifier: string) {
  return useDeleteMessageForKey(queryKeys.channelPages(communityId, channelIdentifier));
}

export function useDeleteAttachment(communityId: string, channelIdentifier: string) {
  return useDeleteAttachmentForKey(queryKeys.channelPages(communityId, channelIdentifier));
}
