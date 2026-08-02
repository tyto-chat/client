import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { login as apiLogin, verifyTwoFactorLogin } from "@/api/auth";
import { fetchMe, requestPasswordReset, confirmPasswordReset } from "@/api/users";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";
import { ServerBranding } from "@/components/ServerBranding";
import { LegalFooterLinks, PoweredByTyto } from "@/components/LegalLinks";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { Modal } from "@/components/Modal";
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
  const verifyFormRef = useRef<HTMLFormElement>(null);

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
          <h1 className="mb-4 pr-6 text-2xl font-bold">
            {t(step === "totp" ? "two_factor_title" : "sign_in")}
          </h1>

          {step === "credentials" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="animate-message-in space-y-1">
                  <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
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

              <div className="space-y-1">
                <label htmlFor="email" className="text-sm text-fg-muted">
                  {t("common:email")}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg bg-surface px-3 py-2 text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="password" className="text-sm text-fg-muted">
                  {t("common:password")}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg bg-surface px-3 py-2 text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
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

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-accent-gradient py-2 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
              >
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
            <form ref={verifyFormRef} onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm text-fg-muted">
                {t(useRecovery ? "two_factor_recovery_hint" : "two_factor_hint")}
              </p>

              <div className="space-y-1">
                <label htmlFor="two-factor-code" className="text-sm text-fg-muted">
                  {t(useRecovery ? "two_factor_recovery_label" : "two_factor_code_label")}
                </label>
                <input
                  id="two-factor-code"
                  autoFocus
                  value={code}
                  onChange={(e) => {
                    const value = useRecovery
                      ? e.target.value
                      : e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(value);
                    if (!useRecovery && value.length === 6) {
                      queueMicrotask(() => verifyFormRef.current?.requestSubmit());
                    }
                  }}
                  inputMode={useRecovery ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  placeholder={useRecovery ? "xxxxx-xxxxx" : "123456"}
                  className="w-full rounded-lg bg-surface px-3 py-2 text-center font-mono text-lg tracking-widest text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white"
                  data-testid="two-factor-code-input"
                />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <button
                type="submit"
                disabled={isSubmitting || code.length === 0}
                className="w-full rounded-lg bg-accent-gradient py-2 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
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

function ForgotPasswordModal({
  initialEmail,
  onClose,
  onSuccess,
}: {
  initialEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation(["auth", "common"]);
  const { notify } = useNotification();
  const [step, setStep] = useState<"email" | "token">("email");
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({ newPassword: false, confirmPassword: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const isValid = token.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      notify(t("token_sent"), "success");
      setStep("token");
    } catch {
      notify(t("failed_send_reset"), "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      await confirmPasswordReset(email, token, newPassword);
      onSuccess();
    } catch {
      notify(t("invalid_token"), "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={t("reset_password_modal_title")} onClose={onClose} size="sm">
      {(close) =>
        step === "email" ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <p className="text-sm text-fg-muted">{t("enter_email_hint")}</p>
            <TextInput
              type="email"
              label={t("common:email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <ModalFooter
              onCancel={close}
              submitLabel={t("send_token")}
              pendingLabel={t("sending")}
              isPending={isSubmitting}
            />
          </form>
        ) : (
          <form onSubmit={handleTokenSubmit} className="animate-message-in space-y-4">
            <p className="text-sm text-fg-muted">{t("enter_token_hint", { email })}</p>
            <TextInput
              label={t("reset_token_label")}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <TextInput
              label={t("new_password")}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, newPassword: true }))}
              required
              error={touched.newPassword && tooShort ? t("password_too_short") : undefined}
            />
            <TextInput
              label={t("confirm_new_password")}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
              required
              error={touched.confirmPassword && mismatch ? t("passwords_dont_match") : undefined}
            />
            <ModalFooter
              onCancel={() => setStep("email")}
              cancelLabel={t("common:back")}
              submitLabel={t("reset_password_submit")}
              pendingLabel={t("resetting")}
              isPending={isSubmitting}
              disabled={!isValid}
            />
          </form>
        )
      }
    </Modal>
  );
}
