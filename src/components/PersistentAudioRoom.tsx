import { lazy, Suspense, useEffect, useRef } from "react";
import { Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAudioCall } from "@/context/AudioCallContext";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/queries/queryKeys";
import { leaveChannel, sendLeaveChannelBeacon } from "@/api/livekit";
import { executeIdentityRequest, getActiveIdentityKey } from "@/platform/activeIdentity";
import type { ChannelParticipant } from "@/types/api";

const LiveKitRoomContent = lazy(() =>
  import("@/components/LiveKitRoomContent").then((m) => ({ default: m.LiveKitRoomContent })),
);

function voiceCallPath(communityId: string, channelId: string): string {
  return `/communities/${communityId}/channels/${channelId}/call`;
}

export function PersistentAudioRoom({ voiceEnabled = true }: { voiceEnabled?: boolean }) {
  const { activeCall, leave } = useAudioCall();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevCallRef = useRef<{
    communityId: string;
    channelId: string;
    identityKey: string | null;
  } | null>(null);

  useEffect(() => {
    if (activeCall) {
      prevCallRef.current = {
        communityId: activeCall.communityId,
        channelId: activeCall.channel.identifier,
        identityKey: activeCall.identityKey ?? null,
      };
    } else if (prevCallRef.current !== null && user) {
      const { communityId, channelId, identityKey } = prevCallRef.current;
      prevCallRef.current = null;
      const owningIdentityActive = identityKey === getActiveIdentityKey();
      if (identityKey && !owningIdentityActive) {
        const leavePath = voiceCallPath(communityId, channelId);
        void executeIdentityRequest(identityKey, leavePath, {
          method: "DELETE",
          keepalive: true,
        }).then((handled) => {
          if (!handled) void leaveChannel(communityId, channelId).catch(() => {});
        });
      } else {
        void leaveChannel(communityId, channelId).catch(() => {});
      }
      if (owningIdentityActive) {
        queryClient.setQueryData(
          queryKeys.channelParticipants(communityId, channelId),
          (old: ChannelParticipant[] = []) => old.filter((p) => p.userId !== user.id),
        );
      }
    }
  }, [activeCall, user, queryClient, leave]);

  useEffect(() => {
    if (!activeCall) return;
    const { communityId, channel, identityKey } = activeCall;
    function onPageHide() {
      const owningIdentityActive = !identityKey || identityKey === getActiveIdentityKey();
      if (identityKey && !owningIdentityActive) {
        void executeIdentityRequest(identityKey, voiceCallPath(communityId, channel.identifier), {
          method: "DELETE",
          keepalive: true,
        });
      } else {
        sendLeaveChannelBeacon(communityId, channel.identifier);
      }
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
