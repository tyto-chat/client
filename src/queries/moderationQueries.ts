import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createModerationAction,
  createModeratorNote,
  deleteModeratorNote,
  fetchActiveModeration,
  fetchModerationLog,
  fetchModeratorNotes,
  liftModerationAction,
  updateModeratorNote,
} from "@/api/moderation";
import { queryKeys } from "@/queries/queryKeys";
import type { ModeratorNote } from "@/types/api";

export function useModerationLog(
  communityId: string,
  page: number,
  type?: "warn" | "timeout" | "ban" | "server_ban",
  activeOnly?: boolean,
  targetUserId?: number,
) {
  return useQuery({
    queryKey: [...queryKeys.moderationLog(communityId), page, type, activeOnly, targetUserId],
    queryFn: () => fetchModerationLog(communityId, page, type, activeOnly, targetUserId),
    staleTime: StaleTime.short,
    placeholderData: (prev) => prev,
  });
}

export function useActiveModeration(communityId: string, userId: number | null) {
  return useQuery({
    queryKey: queryKeys.activeModeration(communityId, userId ?? 0),
    queryFn: () => fetchActiveModeration(communityId, userId!),
    enabled: userId != null,
    staleTime: StaleTime.short,
  });
}

export function useCreateModerationAction(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      targetUserId: number;
      type: "warn" | "timeout" | "ban" | "server_ban";
      reason?: string;
      expiresAt?: string | null;
      channelIdentifier?: string | null;
    }) => createModerationAction(communityId, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.moderationLog(communityId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activeModeration(communityId, variables.targetUserId),
      });
    },
  });
}

export function useLiftModerationAction(communityId: string, targetUserId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: number) => liftModerationAction(communityId, actionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.moderationLog(communityId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activeModeration(communityId, targetUserId),
      });
    },
  });
}

export function useModeratorNotes(communityId: string, userId: number | null) {
  return useQuery({
    queryKey: queryKeys.moderatorNotes(communityId, userId ?? 0),
    queryFn: () => fetchModeratorNotes(communityId, userId!),
    enabled: userId != null,
    staleTime: StaleTime.medium,
  });
}

export function useCreateModeratorNote(communityId: string, userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => createModeratorNote(communityId, userId, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.moderatorNotes(communityId, userId),
      });
    },
  });
}

export function useUpdateModeratorNote(communityId: string, userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, content }: { noteId: number; content: string }) =>
      updateModeratorNote(communityId, noteId, content),
    onSuccess: (updatedNote) => {
      queryClient.setQueryData<ModeratorNote[]>(
        queryKeys.moderatorNotes(communityId, userId),
        (old) => (old ?? []).map((n) => (n.id === updatedNote.id ? updatedNote : n)),
      );
    },
  });
}

export function useDeleteModeratorNote(communityId: string, userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: number) => deleteModeratorNote(communityId, noteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.moderatorNotes(communityId, userId),
      });
    },
  });
}
