import { StaleTime } from "./staleTimes";
import { useQuery } from "@tanstack/react-query";
import {
  searchChannel,
  searchCommunity,
  searchConversation,
  type SearchFilters,
  type SearchResult,
} from "@/api/search";
import { queryKeys } from "@/queries/queryKeys";

const MIN_QUERY_LENGTH = 2;

function filterCacheKey(filters: SearchFilters): string {
  return [filters.authorId ?? "", filters.before ?? "", filters.after ?? ""].join("|");
}

export function useChannelSearch(
  communityId: string,
  channelIdentifier: string,
  query: string,
  filters: SearchFilters = {},
) {
  const trimmed = query.trim();
  return useQuery<SearchResult>({
    queryKey: [
      ...queryKeys.channelSearch(communityId, channelIdentifier, trimmed),
      filterCacheKey(filters),
    ] as const,
    queryFn: () => searchChannel(communityId, channelIdentifier, trimmed, filters),
    enabled: trimmed.length >= MIN_QUERY_LENGTH && !!communityId && !!channelIdentifier,
    staleTime: StaleTime.short,
  });
}

export function useCommunitySearch(
  communityId: string,
  query: string,
  filters: SearchFilters = {},
) {
  const trimmed = query.trim();
  return useQuery<SearchResult>({
    queryKey: [
      ...queryKeys.communitySearch(communityId, trimmed),
      filterCacheKey(filters),
    ] as const,
    queryFn: () => searchCommunity(communityId, trimmed, filters),
    enabled: trimmed.length >= MIN_QUERY_LENGTH && !!communityId,
    staleTime: StaleTime.short,
  });
}

export function useConversationSearch(
  conversationIdentifier: string,
  query: string,
  filters: SearchFilters = {},
) {
  const trimmed = query.trim();
  return useQuery<SearchResult>({
    queryKey: [
      ...queryKeys.conversationSearch(conversationIdentifier, trimmed),
      filterCacheKey(filters),
    ] as const,
    queryFn: () => searchConversation(conversationIdentifier, trimmed, filters),
    enabled: trimmed.length >= MIN_QUERY_LENGTH && !!conversationIdentifier,
    staleTime: StaleTime.short,
  });
}
