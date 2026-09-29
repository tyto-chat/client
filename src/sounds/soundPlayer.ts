import { MASTER_LEVEL, SILENCE, SOUND_SET, TONE } from "@/sounds/soundSet";
import type { SoundName, SoundNote } from "@/sounds/soundSet";

export interface PlayOptions {
  volume: number;
  scale: number;
}

export interface SoundPlayer {
  play(name: SoundName, options: PlayOptions): void;
  setOutputDevice(deviceId: string): void;
}

interface SinkSwitchable {
  setSinkId(sinkId: string): Promise<void>;
}

const START_DELAY = 0.02;
const STOP_MARGIN = 0.05;

function hasSinkId(context: AudioContext): context is AudioContext & SinkSwitchable {
  return typeof (context as unknown as Partial<SinkSwitchable>).setSinkId === "function";
}

function scheduleNote(
  context: AudioContext,
  note: SoundNote,
  noteLength: number,
  options: PlayOptions,
): void {
  const start = context.currentTime + START_DELAY + note.at;
  for (const partial of TONE.partials) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(note.frequency * partial.ratio, start);
    const peak = Math.max(SILENCE, MASTER_LEVEL * options.volume * options.scale * partial.gain);
    gain.gain.setValueAtTime(SILENCE, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + TONE.attack);
    const decayAt = start + noteLength / Math.sqrt(Math.max(1, partial.ratio));
    gain.gain.exponentialRampToValueAtTime(SILENCE, decayAt);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(decayAt + STOP_MARGIN);
  }
}

export function createSoundPlayer(createContext: () => AudioContext | null): SoundPlayer {
  let context: AudioContext | null = null;
  let contextAttempted = false;
  let desiredDeviceId = "";
  let appliedDeviceId = "";

  function ensureContext(): AudioContext | null {
    if (!contextAttempted) {
      contextAttempted = true;
      try {
        context = createContext();
      } catch {
        context = null;
      }
    }
    return context;
  }

  function applyOutputDevice(target: AudioContext): void {
    if (desiredDeviceId === appliedDeviceId) {
      return;
    }
    if (!hasSinkId(target)) {
      return;
    }
    appliedDeviceId = desiredDeviceId;
    target.setSinkId(desiredDeviceId).catch(() => {
      return;
    });
  }

  return {
    play(name: SoundName, options: PlayOptions): void {
      if (options.volume <= 0) {
        return;
      }
      const target = ensureContext();
      if (target === null) {
        return;
      }
      try {
        if (target.state === "suspended") {
          target.resume().catch(() => {
            return;
          });
        }
        applyOutputDevice(target);
        const sound = SOUND_SET[name];
        for (const note of sound.notes) {
          scheduleNote(target, note, sound.noteLength, options);
        }
      } catch {
        return;
      }
    },
    setOutputDevice(deviceId: string): void {
      desiredDeviceId = deviceId;
    },
  };
}

function resolveAudioContextConstructor(): typeof AudioContext | undefined {
  const globalWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return globalWindow.AudioContext ?? globalWindow.webkitAudioContext;
}

let sharedPlayer: SoundPlayer | null = null;
let testPlayer: SoundPlayer | null = null;

export function getSoundPlayer(): SoundPlayer {
  if (testPlayer !== null) {
    return testPlayer;
  }
  if (sharedPlayer === null) {
    sharedPlayer = createSoundPlayer(() => {
      const AudioContextCtor = resolveAudioContextConstructor();
      return AudioContextCtor ? new AudioContextCtor() : null;
    });
  }
  return sharedPlayer;
}

export function setSoundPlayerForTests(player: SoundPlayer | null): void {
  testPlayer = player;
}
