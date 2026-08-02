import { apiClient } from "@/api/client";
import type { Message } from "@/types/api";

export interface SearchHit {
  messageIri: string;
  messageId: string;
  snippet: string;
  text: string;
  authorId: number | null;
  authorName: string | null;
  createdAt: number | null;
  pageNumber: number | null;
  communityIdentifier: string | null;
  channelIdentifier: string | null;
  conversationIdentifier: string | null;
  message: Message;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchFilters {
  authorId?: number;
  before?: number;
  after?: number;
  limit?: number;
  offset?: number;
}

function buildQuery(q: string, filters: SearchFilters): string {
  const params = new URLSearchParams();
  params.set("q", q);
  if (filters.authorId != null) params.set("authorId", String(filters.authorId));
  if (filters.before != null) params.set("before", String(filters.before));
  if (filters.after != null) params.set("after", String(filters.after));
  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.offset != null) params.set("offset", String(filters.offset));
  return params.toString();
}

export function searchChannel(
  communityId: string,
  channelIdentifier: string,
  q: string,
  filters: SearchFilters = {},
): Promise<SearchResult> {
  return apiClient.get<SearchResult>(
    `/api/communities/${encodeURIComponent(communityId)}/channels/${encodeURIComponent(channelIdentifier)}/search?${buildQuery(q, filters)}`,
  );
}

export function searchCommunity(
  communityId: string,
  q: string,
  filters: SearchFilters = {},
): Promise<SearchResult> {
  return apiClient.get<SearchResult>(
    `/api/communities/${encodeURIComponent(communityId)}/search?${buildQuery(q, filters)}`,
  );
}

export function searchConversation(
  conversationIdentifier: string,
  q: string,
  filters: SearchFilters = {},
): Promise<SearchResult> {
  return apiClient.get<SearchResult>(
    `/api/conversations/${encodeURIComponent(conversationIdentifier)}/search?${buildQuery(q, filters)}`,
  );
}
