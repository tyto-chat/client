import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminUser,
  deleteAdminUser,
  disableAdminUserTwoFactor,
  fetchAdminUserApiKeys,
  fetchAdminUserDetail,
  fetchAdminUsers,
  issueAdminUserApiKey,
  patchAdminUser,
  revokeAdminUserApiKey,
  type AdminApiKeyRow,
  type AdminUserDetail,
  type AdminUserListParams,
  type AdminUserListResponse,
  type CreateAdminUserBody,
} from "@/api/adminUsers";
import type { IssuedApiKey } from "@/types/api";
import { queryKeys } from "@/queries/queryKeys";

export function useAdminBots() {
  return useQuery<AdminUserListResponse>({
    queryKey: queryKeys.adminBots(),
    queryFn: () => fetchAdminUsers({ isBot: true, perPage: 100 }),
  });
}

export function useAdminUsers(params: AdminUserListParams) {
  return useQuery<AdminUserListResponse>({
    queryKey: queryKeys.adminUsers(params),
    queryFn: () => fetchAdminUsers(params),
  });
}

export function useAdminUserDetail(id: number | null) {
  return useQuery<AdminUserDetail>({
    queryKey: queryKeys.adminUserDetail(id ?? 0),
    queryFn: () => fetchAdminUserDetail(id!),
    enabled: id != null,
  });
}

export function useAdminUserApiKeys(id: number | null) {
  return useQuery<{ rows: AdminApiKeyRow[] }>({
    queryKey: queryKeys.adminUserApiKeys(id ?? 0),
    queryFn: () => fetchAdminUserApiKeys(id!),
    enabled: id != null,
  });
}

export function usePatchAdminUser() {
  const qc = useQueryClient();
  return useMutation<
    AdminUserDetail,
    Error,
    { id: number; patch: { displayName?: string; isAdmin?: boolean } }
  >({
    mutationFn: ({ id, patch }) => patchAdminUser(id, patch),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.adminUserDetail(data.id), data);
      void qc.invalidateQueries({ queryKey: ["admin", "users"], exact: false });
    },
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: number; confirm: string }>({
    mutationFn: ({ id, confirm }) => deleteAdminUser(id, confirm),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"], exact: false });
      void qc.invalidateQueries({ queryKey: queryKeys.adminBots() });
    },
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation<AdminUserDetail, Error, CreateAdminUserBody>({
    mutationFn: (body) => createAdminUser(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"], exact: false });
      void qc.invalidateQueries({ queryKey: queryKeys.adminBots() });
      void qc.invalidateQueries({ queryKey: queryKeys.adminSetupStatus() });
    },
  });
}

export function useRevokeAdminUserApiKey() {
  const qc = useQueryClient();
  return useMutation<void, Error, { userId: number; keyId: number }>({
    mutationFn: ({ userId, keyId }) => revokeAdminUserApiKey(userId, keyId),
    onSuccess: (_, { userId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.adminUserApiKeys(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.adminUserDetail(userId) });
    },
  });
}

export function useDisableAdminUserTwoFactor() {
  const qc = useQueryClient();
  return useMutation<AdminUserDetail, Error, number>({
    mutationFn: disableAdminUserTwoFactor,
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.adminUserDetail(data.id), data);
      void qc.invalidateQueries({ queryKey: ["admin", "users"], exact: false });
    },
  });
}

export function useIssueAdminUserApiKey(userId: number) {
  const qc = useQueryClient();
  return useMutation<
    IssuedApiKey,
    Error,
    { name: string; scopes: string[]; expiresAt?: string | null }
  >({
    mutationFn: (body) => issueAdminUserApiKey(userId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.adminUserApiKeys(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.adminUserDetail(userId) });
    },
  });
}
