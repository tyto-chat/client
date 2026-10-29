import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { userEventsTopic } from "@/api/topics";
import { queryKeys } from "@/queries/queryKeys";
import { invalidateBlockDependents } from "@/queries/blockQueries";
import { useAuthContext } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { parseMercureEvent } from "@/utils/parseMercureEvent";
import { dispatchE2eeEvent, isE2eeEvent, type E2eeEvent } from "@/e2ee/e2eeEvents";

const GRANT_CHANGING_EVENTS = new Set([
  "community.removed",
  "channel.access.revoked",
  "channel.access.granted",
  "role.changed",
]);

interface UserControlEvent {
  type?: string;
  event?: string;
  communityIdentifier?: string;
  channelIdentifier?: string;
}

export function useUserEventsMercure() {
  const queryClient = useQueryClient();
  const { user, refreshMercureToken } = useAuthContext();
  const { notify } = useNotification();
  const { t } = useTranslation("community");
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    communityId?: string;
    channelId?: string;
  };
  const topic = user?.id ? userEventsTopic(user.id) : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<UserControlEvent>(event);
      if (isE2eeEvent(data)) {
        dispatchE2eeEvent(data as E2eeEvent);
        return;
      }
      if (!data || data.type !== "user.event") return;
      if (data.event && GRANT_CHANGING_EVENTS.has(data.event)) {
        void refreshMercureToken({ revoke: data.event !== "channel.access.granted" });
      }

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

        case "blocks.changed":
          void invalidateBlockDependents(queryClient);
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
    () => {
      void refreshMercureToken();
      void queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships() });
      if (params.communityId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.community(params.communityId) });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.communityMembership(params.communityId),
        });
      }
    },
  );
}
