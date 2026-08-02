import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { createChallenge } from "@/api/challenges";
import { registerUser } from "@/api/users";
import { login as apiLogin } from "@/api/auth";
import { getApiErrorMessage, isRateLimited } from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import { ServerBranding } from "@/components/ServerBranding";
import { LegalConsentLabel, LegalFooterLinks, PoweredByTyto } from "@/components/LegalLinks";
import { Modal } from "@/components/Modal";
import { CodeInput } from "@/components/ui/CodeInput";
import type { ServerInfo } from "@/types/api";

const inputClass =
  "w-full rounded-lg bg-surface px-3 py-2 text-fg outline-none focus:ring-2 focus:ring-[var(--accent)] dark:text-white";
const inputErrorClass =
  "w-full rounded-lg bg-red-100 px-3 py-2 text-fg outline-none focus:ring-2 focus:ring-red-400 dark:bg-red-900/30 dark:text-white";

interface Props {
  serverInfo: ServerInfo | null;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterModal({ serverInfo, onClose, onSwitchToLogin }: Props) {
  const { t } = useTranslation(["auth", "common"]);
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeSent, setChallengeSent] = useState(false);

  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [touched, setTouched] = useState({
    displayName: false,
    password: false,
    confirmPassword: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasPolicy = !!serverInfo?.requireLegalConsent;
  const minAge = serverInfo?.minimumAgeYears ?? 0;
  const ageGate = minAge > 0;
  const computedAge = ageOnDate(dateOfBirth);
  const ageOk = !ageGate || (computedAge !== null && computedAge >= minAge);
  const displayNameTooShort = displayName.length > 0 && displayName.length < 4;
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const isValid =
    code.length === 6 &&
    displayName.length >= 4 &&
    password.length >= 8 &&
    password === confirmPassword &&
    (!hasPolicy || acceptedTerms) &&
    ageOk;

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChallengeError(null);
    setChallengeSubmitting(true);
    try {
      await createChallenge(email);
      setChallengeSent(true);
    } catch (err) {
      setChallengeError(
        isRateLimited(err)
          ? t("too_many_registrations")
          : (getApiErrorMessage(err) ?? t("failed_verification")),
      );
    } finally {
      setChallengeSubmitting(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await registerUser({
        email,
        password,
        challenge: code,
        displayName,
        ...(hasPolicy ? { acceptedTerms } : {}),
        ...(ageGate ? { dateOfBirth } : {}),
      });
      const { token } = await apiLogin(email, password);
      login(token);
      onClose();
      await navigate({ to: "/" });
    } catch (err) {
      setError(
        isRateLimited(err)
          ? t("too_many_registrations")
          : (getApiErrorMessage(err) ?? t("registration_failed")),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} size="md">
      {() => (
        <>
          {serverInfo && <ServerBranding serverInfo={serverInfo} onNavigate={onClose} />}
          <h1 className="mb-4 pr-6 text-2xl font-bold">{t("create_account")}</h1>

          {!challengeSent ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {challengeError && (
                <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {challengeError}
                </p>
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
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={challengeSubmitting}
                className="w-full rounded-lg bg-accent-gradient py-2 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {challengeSubmitting ? t("sending") : t("continue")}
              </button>
              <p className="text-center text-sm text-fg-muted">
                {t("already_account")}{" "}
                <button
                  type="button"
                  onClick={onSwitchToLogin}
                  className="text-[var(--accent)] hover:underline dark:text-[var(--accent-muted)]"
                >
                  {t("sign_in_link")}
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <p className="text-sm text-fg-muted">{t("code_sent_hint", { email })}</p>
              {error && (
                <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <div className="space-y-1">
                <label className="text-sm text-fg-muted">{t("common:email")}</label>
                <input
                  type="email"
                  readOnly
                  value={email}
                  className="w-full cursor-default rounded-lg bg-surface px-3 py-2 text-fg-muted outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="displayName" className="text-sm text-fg-muted">
                  {t("display_name")}
                </label>
                <input
                  id="displayName"
                  type="text"
                  required
                  placeholder={t("display_name_placeholder")}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, displayName: true }))}
                  className={
                    touched.displayName && displayNameTooShort ? inputErrorClass : inputClass
                  }
                />
                {touched.displayName && displayNameTooShort && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {t("display_name_too_short")}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label htmlFor="code" className="text-sm text-fg-muted">
                  {t("verification_code")}
                </label>
                <CodeInput value={code} onChange={setCode} autoFocus />
              </div>
              <div className="space-y-1">
                <label htmlFor="password" className="text-sm text-fg-muted">
                  {t("common:password")}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  className={touched.password && tooShort ? inputErrorClass : inputClass}
                />
                {touched.password && tooShort && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {t("password_too_short")}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label htmlFor="confirmPassword" className="text-sm text-fg-muted">
                  {t("confirm_password")}
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                  className={touched.confirmPassword && mismatch ? inputErrorClass : inputClass}
                />
                {touched.confirmPassword && mismatch && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {t("passwords_dont_match")}
                  </p>
                )}
              </div>
              {ageGate && (
                <div className="space-y-1">
                  <label htmlFor="dob" className="text-sm text-fg-muted">
                    {t("date_of_birth")}
                  </label>
                  <input
                    id="dob"
                    type="date"
                    required
                    value={dateOfBirth}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-xs text-fg-subtle">{t("age_gate_hint", { count: minAge })}</p>
                  {computedAge !== null && computedAge < minAge && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {t("age_too_young", { count: minAge })}
                    </p>
                  )}
                </div>
              )}
              {hasPolicy && (
                <label className="flex items-start gap-2 text-sm text-fg-muted">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    aria-required="true"
                    className="mt-0.5"
                  />
                  <span>
                    <LegalConsentLabel serverInfo={serverInfo} />
                  </span>
                </label>
              )}
              <button
                type="submit"
                disabled={isSubmitting || !isValid}
                className="w-full rounded-lg bg-accent-gradient py-2 font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? t("creating_account") : t("create_account")}
              </button>
            </form>
          )}
          <div className="mt-4 space-y-1.5">
            <LegalFooterLinks serverInfo={serverInfo} />
            <PoweredByTyto />
          </div>
        </>
      )}
    </Modal>
  );
}

function ageOnDate(isoDate: string): number | null {
  if (!isoDate) return null;
  const dob = new Date(isoDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}
