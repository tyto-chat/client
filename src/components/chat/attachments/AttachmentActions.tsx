import { useTranslation } from "react-i18next";
import { DownloadIcon, TrashIcon } from "@/components/icons";
import { formatFileSize } from "@/utils/attachmentFormat";
import type { Attachment } from "@/types/api";

export function AttachmentActions({
  att,
  canDelete,
  onDeleteAttachment,
}: {
  att: Attachment;
  canDelete: boolean;
  onDeleteAttachment: (iri: string) => void;
}) {
  const { t } = useTranslation("channel");
  return (
    <>
      <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex [@media(hover:hover)]:group-focus-within:flex">
        <a
          href={att.contentUrl!}
          download={att.originalName ?? true}
          title={t("download_attachment")}
          onClick={(e) => e.stopPropagation()}
          className="rounded bg-black/50 p-1 text-white hover:bg-black/70"
        >
          <DownloadIcon size={12} />
        </a>
        {canDelete && (
          <button
            type="button"
            title={t("remove_attachment")}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteAttachment(att["@id"]);
            }}
            className="rounded bg-black/50 p-1 text-white hover:bg-danger/80"
          >
            <TrashIcon size={12} />
          </button>
        )}
      </div>
      {formatFileSize(att.size) && (
        <div className="absolute bottom-1 left-1 hidden group-hover:block [@media(hover:hover)]:group-focus-within:block">
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[0.6875rem] text-white">
            {formatFileSize(att.size)}
          </span>
        </div>
      )}
    </>
  );
}
