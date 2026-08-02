import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { DownloadIcon } from "@/components/icons";
import { formatFileSize } from "@/utils/attachmentFormat";
import type { Attachment } from "@/types/api";

export function Lightbox({
  items,
  index,
  onClose,
  onPrev,
  onNext,
  onSelect,
}: {
  items: Attachment[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation(["channel", "common"]);
  const current = items[index];
  const isVideo = !!current?.mimeType?.startsWith("video/");
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stripRef.current?.children[index]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  function enterFullscreen() {
    videoRef.current?.requestFullscreen();
  }

  if (!current) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.originalName || t("image")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
      onClick={onClose}
    >
      {items.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          disabled={index === 0}
          aria-label={t("previous")}
          className="absolute left-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/70 disabled:opacity-20"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <div
        className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {isVideo ? (
            <video
              ref={videoRef}
              key={current["@id"]}
              src={current.contentUrl!}
              controls
              autoPlay
              className="max-h-full max-w-[90vw] rounded-lg shadow-soft-lg"
            />
          ) : (
            <img
              src={current.contentUrl!}
              alt={current.originalName ?? ""}
              className="max-h-full max-w-[90vw] rounded-lg object-contain shadow-soft-lg"
            />
          )}
        </div>

        <div className="mt-2 flex shrink-0 items-center gap-3 text-sm text-white/80">
          {items.length > 1 && (
            <span className="text-xs text-white/60">
              {index + 1} / {items.length}
            </span>
          )}
          <span className="max-w-xs truncate">{current.originalName}</span>
          {formatFileSize(current.size) && (
            <span className="text-xs text-white/60">{formatFileSize(current.size)}</span>
          )}
          {isVideo && (
            <button
              type="button"
              onClick={enterFullscreen}
              title={t("fullscreen")}
              className="text-white/60 hover:text-white"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
          <a
            href={current.contentUrl!}
            download={current.originalName ?? true}
            title={t("download_attachment")}
            className="text-white/60 hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <DownloadIcon size={15} />
          </a>
        </div>

        {items.length > 1 && (
          <div
            ref={stripRef}
            className="mt-3 flex max-w-[92vw] shrink-0 gap-2 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-2"
          >
            {items.map((att, i) => {
              const thumbIsVideo = !!att.mimeType?.startsWith("video/");
              return (
                <button
                  key={att["@id"]}
                  type="button"
                  onClick={() => onSelect(i)}
                  title={att.originalName ?? ""}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                    i === index
                      ? "border-[var(--accent)] opacity-100 ring-2 ring-[var(--accent)]/40"
                      : "border-transparent opacity-50 hover:-translate-y-0.5 hover:opacity-80"
                  }`}
                >
                  {thumbIsVideo ? (
                    <span className="flex h-full w-full items-center justify-center bg-black/60 text-sm text-white">
                      ▶
                    </span>
                  ) : (
                    <img
                      src={att.contentUrl!}
                      alt={att.originalName ?? ""}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {items.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          disabled={index === items.length - 1}
          aria-label={t("next")}
          className="absolute right-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/70 disabled:opacity-20"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t("common:close")}
        className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/70"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
