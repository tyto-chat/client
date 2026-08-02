import { type RefObject, useEffect } from "react";
import { usePreferredDevice } from "@/utils/deviceSettings";
import { getMicGain } from "@/utils/mediaEffects";

const METER_MAX_LEVEL = 0.1;
const METER_TICK_MS = 40;

export function useMicLevelMonitor(active: boolean, micLevelRef: RefObject<number>): void {
  const preferredMic = usePreferredDevice("audioinput");

  useEffect(() => {
    if (!active) {
      micLevelRef.current = 0;
      return;
    }

    let stopped = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: preferredMic ? { deviceId: preferredMic } : true,
          video: false,
        });
      } catch {
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);

      const interval = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const sample of data) sum += sample * sample;
        const rms = Math.sqrt(sum / data.length) * (getMicGain() / 100);
        micLevelRef.current = Math.min(rms / METER_MAX_LEVEL, 1);
      }, METER_TICK_MS);

      cleanup = () => {
        clearInterval(interval);
        stream.getTracks().forEach((t) => t.stop());
        void audioCtx.close();
      };
    })();

    return () => {
      stopped = true;
      cleanup?.();
      cleanup = null;
      micLevelRef.current = 0;
    };
  }, [active, micLevelRef, preferredMic]);
}
