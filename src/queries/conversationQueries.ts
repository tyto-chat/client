import { StaleTime } from "./staleTimes";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createConversation,
  createConversationMessage,
  fetchConversation,
  fetchConversations,
  fetchInvitableUsers,
  markConversationRead,
  muteConversation,
} from "@/api/conversations";
import { fetchConversationPage } from "@/api/pages";
import {
  useSendMessageForKey,
  useEditMessageForKey,
  useDeleteMessageForKey,
  useDeleteAttachmentForKey,
} from "@/queries/messageQueries";
import { queryKeys } from "@/queries/queryKeys";
import type { User } from "@/types/api";

export function useConversations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.conversations(),
    queryFn: fetchConversations,
    enabled,
  });
}

export function useConversation(identifier: string | undefined) {
  return useQuery({
    queryKey: identifier ? queryKeys.conversation(identifier) : ["conversations", "__none__"],
    queryFn: () => fetchConversation(identifier as string),
    enabled: !!identifier,
  });
}

export function useInvitableUsers(search: string) {
  return useQuery({
    queryKey: queryKeys.invitableUsers(search),
    queryFn: () => fetchInvitableUsers(search),
    staleTime: StaleTime.short,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberUserIds: number[]) => createConversation(memberUserIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.conversations() }),
  });
}

export function useMuteConversation(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mutedUntil: string | null) => muteConversation(identifier, mutedUntil),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(identifier) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
    },
  });
}

export function useMarkConversationRead(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markConversationRead(identifier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(identifier) });
    },
  });
}

export function useInfiniteConversationMessages(
  identifier: string,
  initialPageParam: number,
  latestPageNumber: number,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.conversationPages(identifier),
    queryFn: ({ pageParam }) => fetchConversationPage(identifier, pageParam),
    initialPageParam,
    getPreviousPageParam: (firstPage) =>
      firstPage.pageNumber > 1 ? firstPage.pageNumber - 1 : undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pageNumber < latestPageNumber ? lastPage.pageNumber + 1 : undefined,
    staleTime: StaleTime.long,
    enabled: enabled && !!identifier,
  });
}

export function useSendConversationMessage(
  identifier: string,
  currentUser: User | null,
  onRateLimit?: () => void,
) {
  return useSendMessageForKey(
    queryKeys.conversationPages(identifier),
    ({ text, attachmentIris }) => createConversationMessage(identifier, text, attachmentIris ?? []),
    currentUser,
    onRateLimit,
  );
}

export function useEditConversationMessage(identifier: string) {
  return useEditMessageForKey(queryKeys.conversationPages(identifier));
}

export function useDeleteConversationAttachment(identifier: string) {
  return useDeleteAttachmentForKey(queryKeys.conversationPages(identifier));
}

export function useDeleteConversationMessage(identifier: string) {
  return useDeleteMessageForKey(queryKeys.conversationPages(identifier));
}
