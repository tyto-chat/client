import { StaleTime } from "./staleTimes";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createConversation,
  createConversationMessage,
  fetchConversationPreflight,
  fetchConversation,
  fetchConversations,
  fetchInvitableUsers,
  markConversationRead,
  muteConversation,
} from "@/api/conversations";
import { fetchConversationPage } from "@/api/pages";
import { editMessage } from "@/api/messages";
import {
  useSendMessageForKey,
  useEditMessageForKey,
  useDeleteMessageForKey,
  useDeleteAttachmentForKey,
} from "@/queries/messageQueries";
import { bumpDmListRevision } from "@/platform/dmListRevision";
import { queryKeys } from "@/queries/queryKeys";
import type { Conversation, User } from "@/types/api";
import { admitPage, assertPlainWriteAllowed, conversationFromCache } from "@/e2ee/admission";
import { isReadOnlyError, refreshConversationPolicy } from "@/queries/conversationPolicy";
import {
  createEncryptedConversation,
  editEncrypted,
  sendEncrypted,
  type ConversationSession,
  type E2eeIdentity,
} from "@/e2ee/conversationSession";
import type { E2eeAvailability } from "@/e2ee/e2eeContextValue";

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

export function useInvitableUsers(search: string, includeBlocked = false) {
  return useQuery({
    queryKey: queryKeys.invitableUsers(search, includeBlocked),
    queryFn: () => fetchInvitableUsers(search, includeBlocked),
    staleTime: StaleTime.short,
  });
}

export function useConversationPreflight(memberUserIds: number[], enabled = true) {
  const sorted = [...memberUserIds].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["conversationPreflight", sorted.join(",")],
    queryFn: () => fetchConversationPreflight(sorted),
    enabled: enabled && sorted.length > 0,
    retry: false,
    staleTime: 0,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberUserIds: number[]) => createConversation(memberUserIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
      bumpDmListRevision();
    },
  });
}

export function useMuteConversation(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mutedUntil: string | null) => muteConversation(identifier, mutedUntil),
    onSuccess: async () => {
      bumpDmListRevision();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations(), exact: true }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversation(identifier),
          exact: true,
        }),
      ]);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.dmNotifications() });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCounts() });
      bumpDmListRevision();
    },
  });
}

export function useInfiniteConversationMessages(
  identifier: string,
  initialPageParam: number,
  latestPageNumber: number,
  enabled = true,
) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: queryKeys.conversationPages(identifier),
    queryFn: async ({ pageParam }) =>
      admitPage(
        conversationFromCache(queryClient, identifier),
        await fetchConversationPage(identifier, pageParam),
      ),
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
  session: ConversationSession | null = null,
) {
  const queryClient = useQueryClient();
  return useSendMessageForKey(
    queryKeys.conversationPages(identifier),
    async ({ text, attachmentIris }) => {
      try {
        if (session !== null) return await sendEncrypted(session, text);
        assertPlainWriteAllowed(queryClient, identifier);
        return await createConversationMessage(identifier, text, attachmentIris ?? []);
      } catch (err) {
        if (isReadOnlyError(err)) refreshConversationPolicy(queryClient, identifier);
        throw err;
      }
    },
    currentUser,
    onRateLimit,
  );
}

export function useEditConversationMessage(
  identifier: string,
  session: ConversationSession | null = null,
) {
  const queryClient = useQueryClient();
  return useEditMessageForKey(queryKeys.conversationPages(identifier), async (messageIri, text) => {
    try {
      if (session !== null) return await editEncrypted(session, messageIri, text);
      assertPlainWriteAllowed(queryClient, identifier);
      return await editMessage(messageIri, text);
    } catch (err) {
      if (isReadOnlyError(err)) refreshConversationPolicy(queryClient, identifier);
      throw err;
    }
  });
}

export function useDeleteConversationAttachment(identifier: string) {
  return useDeleteAttachmentForKey(queryKeys.conversationPages(identifier));
}

export function useDeleteConversationMessage(identifier: string) {
  return useDeleteMessageForKey(queryKeys.conversationPages(identifier));
}

export type StartEncryptedResult =
  | { kind: "opened"; identifier: string }
  | { kind: "group_not_available" }
  | { kind: "unreachable"; userIds: number[] }
  | { kind: "not_ready"; availability: E2eeAvailability }
  | { kind: "blocked"; reason: string | null };

function sameMembers(conversation: Conversation, userIds: number[]): boolean {
  const members = conversation.members.map((m) => m.userId).sort((a, b) => a - b);
  const wanted = [...userIds].sort((a, b) => a - b);
  return members.length === wanted.length && members.every((id, i) => id === wanted[i]);
}

export function useStartEncryptedWithSameParticipants(
  conversation: Conversation | undefined,
  selfId: number | undefined,
  identity: E2eeIdentity | null,
  availability: E2eeAvailability,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<StartEncryptedResult> => {
      if (conversation === undefined || selfId === undefined) {
        return { kind: "blocked", reason: null };
      }
      const all = conversation.members.map((m) => m.userId);
      const others = all.filter((id) => id !== selfId);
      if (others.length !== 1) return { kind: "group_not_available" };
      const existing = (
        await queryClient.fetchQuery({
          queryKey: queryKeys.conversations(),
          queryFn: fetchConversations,
        })
      ).find((c) => c.encrypted === true && sameMembers(c, all));
      if (existing !== undefined) return { kind: "opened", identifier: existing.identifier };
      const preflight = await fetchConversationPreflight(others);
      if (preflight.outcome !== "encrypted") {
        return preflight.unreachableUserIds.length > 0
          ? { kind: "unreachable", userIds: preflight.unreachableUserIds }
          : { kind: "blocked", reason: preflight.reason };
      }
      if (identity === null) return { kind: "not_ready", availability };
      const created = await createEncryptedConversation(identity, others[0] as number);
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
      bumpDmListRevision();
      return { kind: "opened", identifier: created.identifier };
    },
  });
}
