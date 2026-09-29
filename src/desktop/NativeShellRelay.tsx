import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { setManualPresence } from "@/api/presence";
import { useConfirm } from "@/hooks/useConfirm";
import { useAudioCall } from "@/context/AudioCallContext";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getPlatformBridge } from "@/platform/bridge";
import type { BridgeBadgeState, PlatformBridge, TrayCommand } from "@/platform/PlatformBridge";
import { ConnectionsContext } from "./connections/ConnectionsContext";
import type { RegistrySnapshot } from "./connections/ConnectionRegistry";
import { AddServerModal } from "./DesktopRail";
import {
  badgeTooltip,
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
    a.callLabel === b.callLabel &&
    a.tooltip === b.tooltip
  );
}

export function NativeShellRelay() {
  const [bridge] = useState(resolveShellBridge);
  return bridge ? <ActiveRelay bridge={bridge} /> : null;
}

function ActiveRelay({ bridge }: { bridge: PlatformBridge }) {
  const connections = useContext(ConnectionsContext);
  const { activeCall, isMuted, toggleMute, leave } = useAudioCall();
  const { t } = useTranslation("desktop");
  const { confirm, confirmDialog } = useConfirm();
  const [addServerUrl, setAddServerUrl] = useState<string | null>(null);
  const askingRef = useRef(false);
  const addServerUrlRef = useRef<string | null>(null);
  useEffect(() => {
    addServerUrlRef.current = addServerUrl;
  }, [addServerUrl]);

  const offerServer = useCallback(
    async (serverUrl: string) => {
      if (askingRef.current || addServerUrlRef.current !== null) return;
      askingRef.current = true;
      try {
        const agreed = await confirm({
          title: t("link_add_server_title"),
          message: t("link_add_server_body", { host: new URL(serverUrl).host }),
          confirmLabel: t("link_add_server_confirm"),
        });
        if (agreed) setAddServerUrl(serverUrl);
      } finally {
        askingRef.current = false;
      }
    },
    [confirm, t],
  );
  const offerServerRef = useRef(offerServer);
  useEffect(() => {
    offerServerRef.current = offerServer;
  }, [offerServer]);

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
  const badge = useMemo(() => {
    const state = computeBadgeState(
      snapshot,
      channelName === null ? null : { channelName, identityKey, muted: isMuted },
    );
    const tooltip = badgeTooltip(state, t);
    return tooltip === undefined ? state : { ...state, tooltip };
  }, [snapshot, channelName, identityKey, isMuted, t]);

  const lastBadgeRef = useRef<BridgeBadgeState | null>(null);
  useEffect(() => {
    const appState = bridge.appState;
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
    const app = bridge.app;
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
    const app = bridge.app;
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
          void offerServerRef.current(resolution.serverUrl);
          return;
      }
    });
  }, [bridge]);

  return (
    <>
      {confirmDialog}
      {connections && addServerUrl !== null && (
        <AddServerModal
          registry={connections.registry}
          switchTo={connections.switchTo}
          initialServerUrl={addServerUrl}
          onClose={() => setAddServerUrl(null)}
        />
      )}
    </>
  );
}
