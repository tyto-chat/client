import { isNotificationSnoozed } from "@/desktop/nativeShell";
import { getSoundAmbient } from "@/sounds/soundAmbient";
import { getSoundPlayer } from "@/sounds/soundPlayer";
import {
  decideCallSound,
  decideNotificationSound,
  isMessageNotification,
  isNotificationOnScreen,
  NOTIFICATION_MIN_GAP_MS,
  soundForCallEvent,
  type CallSoundEvent,
  type NotificationTarget,
} from "@/sounds/soundRules";
import { QUIET_SCALE, type SoundName } from "@/sounds/soundSet";
import { getSoundSettings } from "@/sounds/soundSettings";
import { getPreferredDevice } from "@/utils/deviceSettings";

const LAST_NOTIFICATION_KEY = "tyto.sounds.lastNotificationAt";

let lastNotificationSoundAt: number | null = null;

function readSharedNotificationSoundAt(now: number): number | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LAST_NOTIFICATION_KEY);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value - now > NOTIFICATION_MIN_GAP_MS) {
    return null;
  }
  return value;
}

function writeSharedNotificationSoundAt(time: number): void {
  try {
    localStorage.setItem(LAST_NOTIFICATION_KEY, String(time));
  } catch {
    return;
  }
}

function latestNotificationSoundAt(now: number): number | null {
  const shared = readSharedNotificationSoundAt(now);
  if (shared === null) {
    return lastNotificationSoundAt;
  }
  if (lastNotificationSoundAt === null) {
    return shared;
  }
  return Math.max(shared, lastNotificationSoundAt);
}

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
  if (!isMessageNotification(target.notificationType)) {
    return;
  }
  const settings = getSoundSettings();
  const ambient = getSoundAmbient();
  const now = Date.now();
  const lastSoundAt = latestNotificationSoundAt(now);
  const decision = decideNotificationSound({
    enabled: settings.notificationSounds,
    presence: ambient.presence,
    snoozed: isNotificationSnoozed(now),
    msSinceLastSound: lastSoundAt === null ? null : now - lastSoundAt,
    onScreen: isNotificationOnScreen(target, window.location.pathname),
    windowFocused: document.hasFocus(),
    inCall: ambient.inCall,
  });
  if (decision === "silent") {
    return;
  }
  lastNotificationSoundAt = now;
  writeSharedNotificationSoundAt(now);
  playSound("notification", settings.volume / 100, scaleFor(decision));
}

export function playTestSound(name: SoundName): void {
  playSound(name, getSoundSettings().volume / 100, 1);
}

export function resetSoundsForTests(): void {
  lastNotificationSoundAt = null;
  try {
    localStorage.removeItem(LAST_NOTIFICATION_KEY);
  } catch {
    return;
  }
}
