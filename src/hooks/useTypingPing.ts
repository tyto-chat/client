import { useCallback, useRef } from "react";
import { sendChannelTyping, sendConversationTyping } from "@/api/typing";
import { TYPING_PING_INTERVAL_MS } from "@/queries/typingQueries";
import { getSendTypingIndicator } from "@/utils/typingPreference";

export interface TypingTarget {
  communityId?: string;
  channelIdentifier?: string;
  conversationIdentifier?: string;
}

export function useTypingPing(target: TypingTarget): () => void {
  const lastPingRef = useRef(0);

  const { communityId, channelIdentifier, conversationIdentifier } = target;

  return useCallback(() => {
    const now = Date.now();
    if (now - lastPingRef.current < TYPING_PING_INTERVAL_MS) return;
    if (!getSendTypingIndicator()) return;
    lastPingRef.current = now;

    if (conversationIdentifier) {
      sendConversationTyping(conversationIdentifier);
    } else if (communityId && channelIdentifier) {
      sendChannelTyping(communityId, channelIdentifier);
    }
  }, [communityId, channelIdentifier, conversationIdentifier]);
}
