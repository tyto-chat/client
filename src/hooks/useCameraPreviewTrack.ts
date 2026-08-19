import { useEffect, useRef, useState } from "react";
import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import { BLUR_RADII, MEDIAPIPE_ASSET_PATHS, useBackgroundBlur } from "@/utils/mediaEffects";
import { usePreferredDevice } from "@/utils/deviceSettings";

const BLURRED_FRAMES_BEFORE_REVEAL = 2;
const PROCESSOR_REVEAL_TIMEOUT_MS = 5000;

export function useCameraPreviewTrack(enabled = true): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ready: boolean;
  failed: boolean;
} {
  const cameraDevice = usePreferredDevice("videoinput");
  const blur = useBackgroundBlur();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  const [readyTrack, setReadyTrack] = useState<LocalVideoTrack | null>(null);
  const [failed, setFailed] = useState(false);
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);
  const ready = track !== null && readyTrack === track;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let created: LocalVideoTrack | undefined;
    void (async () => {
      try {
        const { createLocalVideoTrack } = await import("livekit-client");
        created = await createLocalVideoTrack({ deviceId: cameraDevice || undefined });
        if (cancelled) {
          created.stop();
          return;
        }
        setFailed(false);
        setTrack(created);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      processorRef.current = null;
      if (created) {
        void created.stopProcessor().catch(() => {});
        created.stop();
      }
      setTrack(null);
    };
  }, [cameraDevice, enabled]);

  useEffect(() => {
    const el = videoRef.current;
    if (!track || !ready || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track, ready, failed]);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      if (!cancelled) setReadyTrack(track);
    };
    void (async () => {
      const { BackgroundProcessor, supportsBackgroundProcessors } =
        await import("@livekit/track-processors");
      if (cancelled) return;
      if (blur !== "off" && supportsBackgroundProcessors()) {
        const blurRadius = BLUR_RADII[blur];
        if (!processorRef.current) {
          let processedFrames = 0;
          const processor = BackgroundProcessor({
            mode: "background-blur",
            blurRadius,
            assetPaths: MEDIAPIPE_ASSET_PATHS,
            onFrameProcessed: () => {
              processedFrames += 1;
              if (processedFrames >= BLURRED_FRAMES_BEFORE_REVEAL) reveal();
            },
          });
          processorRef.current = processor;
          revealTimer = setTimeout(reveal, PROCESSOR_REVEAL_TIMEOUT_MS);
          await track.setProcessor(processor).catch(() => {
            processorRef.current = null;
            reveal();
          });
          return;
        }
        await processorRef.current
          .switchTo({ mode: "background-blur", blurRadius })
          .catch(() => {});
      } else if (track.getProcessor()) {
        await track.stopProcessor().catch(() => {});
        processorRef.current = null;
      }
      reveal();
    })();
    return () => {
      cancelled = true;
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, [track, blur]);

  return { videoRef, ready, failed };
}
