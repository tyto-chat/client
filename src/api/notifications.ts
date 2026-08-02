import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { AppNotification, HydraCollection } from "@/types/api";

export async function fetchNotifications(communityIdentifier: string): Promise<AppNotification[]> {
  const data = await apiClient.get<HydraCollection<AppNotification>>(
    `/api/communities/${communityIdentifier}/notifications`,
  );
  return unwrapCollection(data);
}

export const fetchUnreadCounts = () =>
  apiClient.get<{ counts: Record<string, number> }>("/api/notifications/unread-counts");

export const markNotificationRead = (id: number) =>
  apiClient.patch<AppNotification>(`/api/notifications/${id}`, { isRead: true });

export const markAllNotificationsRead = (communityIdentifier: string) =>
  apiClient.post<void>(`/api/communities/${communityIdentifier}/notifications/mark-all-read`, {});

export async function fetchDmNotifications(): Promise<AppNotification[]> {
  const data = await apiClient.get<HydraCollection<AppNotification>>("/api/me/notifications");
  return unwrapCollection(data);
}

export const markAllDmNotificationsRead = () =>
  apiClient.post<void>("/api/me/notifications/mark-all-read", {});
