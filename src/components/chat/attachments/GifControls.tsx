import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MaximizeIcon } from "@/components/icons";
import { stillFrameSize } from "@/utils/gif";

export function GifBadge() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white"
    >
      GIF
    </span>
  );
}

export function FullscreenButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className: string;
}) {
  const { t } = useTranslation("channel");
  return (
    <button
      type="button"
      title={t("view_full_size")}
      aria-label={t("view_full_size")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${className} hidden rounded bg-black/50 p-1 text-white hover:bg-black/70 group-hover:block [@media(hover:hover)]:group-focus-within:block [@media(hover:none)]:block`}
    >
      <MaximizeIcon size={12} />
    </button>
  );
}

export function CanvasStillGif({
  src,
  playing,
  className,
  style,
  width,
  height,
  onError,
}: {
  src: string;
  playing: boolean;
  className: string;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
  onError?: () => void;
}) {
  const [still, setStill] = useState<"pending" | "ready" | "unavailable" | "failed">("pending");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const captureFirstFrame = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !img.naturalWidth) {
      setStill("unavailable");
      return;
    }
    const { width, height } = stillFrameSize(
      img.naturalWidth,
      img.naturalHeight,
      img.clientWidth,
      img.clientHeight,
      window.devicePixelRatio || 1,
    );
    canvas.width = width;
    canvas.height = height;
    context.drawImage(img, 0, 0, width, height);
    setStill("ready");
  };

  const imageVisibility =
    playing || still === "failed" ? "" : still === "ready" ? "invisible" : "opacity-0";

  return (
    <>
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onLoad={(e) => captureFirstFrame(e.currentTarget)}
        onError={() => {
          setStill("failed");
          onError?.();
        }}
        style={style}
        className={`${className} ${imageVisibility}`}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-testid="gif-still"
        className={`absolute inset-0 h-full w-full object-cover ${playing || still !== "ready" ? "hidden" : ""}`}
      />
      {!playing && still === "unavailable" && (
        <span
          aria-hidden="true"
          data-testid="gif-placeholder"
          className="absolute inset-0 bg-surface"
        />
      )}
    </>
  );
}
