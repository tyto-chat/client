import type { BridgeBadgeState, BridgeTrayLabels, PlatformBridge } from "@/platform/PlatformBridge";
import type { TFunction } from "i18next";
import { hostFromOrigin } from "@/utils/serverDisplay";
import type { RegistrySnapshot } from "./connections/ConnectionRegistry";
import type { SwitchTarget } from "./switchIdentity";

const MAX_PENDING_CLICKS = 200;
const MESSAGE_PATH = /^\/m\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

let snoozedUntil: number | null = null;
let clickSequence = 0;
let clickPrefix = crypto.randomUUID();
const pendingClicks = new Map<string, () => void>();

export function resetNativeShellForTests(): void {
  snoozedUntil = null;
  clickSequence = 0;
  clickPrefix = crypto.randomUUID();
  pendingClicks.clear();
}

export function setNotificationSnooze(minutes: number | null, now: number): void {
  if (minutes === null) {
    snoozedUntil = Number.POSITIVE_INFINITY;
    return;
  }
  snoozedUntil = minutes > 0 ? now + minutes * 60_000 : null;
}

export function isNotificationSnoozed(now: number): boolean {
  return snoozedUntil !== null && now < snoozedUntil;
}

export interface NativeNotificationOptions {
  body: string;
  tag?: string;
  onClick?: () => void;
}

export function showNativeNotification(
  bridge: PlatformBridge,
  title: string,
  options: NativeNotificationOptions,
  context: { focused: boolean; now: number },
): boolean {
  if (!bridge.notifications) return false;
  if (context.focused || isNotificationSnoozed(context.now)) return true;

  clickSequence += 1;
  const payload = `${clickPrefix}:${clickSequence}`;
  if (options.onClick) {
    pendingClicks.set(payload, options.onClick);
    if (pendingClicks.size > MAX_PENDING_CLICKS) {
      const oldest = pendingClicks.keys().next().value;
      if (oldest !== undefined) pendingClicks.delete(oldest);
    }
  }

  bridge.notifications.show({
    title,
    body: options.body,
    tag: options.tag ?? payload,
    payload,
  });
  return true;
}

export function takeNotificationClick(payload: string): (() => void) | null {
  const click = pendingClicks.get(payload);
  if (!click) return null;
  pendingClicks.delete(payload);
  return click;
}

export interface ActiveCallSummary {
  channelName: string;
  identityKey: string | null | undefined;
  muted: boolean;
}

export function computeBadgeState(
  snapshot: RegistrySnapshot | null,
  call: ActiveCallSummary | null,
): BridgeBadgeState {
  let unreadCount = 0;
  for (const connection of snapshot?.connections ?? []) {
    for (const count of Object.values(connection.unreadCounts)) {
      if (Number.isInteger(count) && count > 0) unreadCount += count;
    }
  }

  if (!call) return { unreadCount, callState: "none" };

  const server = snapshot?.connections.find((c) => c.identityId === call.identityKey);
  const place = server ? (server.serverName ?? hostFromOrigin(server.origin)) : null;
  return {
    unreadCount,
    callState: call.muted ? "in-call-muted" : "in-call",
    callLabel: place ? `#${call.channelName} @ ${place}` : `#${call.channelName}`,
  };
}

type Translate = TFunction<"desktop">;

export function buildTrayLabels(t: Translate): BridgeTrayLabels {
  return {
    open: t("tray_open"),
    mute: t("tray_mute"),
    unmute: t("tray_unmute"),
    leaveCall: t("tray_leave_call"),
    snooze: t("tray_snooze"),
    snooze30: t("tray_snooze_30"),
    snooze60: t("tray_snooze_60"),
    snoozeIndefinitely: t("tray_snooze_indefinitely"),
    snoozeOff: t("tray_snooze_off"),
    presence: t("tray_presence"),
    presenceOnline: t("tray_presence_online"),
    presenceAway: t("tray_presence_away"),
    presenceDnd: t("tray_presence_dnd"),
    presenceInvisible: t("tray_presence_invisible"),
    startOnBoot: t("tray_start_on_boot"),
    startMinimized: t("tray_start_minimized"),
    quit: t("tray_quit"),
  };
}

export function badgeTooltip(state: BridgeBadgeState, t: Translate): string | undefined {
  if (state.callState === "in-call-muted")
    return t("tray_in_call_muted", { place: state.callLabel });
  if (state.callState === "in-call") return t("tray_in_call", { place: state.callLabel });
  return state.unreadCount > 0 ? t("tray_unread", { count: state.unreadCount }) : undefined;
}

export type DeepLinkResolution =
  | {
      kind: "switch";
      identityId: string;
      navigateTo?: SwitchTarget["navigateTo"];
      alreadyAdded?: boolean;
    }
  | { kind: "add-server"; serverUrl: string }
  | { kind: "notification"; payload: string };

export function resolveDeepLink(
  envelope: string,
  snapshot: RegistrySnapshot | null,
): DeepLinkResolution | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { kind, url, payload } = parsed as Record<string, unknown>;

  if (kind === "notification") {
    return typeof payload === "string" ? { kind: "notification", payload } : null;
  }
  if (kind !== "url" || typeof url !== "string") return null;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.protocol !== "https:" || target.username !== "" || target.password !== "") {
    return null;
  }

  const onServer = (snapshot?.connections ?? []).filter((c) => c.origin === target.origin);
  const match =
    onServer.find((c) => c.identityId === snapshot?.activeIdentityId) ??
    onServer.find((c) => c.kind !== "guest") ??
    onServer[0];
  if (!match) return { kind: "add-server", serverUrl: target.origin };

  const messageId = MESSAGE_PATH.exec(target.pathname)?.[1];
  return messageId
    ? {
        kind: "switch",
        identityId: match.identityId,
        navigateTo: { to: "/m/$messageId", params: { messageId } },
      }
    : { kind: "switch", identityId: match.identityId, alreadyAdded: true };
}
