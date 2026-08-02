import { apiClient } from "@/api/client";

export interface AccountDeletionStatus {
  pending: boolean;
  purgeAt?: string;
}

export const fetchAccountDeletionStatus = (): Promise<AccountDeletionStatus> =>
  apiClient.getJson<AccountDeletionStatus>("/api/me/account-deletion");

export const requestAccountDeletion = (): Promise<AccountDeletionStatus> =>
  apiClient.postJson<AccountDeletionStatus>("/api/me/account-deletion", {});

// The resource is declared json-only server-side, so the default ld+json Accept
// of apiClient.delete gets a 406 and the cancel silently fails.
export const cancelAccountDeletion = (): Promise<void> =>
  apiClient.deleteJson<void>("/api/me/account-deletion", undefined);
