import { useEffect, useRef } from "react";
import { useAudioCall } from "@/context/AudioCallContext";
import { useAuthContext } from "@/context/AuthContext";
import { useUserPresence } from "@/queries/presenceQueries";
import { callKey } from "@/sounds/participantChanges";
import { setSoundAmbient } from "@/sounds/soundAmbient";
import { playCallSound } from "@/sounds/sounds";

export function CallSounds() {
  const { activeCall, isMuted, voiceMode } = useAudioCall();
  const { user } = useAuthContext();
  const presence = useUserPresence(user?.id);
  const inCall = activeCall !== null;
  const key = callKey(
    activeCall === null
      ? null
      : {
          identityKey: activeCall.identityKey ?? null,
          communityId: activeCall.communityId,
          channel: activeCall.channel,
        },
  );
  const previousKeyRef = useRef(key);
  const previousMutedRef = useRef(isMuted);

  useEffect(() => {
    setSoundAmbient({ presence, inCall, voiceMode });
    return () => setSoundAmbient({ presence: "online", inCall: false, voiceMode: "open" });
  }, [presence, inCall, voiceMode]);

  useEffect(() => {
    const previousKey = previousKeyRef.current;
    const previousMuted = previousMutedRef.current;
    previousKeyRef.current = key;
    previousMutedRef.current = isMuted;
    if (key !== previousKey) {
      playCallSound(key === null ? "self-leave" : "self-join");
      return;
    }
    if (key !== null && isMuted !== previousMuted) {
      playCallSound(isMuted ? "mute" : "unmute");
    }
  }, [key, isMuted]);

  return null;
}
