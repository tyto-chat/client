import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { CommunityMembership, HydraCollection, MyCommunityMembership } from "@/types/api";

export async function fetchMyCommunityMemberships(): Promise<MyCommunityMembership[]> {
  const data = await apiClient.get<
    HydraCollection<MyCommunityMembership> | MyCommunityMembership[]
  >("/api/me/community-memberships");
  return unwrapCollection(data);
}

export function fetchCommunityMembership(identifier: string): Promise<CommunityMembership> {
  return apiClient.get<CommunityMembership>(`/api/communities/${identifier}/membership`);
}
