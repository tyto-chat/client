import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { beginAuthRestore, finishAuthRestore, setAccessToken } from "@/api/tokenStore";
import { getPlatformBridge } from "@/platform/bridge";
import { setActiveIdentityKey } from "@/platform/activeIdentity";
import type { PlatformBridge } from "@/platform/PlatformBridge";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { AppSkeleton } from "@/components/ui/Skeleton";
import { ErrorBanner } from "@/components/authUi";
import { NotificationProvider } from "@/context/NotificationContext";
import { AddIdentityWizard, type AddIdentityResult } from "./AddIdentityWizard";
import { connectGuest, connectIdentity, installRefreshExecutor } from "./connectIdentity";
import {
  getServerOrder,
  identityKind,
  loadDesktopConfig,
  saveDesktopConfig,
  secretKey,
  setLastActiveIdentity,
  type DesktopConfig,
  type DesktopIdentity,
} from "./desktopConfig";
import { persistWizardResult } from "./identitySetup";
import { setServerOrderSnapshot } from "./serverOrderStore";
import { BridgeVersionError } from "@/platform/PlatformBridge";
import { getBootTiming, waitForRetry } from "./bootConnect";

type BootState =
  | { kind: "loading"; waiting?: boolean }
  | { kind: "first-run" }
  | { kind: "relogin"; identity: DesktopIdentity }
  | { kind: "unreachable"; identity: DesktopIdentity; error: unknown }
  | { kind: "incompatible"; identity: DesktopIdentity; direction: string }
  | { kind: "boot-error"; error: unknown }
  | { kind: "ready" };

function FullScreenWizard({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <div
        className="flex h-app w-screen items-center justify-center bg-canvas p-6"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 90% 70% at 50% -10%, color-mix(in srgb, var(--accent) 7%, transparent), transparent)",
        }}
      >
        <div className="w-full max-w-[380px] rounded-lg bg-overlay p-7 text-fg shadow-soft-lg ring-1 ring-inset ring-line">
          {children}
        </div>
      </div>
    </NotificationProvider>
  );
}

export interface DesktopSession {
  profileId: string;
  identityId: string;
  identities: DesktopIdentity[];
}

