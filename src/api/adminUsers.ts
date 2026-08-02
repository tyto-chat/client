import { apiClient } from "@/api/client";
import type { IssuedApiKey } from "@/types/api";

export interface AdminUserListRow {
  id: number;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  isBot: boolean;
  isPendingDeletion: boolean;
  createdAt: string | null;
}

export interface AdminUserDetail extends AdminUserListRow {
  apiKeyCount: number;
  pushSubscriptionCount: number;
  roles: string[];
  twoFactorEnabled: boolean;
}

export interface AdminUserListResponse {
  rows: AdminUserListRow[];
  total: number;
  page: number;
  perPage: number;
}

export type AdminUserSort = "id" | "email" | "name" | "createdAt";

export interface AdminUserListParams {
  search?: string;
  isAdmin?: boolean;
  isBot?: boolean;
  isPendingDeletion?: boolean;
  page?: number;
  perPage?: number;
  sort?: AdminUserSort;
  dir?: "ASC" | "DESC";
}

export interface AdminApiKeyRow {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function buildQuery(params: AdminUserListParams): string {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.isAdmin !== undefined) q.set("isAdmin", String(params.isAdmin));
  if (params.isBot !== undefined) q.set("isBot", String(params.isBot));
  if (params.isPendingDeletion !== undefined)
    q.set("isPendingDeletion", String(params.isPendingDeletion));
  if (params.page) q.set("page", String(params.page));
  if (params.perPage) q.set("perPage", String(params.perPage));
  if (params.sort) q.set("sort", params.sort);
  if (params.dir) q.set("dir", params.dir);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const fetchAdminUsers = (params: AdminUserListParams): Promise<AdminUserListResponse> =>
  apiClient.getJson<AdminUserListResponse>(`/api/admin/users${buildQuery(params)}`);

export const fetchAdminUserDetail = (id: number): Promise<AdminUserDetail> =>
  apiClient.getJson<AdminUserDetail>(`/api/admin/users/${id}`);

export const patchAdminUser = (
  id: number,
  patch: { displayName?: string; isAdmin?: boolean },
): Promise<AdminUserDetail> => apiClient.patch<AdminUserDetail>(`/api/admin/users/${id}`, patch);

export const deleteAdminUser = (id: number, confirm: string): Promise<void> =>
  apiClient.deleteJson<void>(`/api/admin/users/${id}`, { confirm });

export const fetchAdminUserApiKeys = (id: number): Promise<{ rows: AdminApiKeyRow[] }> =>
  apiClient.getJson<{ rows: AdminApiKeyRow[] }>(`/api/admin/users/${id}/api-keys`);

export const revokeAdminUserApiKey = (id: number, keyId: number): Promise<void> =>
  apiClient.delete<void>(`/api/admin/users/${id}/api-keys/${keyId}`);

export const issueAdminUserApiKey = (
  id: number,
  body: { name: string; scopes: string[]; expiresAt?: string | null },
): Promise<IssuedApiKey> =>
  apiClient.postJson<IssuedApiKey>(`/api/admin/users/${id}/api-keys`, body);

export interface CreateAdminUserBody {
  isBot?: boolean;
  name: string;
  email?: string;
  communityIds?: number[];
}

export const createAdminUser = (body: CreateAdminUserBody): Promise<AdminUserDetail> =>
  apiClient.postJson<AdminUserDetail>("/api/admin/users", body);

export const disableAdminUserTwoFactor = (id: number): Promise<AdminUserDetail> =>
  apiClient.postJson<AdminUserDetail>(`/api/admin/users/${id}/2fa/disable`, {});
