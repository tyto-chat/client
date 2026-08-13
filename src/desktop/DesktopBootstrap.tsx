/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { beginAuthRestore, finishAuthRestore, setAccessToken } from "@/api/tokenStore";
import { getPlatformBridge } from "@/platform/bridge";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { Spinner } from "@/components/icons";
import { AddIdentityWizard, ErrorBanner, type AddIdentityResult } from "./AddIdentityWizard";
import { connectIdentity, installRefreshExecutor } from "./connectIdentity";
import {
  addIdentity,
  loadDesktopConfig,
  normalizeServerUrl,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
  type DesktopConfig,
  type DesktopIdentity,
} from "./desktopConfig";

type BootState =
  | { kind: "loading" }
  | { kind: "first-run" }
  | { kind: "relogin"; identity: DesktopIdentity }
  | { kind: "unreachable"; identity: DesktopIdentity; error: unknown }
  | { kind: "incompatible"; identity: DesktopIdentity; direction: string }
  | { kind: "ready" };

export async function persistWizardResult(
  bridge: PlatformBridge,
  config: DesktopConfig,
  profileId: string,
  result: AddIdentityResult,
): Promise<DesktopConfig> {
  const origin = normalizeServerUrl(result.serverUrl);
  const profile = config.profiles.find((p) => p.id === profileId);
  const existing = profile?.identities.find((i) => i.serverUrl === origin);

  let next = config;
  let identityId: string;
  if (existing) {
    identityId = existing.id;
    next = {
      ...next,
      profiles: next.profiles.map((p) =>
        p.id === profileId
          ? {
              ...p,
              identities: p.identities.map((i) =>
                i.id === identityId ? { ...i, email: result.email } : i,
              ),
            }
          : p,
      ),
    };
  } else {
    identityId = crypto.randomUUID();
    next = addIdentity(next, profileId, {
      id: identityId,
      serverUrl: origin,
      email: result.email,
      userId: null,
      displayName: null,
    });
  }
  next = setLastActiveIdentity(next, profileId, identityId);
  await saveDesktopConfig(bridge, next);

  await bridge.secrets.set(secretKey(profileId, identityId, "password"), result.password);
  const refreshKey = secretKey(profileId, identityId, "refreshToken");
  if (result.refreshToken) {
    await bridge.secrets.set(refreshKey, result.refreshToken);
  }
  installRefreshExecutor(bridge, refreshKey);

  return next;
}

function FullScreenWizard({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-canvas p-6"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 90% 70% at 50% -10%, color-mix(in srgb, var(--accent) 7%, transparent), transparent)",
      }}
    >
      <div className="w-full max-w-[380px] rounded-lg bg-overlay p-7 text-fg shadow-soft-lg ring-1 ring-inset ring-line">
        {children}
      </div>
    </div>
  );
}

