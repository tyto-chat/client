import { useState } from "react";
import { previewUrl } from "@/utils/attachmentFormat";
import type { Attachment } from "@/types/api";

type PreviewImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  att: Pick<Attachment, "contentUrl" | "thumbnailUrl">;
  alt: string;
};

export function PreviewImage({ att, alt, ...rest }: PreviewImageProps) {
  const [failedThumb, setFailedThumb] = useState<string | null>(null);
  const thumbFailed = !!att.thumbnailUrl && failedThumb === att.thumbnailUrl;
  const src = thumbFailed ? (att.contentUrl ?? undefined) : previewUrl(att);

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      onError={() => {
        if (att.thumbnailUrl && !thumbFailed) setFailedThumb(att.thumbnailUrl);
      }}
    />
  );
}
