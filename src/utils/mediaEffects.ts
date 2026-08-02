import { useSyncExternalStore } from "react";

const NS_KEY = "tyto.audio.noiseSuppression";
const BLUR_KEY = "tyto.video.backgroundBlur";
const JOIN_MUTED_KEY = "tyto.voice.joinMuted";
const JOIN_CAMERA_KEY = "tyto.voice.joinCamera";
const MIRROR_KEY = "tyto.video.mirrorSelf";
const MIC_GAIN_KEY = "tyto.audio.micGain";
const OUTPUT_VOLUME_KEY = "tyto.audio.outputVolume";

export type BlurLevel = "off" | "light" | "strong";

export const BLUR_RADII: Record<Exclude<BlurLevel, "off">, number> = {
  light: 6,
  strong: 14,
};

export const MEDIAPIPE_ASSET_PATHS = {
  tasksVisionFileSet: "/mediapipe/wasm",
  modelAssetPath: "/mediapipe/selfie_segmenter.tflite",
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function readFlag(key: string, defaultOn: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? defaultOn : v === "1";
  } catch {
    return defaultOn;
  }
}

function writeFlag(key: string, on: boolean, defaultOn: boolean): void {
  try {
    if (on === defaultOn) localStorage.removeItem(key);
    else localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  emit();
}

export function getNoiseSuppression(): boolean {
  try {
    return localStorage.getItem(NS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setNoiseSuppression(on: boolean): void {
  try {
    if (on) localStorage.removeItem(NS_KEY);
    else localStorage.setItem(NS_KEY, "0");
  } catch {
    /* ignore */
  }
  emit();
}

export function getBackgroundBlur(): BlurLevel {
  try {
    const v = localStorage.getItem(BLUR_KEY);
    if (v === "light" || v === "strong") return v;
    if (v === "1") return "strong";
    return "off";
  } catch {
    return "off";
  }
}

export function setBackgroundBlur(level: BlurLevel): void {
  try {
    if (level === "off") localStorage.removeItem(BLUR_KEY);
    else localStorage.setItem(BLUR_KEY, level);
  } catch {
    /* ignore */
  }
  emit();
}

function readNumber(key: string, defaultValue: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    const v = Number(raw);
    if (!Number.isFinite(v)) return defaultValue;
    return Math.min(Math.max(v, min), max);
  } catch {
    return defaultValue;
  }
}

function writeNumber(key: string, value: number, defaultValue: number): void {
  try {
    if (value === defaultValue) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
  emit();
}

export const getMicGain = (): number => readNumber(MIC_GAIN_KEY, 100, 0, 200);
export const setMicGain = (v: number): void => writeNumber(MIC_GAIN_KEY, Math.round(v), 100);

export const getOutputVolume = (): number => readNumber(OUTPUT_VOLUME_KEY, 100, 0, 100);
export const setOutputVolume = (v: number): void =>
  writeNumber(OUTPUT_VOLUME_KEY, Math.round(v), 100);

export const getJoinMuted = (): boolean => readFlag(JOIN_MUTED_KEY, false);
export const setJoinMuted = (on: boolean): void => writeFlag(JOIN_MUTED_KEY, on, false);

export const getJoinWithCamera = (): boolean => readFlag(JOIN_CAMERA_KEY, false);
export const setJoinWithCamera = (on: boolean): void => writeFlag(JOIN_CAMERA_KEY, on, false);

export const getMirrorSelf = (): boolean => readFlag(MIRROR_KEY, true);
export const setMirrorSelf = (on: boolean): void => writeFlag(MIRROR_KEY, on, true);

export function useNoiseSuppression(): boolean {
  return useSyncExternalStore(subscribe, getNoiseSuppression);
}

export function useBackgroundBlur(): BlurLevel {
  return useSyncExternalStore(subscribe, getBackgroundBlur);
}

export function useJoinMuted(): boolean {
  return useSyncExternalStore(subscribe, getJoinMuted);
}

export function useJoinWithCamera(): boolean {
  return useSyncExternalStore(subscribe, getJoinWithCamera);
}

export function useMirrorSelf(): boolean {
  return useSyncExternalStore(subscribe, getMirrorSelf);
}

export function useMicGain(): number {
  return useSyncExternalStore(subscribe, getMicGain);
}

export function useOutputVolume(): number {
  return useSyncExternalStore(subscribe, getOutputVolume);
}
