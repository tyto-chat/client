import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type {
  Channel,
  ChannelMember,
  ChannelParticipant,
  ChannelSection,
  HydraCollection,
} from "@/types/api";

export function fetchChannel(communityId: string, channelId: string): Promise<Channel> {
  return apiClient.get<Channel>(`/api/communities/${communityId}/channels/${channelId}`);
}

export async function fetchChannelUnread(communityIdentifier: string): Promise<string[]> {
  const data = await apiClient.get<{ unread: string[] }>(
    `/api/communities/${communityIdentifier}/unread-channels`,
  );
  return data.unread;
}

export const markChannelRead = (communityId: string, channelId: string) =>
  apiClient.post<void>(`/api/communities/${communityId}/channels/${channelId}/mark-read`, {});

export const archiveChannel = (communityId: string, channelId: string) =>
  apiClient.post<void>(`/api/communities/${communityId}/channels/${channelId}/archive`, {});

export const unarchiveChannel = (communityId: string, channelId: string) =>
  apiClient.post<void>(`/api/communities/${communityId}/channels/${channelId}/unarchive`, {});

export function createSection(
  communityIdentifier: string,
  data: { name: string },
): Promise<ChannelSection> {
  return apiClient.post<ChannelSection>(`/api/communities/${communityIdentifier}/sections`, data);
}

export function createChannel(data: {
  name: string;
  community: string;
  section: string;
  description?: string;
  isPrivate?: boolean;
  isReadonly?: boolean;
  areReadonlyRepliesAllowed?: boolean;
  type?: "text" | "audio";
}): Promise<Channel> {
  return apiClient.post<Channel>("/api/channels", data);
}

export function updateChannel(
  communityId: string,
  channelId: string,
  data: {
    name?: string;
    description?: string;
    section?: string;
    isPrivate?: boolean | null;
    isReadonly?: boolean | null;
    areReadonlyRepliesAllowed?: boolean | null;
    allowAttachments?: boolean;
  },
): Promise<Channel> {
  return apiClient.patch<Channel>(`/api/communities/${communityId}/channels/${channelId}`, data);
}

export async function fetchChannelParticipants(
  communityId: string,
  channelId: string,
): Promise<ChannelParticipant[]> {
  const data = await apiClient.get<HydraCollection<ChannelParticipant>>(
    `/api/communities/${communityId}/channels/${channelId}/participants`,
  );
  return unwrapCollection(data);
}

export function updateSection(
  communityIdentifier: string,
  id: number,
  data: { name?: string },
): Promise<ChannelSection> {
  return apiClient.patch<ChannelSection>(
    `/api/communities/${communityIdentifier}/sections/${id}`,
    data,
  );
}

export function deleteChannel(communityId: string, channelId: string): Promise<void> {
  return apiClient.delete<void>(`/api/communities/${communityId}/channels/${channelId}`);
}

export function deleteSection(communityIdentifier: string, id: number): Promise<void> {
  return apiClient.delete<void>(`/api/communities/${communityIdentifier}/sections/${id}`);
}

export async function fetchChannelMembers(
  communityId: string,
  channelId: string,
): Promise<ChannelMember[]> {
  const data = await apiClient.get<HydraCollection<ChannelMember>>(
    `/api/communities/${communityId}/channels/${channelId}/members`,
  );
  return unwrapCollection(data);
}

export function addChannelMember(
  communityId: string,
  channelId: string,
  userId: number,
  role: "member" | "moderator" = "member",
): Promise<void> {
  return apiClient.post<void>(`/api/communities/${communityId}/channels/${channelId}/members`, {
    userId,
    role,
  });
}

export function removeChannelMember(
  communityId: string,
  channelId: string,
  userId: number,
): Promise<void> {
  return apiClient.delete<void>(
    `/api/communities/${communityId}/channels/${channelId}/members/${userId}`,
  );
}

export function updateChannelMemberRole(
  communityId: string,
  channelId: string,
  userId: number,
  role: "member" | "moderator",
): Promise<ChannelMember> {
  return apiClient.patch<ChannelMember>(
    `/api/communities/${communityId}/channels/${channelId}/members/${userId}/role`,
    {
      role,
    },
  );
}

export function reorderSections(communityIdentifier: string, sections: number[]): Promise<void> {
  return apiClient.put<void>(`/api/communities/${communityIdentifier}/sections/order`, {
    sections,
  });
}

export function reorderChannels(
  communityIdentifier: string,
  sectionId: number,
  channels: number[],
): Promise<void> {
  return apiClient.put<void>(
    `/api/communities/${communityIdentifier}/sections/${sectionId}/channels/order`,
    { channels },
  );
}
