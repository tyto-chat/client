import { useTranslation } from "react-i18next";
import { XIcon } from "@/components/icons";
import type { PendingAttachment } from "@/hooks/usePendingAttachments";

export function AttachmentPreviewStrip({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation(["channel"]);
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pb-2 pt-1">
      {attachments.map((a) =>
        a.previewUrl ? (
          <div key={a.id} className="group relative inline-block">
            {a.file.type.startsWith("video/") ? (
              <>
                <video
                  src={a.previewUrl}
                  className={`h-14 w-14 rounded-lg border object-cover ${
                    a.error ? "border-danger opacity-50" : "border-line"
                  }`}
                  muted
                  preload="metadata"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full bg-black/50 p-1.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <img
                src={a.previewUrl}
                alt={a.file.name}
                className={`h-14 w-14 rounded-lg border object-cover ${
                  a.error ? "border-danger opacity-50" : "border-line"
                }`}
              />
            )}
            {a.uploading && (
              <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-lg bg-black/30">
                <div
                  className="h-full rounded-b-lg bg-[var(--accent)] transition-all duration-150"
                  style={{ width: `${a.progress}%` }}
                />
              </div>
            )}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onRemove(a.id);
              }}
              title={t("channel:remove_attachment")}
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-fg-subtle text-white hover:bg-danger"
            >
              <XIcon size={8} />
            </button>
          </div>
        ) : (
          <div
            key={a.id}
            className={`relative flex items-center gap-1 overflow-hidden rounded-full px-2 py-0.5 text-xs ${
              a.error ? "bg-danger-subtle text-danger" : "bg-surface text-fg-muted"
            }`}
          >
            {a.uploading && (
              <div
                className="absolute inset-0 rounded-full bg-[var(--accent)]/40 transition-all duration-150"
                style={{ width: `${a.progress}%` }}
              />
            )}
            <span className="relative max-w-[120px] truncate">{a.file.name}</span>
            {a.error && <span className="relative ml-1 text-xs">!</span>}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onRemove(a.id);
              }}
              title={t("channel:remove_attachment")}
              className="relative ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            >
              <XIcon size={10} />
            </button>
          </div>
        ),
      )}
    </div>
  );
}
