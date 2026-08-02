import { useTranslation } from "react-i18next";
import { getServerInfo } from "@/api/serverInfo";
import { parseMaxSize } from "@/utils/parseMaxSize";

const FALLBACK_MAX_SIZE = 10 * 1024 * 1024;
const FALLBACK_ALLOWED_MIMES: string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "video/mp4",
  "application/zip",
  "audio/mpeg",
  "audio/wav",
];

export function useAttachmentValidation() {
  const { t } = useTranslation("channel");

  function getLimits(): {
    maxSize: number;
    allowedMimes: string[];
    attachmentMaxPerMessage: number;
  } {
    const info = getServerInfo();
    if (!info?.uploads) {
      return {
        maxSize: FALLBACK_MAX_SIZE,
        allowedMimes: FALLBACK_ALLOWED_MIMES,
        attachmentMaxPerMessage: 10,
      };
    }
    return {
      maxSize: parseMaxSize(info.uploads.attachmentMaxSize),
      allowedMimes: info.uploads.attachmentAllowedMimes
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      attachmentMaxPerMessage: info.uploads.attachmentMaxPerMessage ?? 10,
    };
  }

  function validateAttachment(file: File): string | null {
    const { maxSize, allowedMimes } = getLimits();

    if (file.size > maxSize) {
      return t("attachment_too_large");
    }

    if (allowedMimes.length > 0 && !allowedMimes.includes(file.type)) {
      return t("attachment_type_not_allowed");
    }

    return null;
  }

  return { validateAttachment, getLimits };
}
