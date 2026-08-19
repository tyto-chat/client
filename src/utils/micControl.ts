import { Track } from "livekit-client";
import type { LocalParticipant, LocalTrack } from "livekit-client";

export type MicParticipant = Pick<
  LocalParticipant,
  "setMicrophoneEnabled" | "getTrackPublication" | "unpublishTrack"
>;

export async function applyMicrophoneEnabled(
  participant: MicParticipant,
  enabled: boolean,
): Promise<boolean> {
  try {
    await participant.setMicrophoneEnabled(enabled);
    return true;
  } catch {
    if (!enabled) return false;
  }

  try {
    const publication = participant.getTrackPublication(Track.Source.Microphone);
    if (publication?.track) await participant.unpublishTrack(publication.track as LocalTrack);
    await participant.setMicrophoneEnabled(true);
    return true;
  } catch {
    return false;
  }
}
