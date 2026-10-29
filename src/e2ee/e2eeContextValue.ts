import { createContext, useContext, useMemo } from "react";
import type { ConversationSession, E2eeIdentity } from "./conversationSession";
import type { Conversation } from "@/types/api";

export type E2eeAvailability = "unsupported" | "not_restored" | "ready";

export interface E2eeContextValue {
  identity: E2eeIdentity | null;
  availability: E2eeAvailability;
  setIdentity: (identity: E2eeIdentity | null) => void;
}

export const E2eeContext = createContext<E2eeContextValue>({
  identity: null,
  availability: "unsupported",
  setIdentity: () => undefined,
});

export function useE2ee(): E2eeContextValue {
  return useContext(E2eeContext);
}

export function useConversationSession(
  conversation: Conversation | null | undefined,
): ConversationSession | null {
  const { identity } = useE2ee();
  return useMemo(
    () =>
      identity !== null && conversation?.encrypted === true ? identity.session(conversation) : null,
    [identity, conversation],
  );
}
