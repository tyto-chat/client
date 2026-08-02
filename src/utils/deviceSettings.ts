import { useSyncExternalStore } from "react";

export type DeviceKind = "audioinput" | "audiooutput" | "videoinput";

const storageKey = (kind: DeviceKind) => `tyto.device.${kind}`;
const listeners = new Set<() => void>();

export function getPreferredDevice(kind: DeviceKind): string {
  try {
    return localStorage.getItem(storageKey(kind)) ?? "";
  } catch {
    return "";
  }
}

export function setPreferredDevice(kind: DeviceKind, deviceId: string): void {
  try {
    if (deviceId) {
      localStorage.setItem(storageKey(kind), deviceId);
    } else {
      localStorage.removeItem(storageKey(kind));
    }
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePreferredDevice(kind: DeviceKind): string {
  return useSyncExternalStore(subscribe, () => getPreferredDevice(kind));
}
