import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryKeys } from "@/queries/queryKeys";
import { useMercureSubscription } from "@/hooks/useMercureSubscription";
import { parseMercureEvent } from "@/utils/parseMercureEvent";

export function useCommunityMercure(communityIdentifier: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("community");
  const topic = communityIdentifier ? `/api/communities/${communityIdentifier}` : null;

  useMercureSubscription(
    topic,
    (event) => {
      const data = parseMercureEvent<{ type?: string; "@type"?: string }>(event);
      if (!data) return;
      const isStructure = data.type === "community.structure";
      const isChannelEntity = data["@type"] === "Channel";
      if (!isStructure && !isChannelEntity) return;

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
