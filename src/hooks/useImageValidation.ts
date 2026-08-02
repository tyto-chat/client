import { useTranslation } from "react-i18next";
import { getServerInfo } from "@/api/serverInfo";
import { parseMaxSize } from "@/utils/parseMaxSize";

type ImageUploadType = "avatar" | "logo" | "community_emoji";

interface Limits {
  maxSize: number;
  maxWidth: number;
  maxHeight: number;
  allowedMimes?: string[];
}

const FALLBACK: Limits = { maxSize: 1 * 1024 * 1024, maxWidth: 1000, maxHeight: 1000 };

export function useImageValidation(type: ImageUploadType = "avatar") {
  const { t } = useTranslation("settings");

  function getLimits(): Limits {
    const info = getServerInfo();
    if (!info?.uploads) return FALLBACK;
    if (type === "avatar") {
      return {
        maxSize: parseMaxSize(info.uploads.avatarMaxSize),
        maxWidth: info.uploads.avatarMaxWidth,
        maxHeight: info.uploads.avatarMaxHeight,
      };
    }
    if (type === "community_emoji") {
      return {
        maxSize: parseMaxSize(info.uploads.communityEmojiMaxSize),
        maxWidth: info.uploads.communityEmojiMaxWidth,
        maxHeight: info.uploads.communityEmojiMaxHeight,
        allowedMimes: info.uploads.communityEmojiAllowedMimes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }
    return {
      maxSize: parseMaxSize(info.uploads.logoMaxSize),
      maxWidth: info.uploads.logoMaxWidth,
      maxHeight: info.uploads.logoMaxHeight,
    };
  }

  async function validateImage(file: File): Promise<string | null> {
    const { maxSize, maxWidth, maxHeight, allowedMimes } = getLimits();

    if (allowedMimes && allowedMimes.length > 0 && !allowedMimes.includes(file.type)) {
      return t("image_invalid_type", {
        defaultValue: "Image type is not allowed.",
      });
    }

    if (file.size > maxSize) {
      return t("image_too_large");
    }

    if (type === "community_emoji") return null;

    const dims = await Promise.race([
      createImageBitmap(file)
        .then((bmp) => {
          const result: { w: number; h: number } = { w: bmp.width, h: bmp.height };
          bmp.close();
          return result;
        })
        .catch(() => null as null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    if (!dims || dims.w < 100 || dims.h < 100) {
      return t("image_too_small");
    }
    if (dims.w > maxWidth || dims.h > maxHeight) {
      return t("image_too_big_dimensions");
    }

    return null;
  }

  return { validateImage, getLimits };
}
