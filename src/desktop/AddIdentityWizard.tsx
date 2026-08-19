import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { loginAt, verifyTwoFactorAt, LoginRequestError } from "@/api/auth";
import { isRateLimited, ApiError, configureApiClient } from "@/api/client";
import { getUserColor } from "@/utils/userColor";
import type { ServerInfo } from "@/types/api";
import {
  ErrorBanner,
  TotpCellsInput,
  ghostButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
} from "@/components/authUi";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { RegisterForm } from "@/components/RegisterForm";
import { LegalFooterLinks } from "@/components/LegalLinks";
import { normalizeServerUrl, InvalidServerUrlError } from "./desktopConfig";
import { resolveServer } from "./connectIdentity";
import { ServerTile } from "./ServerTile";

type Step = "server" | "credentials" | "totp" | "register";

interface ServerState {
  origin: string;
  serverInfo: ServerInfo;
}

export interface AddIdentityResult {
  serverUrl: string;
  email: string;
  password: string;
  token: string;
  refreshToken: string | null;
  serverInfo: ServerInfo;
}

interface Props {
  onComplete: (result: AddIdentityResult) => void;
  initialServerUrl?: string;
  initialEmail?: string;
  initialDisplayName?: string | null;
  initialAvatarDataUrl?: string | null;
  initialAvatarColorKey?: string | null;
  lockServer?: boolean;
}

async function resolveServerState(origin: string): Promise<ServerState> {
  const serverInfo = await resolveServer(origin);
  configureApiClient(serverInfo.apiUrl);
  return { origin, serverInfo };
}

class ServerResolutionFailedError extends Error {}

function BrandHeader({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation("desktop");
  return (
    <div className="flex items-center gap-2.5">
      <img src="/nebula-logo.svg" alt="" className="h-[34px] w-auto shrink-0" />
      <span className="text-[17px] font-bold tracking-tight text-fg">tyto.chat</span>
      <span className="ml-auto text-xs text-fg-subtle">
        {t("step_counter", { current: step, total: 2 })}
      </span>
    </div>
  );
}

function ServerChip({
  name,
  origin,
  onChange,
  isSubmitting,
}: {
  name: string;
  origin: string;
  onChange?: () => void;
  isSubmitting?: boolean;
}) {
  const { t } = useTranslation("desktop");
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-line bg-raised px-3 py-2.5">
      <ServerTile name={name} colorSeed={origin} testId="wizard-server-chip-initial" />
      <span className="min-w-0">
        <b className="block truncate text-[13.5px] font-semibold text-fg">{name}</b>
        <span
          className="block truncate font-mono text-xs text-fg-subtle"
          data-testid="wizard-server-origin"
        >
          {origin}
        </span>
      </span>
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          disabled={isSubmitting}
          className="ml-auto shrink-0 text-xs text-accent-text hover:underline disabled:opacity-50"
          data-testid="wizard-change-server"
        >
          {t("change_server_chip")}
        </button>
      )}
    </div>
  );
}

