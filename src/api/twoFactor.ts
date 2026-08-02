import { apiClient } from "@/api/client";

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
}

export interface RecoveryCodes {
  recoveryCodes: string[];
}

export function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  return apiClient.get("/api/users/me/2fa");
}

export function setupTwoFactor(): Promise<TwoFactorSetup> {
  return apiClient.post("/api/users/me/2fa/setup", {});
}

export function confirmTwoFactor(code: string): Promise<RecoveryCodes> {
  return apiClient.post("/api/users/me/2fa/confirm", { code });
}

export function disableTwoFactor(currentPassword: string): Promise<void> {
  return apiClient.post("/api/users/me/2fa/disable", { currentPassword });
}

export function regenerateRecoveryCodes(currentPassword: string): Promise<RecoveryCodes> {
  return apiClient.post("/api/users/me/2fa/recovery-codes", { currentPassword });
}
