import { apiClient } from "@/api/client";

export interface AdminCommunityRow {
  id: number;
  identifier: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  memberCount: number;
  messageCount: number;
  createdAt: string | null;
}

export interface AdminCommunityListResponse {
  rows: AdminCommunityRow[];
  total: number;
  page: number;
  perPage: number;
}

export type AdminCommunitySort = "name" | "createdAt";

export interface AdminCommunityListParams {
  search?: string;
  page?: number;
  perPage?: number;
  sort?: AdminCommunitySort;
  dir?: "ASC" | "DESC";
}

export const fetchAdminCommunities = (
  params: AdminCommunityListParams,
): Promise<AdminCommunityListResponse> => {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  if (params.perPage) q.set("perPage", String(params.perPage));
  if (params.sort) q.set("sort", params.sort);
  if (params.dir) q.set("dir", params.dir);
  const qs = q.toString();
  return apiClient.getJson<AdminCommunityListResponse>(
    `/api/admin/communities${qs ? `?${qs}` : ""}`,
  );
};

export const deleteAdminCommunity = (identifier: string): Promise<void> =>
  apiClient.delete<void>(`/api/admin/communities/${identifier}`);

export const transferAdminCommunity = (
  identifier: string,
  payload: { newAdminUserId: number; demoteOthers?: boolean },
): Promise<{ ok: boolean; demotedCount: number }> =>
  apiClient.postJson<{ ok: boolean; demotedCount: number }>(
    `/api/admin/communities/${identifier}/transfer`,
    payload,
  );
