import type { BlurLevel } from "@/utils/mediaEffects";

export function shouldDeferCameraForBlur(
  joinWithCamera: boolean,
  blur: BlurLevel,
  processorsSupported: boolean,
): boolean {
  return joinWithCamera && blur !== "off" && processorsSupported;
}
