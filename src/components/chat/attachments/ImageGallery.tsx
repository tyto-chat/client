import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentActions } from "./AttachmentActions";
import { THUMB_BASE } from "@/utils/attachmentFormat";
import { PreviewImage } from "./PreviewImage";
import { CanvasStillGif, FullscreenButton, GifBadge } from "./GifControls";
import { useGifPlayback } from "@/hooks/useGifPlayback";
import { fitWithin } from "@/utils/gif";
import type { Attachment } from "@/types/api";

const SINGLE_MAX_WIDTH = 320;
const SINGLE_MAX_HEIGHT = 192;

type ImageSizing = { className: string; style?: React.CSSProperties };

function MediaButton({
  att,
  onOpen,
  className,
  image,
}: {
  att: Attachment;
  onOpen: () => void;
  className: string;
  image: ImageSizing;
}) {
  const { t } = useTranslation("channel");
  if (att.animated && att.contentUrl) {
    return <GifButton att={att} contentUrl={att.contentUrl} className={className} image={image} />;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={att.originalName || t("view_image")}
      className={`${className} cursor-zoom-in`}
    >
      <PreviewImage
        att={att}
        alt={att.originalName ?? ""}
        width={att.width ?? 320}
        height={att.height ?? 192}
        loading="lazy"
        decoding="async"
        className={image.className}
        style={image.style}
      />
    </button>
  );
}

function GifButton({
  att,
  contentUrl,
  className,
  image,
}: {
  att: Attachment;
  contentUrl: string;
  className: string;
  image: ImageSizing;
}) {
  const { t } = useTranslation("channel");
  const { playing, toggle } = useGifPlayback();
  const [thumbFailed, setThumbFailed] = useState(false);
  const [originalShown, setOriginalShown] = useState(false);
  const togglePlayback = () => {
    setOriginalShown(false);
    toggle();
  };
  const name = att.originalName || t("view_image");
  const width = att.width ?? undefined;
  const height = att.height ?? undefined;
  return (
    <button
      type="button"
      onClick={togglePlayback}
      aria-pressed={playing}
      aria-label={t(playing ? "pause_gif" : "play_gif", { name })}
      className={`${className} relative cursor-pointer`}
    >
      {att.thumbnailUrl && !thumbFailed ? (
        <>
          <img
            src={att.thumbnailUrl}
            alt=""
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            onError={() => setThumbFailed(true)}
            className={`${image.className} ${playing && originalShown ? "invisible" : ""}`}
            style={image.style}
          />
          {playing && (
            <img
              src={contentUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setOriginalShown(true)}
              data-testid="gif-playing"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </>
      ) : (
        <CanvasStillGif
          src={contentUrl}
          playing={playing}
          width={width}
          height={height}
          className={image.className}
          style={image.style}
        />
      )}
    </button>
  );
}

function GalleryTile({
  att,
  canDelete,
  onDeleteAttachment,
  onOpen,
  overlay,
}: {
  att: Attachment;
  canDelete: boolean;
  onDeleteAttachment: (iri: string) => void;
  onOpen: () => void;
  overlay?: React.ReactNode;
}) {
  return (
    <div className="group relative h-full w-full overflow-hidden">
      <MediaButton
        att={att}
        onOpen={onOpen}
        className="block h-full w-full"
        image={{ className: "h-full w-full object-cover" }}
      />
      {att.animated && <GifBadge />}
      {overlay}
      <AttachmentActions att={att} canDelete={canDelete} onDeleteAttachment={onDeleteAttachment} />
      {att.animated && <FullscreenButton onClick={onOpen} className="absolute left-1 top-1" />}
    </div>
  );
}

function singleImageSizing(att: Attachment): ImageSizing {
  if (!att.animated || !att.width || !att.height) {
    return { className: "block h-auto max-h-48 w-auto max-w-full" };
  }
  const { width } = fitWithin(att.width, att.height, SINGLE_MAX_WIDTH, SINGLE_MAX_HEIGHT);
  return { className: "block h-auto max-w-full", style: { width } };
}

const tileClass = "overflow-hidden rounded-sm border border-line";

export function ImageGallery({
  images,
  canDelete,
  onDeleteAttachment,
  onOpen,
}: {
  images: Attachment[];
  canDelete: boolean;
  onDeleteAttachment: (iri: string) => void;
  onOpen: (att: Attachment) => void;
}) {
  const count = images.length;
  const visible = images.slice(0, 4);
  const hidden = images.slice(4);

  const single = count === 1 ? images[0] : undefined;
  if (single) {
    return (
      <div className="group relative w-fit max-w-xs overflow-hidden rounded-lg border border-line">
        <MediaButton
          att={single}
          onOpen={() => onOpen(single)}
          className="block"
          image={singleImageSizing(single)}
        />
        {single.animated && <GifBadge />}
        <AttachmentActions
          att={single}
          canDelete={canDelete}
          onDeleteAttachment={onDeleteAttachment}
        />
        {single.animated && (
          <FullscreenButton onClick={() => onOpen(single)} className="absolute left-1 top-1" />
        )}
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className={`grid grid-cols-2 gap-0.5 ${THUMB_BASE}`}>
        {visible.map((att) => (
          <div key={att["@id"]} className={tileClass}>
            <GalleryTile
              att={att}
              canDelete={canDelete}
              onDeleteAttachment={onDeleteAttachment}
              onOpen={() => onOpen(att)}
            />
          </div>
        ))}
      </div>
    );
  }

  const [first, ...rest] = visible;
  if (count === 3 && first) {
    return (
      <div className={`flex gap-0.5 ${THUMB_BASE}`}>
        <div className={`flex-[2] ${tileClass}`}>
          <GalleryTile
            att={first}
            canDelete={canDelete}
            onDeleteAttachment={onDeleteAttachment}
            onOpen={() => onOpen(first)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          {rest.map((att) => (
            <div key={att["@id"]} className={`flex-1 ${tileClass}`}>
              <GalleryTile
                att={att}
                canDelete={canDelete}
                onDeleteAttachment={onDeleteAttachment}
                onOpen={() => onOpen(att)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 gap-0.5 ${THUMB_BASE}`}>
      {visible.map((att, i) => {
        const isLast = i === 3 && hidden.length > 0;
        return (
          <div key={att["@id"]} className={tileClass}>
            <GalleryTile
              att={att}
              canDelete={canDelete}
              onDeleteAttachment={onDeleteAttachment}
              onOpen={() => onOpen(att)}
              overlay={
                isLast ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
                    <span className="text-lg font-semibold text-white">+{hidden.length}</span>
                  </div>
                ) : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}
