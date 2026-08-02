import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, TrashIcon } from "@/components/icons";
import { Tooltip } from "@/components/Tooltip";
import { formatAudioTime } from "@/utils/attachmentFormat";

export function AudioPlayer({
  src,
  fileName,
  canDelete,
  downloadHref,
  downloadName,
  onDelete,
}: {
  src: string;
  fileName: string;
  canDelete: boolean;
  downloadHref: string;
  downloadName: string | true;
  onDelete: () => void;
}) {
  const { t } = useTranslation("channel");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
    } else {
      el.pause();
    }
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-inset ring-line">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-white transition-opacity hover:opacity-80"
        aria-label={playing ? t("pause") : t("play")}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="1" y="1" width="4" height="10" rx="1" />
            <rect x="7" y="1" width="4" height="10" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <polygon points="2,1 11,6 2,11" />
          </svg>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Tooltip
          content={fileName}
          className="max-w-[220px] truncate text-xs font-medium text-fg-muted"
        >
          {fileName}
        </Tooltip>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={currentTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setCurrentTime(val);
              if (audioRef.current) audioRef.current.currentTime = val;
            }}
            className="audio-scrubber h-1 flex-1 cursor-pointer appearance-none rounded-full"
            style={{ "--audio-progress": `${progress}%` } as React.CSSProperties}
          />
          <span className="shrink-0 tabular-nums text-[0.6875rem] text-fg-subtle">
            {formatAudioTime(currentTime)}
            {duration > 0 ? ` / ${formatAudioTime(duration)}` : ""}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <a
          href={downloadHref}
          download={downloadName}
          title={t("download_attachment")}
          className="rounded p-1 text-fg-subtle hover:text-[var(--accent)]"
        >
          <DownloadIcon size={14} />
        </a>
        {canDelete && (
          <button
            type="button"
            title={t("remove_attachment")}
            onClick={onDelete}
            className="rounded p-1 text-fg-subtle hover:text-danger"
          >
            <TrashIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
