import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";
import { deleteMessage, editMessage } from "@/api/messages";
import { createThreadReply, fetchThreadReplies } from "@/api/threads";
import { patchMessageInPages, makeOptimisticMessage } from "@/queries/messageQueries";
import { queryKeys } from "@/queries/queryKeys";
import { uuidFromIri } from "@/api/hydra";
import type { ChannelPage, Message, User } from "@/types/api";
import { forgetUploadedAttachments, uploadedAttachmentsFor } from "@/e2ee/attachments";
import { editEncrypted, sendEncrypted, type ConversationSession } from "@/e2ee/conversationSession";
import { admitMessages, assertPlainWriteAllowed, conversationFromCache } from "@/e2ee/admission";
import { isReadOnlyError, refreshConversationPolicy } from "@/queries/conversationPolicy";

export const THREAD_PAGE_SIZE = 50;

function admitReplies(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationIdentifier: string | undefined,
  replies: Message[],
): Message[] {
  return conversationIdentifier === undefined
    ? replies
    : admitMessages(conversationFromCache(queryClient, conversationIdentifier), replies);
}

export function useThreadReplies(rootIri: string | null, conversationIdentifier?: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.threadReplies(rootIri ?? ""),
    queryFn: async () =>
      admitReplies(
        queryClient,
        conversationIdentifier,
        await fetchThreadReplies(uuidFromIri(rootIri!), { limit: THREAD_PAGE_SIZE }),
      ),
    enabled: !!rootIri,
    staleTime: StaleTime.short,
  });
}

export function useReplyToMessage(
  pagesKey: QueryKey,
  rootIri: string,
  currentUser: User | null,
  conversationIdentifier?: string,
  session: ConversationSession | null = null,
) {
  const queryClient = useQueryClient();
  const threadKey = queryKeys.threadReplies(rootIri);

  return useMutation({
    mutationFn: async ({ text, attachmentIris }: { text: string; attachmentIris?: string[] }) => {
      if (session !== null) {
        const iris = attachmentIris ?? [];
        const sent = await sendEncrypted(session, text, rootIri, uploadedAttachmentsFor(iris));
        forgetUploadedAttachments(iris);
        return sent;
      }
      if (conversationIdentifier) assertPlainWriteAllowed(queryClient, conversationIdentifier);
      return createThreadReply(uuidFromIri(rootIri), text, attachmentIris ?? []);
    },
    onMutate: async ({ text }) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previousThread = queryClient.getQueryData<Message[]>(threadKey);
      const previousPages = queryClient.getQueryData<InfiniteData<ChannelPage>>(pagesKey);

      if (currentUser) {
        const optimistic = makeOptimisticMessage(text, currentUser);
        queryClient.setQueryData<Message[]>(threadKey, (old) => [...(old ?? []), optimistic]);
      }

      queryClient.setQueryData<InfiniteData<ChannelPage>>(pagesKey, (old) => {
        const root = old?.pages.flatMap((p) => p.messages ?? []).find((m) => m["@id"] === rootIri);
        return patchMessageInPages(old, rootIri, {
          replyCount: (root?.replyCount ?? 0) + 1,
          lastReplyAt: new Date().toISOString(),
        });
      });

      return { previousThread, previousPages };
    },
    onError: (err, _vars, context) => {
      if (context?.previousThread) queryClient.setQueryData(threadKey, context.previousThread);
      if (context?.previousPages) queryClient.setQueryData(pagesKey, context.previousPages);
      if (conversationIdentifier && isReadOnlyError(err)) {
        refreshConversationPolicy(queryClient, conversationIdentifier);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
    },
  });
}

export function useLoadEarlierReplies(rootIri: string, conversationIdentifier?: string) {
  const queryClient = useQueryClient();
  const threadKey = queryKeys.threadReplies(rootIri);

  return useMutation({
    mutationFn: async (beforeIri: string) =>
      admitReplies(
        queryClient,
        conversationIdentifier,
        await fetchThreadReplies(uuidFromIri(rootIri), {
          before: uuidFromIri(beforeIri),
          limit: THREAD_PAGE_SIZE,
        }),
      ),
    onSuccess: (earlier) => {
      queryClient.setQueryData<Message[]>(threadKey, (old) => {
        const existing = new Set((old ?? []).map((m) => m["@id"]));
        return [...earlier.filter((m) => !existing.has(m["@id"])), ...(old ?? [])];
      });
    },
  });
}

export function useEditThreadReply(
  rootIri: string,
  session: ConversationSession | null = null,
  conversationIdentifier?: string,
) {
  const queryClient = useQueryClient();
  const threadKey = queryKeys.threadReplies(rootIri);

  return useMutation({
    mutationFn: ({ messageIri, text }: { messageIri: string; text: string }) => {
      if (session !== null) return editEncrypted(session, messageIri, text);
      if (conversationIdentifier) assertPlainWriteAllowed(queryClient, conversationIdentifier);
      return editMessage(messageIri, text);
    },
    onMutate: async ({ messageIri, text }) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previous = queryClient.getQueryData<Message[]>(threadKey);
      if (session === null) {
        queryClient.setQueryData<Message[]>(threadKey, (old) =>
          old?.map((m) => (m["@id"] === messageIri ? { ...m, text, edited: true } : m)),
        );
      }
      return { previous };
    },
    onSuccess: (updated, { messageIri }) => {
      queryClient.setQueryData<Message[]>(threadKey, (old) =>
        old?.map((m) =>
          m["@id"] === messageIri
            ? {
                ...m,
                text: updated.text,
                edited: true,
                revisionCount: updated.revisionCount ?? m.revisionCount,
                revisedAt: updated.revisedAt ?? m.revisedAt,
              }
            : m,
        ),
      );
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(threadKey, context.previous);
      if (conversationIdentifier && isReadOnlyError(err)) {
        refreshConversationPolicy(queryClient, conversationIdentifier);
      }
    },
  });
}

export function useDeleteThreadReply(rootIri: string) {
  const queryClient = useQueryClient();
  const threadKey = queryKeys.threadReplies(rootIri);

  return useMutation({
    mutationFn: (messageIri: string) => deleteMessage(messageIri),
    onMutate: async (messageIri) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previousThread = queryClient.getQueryData<Message[]>(threadKey);
      queryClient.setQueryData<Message[]>(threadKey, (old) =>
        old?.map((m) => (m["@id"] === messageIri ? { ...m, isDeleted: true, text: null } : m)),
      );
      return { previousThread };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousThread) queryClient.setQueryData(threadKey, context.previousThread);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
    },
  });
}
