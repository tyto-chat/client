import { apiClient } from "@/api/client";
import type {
  ChannelNotificationLevel,
  ChannelPinState,
  NotificationPreferencesSnapshot,
} from "@/types/api";

export const fetchNotificationPreferences = () =>
  apiClient.getJson<NotificationPreferencesSnapshot>("/api/me/notification-preferences");

export async function setChannelNotificationLevel(
  communityIdentifier: string,
  channelIdentifier: string,
  level: ChannelNotificationLevel | null,
): Promise<{ level: ChannelNotificationLevel | null }> {
  return apiClient.putJson<{ level: ChannelNotificationLevel | null }>(
    `/api/communities/${encodeURIComponent(communityIdentifier)}/channels/${encodeURIComponent(channelIdentifier)}/notification-preference`,
    { level },
  );
}

export async function setChannelPinState(
  communityIdentifier: string,
  channelIdentifier: string,
  pinState: ChannelPinState | null,
): Promise<{ pinState: ChannelPinState | null }> {
  return apiClient.putJson<{ pinState: ChannelPinState | null }>(
    `/api/communities/${encodeURIComponent(communityIdentifier)}/channels/${encodeURIComponent(channelIdentifier)}/pin-state`,
    { pinState },
  );
}

export async function setCommunityNotificationMuted(
  communityIdentifier: string,
  muted: boolean,
): Promise<{ muted: boolean }> {
  return apiClient.putJson<{ muted: boolean }>(
    `/api/communities/${encodeURIComponent(communityIdentifier)}/notification-preference`,
    { muted },
  );
}
