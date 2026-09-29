import { useSyncExternalStore } from "react";

export interface SoundSettings {
  callSounds: boolean;
  notificationSounds: boolean;
  volume: number;
}

export const SOUND_SETTINGS_KEY = "tyto.sounds";

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  callSounds: true,
  notificationSounds: true,
  volume: 60,
};

const listeners = new Set<() => void>();
let cached: SoundSettings | null = null;

function clampVolume(value: unknown): number {
  const num = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(num)) {
    return DEFAULT_SOUND_SETTINGS.volume;
  }
  return Math.min(100, Math.max(0, Math.round(num)));
}

function normalize(raw: unknown): SoundSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
  const obj = raw as Record<string, unknown>;
  return {
    callSounds:
      typeof obj.callSounds === "boolean" ? obj.callSounds : DEFAULT_SOUND_SETTINGS.callSounds,
    notificationSounds:
      typeof obj.notificationSounds === "boolean"
        ? obj.notificationSounds
        : DEFAULT_SOUND_SETTINGS.notificationSounds,
    volume: "volume" in obj ? clampVolume(obj.volume) : DEFAULT_SOUND_SETTINGS.volume,
  };
}

function load(): SoundSettings {
  try {
    const raw = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (raw === null) {
      return { ...DEFAULT_SOUND_SETTINGS };
    }
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export function getSoundSettings(): SoundSettings {
  if (cached === null) {
    cached = load();
  }
  return cached;
}

export function updateSoundSettings(change: Partial<SoundSettings>): void {
  const next = normalize({ ...getSoundSettings(), ...change });
  cached = next;
  try {
    localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribe, getSoundSettings);
}

export function resetSoundSettingsForTests(): void {
  cached = null;
}
