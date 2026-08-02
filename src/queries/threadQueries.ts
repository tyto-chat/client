import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";
import { deleteMessage, editMessage } from "@/api/messages";
import { createThreadReply, fetchThreadReplies } from "@/api/threads";
import { patchMessageInPages, makeOptimisticMessage } from "@/queries/messageQueries";
import { queryKeys } from "@/queries/queryKeys";
import { uuidFromIri } from "@/api/hydra";
import type { ChannelPage, Message, User } from "@/types/api";

export const THREAD_PAGE_SIZE = 50;

export function useThreadReplies(rootIri: string | null) {
  return useQuery({
    queryKey: queryKeys.threadReplies(rootIri ?? ""),
    queryFn: () => fetchThreadReplies(uuidFromIri(rootIri!), { limit: THREAD_PAGE_SIZE }),
    enabled: !!rootIri,
    staleTime: StaleTime.short,
  });
}

export function useReplyToMessage(pagesKey: QueryKey, rootIri: string, currentUser: User | null) {
  const queryClient = useQueryClient();
  const threadKey = queryKeys.threadReplies(rootIri);

  return useMutation({
    mutationFn: ({ text, attachmentIris }: { text: string; attachmentIris?: string[] }) =>
      createThreadReply(uuidFromIri(rootIri), text, attachmentIris ?? []),
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
    onError: (_err, _vars, context) => {
      if (context?.previousThread) queryClient.setQueryData(threadKey, context.previousThread);
      if (context?.previousPages) queryClient.setQueryData(pagesKey, context.previousPages);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
    },
  });
}

export function useLoadEarlierReplies(rootIri: string) {
  const queryClient = useQueryClient();
  const threadKey = queryKeys.threadReplies(rootIri);

  return useMutation({
    mutationFn: (beforeIri: string) =>
      fetchThreadReplies(uuidFromIri(rootIri), {
        before: uuidFromIri(beforeIri),
        limit: THREAD_PAGE_SIZE,
      }),
    onSuccess: (earlier) => {
      queryClient.setQueryData<Message[]>(threadKey, (old) => {
        const existing = new Set((old ?? []).map((m) => m["@id"]));
        return [...earlier.filter((m) => !existing.has(m["@id"])), ...(old ?? [])];
      });
    },
  });
}

export function useEditThreadReply(rootIri: string) {
  const queryClient = useQueryClient();
  const threadKey = queryKeys.threadReplies(rootIri);

  return useMutation({
    mutationFn: ({ messageIri, text }: { messageIri: string; text: string }) =>
      editMessage(messageIri, text),
    onMutate: async ({ messageIri, text }) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previous = queryClient.getQueryData<Message[]>(threadKey);
      queryClient.setQueryData<Message[]>(threadKey, (old) =>
        old?.map((m) => (m["@id"] === messageIri ? { ...m, text, edited: true } : m)),
      );
      return { previous };
    },
    onSuccess: (updated, { messageIri }) => {
      queryClient.setQueryData<Message[]>(threadKey, (old) =>
        old?.map((m) => (m["@id"] === messageIri ? { ...m, text: updated.text, edited: true } : m)),
      );
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(threadKey, context.previous);
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
