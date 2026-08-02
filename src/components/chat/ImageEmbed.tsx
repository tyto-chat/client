import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageLightbox } from "./ImageLightbox";

interface Props {
  url: string;
}

export function ImageEmbed({ url }: Props) {
  const { t } = useTranslation("channel");
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("view_image")}
        className="mt-2 block"
      >
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="max-h-48 max-w-xs cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
          onError={() => setFailed(true)}
        />
      </button>
      {open && <ImageLightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}
