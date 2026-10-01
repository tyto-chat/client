import type { PresenceState } from "@/types/api";
import type { VoiceMode } from "@/utils/voiceSettings";

export interface SoundAmbient {
  presence: PresenceState;
  inCall: boolean;
  voiceMode: VoiceMode;
}

const DEFAULT_SOUND_AMBIENT: SoundAmbient = {
  presence: "online",
  inCall: false,
  voiceMode: "open",
};

let ambient: SoundAmbient = { ...DEFAULT_SOUND_AMBIENT };

export function getSoundAmbient(): SoundAmbient {
  return ambient;
}

export function setSoundAmbient(change: Partial<SoundAmbient>): void {
  ambient = { ...ambient, ...change };
}

export function resetSoundAmbientForTests(): void {
  ambient = { ...DEFAULT_SOUND_AMBIENT };
}
