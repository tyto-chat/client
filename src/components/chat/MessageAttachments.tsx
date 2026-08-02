import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, TrashIcon, FileTypeIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { AttachmentActions } from "./attachments/AttachmentActions";
import { ImageGallery } from "./attachments/ImageGallery";
import { Lightbox } from "./attachments/Lightbox";
import { AudioPlayer } from "./attachments/AudioPlayer";
import { isImageMime, formatFileSize, THUMB_CLASS } from "@/utils/attachmentFormat";
import type { Attachment } from "@/types/api";

export function MessageAttachments({
  attachments,
  canDelete,
  onDeleteAttachment,
}: {
  attachments: Attachment[];
  canDelete: boolean;
  onDeleteAttachment: (iri: string) => void;
}) {
  const { t } = useTranslation("channel");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  const mediaItems = attachments.filter(
    (a) => (isImageMime(a.mimeType) || a.mimeType?.startsWith("video/")) && a.contentUrl,
  );
  const images = attachments.filter((a) => isImageMime(a.mimeType) && a.contentUrl);
  const videos = attachments.filter((a) => a.mimeType?.startsWith("video/") && a.contentUrl);
  const audios = attachments.filter((a) => a.mimeType?.startsWith("audio/") && a.contentUrl);
  const files = attachments.filter(
    (a) =>
      (!isImageMime(a.mimeType) || !a.contentUrl) &&
      !a.mimeType?.startsWith("video/") &&
      !a.mimeType?.startsWith("audio/"),
  );

  function openLightbox(att: Attachment) {
    const idx = mediaItems.indexOf(att);
    if (idx !== -1) setLightboxIndex(idx);
  }

  const closeLightbox = () => setLightboxIndex(null);
  const prevMedia = () => setLightboxIndex((i) => (i !== null ? Math.max(0, i - 1) : i));
  const nextMedia = () =>
    setLightboxIndex((i) => (i !== null ? Math.min(mediaItems.length - 1, i + 1) : i));

  return (
    <div className="mt-1.5 mb-1.5 flex flex-col gap-2">
      {images.length > 0 && (
        <ImageGallery
          images={images}
          canDelete={canDelete}
          onDeleteAttachment={onDeleteAttachment}
          onOpen={openLightbox}
        />
      )}
      {videos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {videos.map((att) => (
            <div key={att["@id"]} className={`group ${THUMB_CLASS}`}>
              <button
                type="button"
                onClick={() => openLightbox(att)}
                aria-label={att.originalName || t("play_video")}
                className="block h-full w-full cursor-zoom-in"
              >
                <video
                  src={att.contentUrl!}
                  className="h-full w-full object-cover"
                  preload="metadata"
                />
              </button>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-black/50 p-3 transition-transform duration-150 group-hover:scale-110 group-hover:bg-black/70">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                </div>
              </div>
              <AttachmentActions
                att={att}
                canDelete={canDelete}
                onDeleteAttachment={onDeleteAttachment}
              />
            </div>
          ))}
        </div>
      )}
      {lightboxIndex !== null && (
        <Lightbox
          items={mediaItems}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevMedia}
          onNext={nextMedia}
          onSelect={setLightboxIndex}
        />
      )}
      {audios.length > 0 && (
        <div className="flex flex-col gap-2">
          {audios.map((att) => (
            <AudioPlayer
              key={att["@id"]}
              src={att.contentUrl!}
              fileName={att.originalName ?? "audio"}
              canDelete={canDelete}
              downloadHref={att.contentUrl!}
              downloadName={att.originalName ?? true}
              onDelete={() => onDeleteAttachment(att["@id"])}
            />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((att) => {
            const sizeLabel = formatFileSize(att.size);
            return (
              <div
                key={att["@id"]}
                className="group flex items-center gap-2.5 rounded-xl bg-surface px-2.5 py-2 ring-1 ring-inset ring-line"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-gradient text-white">
                  <FileTypeIcon mimeType={att.mimeType ?? null} size={18} />
                </div>
                <div className="flex min-w-0 flex-col">
                  <Tooltip
                    content={att.originalName ?? "attachment"}
                    className="max-w-[200px] truncate text-xs text-fg-muted"
                  >
                    {att.originalName ?? "attachment"}
                  </Tooltip>
                  {sizeLabel && (
                    <span className="text-[0.6875rem] text-fg-subtle">{sizeLabel}</span>
                  )}
                </div>
                {att.contentUrl && (
                  <a
                    href={att.contentUrl}
                    download={att.originalName ?? true}
                    title={t("download_attachment")}
                    className="text-fg-subtle hover:text-[var(--accent)]"
                  >
                    <DownloadIcon size={13} />
                  </a>
                )}
                {canDelete && (
                  <button
                    type="button"
                    title={t("remove_attachment")}
                    onClick={() => onDeleteAttachment(att["@id"])}
                    className="text-fg-subtle hover:text-danger"
                  >
                    <TrashIcon size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
