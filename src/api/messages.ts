import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { HydraCollection, Message, MessageBodyRevision } from "@/types/api";

export async function fetchMessages(
  communityId: string,
  channelIdentifier: string,
): Promise<Message[]> {
  const data = await apiClient.get<HydraCollection<Message> | Message[]>(
    `/api/communities/${communityId}/channels/${channelIdentifier}/messages/current`,
  );
  return unwrapCollection(data);
}

export function createMessage(
  communityId: string,
  channelIdentifier: string,
  text: string,
  attachmentIris: string[] = [],
): Promise<Message> {
  return apiClient.post<Message>(
    `/api/communities/${communityId}/channels/${channelIdentifier}/messages`,
    {
      text,
      attachmentIris,
    },
  );
}

export function fetchMessage(uuid: string): Promise<Message> {
  return apiClient.get<Message>(`/api/messages/${uuid}`);
}

export function pinMessage(uuid: string): Promise<Message> {
  return apiClient.post<Message>(`/api/messages/${uuid}/pin`, {});
}

export function unpinMessage(uuid: string): Promise<void> {
  return apiClient.delete<void>(`/api/messages/${uuid}/pin`);
}

export function deleteMessage(messageIri: string): Promise<void> {
  return apiClient.delete<void>(messageIri);
}

export function editMessage(messageIri: string, text: string): Promise<Message> {
  return apiClient.patch<Message>(messageIri, { text });
}

export async function fetchMessageHistory(messageIri: string): Promise<MessageBodyRevision[]> {
  const data = await apiClient.get<HydraCollection<MessageBodyRevision>>(`${messageIri}/history`);
  return unwrapCollection(data);
}