export function DesktopBootstrap({ children }: { children: ReactNode }) {
  const { t } = useTranslation("desktop");
  const bridgeRef = useRef<PlatformBridge>(getPlatformBridge());
  const configRef = useRef<DesktopConfig | null>(null);
  const profileIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const [state, setState] = useState<BootState>({ kind: "loading" });

  async function finishConnected(profileId: string, identityId: string, token: string) {
    const bridge = bridgeRef.current;
    const current = configRef.current;
    if (current) {
      const next = setLastActiveIdentity(current, profileId, identityId);
      configRef.current = next;
      await saveDesktopConfig(bridge, next);
    }
    setAccessToken(token);
    localStorage.setItem(STORAGE_KEYS.HAD_SESSION, "1");
    finishAuthRestore();
    setState({ kind: "ready" });
  }

  async function tryConnect(profileId: string, identity: DesktopIdentity) {
    const bridge = bridgeRef.current;
    const outcome = await connectIdentity(bridge, profileId, identity);
    if (outcome.status === "connected") {
      await finishConnected(profileId, identity.id, outcome.token);
    } else if (outcome.status === "needs-login") {
      setState({ kind: "relogin", identity });
    } else if (outcome.status === "version-mismatch") {
      setState({ kind: "incompatible", identity, direction: outcome.direction });
    } else {
      setState({ kind: "unreachable", identity, error: outcome.error });
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    beginAuthRestore();

    void (async () => {
      const bridge = bridgeRef.current;
      const config = await loadDesktopConfig(bridge);
      configRef.current = config;

      const profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
      profileIdRef.current = profileId;
      const profile = profileId ? config.profiles.find((p) => p.id === profileId) : undefined;

      if (!profile || profile.identities.length === 0) {
        setState({ kind: "first-run" });
        return;
      }

      const identity =
        profile.identities.find((i) => i.id === profile.lastActiveIdentityId) ??
        profile.identities[0]!;

      await tryConnect(profile.id, identity);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleWizardComplete(result: AddIdentityResult) {
    const bridge = bridgeRef.current;
    let profileId = profileIdRef.current;
    let config = configRef.current;
    if (!config) {
      config = await loadDesktopConfig(bridge);
      configRef.current = config;
    }
    if (!profileId) {
      profileId = config.lastActiveProfileId ?? config.profiles[0]?.id ?? null;
      profileIdRef.current = profileId;
    }
    if (!profileId) return;

    const nextConfig = await persistWizardResult(bridge, config, profileId, result);
    configRef.current = nextConfig;
    const profile = nextConfig.profiles.find((p) => p.id === profileId)!;
    const identityId = profile.lastActiveIdentityId!;
    await finishConnected(profileId, identityId, result.token);
  }

  if (state.kind === "ready") return <>{children}</>;

  if (state.kind === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas">
        <Spinner size={28} />
      </div>
    );
  }

  if (state.kind === "first-run") {
    return (
      <FullScreenWizard>
        <AddIdentityWizard onComplete={(r) => void handleWizardComplete(r)} />
      </FullScreenWizard>
    );
  }

  if (state.kind === "relogin") {
    return (
      <FullScreenWizard>
        <AddIdentityWizard
          onComplete={(r) => void handleWizardComplete(r)}
          initialServerUrl={state.identity.serverUrl}
          initialEmail={state.identity.email}
          lockServer
        />
      </FullScreenWizard>
    );
  }

  if (state.kind === "incompatible") {
    const incompatible = state;
    return (
      <FullScreenWizard>
        <div className="space-y-4">
          <h3 className="text-center text-[19px] font-semibold tracking-tight text-fg">
            {t("server_incompatible_title")}
          </h3>
          <ErrorBanner message={t("server_incompatible")} />
          <button
            type="button"
            onClick={() => {
              setState({ kind: "loading" });
              void tryConnect(profileIdRef.current ?? "", incompatible.identity);
            }}
            className="w-full rounded-md bg-accent-gradient py-2.5 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
            data-testid="desktop-retry"
          >
            {t("retry")}
          </button>
        </div>
      </FullScreenWizard>
    );
  }

  const unreachable = state;
  return (
    <FullScreenWizard>
      <div className="space-y-4">
        <h3 className="text-center text-[19px] font-semibold tracking-tight text-fg">
          {t("server_unreachable_title")}
        </h3>
        <ErrorBanner message={t("server_unreachable")} />
        <p
          className="truncate text-center font-mono text-xs text-fg-subtle"
          data-testid="desktop-unreachable-server"
        >
          {unreachable.identity.serverUrl}
        </p>
        <button
          type="button"
          onClick={() => {
            setState({ kind: "loading" });
            void tryConnect(profileIdRef.current ?? "", unreachable.identity);
          }}
          className="w-full rounded-md bg-accent-gradient py-2.5 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
          data-testid="desktop-retry"
        >
          {t("retry")}
        </button>
        <button
          type="button"
          onClick={() => setState({ kind: "first-run" })}
          className="w-full py-1.5 text-center text-[13px] font-medium text-fg-muted underline decoration-fg-muted/45 underline-offset-[3px] transition hover:text-fg"
          data-testid="desktop-add-different-server"
        >
          {t("add_different_server")}
        </button>
      </div>
    </FullScreenWizard>
  );
}
