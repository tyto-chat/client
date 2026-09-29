import { useEffect, useRef } from "react";
import {
  useConnectionState,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import {
  countChanges,
  createPeerSoundCoalescer,
  peerIdentities,
} from "@/sounds/participantChanges";
import { playCallSound } from "@/sounds/sounds";

export function PeerCallSounds() {
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const ownIdentity = localParticipant.identity;
  const baselineRef = useRef<ReadonlySet<string> | null>(null);
  const coalescerRef = useRef<ReturnType<typeof createPeerSoundCoalescer> | null>(null);

  useEffect(() => {
    const coalescer = createPeerSoundCoalescer(playCallSound);
    coalescerRef.current = coalescer;
    return () => {
      coalescer.cancel();
      coalescerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      baselineRef.current = null;
      return;
    }
    const current = peerIdentities(
      participants.map((participant) => participant.identity),
      ownIdentity,
    );
    const previous = baselineRef.current;
    baselineRef.current = current;
    if (previous === null) {
      return;
    }
    coalescerRef.current?.report(countChanges(previous, current));
  }, [participants, connectionState, ownIdentity]);

  return null;
}
