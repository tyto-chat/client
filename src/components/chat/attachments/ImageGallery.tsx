import { useTranslation } from "react-i18next";
import { AttachmentActions } from "./AttachmentActions";
import { THUMB_BASE } from "@/utils/attachmentFormat";
import type { Attachment } from "@/types/api";

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
  const { t } = useTranslation("channel");
  return (
    <div className="group relative h-full w-full overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label={att.originalName || t("view_image")}
        className="block h-full w-full cursor-zoom-in"
      >
        <img
          src={att.contentUrl!}
          alt={att.originalName ?? ""}
          width={att.width ?? 320}
          height={att.height ?? 192}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </button>
      {overlay}
      <AttachmentActions att={att} canDelete={canDelete} onDeleteAttachment={onDeleteAttachment} />
    </div>
  );
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
  const { t } = useTranslation("channel");
  const count = images.length;
  const visible = images.slice(0, 4);
  const hidden = images.slice(4);

  const single = count === 1 ? images[0] : undefined;
  if (single) {
    return (
      <div className="group relative h-48 w-fit max-w-xs overflow-hidden rounded-lg border border-line">
        <button
          type="button"
          onClick={() => onOpen(single)}
          aria-label={single.originalName || t("view_image")}
          className="block h-full cursor-zoom-in"
        >
          <img
            src={single.contentUrl!}
            alt={single.originalName ?? ""}
            width={single.width ?? 320}
            height={single.height ?? 192}
            loading="lazy"
            decoding="async"
            className="h-full w-auto object-contain"
          />
        </button>
        <AttachmentActions
          att={single}
          canDelete={canDelete}
          onDeleteAttachment={onDeleteAttachment}
        />
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
