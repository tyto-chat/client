import {
  CommitConflictError,
  ConversationNotReadyError,
  PeerIdentityChangedError,
} from "./conversationSession";
import { EnvelopeTooLargeError, PlaintextTooLongError } from "./envelope";

export type E2eeErrorKey =
  "e2ee_too_long" | "e2ee_identity_changed" | "e2ee_setting_up" | "e2ee_send_failed";

export function e2eeErrorKey(error: unknown): E2eeErrorKey {
  if (error instanceof PlaintextTooLongError || error instanceof EnvelopeTooLargeError) {
    return "e2ee_too_long";
  }
  if (error instanceof PeerIdentityChangedError) return "e2ee_identity_changed";
  if (error instanceof ConversationNotReadyError || error instanceof CommitConflictError) {
    return "e2ee_setting_up";
  }
  return "e2ee_send_failed";
}
