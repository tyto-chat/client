import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CommunityAccentProvider } from "@/components/CommunityAccentProvider";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import { useCommunity } from "@/queries/communityQueries";

export const Route = createFileRoute("/_app/$communityId")({
  component: CommunityLayout,
});

function CommunityLayout() {
  const { communityId } = Route.useParams();
  const { data: community } = useCommunity(communityId);
  return (
    <CommunityAccentProvider community={community} className="flex flex-1 overflow-hidden">
      <ChannelSidebar communityId={communityId} />
      <Outlet />
    </CommunityAccentProvider>
  );
}
