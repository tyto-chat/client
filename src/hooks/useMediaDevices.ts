import { useEffect, useState } from "react";

export function useMediaDevices(enabled: boolean): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!enabled || !media?.enumerateDevices) return;
    let cancelled = false;
    const refresh = () => {
      media
        .enumerateDevices()
        .then((list) => {
          if (!cancelled) setDevices(list);
        })
        .catch(() => {});
    };
    refresh();
    media.addEventListener("devicechange", refresh);
    return () => {
      cancelled = true;
      media.removeEventListener("devicechange", refresh);
    };
  }, [enabled]);

  return devices;
}
