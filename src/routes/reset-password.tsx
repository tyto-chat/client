import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requestPasswordReset, confirmPasswordReset } from "@/api/users";
import { getApiErrorMessage } from "@/api/client";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

const inputClass =
  "w-full rounded-lg bg-line-strong px-3 py-2 text-white outline-none focus:ring-2 focus:ring-[var(--accent)]";
const inputErrorClass =
  "w-full rounded-lg bg-red-900/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-red-400";

function ResetPasswordPage() {
  const { t } = useTranslation(["auth", "common"]);
  useDocumentTitle(t("reset_password_title"));
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const isValid = token.length > 0 && password.length >= 8 && password === confirmPassword;

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRequestError(null);
    setRequesting(true);
    try {
      await requestPasswordReset(email);
      setRequested(true);
    } catch (err) {
      setRequestError(getApiErrorMessage(err) ?? t("failed_send_reset"));
    } finally {
      setRequesting(false);
    }
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setConfirmError(null);
    setConfirming(true);
    try {
      await confirmPasswordReset(email, token, password);
      await navigate({ to: "/login" });
    } catch (err) {
      setConfirmError(getApiErrorMessage(err) ?? t("failed_reset"));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-canvas p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white">{t("reset_password_title")}</h1>

        {!requested ? (
          <form onSubmit={handleRequestSubmit} className="space-y-4">
            {requestError && (
              <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-400">{requestError}</p>
            )}
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm text-fg-subtle">
                {t("common:email")}
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={requesting}
              className="w-full rounded-lg bg-accent-gradient py-2 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
            >
              {requesting ? t("sending") : t("send_reset_code")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmSubmit} className="space-y-4">
            <p className="text-sm text-fg-subtle">{t("reset_code_sent", { email })}</p>
            {confirmError && (
              <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-400">{confirmError}</p>
            )}
            <div className="space-y-1">
              <label htmlFor="token" className="text-sm text-fg-subtle">
                {t("reset_code")}
              </label>
              <input
                id="token"
                type="text"
                required
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm text-fg-subtle">
                {t("new_password")}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                className={touched.password && tooShort ? inputErrorClass : inputClass}
              />
              {touched.password && tooShort && (
                <p className="mt-1 text-xs text-red-400">{t("password_too_short")}</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="text-sm text-fg-subtle">
                {t("confirm_new_password")}
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
                className={touched.confirmPassword && mismatch ? inputErrorClass : inputClass}
              />
              {touched.confirmPassword && mismatch && (
                <p className="mt-1 text-xs text-red-400">{t("passwords_dont_match")}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={confirming || !isValid}
              className="w-full rounded-lg bg-accent-gradient py-2 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
            >
              {confirming ? t("resetting") : t("reset_password_submit")}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-fg-muted">
          <a href="/login" className="text-[var(--accent-muted)] hover:underline">
            {t("back_to_sign_in")}
          </a>
        </p>
      </div>
    </div>
  );
}
