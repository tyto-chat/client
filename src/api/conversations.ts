import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { Conversation, HydraCollection, InvitableUsersResponse, Message } from "@/types/api";

export async function fetchConversations(): Promise<Conversation[]> {
  const data = await apiClient.get<HydraCollection<Conversation> | Conversation[]>(
    "/api/conversations",
  );
  return unwrapCollection(data);
}

export function fetchConversation(identifier: string): Promise<Conversation> {
  return apiClient.get<Conversation>(`/api/conversations/${identifier}`);
}

export function createConversation(
  memberUserIds: number[],
  options: { encrypted?: boolean } = {},
): Promise<Conversation> {
  return apiClient.post<Conversation>("/api/conversations", {
    memberUserIds,
    ...(options.encrypted === true && { encrypted: true }),
  });
}

export function muteConversation(
  identifier: string,
  mutedUntil: string | null,
): Promise<Conversation> {
  return apiClient.post<Conversation>(`/api/conversations/${identifier}/mute`, { mutedUntil });
}

export function markConversationRead(identifier: string): Promise<Conversation> {
  return apiClient.post<Conversation>(`/api/conversations/${identifier}/mark-read`, {});
}

export function fetchInvitableUsers(
  search?: string,
  includeBlocked = false,
): Promise<InvitableUsersResponse> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (includeBlocked) params.set("includeBlocked", "true");
  const qs = params.toString();
  return apiClient.getJson<InvitableUsersResponse>(`/api/me/invitable-users${qs ? `?${qs}` : ""}`);
}

export async function fetchConversationMessages(identifier: string): Promise<Message[]> {
  const data = await apiClient.get<HydraCollection<Message> | Message[]>(
    `/api/conversations/${identifier}/messages/current`,
  );
  return unwrapCollection(data);
}

export function createConversationMessage(
  identifier: string,
  text: string,
  attachmentIris: string[] = [],
  id?: string,
): Promise<Message> {
  return apiClient.post<Message>(`/api/conversations/${identifier}/messages`, {
    text,
    attachmentIris,
    ...(id !== undefined && { id }),
  });
}
