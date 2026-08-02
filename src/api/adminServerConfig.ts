import { apiClient } from "@/api/client";
import type { CommunityLocale } from "@/types/api";

export interface AdminServerConfig {
  serverName: string;
  serverDescription: string;
  accentColor: string | null;
  registrationEnabled: boolean;
  termsContent: string;
  privacyContent: string;
  legalContactEmail: string | null;
  requireRegistrationConsent: boolean;
  listInServerCatalogue: boolean;
  minimumAgeYears: number;
  messageRetentionDays: number;
  notificationRetentionDays: number;
  archivedChannelRetentionDays: number;
  defaultLocale: CommunityLocale;
  defaultAttachmentRetentionDays: number | null;
  maxAttachmentSizeMb: number;
  maxAttachmentsPerMessage: number;
  defaultWelcomeChannelName: string;
  rateLoginLimit: number;
  rateSessionRefreshLimit: number;
  rateSessionRefreshIntervalSeconds: number;
  rateLoginIntervalSeconds: number;
  rateRegisterLimit: number;
  rateRegisterIntervalSeconds: number;
  rateApiWriteLimit: number;
  rateApiWriteIntervalSeconds: number;
  rateMessageSendLimit: number;
  rateMessageSendIntervalSeconds: number;
  rateAttachmentUploadLimit: number;
  rateAttachmentUploadIntervalSeconds: number;
  rateSearchLimit: number;
  rateSearchIntervalSeconds: number;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordSet: boolean;
  smtpEncryption: "none" | "tls" | "ssl" | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  avatarMaxSizeMb: number;
  avatarMaxWidth: number;
  avatarMaxHeight: number;
  logoMaxSizeMb: number;
  logoMaxWidth: number;
  logoMaxHeight: number;
  communityEmojiMaxSizeMb: number;
  attachmentAllowedMimes: string;
  communityEmojiAllowedMimes: string;
  diskPurgeTriggerPercent: number;
  diskPurgeTargetPercent: number;
  diskPurgeMinAgeDays: number;
  diskPurgeIncludeDms: boolean;
  autoTimeoutEnabled: boolean;
  autoTimeoutHits: number;
  autoTimeoutWindowSeconds: number;
  autoTimeoutDurationSeconds: number;
  autoTimeoutProgressive: boolean;
  autoTimeoutResetSeconds: number;
  autoTimeoutMaxSeconds: number;
  ipReputationEnabled: boolean;
  ipReputationEndpoint: string;
  ipReputationConfidenceMin: number;
  ipReputationCheckUsername: boolean;
  ipReputationAllowlist: string;
  ipReputationAppealContact: string;
  resetPasswordCodeExpiryMinutes: number;
  emailChallengeExpiryMinutes: number;
  invitationExpiryHours: number;
  validateEmails: boolean;
  digestHour: number;
  mediaTokenTtlSeconds: number;
  communityEmojiTokenTtlSeconds: number;
  defaultBotId: number;
  welcomeBotId: number;
  autoModeratorBotId: number;
  updatedAt: string;
  updatedBy: number | null;
}

export type AdminServerConfigPatch = Partial<
  Omit<AdminServerConfig, "updatedAt" | "updatedBy" | "smtpPasswordSet">
> & { smtpPassword?: string };

export const fetchAdminServerConfig = (): Promise<AdminServerConfig> =>
  apiClient.getJson<AdminServerConfig>("/api/admin/server-config");

export const patchAdminServerConfig = (patch: AdminServerConfigPatch): Promise<AdminServerConfig> =>
  apiClient.patch<AdminServerConfig>("/api/admin/server-config", patch);

export const sendAdminTestEmail = (to: string): Promise<{ ok: boolean; error: string | null }> =>
  apiClient.postJson<{ ok: boolean; error: string | null }>("/api/admin/server-config/test-email", {
    to,
  });

export const completeAdminOnboarding = (): Promise<{
  adminOnboardingComplete: boolean;
  adminOnboardedAt: string | null;
}> => apiClient.postJson("/api/admin/server-config/onboarding/complete", {});
