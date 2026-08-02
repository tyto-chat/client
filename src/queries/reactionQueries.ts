import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { addReaction, fetchReactionUsers, removeReaction } from "@/api/reactions";
import { queryKeys } from "@/queries/queryKeys";
import type { ChannelPage, Message, ReactionEntry, ReactionUser } from "@/types/api";

interface ToggleReactionVars {
  messageIri: string;
  emoji: string;
  existingId?: number;
}

const pendingReactionRemovals = new Set<string>();
const removalKey = (messageIri: string, emoji: string, userId: number) =>
  `${messageIri}|${emoji}|${userId}`;

export function stripPendingReactionRemovals(
  messageIri: string,
  reactions: Record<string, ReactionEntry[]> | null | undefined,
): Record<string, ReactionEntry[]> | null {
  if (!reactions || pendingReactionRemovals.size === 0) return reactions ?? null;
  const out: Record<string, ReactionEntry[]> = {};
  for (const [emoji, entries] of Object.entries(reactions)) {
    const kept = entries.filter(
      (e) => !pendingReactionRemovals.has(removalKey(messageIri, emoji, e.userId)),
    );
    if (kept.length > 0) out[emoji] = kept;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function applyOptimisticReactionToggle(
  message: Message,
  emoji: string,
  existingId: number | undefined,
  currentUserId: number,
): Message {
  const reactions: Record<string, ReactionEntry[]> = structuredClone(message.reactions ?? {});

  if (existingId !== undefined) {
    reactions[emoji] = (reactions[emoji] ?? []).filter((e) => e.userId !== currentUserId);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji] = [...(reactions[emoji] ?? []), { id: 0, userId: currentUserId }];
  }

  return {
    ...message,
    reactions: Object.keys(reactions).length > 0 ? reactions : null,
  };
}

function applyConfirmedReactionId(
  message: Message,
  emoji: string,
  currentUserId: number,
  realId: number,
): Message {
  if (!message.reactions?.[emoji]) return message;
  const reactions = structuredClone(message.reactions);
  reactions[emoji] = (reactions[emoji] ?? []).map((e) =>
    e.userId === currentUserId && !e.id ? { ...e, id: realId } : e,
  );
  return { ...message, reactions };
}

function useToggleReactionForKey(cacheKey: readonly unknown[], currentUserId: number) {
  const queryClient = useQueryClient();

  return useMutation<
    void | { id: number },
    Error,
    ToggleReactionVars,
    { previous: InfiniteData<ChannelPage> | undefined }
  >({
    mutationFn: ({ messageIri, emoji, existingId }: ToggleReactionVars) => {
      if (existingId === 0) {
        pendingReactionRemovals.add(removalKey(messageIri, emoji, currentUserId));
        return Promise.resolve();
      }
      return existingId !== undefined ? removeReaction(existingId) : addReaction(messageIri, emoji);
    },

    onMutate: async ({ messageIri, emoji, existingId }) => {
      await queryClient.cancelQueries({ queryKey: cacheKey });
      const previous = queryClient.getQueryData<InfiniteData<ChannelPage>>(cacheKey);

      queryClient.setQueryData<InfiniteData<ChannelPage>>(cacheKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages?.map((m) =>
              m["@id"] !== messageIri
                ? m
                : applyOptimisticReactionToggle(m, emoji, existingId, currentUserId),
            ),
          })),
        };
      });

      return { previous };
    },

    onError: (_err, vars, context) => {
      if (context?.previous) queryClient.setQueryData(cacheKey, context.previous);
      if (vars.existingId === undefined) {
        pendingReactionRemovals.delete(removalKey(vars.messageIri, vars.emoji, currentUserId));
      }
    },

    onSuccess: (data: void | { id: number }, { messageIri, emoji, existingId }) => {
      const created = data as { id?: number } | undefined;
      if (existingId !== undefined || !created?.id) return;
      queryClient.setQueryData<InfiniteData<ChannelPage>>(cacheKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages?.map((m) =>
              m["@id"] !== messageIri
                ? m
                : applyConfirmedReactionId(m, emoji, currentUserId, created.id!),
            ),
          })),
        };
      });

      const key = removalKey(messageIri, emoji, currentUserId);
      if (pendingReactionRemovals.has(key)) {
        void removeReaction(created.id)
          .catch(() => {})
          .finally(() => pendingReactionRemovals.delete(key));
      }
    },
  });
}

export function useToggleReaction(
  communityId: string,
  channelIdentifier: string,
  currentUserId: number,
) {
  return useToggleReactionForKey(
    queryKeys.channelPages(communityId, channelIdentifier),
    currentUserId,
  );
}

export function useToggleConversationReaction(identifier: string, currentUserId: number) {
  return useToggleReactionForKey(queryKeys.conversationPages(identifier), currentUserId);
}

export function useToggleThreadReaction(rootIri: string, currentUserId: number) {
  const queryClient = useQueryClient();
  const cacheKey = queryKeys.threadReplies(rootIri);

  return useMutation<
    void | { id: number },
    Error,
    ToggleReactionVars,
    { previous: Message[] | undefined }
  >({
    mutationFn: ({ messageIri, emoji, existingId }: ToggleReactionVars) => {
      if (existingId === 0) {
        pendingReactionRemovals.add(removalKey(messageIri, emoji, currentUserId));
        return Promise.resolve();
      }
      return existingId !== undefined ? removeReaction(existingId) : addReaction(messageIri, emoji);
    },

    onMutate: async ({ messageIri, emoji, existingId }) => {
      await queryClient.cancelQueries({ queryKey: cacheKey });
      const previous = queryClient.getQueryData<Message[]>(cacheKey);

      queryClient.setQueryData<Message[]>(cacheKey, (old) =>
        old?.map((m) =>
          m["@id"] !== messageIri
            ? m
            : applyOptimisticReactionToggle(m, emoji, existingId, currentUserId),
        ),
      );

      return { previous };
    },

    onError: (_err, vars, context) => {
      if (context?.previous) queryClient.setQueryData(cacheKey, context.previous);
      if (vars.existingId === undefined) {
        pendingReactionRemovals.delete(removalKey(vars.messageIri, vars.emoji, currentUserId));
      }
    },

    onSuccess: (data: void | { id: number }, { messageIri, emoji, existingId }) => {
      const created = data as { id?: number } | undefined;
      if (existingId !== undefined || !created?.id) return;
      queryClient.setQueryData<Message[]>(cacheKey, (old) =>
        old?.map((m) =>
          m["@id"] !== messageIri
            ? m
            : applyConfirmedReactionId(m, emoji, currentUserId, created.id!),
        ),
      );

      const key = removalKey(messageIri, emoji, currentUserId);
      if (pendingReactionRemovals.has(key)) {
        void removeReaction(created.id)
          .catch(() => {})
          .finally(() => pendingReactionRemovals.delete(key));
      }
    },
  });
}

export function useReactionUsers(
  messageIri: string,
  emoji: string,
  enabled: boolean,
): { data: ReactionUser[] | undefined; isLoading: boolean } {
  return useQuery({
    queryKey: queryKeys.reactionUsers(messageIri, emoji),
    queryFn: () => fetchReactionUsers(messageIri, emoji),
    enabled,
    staleTime: StaleTime.short,
  });
}
