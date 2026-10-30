import { uploadFile, apiClient } from "@/api/client";
import { uuidFromIri } from "@/api/hydra";
import type { Attachment } from "@/types/api";

export function uploadAttachment(
  communityId: string,
  channelIdentifier: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Attachment> {
  return uploadFile<Attachment>(
    `/api/communities/${communityId}/channels/${channelIdentifier}/attachments`,
    file,
    onProgress,
  );
}

export function uploadConversationAttachment(
  conversationIdentifier: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Attachment> {
  return uploadFile<Attachment>(
    `/api/conversations/${conversationIdentifier}/attachments`,
    file,
    onProgress,
  );
}

export function uploadEncryptedConversationAttachment(
  conversationIdentifier: string,
  ciphertext: Blob,
  onProgress?: (percent: number) => void,
): Promise<Attachment> {
  return uploadFile<Attachment>(
    `/api/conversations/${conversationIdentifier}/encrypted-attachments`,
    new File([ciphertext], `${crypto.randomUUID()}.bin`, { type: "application/octet-stream" }),
    onProgress,
  );
}

export function deleteAttachment(attachmentIri: string): Promise<void> {
  const id = uuidFromIri(attachmentIri);
  return apiClient.delete<void>(`/api/attachments/${id}`);
}