function IdentityBlock({
  email,
  origin,
  onEmailChange,
  displayName,
  avatarDataUrl,
  avatarColorKey,
}: {
  email: string;
  origin: string;
  onEmailChange: (value: string) => void;
  displayName?: string | null;
  avatarDataUrl?: string | null;
  avatarColorKey?: string | null;
}) {
  const { t } = useTranslation("desktop");
  const primary = displayName?.trim() || email;
  const hasName = primary !== email;
  return (
    <div className="flex items-center gap-3">
      {avatarDataUrl ? (
        <img
          src={avatarDataUrl}
          alt=""
          data-testid="wizard-identity-avatar"
          className="h-11 w-11 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          data-testid="wizard-identity-initial"
          style={{ backgroundColor: getUserColor(avatarColorKey ?? email) }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[17px] font-bold text-white"
        >
          {primary.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        {hasName ? (
          <>
            <b
              data-testid="wizard-identity-name"
              className="block truncate text-[14.5px] font-semibold text-fg"
            >
              {primary}
            </b>
            <input
              id="wizard-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              aria-label={t("email_label")}
              className="sr-only"
              data-testid="wizard-email-input"
            />
          </>
        ) : (
          <span className="relative block rounded-[4px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)]">
            <input
              id="wizard-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              aria-label={t("email_label")}
              className="absolute inset-0 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
              data-testid="wizard-email-input"
            />
            <b aria-hidden="true" className="block truncate text-[14.5px] font-semibold text-fg">
              {email}
            </b>
          </span>
        )}
        <span
          aria-hidden="true"
          className="block truncate font-mono text-xs text-fg-subtle"
          data-testid="wizard-server-origin"
        >
          {origin}
        </span>
      </span>
    </div>
  );
}

export function AddIdentityWizard({
  onComplete,
  initialServerUrl,
  initialEmail,
  initialDisplayName,
  initialAvatarDataUrl,
  initialAvatarColorKey,
  lockServer,
}: Props) {
  const { t } = useTranslation(["desktop", "auth"]);
  const startsOnCredentials = Boolean(lockServer && initialServerUrl);
  const [step, setStep] = useState<Step>(startsOnCredentials ? "credentials" : "server");
  const [serverUrlInput, setServerUrlInput] = useState(initialServerUrl ?? "");
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resolvingRef = useRef<Promise<ServerState> | null>(null);

  useEffect(() => {
    if (!startsOnCredentials || !initialServerUrl) return;
    const promise: Promise<ServerState> = resolveServerState(initialServerUrl)
      .then((state) => {
        if (resolvingRef.current === promise) setServerState(state);
        return state;
      })
      .catch(() => {
        if (resolvingRef.current === promise) {
          setError(t("server_unreachable"));
          setStep("server");
        }
        throw new ServerResolutionFailedError();
      });
    resolvingRef.current = promise;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requireServerState(): Promise<ServerState> {
    if (serverState) return serverState;
    if (resolvingRef.current) return resolvingRef.current;
    throw new Error("server not resolved");
  }

  function handleChangeServer() {
    resolvingRef.current?.catch(() => {});
    resolvingRef.current = null;
    setServerState(null);
    setError(null);
    setStep("server");
  }

  async function handleServerSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let origin: string;
    try {
      origin = normalizeServerUrl(serverUrlInput);
    } catch (err) {
      if (err instanceof InvalidServerUrlError) {
        setError(t("server_url_invalid"));
        return;
      }
      throw err;
    }
    setIsSubmitting(true);
    try {
      const state = await resolveServerState(origin);
      setServerState(state);
      setStep("credentials");
    } catch {
      setError(t("server_unreachable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const state = await requireServerState();
      const result = await loginAt(state.serverInfo.apiUrl, email, password);
      if (result.twoFactorRequired) {
        setPendingToken(result.token);
        setStep("totp");
        return;
      }
      onComplete({
        serverUrl: state.origin,
        email,
        password,
        token: result.token,
        refreshToken: result.refreshToken,
        serverInfo: state.serverInfo,
      });
    } catch (err) {
      if (err instanceof ServerResolutionFailedError) return;
      if (err instanceof LoginRequestError && err.kind === "unreachable") {
        setError(t("server_unreachable"));
      } else {
        setError(t("invalid_credentials"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegistered(regEmail: string, regPassword: string) {
    const state = await requireServerState();
    const result = await loginAt(state.serverInfo.apiUrl, regEmail, regPassword);
    onComplete({
      serverUrl: state.origin,
      email: regEmail,
      password: regPassword,
      token: result.token,
      refreshToken: result.refreshToken,
      serverInfo: state.serverInfo,
    });
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting || !pendingToken) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const state = await requireServerState();
      const { token, refreshToken } = await verifyTwoFactorAt(
        state.serverInfo.apiUrl,
        pendingToken,
        code,
      );
      onComplete({
        serverUrl: state.origin,
        email,
        password,
        token,
        refreshToken,
        serverInfo: state.serverInfo,
      });
    } catch (err) {
      if (err instanceof ServerResolutionFailedError) return;
      if (isRateLimited(err)) {
        setError(t("too_many_attempts"));
      } else if (
        err instanceof ApiError &&
        err.status === 401 &&
        err.body !== null &&
        typeof err.body === "object" &&
        "error" in err.body
      ) {
        setError(t("two_factor_invalid_code"));
      } else {
        setError(t("two_factor_expired"));
        setStep("credentials");
        setPendingToken(null);
        setCode("");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      {step === "server" && (
        <form onSubmit={handleServerSubmit} className="space-y-4">
          <BrandHeader step={1} />
          <div>
            <h3 className="mb-1 text-[19px] font-semibold tracking-tight text-fg">
              {t("add_identity_title")}
            </h3>
            <p className="text-[13.5px] text-fg-muted">{t("server_step_sub")}</p>
          </div>
          {error && <ErrorBanner message={error} />}
          <div>
            <label htmlFor="wizard-server-url" className={labelClass}>
              {t("server_url_label")}
            </label>
            <input
              id="wizard-server-url"
              type="text"
              required
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder={t("server_url_placeholder")}
              className={`${inputClass} font-mono`}
              data-testid="wizard-server-input"
            />
            {!error && (
              <p className="mt-1.5 text-[12.5px] text-fg-subtle">{t("server_url_hint")}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={primaryButtonClass}
            data-testid="wizard-server-submit"
          >
            {error ? t("try_again") : t("server_continue")}
          </button>
          {!error && (
            <p className="text-center text-[11.5px] text-fg-subtle">{t("server_footer")}</p>
          )}
        </form>
      )}

      {step === "credentials" && lockServer && (
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <div>
            <h3 className="mb-1 text-[19px] font-semibold tracking-tight text-fg">
              {t("welcome_back")}
            </h3>
            <p className="text-[13.5px] text-fg-muted">{t("welcome_back_sub")}</p>
          </div>
          <IdentityBlock
            email={email}
            origin={serverState?.origin ?? initialServerUrl ?? ""}
            onEmailChange={setEmail}
            displayName={initialDisplayName}
            avatarDataUrl={initialAvatarDataUrl}
            avatarColorKey={initialAvatarColorKey}
          />
          {error && <ErrorBanner message={error} />}
          <div>
            <label htmlFor="wizard-password" className={labelClass}>
              {t("password_label")}
            </label>
            <input
              id="wizard-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              data-testid="wizard-password-input"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={primaryButtonClass}
            data-testid="wizard-credentials-submit"
          >
            {t("sign_in")}
          </button>
          <button
            type="button"
            onClick={handleChangeServer}
            disabled={isSubmitting}
            className={ghostButtonClass}
            data-testid="wizard-change-server"
          >
            {t("change_server")}
          </button>
          <p className="text-center text-[12.5px]">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-accent-text hover:underline"
              data-testid="wizard-forgot-password"
            >
              {t("auth:forgot_password")}
            </button>
          </p>
          <LegalFooterLinks serverInfo={serverState?.serverInfo ?? null} />
        </form>
      )}

      {step === "credentials" && !lockServer && (
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <BrandHeader step={2} />
          <div>
            <h3 className="mb-1 text-[19px] font-semibold tracking-tight text-fg">
              {t("sign_in")}
            </h3>
            <p className="text-[13.5px] text-fg-muted">{t("credentials_sub")}</p>
          </div>
          {serverState && (
            <ServerChip
              name={serverState.serverInfo.name}
              origin={serverState.origin}
              onChange={handleChangeServer}
              isSubmitting={isSubmitting}
            />
          )}
          {error && <ErrorBanner message={error} />}
          <div>
            <label htmlFor="wizard-email" className={labelClass}>
              {t("email_label")}
            </label>
            <input
              id="wizard-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              data-testid="wizard-email-input"
            />
          </div>
          <div>
            <label htmlFor="wizard-password" className={labelClass}>
              {t("password_label")}
            </label>
            <input
              id="wizard-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              data-testid="wizard-password-input"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={primaryButtonClass}
            data-testid="wizard-credentials-submit"
          >
            {t("sign_in")}
          </button>
          <p className="text-center text-[12.5px]">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-accent-text hover:underline"
              data-testid="wizard-forgot-password"
            >
              {t("auth:forgot_password")}
            </button>
          </p>
          {serverState?.serverInfo.registrationEnabled && (
            <p className="text-center text-[12.5px] text-fg-muted">
              {t("auth:no_account")}{" "}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("register");
                }}
                className="text-accent-text hover:underline"
                data-testid="wizard-register-link"
              >
                {t("auth:register_link")}
              </button>
            </p>
          )}
          <LegalFooterLinks serverInfo={serverState?.serverInfo ?? null} />
        </form>
      )}

      {step === "register" && serverState && (
        <div className="space-y-4">
          <BrandHeader step={2} />
          <h3 className="text-[19px] font-semibold tracking-tight text-fg">
            {t("auth:create_account")}
          </h3>
          <ServerChip
            name={serverState.serverInfo.name}
            origin={serverState.origin}
            onChange={handleChangeServer}
          />
          <RegisterForm
            serverInfo={serverState.serverInfo}
            onSwitchToLogin={() => setStep("credentials")}
            onComplete={handleRegistered}
          />
          <LegalFooterLinks serverInfo={serverState.serverInfo} />
        </div>
      )}

      {step === "totp" && (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <h3 className="mb-1 text-[19px] font-semibold tracking-tight text-fg">
              {t("totp_title")}
            </h3>
            <p className="text-[13.5px] text-fg-muted">{t("totp_hint")}</p>
          </div>
          {serverState && (
            <ServerChip name={serverState.serverInfo.name} origin={serverState.origin} />
          )}
          <TotpCellsInput
            id="wizard-totp"
            value={code}
            onChange={setCode}
            ariaLabel={t("totp_title")}
            testId="wizard-totp-input"
            cellTestIdPrefix="wizard-totp-cell"
          />
          <p className="text-[12.5px] text-fg-subtle">{t("signing_in_as", { email })}</p>
          {error && <ErrorBanner message={error} />}
          <button
            type="submit"
            disabled={isSubmitting || code.length !== 6}
            className={primaryButtonClass}
            data-testid="wizard-totp-submit"
          >
            {t("sign_in")}
          </button>
        </form>
      )}

      {showForgotPassword &&
        createPortal(
          <ForgotPasswordModal
            initialEmail={email}
            onClose={() => setShowForgotPassword(false)}
            onSuccess={() => setShowForgotPassword(false)}
          />,
          document.body,
        )}
    </div>
  );
}
