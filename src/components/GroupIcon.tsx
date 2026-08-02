import type { ReactNode } from "react";
import { useCommunityEmojis } from "@/queries/communityEmojiQueries";
import { groupChipStyle } from "@/utils/groupChipStyle";

interface Props {
  icon: string | null | undefined;
  name: string;
  communityIdentifier: string | undefined;
  className?: string;
  color?: string | null;
}

/**
 * A group's icon tile. Resolves a custom-emoji `:shortcode:` to its uploaded
 * image via the community emoji set; otherwise renders a unicode emoji or the
 * name's initial. Shared by every place a group icon shows so custom emojis
 * never leak through as raw `:shortcode:` text.
 */
export function GroupIcon({ icon, name, communityIdentifier, className, color }: Props) {
  const { data: emojis } = useCommunityEmojis(communityIdentifier);

  let content: ReactNode;
  if (!icon) {
    content = name[0]?.toUpperCase() ?? "?";
  } else if (icon.startsWith(":") && icon.endsWith(":")) {
    const match = emojis?.find((e) => e.shortcode === icon);
    content = match?.image?.contentUrl ? (
      <img
        src={match.image.contentUrl}
        alt={icon}
        title={icon}
        className="max-h-[1.6em] max-w-[1.6em] object-contain"
        loading="lazy"
        decoding="async"
      />
    ) : (
      icon
    );
  } else {
    content = icon;
  }

  return (
    <span className={className} style={groupChipStyle(color)}>
      {content}
    </span>
  );
}
