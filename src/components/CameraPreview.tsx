import { useTranslation } from "react-i18next";
import { useMirrorSelf } from "@/utils/mediaEffects";
import { useCameraPreviewTrack } from "@/hooks/useCameraPreviewTrack";

export function CameraPreview() {
  const { t } = useTranslation("channel");
  const mirrorSelf = useMirrorSelf();
  const { videoRef, ready, failed } = useCameraPreviewTrack();

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center text-xs text-fg-muted">
          {t("camera_preview_failed")}
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover ${mirrorSelf ? "-scale-x-100" : ""} ${
              ready ? "" : "invisible"
            }`}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-muted">
              {t("camera_preview_starting")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
