import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import {
  useNavigate,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import {
  ConnectionsContext,
  useConnectionsSnapshot,
} from "@/desktop/connections/ConnectionsContext";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { useNotification } from "@/context/NotificationContext";
import { getPlatformBridge } from "@/platform/bridge";
import { continueAfterRemovingActive, removeServerById } from "@/desktop/identityLifecycle";
import { hostFromOrigin } from "@/utils/serverDisplay";
import { ApiError, isNetworkError, probeServer } from "@/api/client";
import { reloadCurrentLocation } from "@/utils/reloadCurrentLocation";
import { ErrorBanner } from "./authUi";

function isNetworkFailure(error: unknown): boolean {
  return isNetworkError(error) || (error instanceof ApiError && error.status >= 500);
}

function OtherServers() {
  const { t } = useTranslation("common");
  const connections = useContext(ConnectionsContext);
  const snapshot = useConnectionsSnapshot();
  const others = snapshot.connections.filter((c) => c.identityId !== snapshot.activeIdentityId);
  if (!connections || others.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-line pt-4" data-testid="recovery-other-servers">
      <p className="text-center text-[13px] text-fg-muted">{t("recovery_switch_server")}</p>
      {others.map((c) => (
        <button
          key={c.identityId}
          type="button"
          onClick={() => void connections.switchTo(c.identityId)}
          className="w-full truncate rounded-md bg-surface px-3 py-2 text-sm font-medium text-fg ring-1 ring-inset ring-line transition hover:bg-raised"
          data-testid="recovery-switch-server"
        >
          {c.serverName ?? hostFromOrigin(c.origin)}
        </button>
      ))}
    </div>
  );
}

function RemoveActiveServer() {
  const { t } = useTranslation("desktop");
  const connections = useContext(ConnectionsContext);
  const snapshot = useConnectionsSnapshot();
  const { confirm, confirmDialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const active = snapshot.connections.find((c) => c.identityId === snapshot.activeIdentityId);
  if (!connections || !active) return null;

  const remove = async () => {
    const ok = await confirm({
      title: t("remove_identity"),
      message: t("remove_identity_confirm", {
        server: active.serverName ?? hostFromOrigin(active.origin),
      }),
      confirmLabel: t("remove_identity"),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (await removeServerById(getPlatformBridge(), connections.registry, active.identityId)) {
        continueAfterRemovingActive(connections.registry, connections.switchTo);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className="w-full rounded-md py-2 text-sm font-medium text-danger ring-1 ring-inset ring-line transition hover:bg-raised disabled:opacity-60"
        data-testid="recovery-remove-server"
      >
        {t("remove_identity")}
      </button>
      {confirmDialog}
    </>
  );
}

let mountedCards = 0;
let reloadInFlight = false;
let reloadFailureReported = false;

interface RecoveryCardProps {
  error: unknown;
  onReachable: () => Promise<unknown>;
  onGoHome?: () => void;
}

export function RecoveryCard({ error, onReachable, onGoHome }: RecoveryCardProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const inDesktop = useContext(ConnectionsContext) !== null;
  const { notify } = useNotification();
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<unknown>(null);
  const shownError = probeError ?? error;
  const detail = shownError instanceof Error ? shownError.message : String(shownError);
  const notifyFailure = useCallback(() => notify(t("recovery_retry_failed"), "error"), [notify, t]);

  useEffect(() => {
    mountedCards += 1;
    if (reloadInFlight && !reloadFailureReported) {
      reloadFailureReported = true;
      notifyFailure();
    }
    return () => {
      mountedCards -= 1;
    };
  }, [notifyFailure]);

  const retry = async () => {
    setProbing(true);
    try {
      await probeServer();
    } catch (err) {
      setProbeError(err);
      setProbing(false);
      notifyFailure();
      return;
    }
    reloadInFlight = true;
    reloadFailureReported = false;
    try {
      await onReachable();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      reloadInFlight = false;
      setProbing(false);
    }
    if (mountedCards > 0 && !reloadFailureReported) notifyFailure();
  };

  return (
    <div className="w-full max-w-[380px] space-y-4 rounded-lg bg-overlay p-7 text-fg shadow-soft-lg ring-1 ring-inset ring-line">
      <h3 className="text-center text-[19px] font-semibold tracking-tight text-fg">
        {t("recovery_title")}
      </h3>
      <ErrorBanner
        message={t(isNetworkFailure(shownError) ? "recovery_network" : "recovery_generic")}
      />
      <button
        type="button"
        onClick={() => void retry()}
        disabled={probing}
        className="w-full rounded-md bg-accent-gradient py-2.5 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-60"
        data-testid="recovery-retry"
      >
        {t("recovery_retry")}
      </button>
      {onGoHome && (
        <button
          type="button"
          onClick={onGoHome}
          className="w-full rounded-md bg-surface py-2 text-sm font-medium text-fg ring-1 ring-inset ring-line transition hover:bg-raised"
          data-testid="recovery-home"
        >
          {t("recovery_go_home")}
        </button>
      )}
      {inDesktop && <OtherServers />}
      {inDesktop && <RemoveActiveServer />}
      {token && (
        <button
          type="button"
          onClick={() => {
            void logout().then(() => navigate({ to: "/" }));
          }}
          className="w-full py-1.5 text-center text-[13px] font-medium text-fg-muted underline decoration-fg-muted/45 underline-offset-[3px] transition hover:text-fg"
          data-testid="recovery-sign-out"
        >
          {t("recovery_sign_out")}
        </button>
      )}
      <details className="text-xs text-fg-subtle">
        <summary className="cursor-pointer select-none">{t("recovery_details")}</summary>
        <p className="mt-2 break-words font-mono" data-testid="recovery-detail">
          {detail}
        </p>
      </details>
    </div>
  );
}

export function RouteRecoveryScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryErrorReset = useQueryErrorResetBoundary();

  useEffect(() => {
    queryErrorReset.reset();
  }, [queryErrorReset]);

  return (
    <div
      className="flex min-h-app w-full flex-1 items-center justify-center bg-canvas p-6"
      data-testid="route-recovery"
    >
      <RecoveryCard
        error={error}
        onReachable={() => reloadCurrentLocation(router)}
        onGoHome={
          pathname === "/"
            ? undefined
            : () => {
                reset();
                void navigate({ to: "/" });
              }
        }
      />
    </div>
  );
}
