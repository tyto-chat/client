import type { Conversation, ConversationMember } from "@/types/api";

const MAX_NAMES = 2;

export function compactParticipantList(
  members: ConversationMember[],
  currentUserId: number | undefined,
  overflowSuffix: (count: number) => string,
): string {
  const others = members
    .filter((m) => m.userId !== currentUserId)
    .map((m) => m.profile?.name ?? `#${m.userId}`);

  if (others.length === 0) return "—";
  if (others.length <= MAX_NAMES) return others.join(", ");
  const shown = others.slice(0, MAX_NAMES).join(", ");
  return `${shown} ${overflowSuffix(others.length - MAX_NAMES)}`;
}

export function conversationDisplayName(
  conversation: Conversation,
  currentUserId: number | undefined,
  overflowSuffix: (count: number) => string,
): string {
  return compactParticipantList(conversation.members, currentUserId, overflowSuffix);
}
