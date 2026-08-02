import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNotificationPreferences,
  setChannelNotificationLevel,
  setChannelPinState,
  setCommunityNotificationMuted,
} from "@/api/notificationPreferences";
import { queryKeys } from "@/queries/queryKeys";
import { useHasAccessToken } from "@/api/tokenStore";
import type {
  ChannelNotificationLevel,
  ChannelPinState,
  NotificationPreferencesSnapshot,
} from "@/types/api";

export function useNotificationPreferences() {
  const hasToken = useHasAccessToken();
  return useQuery<NotificationPreferencesSnapshot>({
    queryKey: queryKeys.notificationPreferences(),
    queryFn: fetchNotificationPreferences,
    staleTime: StaleTime.long,
    enabled: hasToken,
  });
}

export function useChannelNotificationLevel(
  channelId: number | undefined,
): ChannelNotificationLevel {
  const { data } = useNotificationPreferences();
  if (!data || channelId === undefined) return "mentions";
  return data.channels.find((c) => c.channelId === channelId)?.level ?? "mentions";
}

export function useIsCommunityMuted(communityId: number | undefined): boolean {
  const { data } = useNotificationPreferences();
  if (!data || communityId === undefined) return false;
  return data.mutedCommunityIds.includes(communityId);
}

export function useSetChannelNotificationLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      communityIdentifier,
      channelIdentifier,
      channelId,
      level,
    }: {
      communityIdentifier: string;
      channelIdentifier: string;
      channelId: number;
      level: ChannelNotificationLevel | null;
    }) =>
      setChannelNotificationLevel(communityIdentifier, channelIdentifier, level).then(() => ({
        channelId,
        level,
        communityIdentifier,
      })),
    onSuccess: ({ channelId, level, communityIdentifier }) => {
      queryClient.setQueryData<NotificationPreferencesSnapshot>(
        queryKeys.notificationPreferences(),
        (old) => {
          const base = old ?? { channels: [], mutedCommunityIds: [] };
          const existing = base.channels.find((c) => c.channelId === channelId);
          const without = base.channels.filter((c) => c.channelId !== channelId);
          const pinState = existing?.pinState ?? null;
          const next =
            level !== null
              ? [...without, { channelId, level, pinState }]
              : pinState !== null
                ? [...without, { channelId, level: "mentions" as const, pinState }]
                : without;
          return { ...base, channels: next };
        },
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.channelUnread(communityIdentifier),
      });
    },
  });
}

export function useChannelPinState(channelId: number | undefined): ChannelPinState | null {
  const { data } = useNotificationPreferences();
  if (!data || channelId === undefined) return null;
  return data.channels.find((c) => c.channelId === channelId)?.pinState ?? null;
}

export function useSetChannelPinState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      communityIdentifier,
      channelIdentifier,
      channelId,
      pinState,
    }: {
      communityIdentifier: string;
      channelIdentifier: string;
      channelId: number;
      pinState: ChannelPinState | null;
    }) =>
      setChannelPinState(communityIdentifier, channelIdentifier, pinState).then(() => ({
        channelId,
        pinState,
        communityIdentifier,
      })),
    onSuccess: ({ channelId, pinState, communityIdentifier }) => {
      queryClient.setQueryData<NotificationPreferencesSnapshot>(
        queryKeys.notificationPreferences(),
        (old) => {
          const base = old ?? { channels: [], mutedCommunityIds: [] };
          const existing = base.channels.find((c) => c.channelId === channelId);
          const without = base.channels.filter((c) => c.channelId !== channelId);
          const level = existing?.level ?? "mentions";
          const keep = pinState !== null || level !== "mentions";
          const next = keep ? [...without, { channelId, level, pinState }] : without;
          return { ...base, channels: next };
        },
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.channelUnread(communityIdentifier),
      });
    },
  });
}

export function useSetCommunityNotificationMuted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      communityIdentifier,
      communityId,
      muted,
    }: {
      communityIdentifier: string;
      communityId: number;
      muted: boolean;
    }) =>
      setCommunityNotificationMuted(communityIdentifier, muted).then(() => ({
        communityId,
        communityIdentifier,
        muted,
      })),
    onSuccess: ({ communityId, communityIdentifier, muted }) => {
      queryClient.setQueryData<NotificationPreferencesSnapshot>(
        queryKeys.notificationPreferences(),
        (old) => {
          const base = old ?? { channels: [], mutedCommunityIds: [] };
          const without = base.mutedCommunityIds.filter((id) => id !== communityId);
          return {
            ...base,
            mutedCommunityIds: muted ? [...without, communityId] : without,
          };
        },
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.channelUnread(communityIdentifier),
      });
    },
  });
}
