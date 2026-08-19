import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChannelSidebarSkeleton, MessagePaneSkeleton } from "@/components/ui/Skeleton";
import { ConversationsSidebar } from "@/components/ConversationsSidebar";
import { getIdentitySwitchTarget, isIdentitySwitchInProgress } from "@/platform/activeIdentity";

export function SwitchingScreen() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isIdentitySwitchInProgress()) void navigate({ to: "/", replace: true });
  }, [navigate]);
  const toDm = getIdentitySwitchTarget()?.to.startsWith("/dm") ?? false;
  return (
    <div className="flex min-w-0 flex-1">
      {toDm ? <ConversationsSidebar /> : <ChannelSidebarSkeleton />}
      <MessagePaneSkeleton />
    </div>
  );
}
