import { lazy, Suspense, useEffect, useRef } from "react";
import { Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAudioCall } from "@/context/AudioCallContext";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/queries/queryKeys";
import { leaveChannel, sendLeaveChannelBeacon } from "@/api/livekit";
import type { ChannelParticipant } from "@/types/api";

const LiveKitRoomContent = lazy(() =>
  import("@/components/LiveKitRoomContent").then((m) => ({ default: m.LiveKitRoomContent })),
);

export function PersistentAudioRoom({ voiceEnabled = true }: { voiceEnabled?: boolean }) {
  const { activeCall, leave } = useAudioCall();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevCallRef = useRef<{ communityId: string; channelId: string } | null>(null);

  useEffect(() => {
    if (activeCall) {
      prevCallRef.current = {
        communityId: activeCall.communityId,
        channelId: activeCall.channel.identifier,
      };
    } else if (prevCallRef.current !== null && user) {
      const { communityId, channelId } = prevCallRef.current;
      prevCallRef.current = null;
      void leaveChannel(communityId, channelId).catch(() => {});
      queryClient.setQueryData(
        queryKeys.channelParticipants(communityId, channelId),
        (old: ChannelParticipant[] = []) => old.filter((p) => p.userId !== user.id),
      );
    }
  }, [activeCall, user, queryClient, leave]);

  useEffect(() => {
    if (!activeCall) return;
    const { communityId, channel } = activeCall;
    function onPageHide() {
      sendLeaveChannelBeacon(communityId, channel.identifier);
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [activeCall]);

  return (
    <>
      <Outlet />
      {voiceEnabled && activeCall && (
        <Suspense fallback={null}>
          <LiveKitRoomContent />
        </Suspense>
      )}
    </>
  );
}
