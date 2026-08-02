import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { HydraCollection, Message } from "@/types/api";

export async function fetchThreadReplies(
  rootUuid: string,
  opts: { before?: string; limit?: number } = {},
): Promise<Message[]> {
  const params = new URLSearchParams();
  if (opts.before) params.set("before", opts.before);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const data = await apiClient.get<HydraCollection<Message> | Message[]>(
    `/api/messages/${rootUuid}/thread${qs ? `?${qs}` : ""}`,
  );
  return unwrapCollection(data);
}

export function createThreadReply(
  rootUuid: string,
  text: string,
  attachmentIris: string[] = [],
): Promise<Message> {
  return apiClient.post<Message>(`/api/messages/${rootUuid}/replies`, { text, attachmentIris });
}
