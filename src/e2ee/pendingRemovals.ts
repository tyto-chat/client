import type { Conversation } from "@/types/api";
import type { E2eeIdentity } from "./conversationSession";

export function processPendingRemovals(
  identity: E2eeIdentity,
  conversation: Conversation,
): Promise<number> {
  return identity.session(conversation).completeLeaveRequests();
}
