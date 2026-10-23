import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageLightbox } from "./ImageLightbox";
import {
  allowHostForSession,
  remoteHost,
  alwaysLoadHost,
  useRemoteContentPolicy,
} from "@/utils/remoteContent";
import { useAllowRemoteHost } from "@/hooks/useAllowRemoteHost";

interface Props {
  url: string;
}

export function ImageEmbed({ url }: Props) {
  const { t } = useTranslation("channel");
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const revealed = useRemoteContentPolicy().canAutoLoad(url);
  const allowAlways = useAllowRemoteHost();

  if (failed) return null;

  if (!revealed) {
    const host = remoteHost(url) ?? "?";
    return (
      <span className="remote-image-gate mt-2">
        <button
          type="button"
          data-testid="remote-image-placeholder"
          onClick={() => allowHostForSession(host)}
          className="remote-image-placeholder"
        >
          {t("remote_content_load_image", { host })}
        </button>
        <button
          type="button"
          data-testid="remote-image-always"
          onClick={() => allowAlways(alwaysLoadHost(host))}
          className="remote-image-placeholder"
        >
          {t("remote_content_always_load", { host: alwaysLoadHost(host) })}
        </button>
      </span>
    );
  }

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
