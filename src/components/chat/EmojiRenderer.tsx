import type { CommunityEmoji } from "@/types/api";

interface Props {
  emoji: string;
  emojis?: CommunityEmoji[];
  className?: string;
}

const CELL_CLASS =
  "inline-flex h-4 w-4 items-center justify-center align-middle text-base leading-none";

export function EmojiRenderer({ emoji, emojis, className }: Props) {
  const cls = `${CELL_CLASS} ${className ?? ""}`;

  if (!emoji.startsWith(":") || !emoji.endsWith(":")) {
    return <span className={`${cls} emoji-glyph`}>{emoji}</span>;
  }

  const match = emojis?.find((e) => e.shortcode === emoji);

  if (match?.image?.contentUrl) {
    return (
      <span className={cls}>
        <img
          src={match.image.contentUrl}
          alt={emoji}
          title={emoji}
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }

  return <span className={`${cls} emoji-glyph`}>{emoji}</span>;
}
