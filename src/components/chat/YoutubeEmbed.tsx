import { useEffect, useState } from "react";

interface Props {
  videoId: string;
}

export function YoutubeEmbed({ videoId }: Props) {
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { title?: string } | null) => {
        if (!cancelled && d?.title) setTitle(d.title);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return (
    <div className="mt-2 w-full max-w-md overflow-hidden rounded-xl border border-line shadow-soft">
      {playing ? (
        <iframe
          className="aspect-video w-full border-0"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={title ?? "YouTube video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={title ? `Play: ${title}` : "Play YouTube video"}
          className="group block w-full text-left"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-canvas">
            <img
              src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              className="h-full w-full object-cover transition-transform duration-(--motion-base) group-hover:scale-[1.03]"
              loading="lazy"
            />
            <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white transition-colors group-hover:bg-black/75">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <polygon points="9 7 9 17 17 12" />
              </svg>
            </span>
          </div>
          <div className="px-3.5 py-2.5">
            <div className="truncate text-sm font-semibold text-fg">{title ?? "YouTube"}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              YouTube
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
