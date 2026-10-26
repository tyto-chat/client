import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageLightbox } from "./ImageLightbox";
import { CanvasStillGif, FullscreenButton, GifBadge } from "./attachments/GifControls";
import { useGifPlayback } from "@/hooks/useGifPlayback";
import { isGifUrl } from "@/utils/gif";
import { allowHostForSession, remoteHost, useRemoteContentPolicy } from "@/utils/remoteContent";
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
          onClick={() => allowAlways(host)}
          className="remote-image-placeholder"
        >
          {t("remote_content_always_load", { host: host })}
        </button>
      </span>
    );
  }

  if (isGifUrl(url)) {
    return <RemoteGif url={url} onFailed={() => setFailed(true)} />;
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

function RemoteGif({ url, onFailed }: { url: string; onFailed: () => void }) {
  const { t } = useTranslation("channel");
  const { playing, toggle } = useGifPlayback();
  const [open, setOpen] = useState(false);

  return (
    <span className="group relative mt-2 block w-fit">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={t(playing ? "pause_gif" : "play_gif", { name: remoteHost(url) ?? url })}
        className="relative block cursor-pointer overflow-hidden rounded-lg"
      >
        <CanvasStillGif
          src={url}
          playing={playing}
          onError={onFailed}
          className="block max-h-48 max-w-xs"
        />
      </button>
      <GifBadge />
      <FullscreenButton onClick={() => setOpen(true)} className="absolute right-1 top-1" />
      {open && <ImageLightbox url={url} onClose={() => setOpen(false)} />}
    </span>
  );
}
