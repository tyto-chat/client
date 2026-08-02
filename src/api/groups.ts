import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type {
  GroupChannelPermission,
  HydraCollection,
  MyGroupSummary,
  UserGroup,
  UserGroupMember,
} from "@/types/api";

export async function fetchMyGroups(): Promise<MyGroupSummary[]> {
  const data = await apiClient.get<{ items: MyGroupSummary[] }>("/api/me/groups");
  return data.items;
}

export async function fetchGroups(communityId: string): Promise<UserGroup[]> {
  const data = await apiClient.get<HydraCollection<UserGroup>>(
    `/api/communities/${communityId}/groups`,
  );
  return unwrapCollection(data);
}

export function fetchGroup(communityId: string, groupId: string): Promise<UserGroup> {
  return apiClient.get<UserGroup>(`/api/communities/${communityId}/groups/${groupId}`);
}

export function createGroup(
  communityId: string,
  data: { name: string; icon?: string | null; color?: string | null; isHidden?: boolean },
): Promise<UserGroup> {
  return apiClient.post<UserGroup>(`/api/communities/${communityId}/groups`, data);
}

export function updateGroup(
  communityId: string,
  groupId: string,
  data: {
    name?: string;
    icon?: string | null;
    color?: string | null;
    isHidden?: boolean;
    ownerId?: number | null;
  },
): Promise<UserGroup> {
  return apiClient.patch<UserGroup>(`/api/communities/${communityId}/groups/${groupId}`, data);
}

export function deleteGroup(communityId: string, groupId: string): Promise<void> {
  return apiClient.delete<void>(`/api/communities/${communityId}/groups/${groupId}`);
}

export function transferGroupOwnership(
  communityId: string,
  groupId: string,
  userId: number,
): Promise<UserGroup> {
  return apiClient.post<UserGroup>(
    `/api/communities/${communityId}/groups/${groupId}/transfer-ownership`,
    { userId },
  );
}

export async function fetchGroupMembers(
  communityId: string,
  groupId: string,
): Promise<UserGroupMember[]> {
  const data = await apiClient.get<HydraCollection<UserGroupMember>>(
    `/api/communities/${communityId}/groups/${groupId}/members`,
  );
  return unwrapCollection(data);
}

export function addGroupMember(
  communityId: string,
  groupId: string,
  userId: number,
): Promise<UserGroupMember> {
  return apiClient.post<UserGroupMember>(
    `/api/communities/${communityId}/groups/${groupId}/members`,
    { userId },
  );
}

export function removeGroupMember(
  communityId: string,
  groupId: string,
  userId: number,
): Promise<void> {
  return apiClient.delete<void>(
    `/api/communities/${communityId}/groups/${groupId}/members/${userId}`,
  );
}

export async function fetchGroupChannelPermissions(
  communityId: string,
  groupId: string,
): Promise<GroupChannelPermission[]> {
  const data = await apiClient.get<HydraCollection<GroupChannelPermission>>(
    `/api/communities/${communityId}/groups/${groupId}/channel-permissions`,
  );
  return unwrapCollection(data);
}

export function setGroupChannelPermission(
  communityId: string,
  groupId: string,
  channelIdentifier: string,
  role: "member" | "moderator",
): Promise<GroupChannelPermission> {
  return apiClient.put<GroupChannelPermission>(
    `/api/communities/${communityId}/groups/${groupId}/channel-permissions/${channelIdentifier}`,
    { role },
  );
}

export function removeGroupChannelPermission(
  communityId: string,
  groupId: string,
  channelIdentifier: string,
): Promise<void> {
  return apiClient.delete<void>(
    `/api/communities/${communityId}/groups/${groupId}/channel-permissions/${channelIdentifier}`,
  );
}
