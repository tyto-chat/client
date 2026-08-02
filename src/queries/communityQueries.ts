import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCommunityMember,
  createCommunity,
  createCommunityInvite,
  fetchCommunities,
  fetchCommunity,
  fetchCommunityInvites,
  fetchCommunityMembers,
  fetchPinnedCommunities,
  joinCommunity,
  leaveCommunity,
  pinCommunity,
  reorderPinnedCommunities,
  revokeCommunityInvite,
  unpinCommunity,
  updateCommunity,
  updateCommunityMemberRole,
} from "@/api/communities";
import type { PinnedCommunitiesResponse } from "@/types/api";
import { queryKeys } from "@/queries/queryKeys";
import { useHasAccessToken } from "@/api/tokenStore";

export function useCommunities() {
  return useQuery({
    queryKey: queryKeys.communities(),
    queryFn: fetchCommunities,
  });
}

export function useCommunity(identifier: string) {
  return useQuery({
    queryKey: queryKeys.community(identifier),
    queryFn: () => fetchCommunity(identifier),
  });
}

export function useCommunityMembers(communityId: string) {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.communityMembers(communityId),
    queryFn: () => fetchCommunityMembers(communityId),
    staleTime: StaleTime.medium,
    enabled: hasToken,
  });
}

export function useCreateCommunity() {
  return useMutation({
    mutationFn: createCommunity,
  });
}

export function useCommunityInvites(communityId: string) {
  return useQuery({
    queryKey: queryKeys.communityInvites(communityId),
    queryFn: () => fetchCommunityInvites(communityId),
    staleTime: StaleTime.short,
  });
}

export function useCreateCommunityInvite(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { maxUses?: number | null; expiresAt?: string | null }) =>
      createCommunityInvite(communityId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityInvites(communityId) });
    },
  });
}

export function useRevokeCommunityInvite(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: number) => revokeCommunityInvite(communityId, inviteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityInvites(communityId) });
    },
  });
}

export function useAddCommunityMember(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      role = "member",
    }: {
      userId: number;
      role?: "member" | "moderator" | "admin";
    }) => addCommunityMember(communityId, userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembers(communityId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembership(communityId) });
    },
  });
}

export function useUpdateCommunityMemberRole(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: number;
      role: "member" | "moderator" | "admin";
    }) => updateCommunityMemberRole(communityId, memberId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembers(communityId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembership(communityId) });
    },
  });
}

export function useUpdateCommunity(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name?: string;
      description?: string;
      isPrivate?: boolean;
      accentColor?: string | null;
      broadcastMentionMinRole?: "member" | "moderator" | "admin";
      locale?: string;
      welcomeChannelIdentifier?: string | null;
    }) => updateCommunity(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.community(updated.identifier), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
    },
  });
}

export function usePinnedCommunities() {
  const hasToken = useHasAccessToken();
  return useQuery({
    queryKey: queryKeys.pinnedCommunities(),
    queryFn: fetchPinnedCommunities,
    staleTime: StaleTime.short,
    enabled: hasToken,
  });
}

export function usePinCommunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (communityId: number) => pinCommunity(communityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
    },
  });
}

export function useUnpinCommunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (communityId: number) => unpinCommunity(communityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
    },
  });
}

export function useReorderPinnedCommunities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (communityIds: number[]) => reorderPinnedCommunities(communityIds),
    onMutate: async (communityIds) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.pinnedCommunities() });
      const previous = queryClient.getQueryData<PinnedCommunitiesResponse>(
        queryKeys.pinnedCommunities(),
      );
      if (previous) {
        const byId = new Map(previous.items.map((p) => [p.community.id, p]));
        const next = communityIds
          .map((id, position) => {
            const pin = byId.get(id);
            return pin ? { ...pin, position } : null;
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);
        queryClient.setQueryData<PinnedCommunitiesResponse>(queryKeys.pinnedCommunities(), {
          items: next,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.pinnedCommunities(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
    },
  });
}

export function useJoinCommunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (identifier: string) => joinCommunity(identifier),
    onSuccess: (identifier) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.community(identifier) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.communityMembership(identifier),
      });
    },
  });
}

export function useLeaveCommunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (identifier: string) => leaveCommunity(identifier),
    onSuccess: (_void, identifier) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.community(identifier) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communityMembership(identifier) });
    },
  });
}
