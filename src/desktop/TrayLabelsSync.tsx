import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isManagedIdentityMode } from "@/platform/appMode";
import { getPlatformBridge } from "@/platform/bridge";
import type { BridgeTrayLabels } from "@/platform/PlatformBridge";
import { buildTrayLabels } from "./nativeShell";

type SendLabels = (labels: BridgeTrayLabels) => void;

function resolveSender(): SendLabels | null {
  if (!isManagedIdentityMode()) return null;
  try {
    const appState = getPlatformBridge().appState;
    return appState?.setTrayLabels ? (labels) => appState.setTrayLabels?.(labels) : null;
  } catch {
    return null;
  }
}

export function TrayLabelsSync() {
  const [send] = useState(resolveSender);
  return send ? <ActiveSync send={send} /> : null;
}

function ActiveSync({ send }: { send: SendLabels }) {
  const { t, ready } = useTranslation("desktop", { useSuspense: false });

  useEffect(() => {
    if (ready) send(buildTrayLabels(t));
  }, [send, t, ready]);

  return null;
}
