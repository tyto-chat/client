import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addChannelMember,
  archiveChannel,
  createChannel,
  createSection,
  deleteChannel,
  deleteSection,
  fetchChannelMembers,
  fetchChannelUnread,
  markChannelRead,
  removeChannelMember,
  reorderChannels,
  reorderSections,
  unarchiveChannel,
  updateChannel,
  updateChannelMemberRole,
  updateSection,
} from "@/api/channels";
import { queryKeys } from "@/queries/queryKeys";
import { useHasAccessToken } from "@/api/tokenStore";
import type { ChannelMember } from "@/types/api";

export function useChannelUnread(communityIdentifier: string) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.channelUnread(communityIdentifier),
    queryFn: () => fetchChannelUnread(communityIdentifier),
    enabled: hasToken && !!communityIdentifier,
  });
}

export function useMarkChannelRead(communityIdentifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => markChannelRead(communityIdentifier, channelId),
    onSuccess: (_data, channelId) => {
      queryClient.setQueryData<string[]>(
        queryKeys.channelUnread(communityIdentifier),
        (old) => old?.filter((id) => id !== channelId) ?? [],
      );
    },
  });
}

export function useCreateSection(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => createSection(communityId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) }),
  });
}

export function useCreateChannel(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createChannel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) }),
  });
}

export function useUpdateChannel(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      channelId,
      ...data
    }: {
      channelId: string;
      name?: string;
      description?: string;
      section?: string;
      isPrivate?: boolean | null;
      isReadonly?: boolean | null;
      areReadonlyRepliesAllowed?: boolean | null;
      allowAttachments?: boolean;
    }) => updateChannel(communityId, channelId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) }),
  });
}

export function useDeleteChannel(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => deleteChannel(communityId, channelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) }),
  });
}

export function useUpdateSection(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string }) =>
      updateSection(communityId, id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) }),
  });
}

export function useDeleteSection(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSection(communityId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) }),
  });
}

export function useChannelMembers(communityId: string, channelId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.channelMembers(communityId, channelId),
    queryFn: () => fetchChannelMembers(communityId, channelId),
    enabled: enabled && !!communityId && !!channelId,
  });
}

export function useAddChannelMember(communityId: string, channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role?: "member" | "moderator" }) =>
      addChannelMember(communityId, channelId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.channelMembers(communityId, channelId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembership(communityId) });
    },
  });
}

export function useRemoveChannelMember(communityId: string, channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeChannelMember(communityId, channelId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.channelMembers(communityId, channelId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembership(communityId) });
    },
  });
}

export function useLeaveChannel(communityId: string, channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeChannelMember(communityId, channelId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembership(communityId) });
    },
  });
}

export function useUpdateChannelMemberRole(communityId: string, channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: "member" | "moderator" }) =>
      updateChannelMemberRole(communityId, channelId, userId, role),
    onSuccess: (updatedMember) => {
      queryClient.setQueryData<ChannelMember[]>(
        queryKeys.channelMembers(communityId, channelId),
        (old) => old?.map((m) => (m.id === updatedMember.id ? updatedMember : m)),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.channelMembers(communityId, channelId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembership(communityId) });
    },
  });
}

export function useReorderSections(communityIdentifier: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, number[]>({
    mutationFn: (sections) => reorderSections(communityIdentifier, sections),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.community(communityIdentifier) });
    },
  });
}

export function useReorderChannels(communityIdentifier: string, sectionId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, number[]>({
    mutationFn: (channels) => reorderChannels(communityIdentifier, sectionId, channels),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.community(communityIdentifier) });
    },
  });
}

export function useArchiveChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      communityIdentifier,
      channelIdentifier,
    }: {
      communityIdentifier: string;
      channelIdentifier: string;
    }) => archiveChannel(communityIdentifier, channelIdentifier).then(() => communityIdentifier),
    onSuccess: (communityIdentifier) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.community(communityIdentifier) });
    },
  });
}

export function useUnarchiveChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      communityIdentifier,
      channelIdentifier,
    }: {
      communityIdentifier: string;
      channelIdentifier: string;
    }) => unarchiveChannel(communityIdentifier, channelIdentifier).then(() => communityIdentifier),
    onSuccess: (communityIdentifier) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.community(communityIdentifier) });
    },
  });
}
