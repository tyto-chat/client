import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCommunity } from "@/queries/communityQueries";
import { fetchCommunity } from "@/api/communities";
import { queryKeys } from "@/queries/queryKeys";
import { MobileTopBar } from "@/components/MobileTopBar";
import { MessagePaneSkeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/api/client";
import { defaultChannelFor } from "@/utils/defaultChannel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export const Route = createFileRoute("/_app/$communityId/")({
  loader: async ({ context: { queryClient, auth }, params }) => {
    try {
      const community = await queryClient.ensureQueryData({
        queryKey: queryKeys.community(params.communityId),
        queryFn: () => fetchCommunity(params.communityId),
      });
      const first = defaultChannelFor(community);
      if (first) {
        throw redirect({
          to: "/$communityId/$channelId",
          params: { communityId: params.communityId, channelId: first.identifier },
        });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw redirect({ to: "/" });
      }
      if (err instanceof ApiError && err.status === 401) {
        if (!auth.token) {
          throw redirect({ to: "/" });
        }
        return;
      }
      throw err;
    }
  },
  pendingMs: 100,
  pendingMinMs: 0,
  pendingComponent: CommunityPendingPane,
  component: CommunityPage,
});

function CommunityPendingPane() {
  return (
    <div className="flex min-w-0 flex-1">
      <MessagePaneSkeleton />
    </div>
  );
}

function CommunityPage() {
  const { t } = useTranslation(["community", "common"]);
  const { communityId } = Route.useParams();
  const { data: community, isLoading } = useCommunity(communityId);
  useDocumentTitle(community?.name ?? "");

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-fg-muted">
        {t("common:loading")}
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex flex-1 items-center justify-center text-fg-muted">
        {t("community_not_found")}
      </div>
    );
  }

  const hasSections = community.channelSections.length > 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <MobileTopBar title={community.name} />
      <div className="flex flex-1 items-center justify-center text-fg-muted">
        {hasSections ? t("select_channel") : t("no_channels")}
      </div>
    </main>
  );
}
