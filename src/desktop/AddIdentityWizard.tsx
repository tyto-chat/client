import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loginAt, verifyTwoFactorAt } from "@/api/auth";
import { isRateLimited, ApiError, configureApiClient } from "@/api/client";
import type { ServerInfo } from "@/types/api";
import { gradientEnd, onAccentColor } from "@/utils/accentGradient";
import { getUserColor } from "@/utils/userColor";
import { normalizeServerUrl, InvalidServerUrlError } from "./desktopConfig";
import { resolveServer } from "./connectIdentity";

type Step = "server" | "credentials" | "totp";

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
  lockServer?: boolean;
}

async function resolveServerState(origin: string): Promise<ServerState> {
  const serverInfo = await resolveServer(origin);
  configureApiClient(serverInfo.apiUrl);
  return { origin, serverInfo };
}

class ServerResolutionFailedError extends Error {}

const inputClass =
  "w-full rounded-md border border-line-strong bg-raised px-3 py-2 text-fg outline-none placeholder:text-fg-subtle focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)] dark:text-white";

const labelClass = "mb-1.5 block text-[12.5px] font-semibold tracking-[0.01em] text-fg-muted";

const primaryButtonClass =
  "w-full rounded-md bg-accent-gradient py-2.5 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50";

const ghostButtonClass =
  "w-full py-1.5 text-center text-[13px] font-medium text-fg-muted underline decoration-fg-muted/45 underline-offset-[3px] transition hover:text-fg disabled:opacity-50";

export function ErrorBanner({ message }: { message: string }) {
  const separatorIndex = message.indexOf(". ");
  const lead = separatorIndex === -1 ? message : message.slice(0, separatorIndex + 1);
  const rest = separatorIndex === -1 ? "" : message.slice(separatorIndex + 1).trim();
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-danger/35 bg-danger-subtle px-3 py-2.5 text-[13px] text-fg">
      <span>
        <b className="text-danger">{lead}</b>
        {rest && ` ${rest}`}
      </span>
    </div>
  );
}

function BrandHeader({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation("desktop");
  return (
    <div className="flex items-center gap-2.5">
      <img src="/nebula-logo.svg" alt="" className="h-[34px] w-auto shrink-0" />
      <span className="text-[17px] font-bold tracking-tight text-fg">tyto</span>
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
  const base = getUserColor(origin);
  const dotStyle = {
    backgroundImage: `linear-gradient(135deg, ${base}, ${gradientEnd(base)})`,
    color: onAccentColor(base),
  };
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-line bg-raised px-3 py-2.5">
      <span
        style={dotStyle}
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] text-xs font-bold"
      >
        <span className="block cap-trim" data-testid="wizard-server-chip-initial">
          {name.charAt(0).toUpperCase()}
        </span>
      </span>
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
}: {
  email: string;
  origin: string;
  onEmailChange: (value: string) => void;
}) {
  const { t } = useTranslation("desktop");
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-gradient text-[17px] font-bold text-on-accent">
        {initial}
      </span>
      <span className="min-w-0 flex-1">
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
  lockServer,
}: Props) {
  const { t } = useTranslation("desktop");
  const startsOnCredentials = Boolean(lockServer && initialServerUrl);
  const [step, setStep] = useState<Step>(startsOnCredentials ? "credentials" : "server");
  const [serverUrlInput, setServerUrlInput] = useState(initialServerUrl ?? "");
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpFocused, setTotpFocused] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const totpFormRef = useRef<HTMLFormElement>(null);
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
      setError(t("invalid_credentials"));
    } finally {
      setIsSubmitting(false);
    }
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
        </form>
      )}

      {step === "totp" && (
        <form ref={totpFormRef} onSubmit={handleVerify} className="space-y-4">
          <div>
            <h3 className="mb-1 text-[19px] font-semibold tracking-tight text-fg">
              {t("totp_title")}
            </h3>
            <p className="text-[13.5px] text-fg-muted">{t("totp_hint")}</p>
          </div>
          {serverState && (
            <ServerChip name={serverState.serverInfo.name} origin={serverState.origin} />
          )}
          <div className="relative">
            <div className="flex gap-2" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => {
                const char = code[i] ?? "";
                const isActive = totpFocused && code.length === i;
                return (
                  <div
                    key={i}
                    data-testid={`wizard-totp-cell-${i}`}
                    className={`flex h-13 w-11 items-center justify-center rounded-md border bg-raised font-mono text-xl text-fg ${
                      isActive
                        ? "border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]"
                        : "border-line-strong"
                    }`}
                  >
                    {char}
                  </div>
                );
              })}
            </div>
            <input
              id="wizard-totp"
              autoFocus
              value={code}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(value);
                if (value.length === 6) {
                  queueMicrotask(() => totpFormRef.current?.requestSubmit());
                }
              }}
              onFocus={() => setTotpFocused(true)}
              onBlur={() => setTotpFocused(false)}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={t("totp_title")}
              className="absolute inset-0 h-full w-full cursor-text opacity-0"
              data-testid="wizard-totp-input"
            />
          </div>
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
    </div>
  );
}
