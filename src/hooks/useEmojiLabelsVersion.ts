import { useSyncExternalStore } from "react";
import { subscribeEmojiLabels, emojiLabelsVersion } from "@/utils/emojiNameI18n";

export function useEmojiLabelsVersion(): number {
  return useSyncExternalStore(subscribeEmojiLabels, emojiLabelsVersion, emojiLabelsVersion);
}
