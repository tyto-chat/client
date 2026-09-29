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
let storageWritable = true;

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

function readStored(): SoundSettings | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SOUND_SETTINGS_KEY);
  } catch {
    return null;
  }
  if (raw === null) {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

function writeStored(settings: SoundSettings): boolean {
  try {
    localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    return false;
  }
  return true;
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

export function getSoundSettings(): SoundSettings {
  if (cached === null) {
    cached = readStored() ?? { ...DEFAULT_SOUND_SETTINGS };
  }
  return cached;
}

export function updateSoundSettings(change: Partial<SoundSettings>): void {
  const base = storageWritable ? (readStored() ?? getSoundSettings()) : getSoundSettings();
  const next = normalize({ ...base, ...change });
  cached = next;
  storageWritable = writeStored(next);
  notifyListeners();
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== null && event.key !== SOUND_SETTINGS_KEY) {
    return;
  }
  cached = null;
  notifyListeners();
}

window.addEventListener("storage", handleStorageChange);

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribe, getSoundSettings);
}

export function resetSoundSettingsForTests(): void {
  cached = null;
  storageWritable = true;
}
