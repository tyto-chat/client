import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommunityEmoji } from "@/types/api";
import { useCommunityEmojis } from "@/queries/communityEmojiQueries";
import { UnifiedEmojiPicker } from "@/components/chat/UnifiedEmojiPicker";
import { getTopEmojiKeys, recordEmojiUse } from "@/utils/emojiUsage";

interface Props {
  communityIdentifier: string;
  onPick: (reactionValue: string) => void;
}

const QUICK_COUNT = 6;
const QUICK_FALLBACK = ["👍", "❤️", "😂", "🎉", "😢", "🔥"];

export function QuickReactionPicker({ communityIdentifier, onPick }: Props) {
  const { t } = useTranslation("common");
  const { data: emojis } = useCommunityEmojis(communityIdentifier);
  const [showAll, setShowAll] = useState(false);

  function pick(value: string) {
    recordEmojiUse(communityIdentifier, value);
    onPick(value);
  }

  if (showAll) {
    return <UnifiedEmojiPicker communityIdentifier={communityIdentifier} onPick={pick} />;
  }

  const topKeys = getTopEmojiKeys(communityIdentifier, QUICK_COUNT);
  const seen = new Set<string>();
  const items: Array<{ key: string; emoji?: CommunityEmoji }> = [];

  for (const key of topKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const emoji = emojis?.find((e) => e.shortcode === key);
    if (!emoji && key.startsWith(":") && key.endsWith(":")) continue;
    items.push({ key, emoji });
  }
  if (emojis) {
    for (const e of emojis) {
      if (items.length >= QUICK_COUNT) break;
      const key = e.shortcode;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, emoji: e });
    }
  }
  for (const glyph of QUICK_FALLBACK) {
    if (items.length >= QUICK_COUNT) break;
    if (seen.has(glyph)) continue;
    seen.add(glyph);
    items.push({ key: glyph });
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-overlay p-1.5 shadow-soft-md">
      {items.map(({ key, emoji }) => (
        <button
          type="button"
          key={key}
          onClick={() => pick(key)}
          title={emoji?.shortcode ?? key}
          className="flex h-8 w-8 items-center justify-center rounded text-lg transition-colors hover:bg-surface"
        >
          {emoji?.image?.contentUrl ? (
            <img
              src={emoji.image.contentUrl}
              alt={emoji.shortcode}
              className="h-5 w-5"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span>{key}</span>
          )}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowAll(true)}
        title={t("show_all_emojis")}
        className="flex h-8 items-center justify-center rounded px-2 text-xs text-fg-muted transition-colors hover:bg-surface"
      >
        …
      </button>
    </div>
  );
}
