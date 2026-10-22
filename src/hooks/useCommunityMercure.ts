import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { communityTopic } from "@/api/topics";
import { queryKeys } from "@/queries/queryKeys";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { parseMercureEvent } from "@/utils/parseMercureEvent";

export function useCommunityMercure(communityIdentifier: string, communityId: number | undefined) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("community");
  const topic = communityId != null ? communityTopic(communityId) : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<{ type?: string }>(event);
      if (data?.type !== "community.structure") return;

      void queryClient.invalidateQueries({ queryKey: queryKeys.community(communityIdentifier) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.communityMembers(communityIdentifier),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.communityPresenceSummary(communityIdentifier),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.communityMembership(communityIdentifier),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myMemberships() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pinnedCommunities() });
    },
    t("structure_realtime_error"),
  );
}
