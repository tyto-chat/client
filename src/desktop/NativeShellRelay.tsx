import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { setManualPresence } from "@/api/presence";
import { useAudioCall } from "@/context/AudioCallContext";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getPlatformBridge } from "@/platform/bridge";
import type { BridgeBadgeState, PlatformBridge, TrayCommand } from "@/platform/PlatformBridge";
import { ConnectionsContext } from "./connections/ConnectionsContext";
import type { RegistrySnapshot } from "./connections/ConnectionRegistry";
import { AddServerModal } from "./DesktopRail";
import {
  computeBadgeState,
  resolveDeepLink,
  setNotificationSnooze,
  takeNotificationClick,
} from "./nativeShell";

const BADGE_DEBOUNCE_MS = 150;

function resolveShellBridge(): PlatformBridge | null {
  if (!isManagedIdentityMode()) return null;
  try {
    const bridge = getPlatformBridge();
    return bridge.app || bridge.appState ? bridge : null;
  } catch {
    return null;
  }
}

function sameBadge(a: BridgeBadgeState | null, b: BridgeBadgeState): boolean {
  return (
    a !== null &&
    a.unreadCount === b.unreadCount &&
    a.callState === b.callState &&
    a.callLabel === b.callLabel
  );
}

export function NativeShellRelay() {
  const connections = useContext(ConnectionsContext);
  const { activeCall, isMuted, toggleMute, leave } = useAudioCall();
  const [bridge] = useState(resolveShellBridge);
  const [addServerUrl, setAddServerUrl] = useState<string | null>(null);

  const subscribe = useCallback(
    (listener: () => void) =>
      connections ? connections.registry.subscribe(listener) : () => undefined,
    [connections],
  );
  const getSnapshot = useCallback(
    (): RegistrySnapshot | null => connections?.registry.getSnapshot() ?? null,
    [connections],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  const channelName = activeCall?.channel.name ?? null;
  const identityKey = activeCall?.identityKey ?? null;
  const badge = useMemo(
    () =>
      computeBadgeState(
        snapshot,
        channelName === null ? null : { channelName, identityKey, muted: isMuted },
      ),
    [snapshot, channelName, identityKey, isMuted],
  );

  const lastBadgeRef = useRef<BridgeBadgeState | null>(null);
  useEffect(() => {
    const appState = bridge?.appState;
    if (!appState || sameBadge(lastBadgeRef.current, badge)) return undefined;
    const timer = setTimeout(() => {
      lastBadgeRef.current = badge;
      appState.setBadge(badge);
    }, BADGE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [bridge, badge]);

  const callActionsRef = useRef({ toggleMute, leave });
  useEffect(() => {
    callActionsRef.current = { toggleMute, leave };
  }, [toggleMute, leave]);

  useEffect(() => {
    const app = bridge?.app;
    if (!app) return undefined;

    return app.onTrayCommand((command: TrayCommand | null) => {
      switch (command?.type) {
        case "toggle-mute":
          callActionsRef.current.toggleMute();
          return;
        case "leave-call":
          callActionsRef.current.leave();
          return;
        case "snooze":
          setNotificationSnooze(command.minutes, Date.now());
          return;
        case "presence":
          void setManualPresence(command.value === "online" ? null : command.value).catch(
            () => undefined,
          );
          return;
      }
    });
  }, [bridge]);

  const connectionsRef = useRef(connections);
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  useEffect(() => {
    const app = bridge?.app;
    if (!app) return undefined;

    return app.onDeepLink((envelope) => {
      const current = connectionsRef.current;
      const resolution = resolveDeepLink(envelope, current?.registry.getSnapshot() ?? null);
      switch (resolution?.kind) {
        case "notification":
          takeNotificationClick(resolution.payload)?.();
          return;
        case "switch":
          void current
            ?.switchTo(resolution.identityId, resolution.navigateTo)
            .catch(() => undefined);
          return;
        case "add-server":
          setAddServerUrl(resolution.serverUrl);
          return;
      }
    });
  }, [bridge]);

  if (!connections || addServerUrl === null) return null;

  return (
    <AddServerModal
      registry={connections.registry}
      switchTo={connections.switchTo}
      initialServerUrl={addServerUrl}
      onClose={() => setAddServerUrl(null)}
    />
  );
}
