import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNotification } from "@/context/NotificationContext";
import { navigationFromNotification } from "@/utils/notificationLink";
import { notificationText } from "@/utils/notificationText";
import { showDesktopNotification } from "@/utils/desktopNotifications";
import { isManagedIdentityMode } from "@/platform/appMode";
import { AgentsContext, type AgentsContextValue } from "./agents/AgentsContext";
import type { AgentNotificationEvent } from "./agents/IdentityAgent";
import type { AppNotification } from "@/types/api";

function useOptionalAgentsContext(): AgentsContextValue | null {
  return useContext(AgentsContext);
}

export function AgentNotificationBridge() {
  const contextValue = useOptionalAgentsContext();
  const { notify } = useNotification();
  const { t } = useTranslation("notifications");

  useEffect(() => {
    if (!isManagedIdentityMode() || !contextValue) return undefined;
    const { registry, switchTo } = contextValue;

    return registry.onNotification((event: AgentNotificationEvent) => {
      const activeIdentityId = registry.getSnapshot().activeIdentityId;
      if (event.identityId === activeIdentityId) return;

      const data = event.raw;
      const isDm = data.notificationType === "dm_message";

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

      const text = notificationText(
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
      );

      const serverName = event.serverName ?? event.origin;
      notify(t("from_server", { server: serverName, text }), "info");

      showDesktopNotification(t("desktop_title"), {
        body: text,
        tag: isDm
          ? `${event.origin}:dm:${data.conversationIdentifier ?? ""}`
          : `${event.origin}:${data.communityIdentifier}:${data.channelIdentifier}`,
        onClick: () => {
          if (isDm) {
            void switchTo(
              event.identityId,
              data.conversationIdentifier
                ? {
                    to: "/dm/$conversationId",
                    params: { conversationId: data.conversationIdentifier },
                  }
                : undefined,
            );
            return;
          }
          void switchTo(event.identityId, navigationFromNotification(newNotif));
        },
      });
    });
  }, [contextValue, notify, t]);

  return null;
}