export function DesktopBootstrap({
  children,
  onSession,
}: {
  children: ReactNode;
  onSession?: (session: DesktopSession) => void;
}) {
  const { t } = useTranslation("desktop");
  const bridgeRef = useRef<PlatformBridge | null>(null);
  const configRef = useRef<DesktopConfig | null>(null);
  const profileIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const runRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<BootState>({ kind: "loading" });
  const [bootGeneration, setBootGeneration] = useState(0);

  async function finishConnected(
    profileId: string,
    identityId: string,
    token: string | null,
    rememberAsLastActive = true,
  ) {
    const bridge = bridgeRef.current!;
    const current = configRef.current;
    let identities: DesktopIdentity[] = [];
    if (current) {
      const next = rememberAsLastActive
        ? setLastActiveIdentity(current, profileId, identityId)
        : current;
      configRef.current = next;
      if (next !== current) await saveDesktopConfig(bridge, next);
      const profile = next.profiles.find((p) => p.id === profileId);
      identities = profile?.identities ?? [];
      setServerOrderSnapshot(profile ? getServerOrder(profile) : []);
    }
    if (token !== null) {
      setAccessToken(token);
      localStorage.setItem(STORAGE_KEYS.HAD_SESSION, "1");
    }
    setActiveIdentityKey(identityId);
    finishAuthRestore();
    onSession?.({ profileId, identityId, identities });
    setState({ kind: "ready" });
  }

  async function attempt(
    profileId: string,
    identity: DesktopIdentity,
    asGuest = false,
  ): Promise<"connected" | "handled" | "unreachable"> {
    const bridge = bridgeRef.current!;
    if (asGuest || identityKind(identity) === "guest") {
      const guestOutcome = await connectGuest(identity);
      if (guestOutcome.status === "connected") {
        await finishConnected(profileId, identity.id, null);
        return "connected";
      }
      if (guestOutcome.status === "version-mismatch") {
        setState({ kind: "incompatible", identity, direction: guestOutcome.direction });
        return "handled";
      }
      return "unreachable";
    }
    const outcome = await connectIdentity(bridge, profileId, identity);
    if (outcome.status === "connected") {
      await finishConnected(profileId, identity.id, outcome.token);
      return "connected";
    }
    if (outcome.status === "needs-login") {
      setState({ kind: "relogin", identity });
      return "handled";
    }
    if (outcome.status === "version-mismatch") {
      setState({ kind: "incompatible", identity, direction: outcome.direction });
      return "handled";
    }
    return "unreachable";
  }

  async function attemptFallback(profileId: string, identity: DesktopIdentity): Promise<boolean> {
    const bridge = bridgeRef.current!;
    if (identityKind(identity) === "guest") {
      const guestOutcome = await connectGuest(identity);
      if (guestOutcome.status !== "connected") return false;
      await finishConnected(profileId, identity.id, null, false);
      return true;
    }
    const outcome = await connectIdentity(bridge, profileId, identity);
    if (outcome.status !== "connected") return false;
    await finishConnected(profileId, identity.id, outcome.token, false);
    return true;
  }

  function fallbackCandidates(profileId: string, identity: DesktopIdentity): DesktopIdentity[] {
    const profile = configRef.current?.profiles.find((p) => p.id === profileId);
    if (!profile) return [];
    const order = getServerOrder(profile);
    const rank = (i: DesktopIdentity) => {
      const index = order.indexOf(i.id);
      return index === -1 ? order.length : index;
    };
    return profile.identities.filter((i) => i.id !== identity.id).sort((a, b) => rank(a) - rank(b));
  }

  async function bootConnect(profileId: string, identity: DesktopIdentity, asGuest = false) {
    runRef.current?.abort();
    const run = new AbortController();
    runRef.current = run;
    const { signal } = run;
    const timing = getBootTiming();

    if ((await attempt(profileId, identity, asGuest)) !== "unreachable" || signal.aborted) return;

    setState({ kind: "loading", waiting: true });
    for (const delay of timing.retryDelaysMs) {
      await waitForRetry(delay, signal);
      if (signal.aborted) return;
      if ((await attempt(profileId, identity, asGuest)) !== "unreachable" || signal.aborted) return;
    }

    for (const other of fallbackCandidates(profileId, identity)) {
      if (await attemptFallback(profileId, other)) return;
      if (signal.aborted) return;
    }

    setState({ kind: "unreachable", identity, error: null });
    while (!signal.aborted) {
      await waitForRetry(timing.unreachableRetryMs, signal);
      if (signal.aborted) return;
      if ((await attempt(profileId, identity, asGuest)) !== "unreachable" || signal.aborted) return;
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        beginAuthRestore();
        const bridge = getPlatformBridge();
        bridgeRef.current = bridge;
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

        await bootConnect(profile.id, identity);
      } catch (error) {
        setState({ kind: "boot-error", error });
      }
    })();
    return () => runRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootGeneration]);

  async function handleWizardComplete(result: AddIdentityResult) {
    const bridge = bridgeRef.current!;
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
    if (result.guest) {
      await finishConnected(profileId, identityId, null);
      return;
    }
    installRefreshExecutor(bridge, secretKey(profileId, identityId, "refreshToken"));
    await finishConnected(profileId, identityId, result.token);
  }

  if (state.kind === "ready") return <>{children}</>;

  if (state.kind === "loading") {
    return (
      <>
        <AppSkeleton />
        {state.waiting && (
          <div className="fixed inset-x-0 bottom-6 z-10 flex justify-center">
            <div
              className="rounded-full bg-overlay px-4 py-2 text-[13px] text-fg-muted shadow-soft-sm ring-1 ring-inset ring-line"
              data-testid="desktop-boot-waiting"
            >
              {t("waiting_for_network")}
            </div>
          </div>
        )}
      </>
    );
  }

  if (state.kind === "boot-error" && state.error instanceof BridgeVersionError) {
    return (
      <FullScreenWizard>
        <div className="space-y-4" data-testid="desktop-bridge-outdated">
          <h3 className="text-center text-[19px] font-semibold tracking-tight text-fg">
            {t("bridge_outdated_title")}
          </h3>
          <ErrorBanner message={t("bridge_outdated_body")} />
        </div>
      </FullScreenWizard>
    );
  }

  if (state.kind === "boot-error") {
    const bootError = state;
    return (
      <FullScreenWizard>
        <div className="space-y-4">
          <h3 className="text-center text-[19px] font-semibold tracking-tight text-fg">
            {t("boot_error_title")}
          </h3>
          <ErrorBanner message={String(bootError.error)} />
          <button
            type="button"
            onClick={() => {
              startedRef.current = false;
              setState({ kind: "loading" });
              setBootGeneration((n) => n + 1);
            }}
            className="w-full rounded-md bg-accent-gradient py-2.5 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
            data-testid="desktop-boot-retry"
          >
            {t("retry")}
          </button>
        </div>
      </FullScreenWizard>
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
    const relogin = state;
    return (
      <FullScreenWizard>
        <AddIdentityWizard
          onComplete={(r) => void handleWizardComplete(r)}
          initialServerUrl={relogin.identity.serverUrl}
          initialEmail={relogin.identity.email}
          initialDisplayName={relogin.identity.displayName}
          initialAvatarDataUrl={relogin.identity.avatarDataUrl}
          initialAvatarColorKey={relogin.identity.avatarColorKey}
          lockServer
        />
        <button
          type="button"
          onClick={() => {
            setState({ kind: "loading" });
            void bootConnect(profileIdRef.current ?? "", relogin.identity, true);
          }}
          className="mt-3 w-full py-1.5 text-center text-[13px] font-medium text-fg-muted underline decoration-fg-muted/45 underline-offset-[3px] transition hover:text-fg"
          data-testid="desktop-continue-as-guest"
        >
          {t("continue_as_guest")}
        </button>
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
              void bootConnect(profileIdRef.current ?? "", incompatible.identity);
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
        <p className="text-center text-[13px] text-fg-muted" data-testid="desktop-auto-retry">
          {t("retrying_automatically")}
        </p>
        <button
          type="button"
          onClick={() => {
            setState({ kind: "loading" });
            void bootConnect(profileIdRef.current ?? "", unreachable.identity);
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
