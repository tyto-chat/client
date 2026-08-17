import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { login as apiLogin, verifyTwoFactorLogin } from "@/api/auth";
import { fetchMe } from "@/api/users";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";
import { ServerBranding } from "@/components/ServerBranding";
import { LegalFooterLinks, PoweredByTyto } from "@/components/LegalLinks";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { Modal } from "@/components/Modal";
import {
  ErrorBanner,
  TotpCellsInput,
  inputClass,
  labelClass,
  primaryButtonClass,
} from "@/components/authUi";
import { isRateLimited, ApiError } from "@/api/client";
import type { ServerInfo } from "@/types/api";

interface Props {
  serverInfo: ServerInfo | null;
  onClose: () => void;
  onSwitchToRegister: () => void;
  onSuccess?: () => void;
}

export function LoginModal({ serverInfo, onClose, onSwitchToRegister, onSuccess }: Props) {
  const { t } = useTranslation(["auth", "common"]);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  async function completeLogin(token: string) {
    login(token);
    const me = await fetchMe();
    notify(t("welcome_back_toast", { name: me.profile.name }), "success");
    onSuccess?.();
    await navigate({ to: "/" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiLogin(email, password, rememberMe);
      if (result.twoFactorRequired) {
        setPendingToken(result.token);
        setStep("totp");
        return;
      }
      await completeLogin(result.token);
    } catch (err) {
      setError(isRateLimited(err) ? t("too_many_login_attempts") : t("invalid_credentials"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!pendingToken) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const token = await verifyTwoFactorLogin(pendingToken, code, rememberMe);
      await completeLogin(token);
    } catch (err) {
      if (isRateLimited(err)) {
        setError(t("too_many_login_attempts"));
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
        setUseRecovery(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} size="md">
      {() => (
        <>
          {serverInfo && (
            <ServerBranding
              serverInfo={serverInfo}
              onRegister={onSwitchToRegister}
              onNavigate={onClose}
            />
          )}
          <div className="mb-4 pr-6">
            <h1 className="mb-1 text-[19px] font-semibold tracking-tight text-fg">
              {t(step === "totp" ? "two_factor_title" : "sign_in")}
            </h1>
            <p className="text-[13.5px] text-fg-muted">
              {step === "totp"
                ? t(useRecovery ? "two_factor_recovery_hint" : "two_factor_hint")
                : t("sign_in_sub")}
            </p>
          </div>

          {step === "credentials" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="animate-message-in space-y-1">
                  <ErrorBanner message={error} />
                  <p className="text-right text-xs">
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-[var(--accent)] hover:underline dark:text-[var(--accent-muted)]"
                    >
                      {t("forgot_password")}
                    </button>
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="email" className={labelClass}>
                  {t("common:email")}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="password" className={labelClass}>
                  {t("common:password")}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="shrink-0"
                />
                {t("remember_me")}
              </label>

              <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
                {isSubmitting ? t("signing_in") : t("sign_in")}
              </button>

              <p className="text-center text-sm text-fg-muted">
                {t("no_account")}{" "}
                <button
                  type="button"
                  onClick={onSwitchToRegister}
                  className="text-[var(--accent)] hover:underline dark:text-[var(--accent-muted)]"
                >
                  {t("register_link")}
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              {useRecovery ? (
                <div>
                  <label htmlFor="two-factor-code" className={labelClass}>
                    {t("two_factor_recovery_label")}
                  </label>
                  <input
                    id="two-factor-code"
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="one-time-code"
                    placeholder="xxxxx-xxxxx"
                    className={`${inputClass} font-mono`}
                    data-testid="two-factor-code-input"
                  />
                </div>
              ) : (
                <TotpCellsInput
                  id="two-factor-code"
                  value={code}
                  onChange={setCode}
                  ariaLabel={t("two_factor_code_label")}
                  testId="two-factor-code-input"
                  cellTestIdPrefix="two-factor-code-cell"
                />
              )}

              <p className="text-[12.5px] text-fg-subtle">{t("signing_in_as", { email })}</p>

              {error && <ErrorBanner message={error} />}

              <button
                type="submit"
                disabled={isSubmitting || (useRecovery ? code.length === 0 : code.length !== 6)}
                className={primaryButtonClass}
              >
                {t("two_factor_verify_submit")}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setUseRecovery(!useRecovery);
                    setCode("");
                    setError(null);
                  }}
                  className="text-fg-muted hover:text-fg"
                >
                  {t(useRecovery ? "two_factor_use_totp" : "two_factor_use_recovery")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    setPendingToken(null);
                    setCode("");
                    setError(null);
                    setUseRecovery(false);
                  }}
                  className="text-fg-muted hover:text-fg"
                >
                  {t("two_factor_back")}
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 space-y-1.5">
            <LegalFooterLinks serverInfo={serverInfo} />
            <PoweredByTyto />
          </div>

          {showForgotPassword &&
            createPortal(
              <ForgotPasswordModal
                initialEmail={email}
                onClose={() => setShowForgotPassword(false)}
                onSuccess={() => {
                  setShowForgotPassword(false);
                  setError(null);
                  notify(t("reset_password_success"), "success");
                }}
              />,
              document.body,
            )}
        </>
      )}
    </Modal>
  );
}
