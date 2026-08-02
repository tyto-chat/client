import { useSyncExternalStore } from "react";

export interface MemberAudioSettings {
  muted: boolean;
  volume: number;
}

const DEFAULT: MemberAudioSettings = { muted: false, volume: 100 };

let store = new Map<number, MemberAudioSettings>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getMemberAudio(userId: number): MemberAudioSettings {
  return store.get(userId) ?? DEFAULT;
}

export function setMemberMuted(userId: number, muted: boolean): void {
  const prev = getMemberAudio(userId);
  store = new Map(store);
  store.set(userId, { ...prev, muted });
  emit();
}

export function setMemberVolume(userId: number, volume: number): void {
  const prev = getMemberAudio(userId);
  store = new Map(store);
  store.set(userId, { ...prev, volume: Math.min(Math.max(Math.round(volume), 0), 100) });
  emit();
}

export function resetMemberAudio(): void {
  if (store.size === 0) return;
  store = new Map();
  emit();
}

export function useMemberAudio(userId: number): MemberAudioSettings {
  return useSyncExternalStore(subscribe, () => getMemberAudio(userId));
}

export function useMemberAudioStore(): Map<number, MemberAudioSettings> {
  return useSyncExternalStore(subscribe, () => store);
}
