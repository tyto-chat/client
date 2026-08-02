import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GroupChannelPermission } from "@/types/api";
import {
  fetchGroups,
  fetchGroup,
  fetchMyGroups,
  fetchGroupMembers,
  fetchGroupChannelPermissions,
  createGroup,
  updateGroup,
  deleteGroup,
  transferGroupOwnership,
  addGroupMember,
  removeGroupMember,
  setGroupChannelPermission,
  removeGroupChannelPermission,
} from "@/api/groups";
import { queryKeys } from "@/queries/queryKeys";
import { useHasAccessToken } from "@/api/tokenStore";

export function useGroups(communityId: string) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.groups(communityId),
    queryFn: () => fetchGroups(communityId),
    enabled: hasToken,
  });
}

export function useGroup(communityId: string, groupId: string) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.group(communityId, groupId),
    queryFn: () => fetchGroup(communityId, groupId),
    enabled: hasToken && !!groupId,
  });
}

export function useMyGroups(enabled = true) {
  return useQuery({
    queryKey: queryKeys.myGroups(),
    queryFn: fetchMyGroups,
    enabled,
  });
}

export function useGroupMembers(communityId: string, groupId: string) {
  return useQuery({
    queryKey: queryKeys.groupMembers(communityId, groupId),
    queryFn: () => fetchGroupMembers(communityId, groupId),
  });
}

export function useGroupChannelPermissions(communityId: string, groupId: string) {
  return useQuery({
    queryKey: queryKeys.groupChannelPermissions(communityId, groupId),
    queryFn: () => fetchGroupChannelPermissions(communityId, groupId),
    staleTime: Infinity,
  });
}

export function useCreateGroup(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      icon?: string | null;
      color?: string | null;
      isHidden?: boolean;
    }) => createGroup(communityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups(communityId) });
    },
  });
}

export function useUpdateGroup(communityId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name?: string;
      icon?: string | null;
      color?: string | null;
      isHidden?: boolean;
      ownerId?: number | null;
    }) => updateGroup(communityId, groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups(communityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myGroups() });
    },
  });
}

export function useDeleteGroup(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(communityId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups(communityId) });
    },
  });
}

export function useTransferGroupOwnership(communityId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => transferGroupOwnership(communityId, groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups(communityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groupMembers(communityId, groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myGroups() });
    },
  });
}

export function useAddGroupMember(communityId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => addGroupMember(communityId, groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groupMembers(communityId, groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myGroups() });
    },
  });
}

export function useRemoveGroupMember(communityId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeGroupMember(communityId, groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groupMembers(communityId, groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups(communityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myGroups() });
    },
  });
}

export function useSetGroupChannelPermission(communityId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      channelIdentifier,
      role,
    }: {
      channelIdentifier: string;
      role: "member" | "moderator";
    }) => setGroupChannelPermission(communityId, groupId, channelIdentifier, role),
    onSuccess: (newPerm) => {
      queryClient.setQueryData<GroupChannelPermission[]>(
        queryKeys.groupChannelPermissions(communityId, groupId),
        (old = []) => {
          const idx = old.findIndex((p) => p.channelId === newPerm.channelId);
          return idx === -1 ? [...old, newPerm] : old.map((p, i) => (i === idx ? newPerm : p));
        },
      );
    },
  });
}

export function useRemoveGroupChannelPermission(communityId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelIdentifier }: { channelIdentifier: string; channelId: number }) =>
      removeGroupChannelPermission(communityId, groupId, channelIdentifier),
    onSuccess: (_, { channelId }) => {
      queryClient.setQueryData<GroupChannelPermission[]>(
        queryKeys.groupChannelPermissions(communityId, groupId),
        (old = []) => old.filter((p) => p.channelId !== channelId),
      );
    },
  });
}
