import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { queryKeys } from "@/queries/queryKeys";
import { useAuthContext } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { parseMercureEvent } from "@/utils/parseMercureEvent";

interface UserControlEvent {
  type?: string;
  event?: string;
  communityIdentifier?: string;
  channelIdentifier?: string;
}

export function useUserEventsMercure() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { notify } = useNotification();
  const { t } = useTranslation("community");
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    communityId?: string;
    channelId?: string;
  };
  const topic = user?.id ? `/api/users/${user.id}/events` : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<UserControlEvent>(event);
      if (!data || data.type !== "user.event") return;

      const onThisCommunity =
        !!data.communityIdentifier && params.communityId === data.communityIdentifier;

      switch (data.event) {
        case "server.banned":
          window.dispatchEvent(new CustomEvent("session:expired"));
          return;

        case "community.removed":
          if (onThisCommunity) {
            notify(t("evicted_community"), "info");
            void navigate({ to: "/" });
          }
          void queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships() });
          if (data.communityIdentifier) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.community(data.communityIdentifier),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.communityMembership(data.communityIdentifier),
            });
          }
          return;

        case "channel.access.revoked":
          if (
            onThisCommunity &&
            params.channelId === data.channelIdentifier &&
            data.communityIdentifier
          ) {
            notify(t("evicted_channel"), "info");
            void navigate({
              to: "/$communityId",
              params: { communityId: data.communityIdentifier },
            });
          }
          if (data.communityIdentifier) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.community(data.communityIdentifier),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.communityMembership(data.communityIdentifier),
            });
          }
          return;

        case "channel.access.granted":
          if (data.communityIdentifier) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.community(data.communityIdentifier),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.communityMembership(data.communityIdentifier),
            });
          }
          return;

        case "role.changed":
          void queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships() });
          if (data.communityIdentifier) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.community(data.communityIdentifier),
            });
            void queryClient.invalidateQueries({
              queryKey: queryKeys.communityMembership(data.communityIdentifier),
            });
          }
          return;
      }
    },
    t("structure_realtime_error"),
  );
}
