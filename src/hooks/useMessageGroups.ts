import { useCallback, useMemo, useState } from "react";
import { useBlockedUserIds } from "@/queries/blockQueries";
import { groupMessages, revealGroups } from "@/utils/messageGroups";
import type { Message, User } from "@/types/api";

const NONE: ReadonlySet<string> = new Set();

function matchesFocus(message: Message, focusId: string): boolean {
  return message["@id"] === focusId || message["@id"].endsWith(`/${focusId}`);
}

export function useMessageGroups(messages: Message[], user: User | null, focusId?: string | null) {
  const blockedUserIds = useBlockedUserIds();
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(NONE);

  const focusIri = focusId ? messages.find((m) => matchesFocus(m, focusId))?.["@id"] : undefined;
  if (focusIri && !revealedIds.has(focusIri)) {
    setRevealedIds(new Set(revealedIds).add(focusIri));
  }

  const groups = useMemo(
    () => revealGroups(groupMessages(messages, user, blockedUserIds), user, revealedIds),
    [messages, user, blockedUserIds, revealedIds],
  );

  const reveal = useCallback((msgs: readonly Message[]) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      for (const m of msgs) next.add(m["@id"]);
      return next;
    });
  }, []);

  return { groups, reveal };
}
