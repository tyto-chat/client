import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import {
  BLUR_RADII,
  MEDIAPIPE_ASSET_PATHS,
  useBackgroundBlur,
  useMirrorSelf,
} from "@/utils/mediaEffects";
import { usePreferredDevice } from "@/utils/deviceSettings";

export function CameraPreview() {
  const { t } = useTranslation("channel");
  const cameraDevice = usePreferredDevice("videoinput");
  const blur = useBackgroundBlur();
  const mirrorSelf = useMirrorSelf();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  const [failed, setFailed] = useState(false);
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);

  useEffect(() => {
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
  }, [cameraDevice]);

  useEffect(() => {
    const el = videoRef.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track, failed]);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    void (async () => {
      const { BackgroundProcessor, supportsBackgroundProcessors } =
        await import("@livekit/track-processors");
      if (cancelled) return;
      if (blur !== "off" && supportsBackgroundProcessors()) {
        const blurRadius = BLUR_RADII[blur];
        if (!processorRef.current) {
          const processor = BackgroundProcessor({
            mode: "background-blur",
            blurRadius,
            assetPaths: MEDIAPIPE_ASSET_PATHS,
          });
          processorRef.current = processor;
          await track.setProcessor(processor).catch(() => {
            processorRef.current = null;
          });
        } else {
          await processorRef.current
            .switchTo({ mode: "background-blur", blurRadius })
            .catch(() => {});
        }
      } else if (track.getProcessor()) {
        await track.stopProcessor().catch(() => {});
        processorRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track, blur]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center text-xs text-fg-muted">
          {t("camera_preview_failed")}
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`h-full w-full object-cover ${mirrorSelf ? "-scale-x-100" : ""}`}
        />
      )}
    </div>
  );
}
