import { apiClient, uploadFile } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type {
  Community,
  CommunityInvite,
  CommunityMember,
  HydraCollection,
  InvitePreview,
  PinnedCommunitiesResponse,
  PinnedCommunity,
} from "@/types/api";

export async function fetchCommunities(): Promise<Community[]> {
  const data = await apiClient.get<HydraCollection<Community> | Community[]>("/api/communities");

  return unwrapCollection(data);
}

export function fetchCommunity(identifier: string): Promise<Community> {
  return apiClient.get<Community>(`/api/communities/${identifier}`);
}

export function createCommunity(data: {
  name: string;
  description?: string;
  isPrivate?: boolean;
}): Promise<Community> {
  return apiClient.post<Community>("/api/communities", data);
}

export function updateCommunity(
  identifier: string,
  data: {
    name?: string;
    description?: string;
    isPrivate?: boolean;
    accentColor?: string | null;
    broadcastMentionMinRole?: "member" | "moderator" | "admin";
    locale?: string;
    welcomeChannelIdentifier?: string | null;
  },
): Promise<Community> {
  return apiClient.patch<Community>(`/api/communities/${identifier}`, data);
}

export function uploadCommunityLogo(identifier: string, file: File): Promise<unknown> {
  return uploadFile<unknown>(`/api/communities/${identifier}/logo`, file);
}

export function removeCommunityLogo(identifier: string): Promise<void> {
  return apiClient.delete<void>(`/api/communities/${identifier}/logo`);
}

export async function fetchCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  const data = await apiClient.get<HydraCollection<CommunityMember>>(
    `/api/communities/${communityId}/members`,
  );
  return unwrapCollection(data);
}

export function updateCommunityMemberRole(
  communityId: string,
  memberId: number,
  role: "member" | "moderator" | "admin",
): Promise<CommunityMember> {
  return apiClient.patch<CommunityMember>(`/api/communities/${communityId}/members/${memberId}`, {
    role,
  });
}

export function addCommunityMember(
  communityId: string,
  userId: number,
  role: "member" | "moderator" | "admin" = "member",
): Promise<CommunityMember> {
  return apiClient.post<CommunityMember>(`/api/communities/${communityId}/members/add`, {
    userId,
    role,
  });
}

export async function fetchCommunityInvites(communityId: string): Promise<CommunityInvite[]> {
  const data = await apiClient.get<HydraCollection<CommunityInvite>>(
    `/api/communities/${communityId}/invites`,
  );
  return unwrapCollection(data);
}

export function createCommunityInvite(
  communityId: string,
  data: { maxUses?: number | null; expiresAt?: string | null },
): Promise<CommunityInvite> {
  return apiClient.post<CommunityInvite>(`/api/communities/${communityId}/invites`, data);
}

export function revokeCommunityInvite(communityId: string, inviteId: number): Promise<void> {
  return apiClient.delete<void>(`/api/communities/${communityId}/invites/${inviteId}`);
}

export function previewInvite(token: string): Promise<InvitePreview> {
  return apiClient.get<InvitePreview>(`/api/invites/${token}`);
}

export function acceptInvite(token: string): Promise<InvitePreview> {
  return apiClient.post<InvitePreview>(`/api/invites/${token}/accept`, {});
}

export async function joinCommunity(identifier: string): Promise<string> {
  await apiClient.post<void>(`/api/communities/${identifier}/members`, {});

  return identifier;
}

export async function fetchPinnedCommunities(): Promise<PinnedCommunitiesResponse> {
  const res = await apiClient.get<HydraCollection<PinnedCommunity>>("/api/me/pinned-communities");
  return { items: unwrapCollection(res) };
}

export function pinCommunity(communityId: number): Promise<unknown> {
  return apiClient.post<unknown>("/api/me/pinned-communities", { communityId });
}

export function unpinCommunity(communityId: number): Promise<void> {
  return apiClient.delete<void>(`/api/me/pinned-communities/${communityId}`);
}

export function reorderPinnedCommunities(communityIds: number[]): Promise<void> {
  return apiClient.post<void>("/api/me/pinned-communities/order", { communityIds });
}

export function leaveCommunity(identifier: string): Promise<void> {
  return apiClient.delete<void>(`/api/communities/${identifier}/members`);
}
