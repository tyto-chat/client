import { isNotificationSnoozed } from "@/desktop/nativeShell";
import { getSoundAmbient } from "@/sounds/soundAmbient";
import { getSoundPlayer } from "@/sounds/soundPlayer";
import {
  decideCallSound,
  decideNotificationSound,
  isNotificationOnScreen,
  soundForCallEvent,
  type CallSoundEvent,
  type NotificationTarget,
} from "@/sounds/soundRules";
import { QUIET_SCALE, type SoundName } from "@/sounds/soundSet";
import { getSoundSettings } from "@/sounds/soundSettings";
import { getPreferredDevice } from "@/utils/deviceSettings";

let lastNotificationSoundAt: number | null = null;

function scaleFor(decision: "play" | "quiet"): number {
  return decision === "quiet" ? QUIET_SCALE : 1;
}

function playSound(name: SoundName, volume: number, scale: number): void {
  const player = getSoundPlayer();
  player.setOutputDevice(getPreferredDevice("audiooutput"));
  player.play(name, { volume, scale });
}

export function playCallSound(event: CallSoundEvent): void {
  const settings = getSoundSettings();
  const ambient = getSoundAmbient();
  const decision = decideCallSound(event, {
    enabled: settings.callSounds,
    voiceMode: ambient.voiceMode,
  });
  if (decision === "silent") {
    return;
  }
  playSound(soundForCallEvent(event), settings.volume / 100, scaleFor(decision));
}

export function playNotificationSound(target: NotificationTarget): void {
  const settings = getSoundSettings();
  const ambient = getSoundAmbient();
  const now = Date.now();
  const decision = decideNotificationSound({
    enabled: settings.notificationSounds,
    presence: ambient.presence,
    snoozed: isNotificationSnoozed(now),
    msSinceLastSound: lastNotificationSoundAt === null ? null : now - lastNotificationSoundAt,
    onScreen: isNotificationOnScreen(target, window.location.pathname),
    windowFocused: document.hasFocus(),
    inCall: ambient.inCall,
  });
  if (decision === "silent") {
    return;
  }
  lastNotificationSoundAt = now;
  playSound("notification", settings.volume / 100, scaleFor(decision));
}

export function playTestSound(name: SoundName): void {
  playSound(name, getSoundSettings().volume / 100, 1);
}

export function resetSoundsForTests(): void {
  lastNotificationSoundAt = null;
}
