import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { queryKeys } from "@/queries/queryKeys";
import { useAuthContext } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { navigationFromNotification } from "@/utils/notificationLink";
import { notificationText } from "@/utils/notificationText";
import { showDesktopNotification } from "@/utils/desktopNotifications";
import { parseMercureEvent } from "@/utils/parseMercureEvent";
import type { AppNotification, NotificationMercureEvent } from "@/types/api";

export function useUserNotificationsMercure() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { notify } = useNotification();
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const topic = user?.id ? `/api/users/${user.id}/notifications` : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<NotificationMercureEvent>(event);
      if (!data || (data.type !== "notification" && data.type !== "notification.update")) return;

      const isDm = data.notificationType === "dm_message";
      const isUpdate = data.type === "notification.update";

      const newNotif: AppNotification = {
        "@id": `/api/notifications/${data.id}`,
        "@type": "Notification",
        id: data.id,
        type: data.notificationType,
        isRead: data.isRead,
        createdAt: data.createdAt,
        authorName: data.authorName,
        channelIdentifier: data.channelIdentifier,
        communityIdentifier: data.communityIdentifier,
        conversationIdentifier: data.conversationIdentifier,
        messageIri: data.messageIri ?? undefined,
        groupName: data.groupName,
        groupIdentifier: data.groupIdentifier,
        actorIds: data.actorIds,
        messageCount: data.messageCount,
      };

      const upsert = (old: AppNotification[] | undefined): AppNotification[] | undefined => {
        if (!old) return old;
        if (isUpdate) {
          const idx = old.findIndex((n) => n.id === data.id);
          if (idx === -1) return [newNotif, ...old];
          const next = old.slice();
          next[idx] = newNotif;
          return next;
        }
        return [newNotif, ...old];
      };

      if (isDm) {
        queryClient.setQueryData(queryKeys.dmNotifications(), upsert);
      } else {
        queryClient.setQueryData(queryKeys.notifications(data.communityIdentifier), upsert);
      }

      if (!isUpdate) {
        queryClient.setQueryData(
          queryKeys.notificationUnreadCounts(),
          (old: { counts: Record<string, number> } | undefined) => {
            const key = isDm ? "dm" : String(data.communityId);
            return {
              counts: {
                ...old?.counts,
                [key]: (old?.counts[key] ?? 0) + 1,
              },
            };
          },
        );
      }

      if (isUpdate) return;

      if (
        data.notificationType === "channel_access" ||
        data.notificationType === "channel_moderator"
      ) {
        queryClient.invalidateQueries({ queryKey: queryKeys.community(data.communityIdentifier) });
      } else if (
        data.notificationType === "group_added" ||
        data.notificationType === "group_removed"
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.communityMembers(data.communityIdentifier),
        });
      }

      const { text, variant } = ((): { text: string; variant: "info" | "success" } => {
        switch (data.notificationType) {
          case "dm_message":
            return { text: t("toast_dm_message", { author: data.authorName }), variant: "info" };
          case "channel_access":
            return {
              text: t("toast_channel_access", { channel: data.channelIdentifier }),
              variant: "success",
            };
          case "channel_moderator":
            return {
              text: t("toast_channel_moderator", { channel: data.channelIdentifier }),
              variant: "success",
            };
          case "group_added":
            return { text: t("toast_group_added", { group: data.groupName }), variant: "success" };
          case "group_removed":
            return { text: t("toast_group_removed", { group: data.groupName }), variant: "info" };
          case "broadcast_mention":
            return {
              text: t("toast_broadcast_mention", {
                author: data.authorName,
                channel: data.channelIdentifier,
              }),
              variant: "info",
            };
          case "channel_activity":
            return {
              text: t("toast_channel_activity", {
                author: data.authorName,
                channel: data.channelIdentifier,
              }),
              variant: "info",
            };
          case "report_filed":
            return { text: t("toast_report_filed"), variant: "info" };
          case "report_escalated":
            return { text: t("toast_report_escalated"), variant: "info" };
          case "report_resolved":
            return { text: t("toast_report_resolved"), variant: "success" };
          case "report_dismissed":
            return { text: t("toast_report_dismissed"), variant: "info" };
          default:
            // Any type without a tailored toast above (moderation actions,
            // appeals, ownership transfer, webhook failures) — and real
            // mentions — render via the shared notification text so the toast
            // never falls back to a broken empty "mentioned you".
            return {
              text: notificationText(
                {
                  type: data.notificationType,
                  groupName: data.groupName,
                  authorName: data.authorName,
                  channelIdentifier: data.channelIdentifier,
                  actorIds: data.actorIds,
                  messageCount: data.messageCount,
                  reason: data.reason,
                },
                t,
              ),
              variant: "info",
            };
        }
      })();

      notify(text, variant);

      showDesktopNotification(t("desktop_title"), {
        body: text,
        tag: isDm
          ? `dm:${data.conversationIdentifier ?? ""}`
          : `${data.communityIdentifier}:${data.channelIdentifier}`,
        onClick: () => {
          if (isDm) {
            if (data.conversationIdentifier) {
              void navigate({
                to: "/dm/$conversationId",
                params: { conversationId: data.conversationIdentifier },
              });
            }
            return;
          }
          void navigate(navigationFromNotification(newNotif));
        },
      });
    },
    t("realtime_error"),
    () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCounts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dmNotifications() });
    },
  );
}
