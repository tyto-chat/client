import type { PresenceState } from "@/types/api";
import type { VoiceMode } from "@/utils/voiceSettings";
import type { SoundName } from "@/sounds/soundSet";

export type SoundDecision = "play" | "quiet" | "silent";

export type CallSoundEvent =
  "self-join" | "self-leave" | "peer-join" | "peer-leave" | "mute" | "unmute";

export const NOTIFICATION_MIN_GAP_MS = 2000;

const CALL_EVENT_SOUND: Record<CallSoundEvent, SoundName> = {
  "self-join": "join",
  "peer-join": "join",
  "self-leave": "leave",
  "peer-leave": "leave",
  mute: "mute",
  unmute: "unmute",
};

export function soundForCallEvent(event: CallSoundEvent): SoundName {
  return CALL_EVENT_SOUND[event];
}

export function decideCallSound(
  event: CallSoundEvent,
  situation: { enabled: boolean; voiceMode: VoiceMode },
): SoundDecision {
  if (!situation.enabled) {
    return "silent";
  }
  if (situation.voiceMode === "ptt" && (event === "mute" || event === "unmute")) {
    return "silent";
  }
  if (event === "peer-join" || event === "peer-leave") {
    return "quiet";
  }
  return "play";
}

export interface NotificationSituation {
  enabled: boolean;
  presence: PresenceState;
  snoozed: boolean;
  msSinceLastSound: number | null;
  onScreen: boolean;
  windowFocused: boolean;
  inCall: boolean;
}

export function decideNotificationSound(situation: NotificationSituation): SoundDecision {
  if (!situation.enabled) {
    return "silent";
  }
  if (situation.presence === "dnd") {
    return "silent";
  }
  if (situation.snoozed) {
    return "silent";
  }
  if (situation.msSinceLastSound !== null && situation.msSinceLastSound < NOTIFICATION_MIN_GAP_MS) {
    return "silent";
  }
  if (situation.onScreen && situation.windowFocused) {
    return "silent";
  }
  if (situation.inCall) {
    return "quiet";
  }
  return "play";
}

export interface NotificationTarget {
  sameServer: boolean;
  conversationIdentifier?: string | null;
  communityIdentifier?: string | null;
  channelIdentifier?: string | null;
}

export function isNotificationOnScreen(target: NotificationTarget, pathname: string): boolean {
  if (!target.sameServer) {
    return false;
  }
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const first = segments[0];
  const second = segments[1];
  if (segments.length !== 2 || first === undefined || second === undefined) {
    return false;
  }
  if (first === "dm") {
    return target.conversationIdentifier === second;
  }
  return (
    target.communityIdentifier === first &&
    !!target.channelIdentifier &&
    target.channelIdentifier === second
  );
}
