import { activeSecurity, type AdmissionConversation } from "./admission";

export function allowNotification(
  notification: { type: string; conversationIdentifier?: string | null },
  lookup: (identifier: string) => AdmissionConversation | undefined,
  origin?: string,
): boolean {
  if (notification.type !== "dm_message") return true;
  const security = activeSecurity();
  if (security === null) return true;
  if (origin !== undefined && origin !== security.scope.serverOrigin) return true;
  const conversation = notification.conversationIdentifier
    ? lookup(notification.conversationIdentifier)
    : undefined;
  if (conversation?.encrypted === true) return true;
  if (security.refusal.on) return false;
  if (conversation === undefined || security.acceptedPlainConversations.has(conversation.id)) {
    return true;
  }
  return !conversation.members.some(
    (m) => m.userId !== security.scope.serverUserId && security.pinnedUserIds.has(m.userId),
  );
}
