export type SoundName = "join" | "leave" | "mute" | "unmute" | "notification";

export interface SoundNote {
  frequency: number;
  at: number;
}

export interface SoundDefinition {
  notes: readonly SoundNote[];
  noteLength: number;
}

export interface TonePartial {
  ratio: number;
  gain: number;
}

export const TONE: { attack: number; partials: readonly TonePartial[] } = {
  attack: 0.015,
  partials: [
    { ratio: 1, gain: 0.62 },
    { ratio: 1.004, gain: 0.62 },
    { ratio: 0.5, gain: 0.22 },
  ],
};

export const MASTER_LEVEL = 0.5;
export const QUIET_SCALE = 0.45;
export const SILENCE = 0.0001;

export const SOUND_SET: Readonly<Record<SoundName, SoundDefinition>> = {
  join: {
    notes: [
      { frequency: 523.25, at: 0 },
      { frequency: 659.25, at: 0.07 },
      { frequency: 783.99, at: 0.14 },
    ],
    noteLength: 0.24,
  },
  leave: {
    notes: [
      { frequency: 783.99, at: 0 },
      { frequency: 659.25, at: 0.07 },
      { frequency: 523.25, at: 0.14 },
    ],
    noteLength: 0.24,
  },
  mute: {
    notes: [
      { frequency: 523.25, at: 0 },
      { frequency: 392.0, at: 0.06 },
    ],
    noteLength: 0.12,
  },
  unmute: {
    notes: [
      { frequency: 392.0, at: 0 },
      { frequency: 523.25, at: 0.06 },
    ],
    noteLength: 0.12,
  },
  notification: {
    notes: [
      { frequency: 587.33, at: 0 },
      { frequency: 880.0, at: 0.11 },
    ],
    noteLength: 0.24,
  },
};

export function soundDuration(name: SoundName): number {
  const sound = SOUND_SET[name];
  const lastNote = sound.notes[sound.notes.length - 1]!;
  const decay = Math.max(
    ...TONE.partials.map((partial) => sound.noteLength / Math.sqrt(Math.max(1, partial.ratio))),
  );
  return lastNote.at + decay;
}
