import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  completeAdminOnboarding,
  fetchAdminServerConfig,
  patchAdminServerConfig,
  sendAdminTestEmail,
  type AdminServerConfig,
  type AdminServerConfigPatch,
} from "@/api/adminServerConfig";
import { createCommunity } from "@/api/communities";
import { apiErrorText } from "@/api/client";
import { updateServerInfo } from "@/api/serverInfo";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/icons";
import { TytoMark } from "@/components/TytoMark";
import { gradientEnd } from "@/utils/accentGradient";
import { WizardPrimaryButton, WizardRail, WizardSwitch } from "./wizardUi";
import { wizardInputCls as inputCls } from "./wizardStyles";

type Step = 1 | 2 | 3 | 4 | 5;

const ACCENT_FALLBACK = "#22d3ee";

interface Summary {
  community: "created" | "skipped";
  mailer: "tested" | "configured" | "skipped";
}

export function SetupWizard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [config, setConfig] = useState<AdminServerConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [serverName, setServerName] = useState("");
  const [serverDescription, setServerDescription] = useState("");
  const [accentColor, setAccentColor] = useState<string | null>(null);

  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [communityIsPrivate, setCommunityIsPrivate] = useState(false);

  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpEncryption, setSmtpEncryption] = useState<"none" | "tls" | "ssl">("tls");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [mailerResult, setMailerResult] = useState<{ ok: boolean; error: string | null } | null>(
    null,
  );

  const [summary, setSummary] = useState<Summary>({ community: "skipped", mailer: "skipped" });

  useEffect(() => {
    void (async () => {
      const c = await fetchAdminServerConfig();
      setConfig(c);
      setServerName(c.serverName);
      setServerDescription(c.serverDescription);
      setAccentColor(c.accentColor);
      setRegistrationEnabled(c.registrationEnabled);
      setSmtpHost(c.smtpHost ?? "");
      setSmtpPort(c.smtpPort != null ? String(c.smtpPort) : "");
      setSmtpUsername(c.smtpUsername ?? "");
      setSmtpEncryption(c.smtpEncryption ?? "tls");
      setSmtpFromEmail(c.smtpFromEmail ?? "");
      setSmtpFromName(c.smtpFromName ?? "");
      if (user?.email) setTestEmailTo(user.email);
    })();
  }, [user?.email]);

  if (!config) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  async function saveBranding() {
    setBusy(true);
    setError(null);
    try {
      const patch = await patchAdminServerConfig({
        serverName: serverName.trim(),
        serverDescription: serverDescription.trim(),
        accentColor,
      });
      setConfig(patch);
      setStep(2);
    } catch (e) {
      setError(apiErrorText(e, t("setup_save_failed")));
    } finally {
      setBusy(false);
    }
  }

  async function saveCommunity() {
    setBusy(true);
    setError(null);
    try {
      await createCommunity({
        name: communityName.trim(),
        description: communityDescription.trim() || undefined,
        isPrivate: communityIsPrivate || undefined,
      });
      setSummary((s) => ({ ...s, community: "created" }));
      setStep(3);
    } catch (e) {
      setError(apiErrorText(e, t("setup_save_failed")));
    } finally {
      setBusy(false);
    }
  }

  async function saveRegistration() {
    setBusy(true);
    setError(null);
    try {
      const patch = await patchAdminServerConfig({ registrationEnabled });
      setConfig(patch);
      setStep(4);
    } catch (e) {
      setError(apiErrorText(e, t("setup_save_failed")));
    } finally {
      setBusy(false);
    }
  }

  function smtpPatch(): AdminServerConfigPatch {
    const patch: AdminServerConfigPatch = {
      smtpHost: smtpHost.trim() || null,
      smtpPort: smtpPort.trim() ? Number(smtpPort) : null,
      smtpUsername: smtpUsername.trim() || null,
      smtpEncryption,
      smtpFromEmail: smtpFromEmail.trim() || null,
      smtpFromName: smtpFromName.trim() || null,
    };
    if (smtpPassword.length > 0) patch.smtpPassword = smtpPassword;
    return patch;
  }

  async function saveSmtp(): Promise<boolean> {
    try {
      const patch = await patchAdminServerConfig(smtpPatch());
      setConfig(patch);
      setSummary((s) => (s.mailer === "tested" ? s : { ...s, mailer: "configured" }));
      return true;
    } catch (e) {
      setError(apiErrorText(e, t("setup_save_failed")));
      return false;
    }
  }

  async function saveAndSendTest() {
    setBusy(true);
    setError(null);
    setMailerResult(null);
    try {
      if (!(await saveSmtp())) return;
      const res = await sendAdminTestEmail(testEmailTo.trim());
      setMailerResult(res);
      if (res.ok) setSummary((s) => ({ ...s, mailer: "tested" }));
    } catch (e) {
      setMailerResult({ ok: false, error: apiErrorText(e, t("setup_mailer_fail")) });
    } finally {
      setBusy(false);
    }
  }

  async function mailerNext() {
    setBusy(true);
    setError(null);
    try {
      if (smtpHost.trim().length > 0 && !(await saveSmtp())) return;
      setStep(5);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await completeAdminOnboarding();
      updateServerInfo({ adminOnboardingComplete: true });
      onClose();
    } catch (e) {
      setError(apiErrorText(e, t("setup_save_failed")));
      setBusy(false);
    }
  }

  const heads: Record<Step, { title: string; sub: string }> = {
    1: { title: t("setup_title"), sub: t("setup_subtitle") },
    2: { title: t("setup_community_title"), sub: t("setup_community_intro") },
    3: { title: t("setup_registration_title"), sub: t("setup_registration_intro") },
    4: { title: t("setup_mailer_title"), sub: t("setup_mailer_intro") },
    5: { title: "", sub: "" },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10"
      onMouseDown={() => void finish()}
    >
      <div
        className="grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl bg-canvas ring-1 ring-inset ring-line shadow-soft-lg sm:grid-cols-[216px_1fr]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <WizardRail
          eyebrow={t("setup_eyebrow")}
          note={t("setup_rail_note")}
          steps={[
            t("setup_step_branding"),
            t("setup_step_community"),
            t("setup_step_registration"),
            t("setup_step_mailer"),
            t("setup_step_finish"),
          ]}
          current={step}
        />

        <div className="flex min-w-0 flex-col">
          {step !== 5 && (
            <header className="flex items-start justify-between gap-3 px-6 pt-5">
              <div>
                <h1 className="text-xl font-bold text-fg">{heads[step].title}</h1>
                <p className="mt-1 max-w-md text-sm text-fg-muted">{heads[step].sub}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void finish()}
                className="whitespace-nowrap text-xs font-medium text-fg-subtle hover:text-fg hover:underline disabled:opacity-40"
              >
                {t("setup_dismiss")}
              </button>
            </header>
          )}
          {step === 5 && (
            <header className="flex justify-end px-6 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void finish()}
                className="text-xs font-medium text-fg-subtle hover:text-fg hover:underline disabled:opacity-40"
              >
                {t("setup_dismiss")}
              </button>
            </header>
          )}

          <div className="flex flex-col gap-4 px-6 py-5">
            {step === 1 && (
              <Branding
                t={t}
                serverName={serverName}
                setServerName={setServerName}
                serverDescription={serverDescription}
                setServerDescription={setServerDescription}
                accentColor={accentColor}
                setAccentColor={setAccentColor}
              />
            )}
            {step === 2 && (
              <CommunityStep
                t={t}
                communityName={communityName}
                setCommunityName={setCommunityName}
                communityDescription={communityDescription}
                setCommunityDescription={setCommunityDescription}
                communityIsPrivate={communityIsPrivate}
                setCommunityIsPrivate={setCommunityIsPrivate}
              />
            )}
            {step === 3 && (
              <RegistrationStep
                t={t}
                registrationEnabled={registrationEnabled}
                setRegistrationEnabled={setRegistrationEnabled}
              />
            )}
            {step === 4 && (
              <MailerStep
                t={t}
                smtpHost={smtpHost}
                setSmtpHost={setSmtpHost}
                smtpPort={smtpPort}
                setSmtpPort={setSmtpPort}
                smtpUsername={smtpUsername}
                setSmtpUsername={setSmtpUsername}
                smtpPassword={smtpPassword}
                setSmtpPassword={setSmtpPassword}
                smtpEncryption={smtpEncryption}
                setSmtpEncryption={setSmtpEncryption}
                smtpFromEmail={smtpFromEmail}
                setSmtpFromEmail={setSmtpFromEmail}
                smtpFromName={smtpFromName}
                setSmtpFromName={setSmtpFromName}
                passwordSet={config.smtpPasswordSet}
                testEmailTo={testEmailTo}
                setTestEmailTo={setTestEmailTo}
                mailerResult={mailerResult}
                busy={busy}
                onSend={() => void saveAndSendTest()}
              />
            )}
            {step === 5 && (
              <DoneStep
                t={t}
                serverName={serverName}
                summary={summary}
                registrationEnabled={registrationEnabled}
              />
            )}

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <footer className="mt-auto flex items-center justify-between border-t border-line px-6 py-3.5">
            <button
              type="button"
              disabled={step === 1 || busy}
              onClick={() => setStep((s) => Math.max(1, (s - 1) as Step) as Step)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface disabled:opacity-30"
            >
              {t("setup_back")}
            </button>
            <div className="flex items-center gap-2">
              {step === 2 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSummary((s) => ({ ...s, community: "skipped" }));
                    setStep(3);
                  }}
                  className="px-2 py-1.5 text-sm font-medium text-fg-subtle hover:text-fg"
                >
                  {t("setup_community_skip")}
                </button>
              )}
              {step === 4 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(5)}
                  className="px-2 py-1.5 text-sm font-medium text-fg-subtle hover:text-fg"
                >
                  {t("setup_mailer_skip")}
                </button>
              )}
              {step === 1 && (
                <WizardPrimaryButton
                  disabled={busy || serverName.trim().length === 0}
                  onClick={() => void saveBranding()}
                  label={t("setup_next")}
                />
              )}
              {step === 2 && (
                <WizardPrimaryButton
                  disabled={busy || communityName.trim().length < 2}
                  onClick={() => void saveCommunity()}
                  label={t("setup_next")}
                />
              )}
              {step === 3 && (
                <WizardPrimaryButton
                  disabled={busy}
                  onClick={() => void saveRegistration()}
                  label={t("setup_next")}
                />
              )}
              {step === 4 && (
                <WizardPrimaryButton
                  disabled={busy}
                  onClick={() => void mailerNext()}
                  label={t("setup_next")}
                />
              )}
              {step === 5 && (
                <WizardPrimaryButton
                  disabled={busy}
                  onClick={() => void finish()}
                  label={t("setup_finish")}
                />
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

type T = TFunction<"admin">;

function Branding({
  t,
  serverName,
  setServerName,
  serverDescription,
  setServerDescription,
  accentColor,
  setAccentColor,
}: {
  t: T;
  serverName: string;
  setServerName: (v: string) => void;
  serverDescription: string;
  setServerDescription: (v: string) => void;
  accentColor: string | null;
  setAccentColor: (v: string | null) => void;
}) {
  const accent = accentColor ?? ACCENT_FALLBACK;
  const gradient = `linear-gradient(135deg, ${accent}, ${gradientEnd(accent)})`;
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">{t("server_name")}</label>
        <input
          type="text"
          value={serverName}
          onChange={(e) => setServerName(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">{t("server_description")}</label>
        <textarea
          rows={3}
          value={serverDescription}
          onChange={(e) => setServerDescription(e.target.value)}
          className={inputCls}
          placeholder={t("server_description_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">{t("accent_color")}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-line"
          />
          <button
            type="button"
            onClick={() => setAccentColor(null)}
            className="rounded-lg border border-line px-2 py-1 text-xs text-fg hover:bg-surface"
          >
            {t("accent_color_clear")}
          </button>
          <span className="font-mono text-xs text-fg-muted">{accent}</span>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-3.5 py-3"
      >
        <span
          className="grid h-9 w-9 flex-none place-items-center rounded-xl text-sm font-bold text-white shadow-soft-sm"
          style={{ background: gradient }}
        >
          {(serverName.trim()[0] ?? "T").toUpperCase()}
        </span>
        <div className="flex-1">
          <div className="mb-1.5 h-2 w-2/5 rounded bg-line-strong" />
          <div className="h-2 w-3/5 rounded bg-line" />
        </div>
        <span
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
          style={{ background: gradient }}
        >
          {t("setup_preview_send")}
        </span>
      </div>
    </div>
  );
}

function CommunityStep({
  t,
  communityName,
  setCommunityName,
  communityDescription,
  setCommunityDescription,
  communityIsPrivate,
  setCommunityIsPrivate,
}: {
  t: T;
  communityName: string;
  setCommunityName: (v: string) => void;
  communityDescription: string;
  setCommunityDescription: (v: string) => void;
  communityIsPrivate: boolean;
  setCommunityIsPrivate: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">{t("community_name")}</label>
        <input
          type="text"
          value={communityName}
          onChange={(e) => setCommunityName(e.target.value)}
          className={inputCls}
          placeholder={t("setup_community_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">
          {t("setup_community_description")}
        </label>
        <textarea
          rows={2}
          value={communityDescription}
          onChange={(e) => setCommunityDescription(e.target.value)}
          className={inputCls}
          placeholder={t("setup_community_description_placeholder")}
        />
      </div>
      <div className="flex items-start gap-3">
        <WizardSwitch
          on={communityIsPrivate}
          onToggle={() => setCommunityIsPrivate(!communityIsPrivate)}
          label={t("setup_community_private")}
        />
        <span className="flex flex-col text-sm">
          <span className="font-medium text-fg">{t("setup_community_private")}</span>
          <span className="text-xs text-fg-muted">{t("setup_community_private_hint")}</span>
        </span>
      </div>
    </div>
  );
}

function RadioCard({
  selected,
  onSelect,
  title,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex items-start gap-3 rounded-xl px-4 py-3 text-left ${
        selected
          ? "bg-accent-subtle/40 ring-2 ring-inset ring-[var(--accent)]"
          : "bg-surface ring-1 ring-inset ring-line-strong"
      }`}
    >
      <span
        className={`mt-0.5 h-[18px] w-[18px] flex-none rounded-full bg-raised ${
          selected
            ? "ring-[5.5px] ring-inset ring-[var(--accent)]"
            : "ring-2 ring-inset ring-line-strong"
        }`}
      />
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="text-xs text-fg-muted">{hint}</span>
      </span>
    </button>
  );
}

function RegistrationStep({
  t,
  registrationEnabled,
  setRegistrationEnabled,
}: {
  t: T;
  registrationEnabled: boolean;
  setRegistrationEnabled: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div role="radiogroup" className="flex flex-col gap-2.5">
        <RadioCard
          selected={registrationEnabled}
          onSelect={() => setRegistrationEnabled(true)}
          title={t("setup_registration_open")}
          hint={t("setup_registration_open_hint")}
        />
        <RadioCard
          selected={!registrationEnabled}
          onSelect={() => setRegistrationEnabled(false)}
          title={t("setup_registration_closed")}
          hint={t("setup_registration_closed_hint")}
        />
      </div>
      {registrationEnabled && (
        <p className="rounded-lg bg-surface px-3.5 py-2.5 text-xs text-fg-muted ring-1 ring-inset ring-line">
          {t("setup_registration_antispam_hint")}
        </p>
      )}
    </div>
  );
}

function MailerStep({
  t,
  smtpHost,
  setSmtpHost,
  smtpPort,
  setSmtpPort,
  smtpUsername,
  setSmtpUsername,
  smtpPassword,
  setSmtpPassword,
  smtpEncryption,
  setSmtpEncryption,
  smtpFromEmail,
  setSmtpFromEmail,
  smtpFromName,
  setSmtpFromName,
  passwordSet,
  testEmailTo,
  setTestEmailTo,
  mailerResult,
  busy,
  onSend,
}: {
  t: T;
  smtpHost: string;
  setSmtpHost: (v: string) => void;
  smtpPort: string;
  setSmtpPort: (v: string) => void;
  smtpUsername: string;
  setSmtpUsername: (v: string) => void;
  smtpPassword: string;
  setSmtpPassword: (v: string) => void;
  smtpEncryption: "none" | "tls" | "ssl";
  setSmtpEncryption: (v: "none" | "tls" | "ssl") => void;
  smtpFromEmail: string;
  setSmtpFromEmail: (v: string) => void;
  smtpFromName: string;
  setSmtpFromName: (v: string) => void;
  passwordSet: boolean;
  testEmailTo: string;
  setTestEmailTo: (v: string) => void;
  mailerResult: { ok: boolean; error: string | null } | null;
  busy: boolean;
  onSend: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-3.5 gap-y-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">{t("smtp_host")}</label>
          <input
            type="text"
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">{t("smtp_port")}</label>
          <input
            type="number"
            value={smtpPort}
            onChange={(e) => setSmtpPort(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">{t("smtp_username")}</label>
          <input
            type="text"
            value={smtpUsername}
            onChange={(e) => setSmtpUsername(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">{t("smtp_password")}</label>
          <input
            type="password"
            value={smtpPassword}
            placeholder={passwordSet ? t("smtp_password_set") : t("smtp_password_unset")}
            onChange={(e) => setSmtpPassword(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">{t("smtp_encryption")}</label>
          <select
            value={smtpEncryption}
            onChange={(e) => setSmtpEncryption(e.target.value as "none" | "tls" | "ssl")}
            className={inputCls}
          >
            <option value="none">{t("smtp_encryption_none")}</option>
            <option value="tls">{t("smtp_encryption_tls")}</option>
            <option value="ssl">{t("smtp_encryption_ssl")}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">{t("smtp_from_name")}</label>
          <input
            type="text"
            value={smtpFromName}
            onChange={(e) => setSmtpFromName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-fg">{t("smtp_from_email")}</label>
          <input
            type="email"
            value={smtpFromEmail}
            onChange={(e) => setSmtpFromEmail(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-fg-subtle">
          {t("setup_mailer_verify")}
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-fg">{t("test_email_to")}</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmailTo}
            onChange={(e) => setTestEmailTo(e.target.value)}
            className={inputCls}
          />
          <button
            type="button"
            disabled={busy || testEmailTo.length < 3 || smtpHost.trim().length === 0}
            onClick={onSend}
            className="whitespace-nowrap rounded-lg border border-line px-3 py-2 text-sm font-medium text-fg hover:bg-surface disabled:opacity-40"
          >
            {busy ? t("loading") : t("setup_mailer_send")}
          </button>
        </div>
      </div>
      {mailerResult && (
        <p
          className={`rounded-lg px-3.5 py-2.5 text-xs ${
            mailerResult.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"
          }`}
        >
          {mailerResult.ok ? t("setup_mailer_ok") : (mailerResult.error ?? t("setup_mailer_fail"))}
        </p>
      )}
      <p className="text-xs text-fg-muted">{t("setup_mailer_skip_hint")}</p>
    </div>
  );
}

function DoneStep({
  t,
  serverName,
  summary,
  registrationEnabled,
}: {
  t: T;
  serverName: string;
  summary: Summary;
  registrationEnabled: boolean;
}) {
  const rows: { label: string; done: boolean; value: string }[] = [
    { label: t("setup_step_branding"), done: true, value: serverName },
    {
      label: t("setup_step_community"),
      done: summary.community === "created",
      value:
        summary.community === "created" ? t("setup_summary_created") : t("setup_summary_skipped"),
    },
    {
      label: t("setup_step_registration"),
      done: true,
      value: registrationEnabled ? t("setup_registration_open") : t("setup_registration_closed"),
    },
    {
      label: t("setup_step_mailer"),
      done: summary.mailer === "tested",
      value:
        summary.mailer === "tested"
          ? t("setup_summary_tested")
          : summary.mailer === "configured"
            ? t("setup_summary_configured")
            : t("setup_summary_skipped"),
    },
  ];
  return (
    <div className="py-2 text-center">
      <div className="mx-auto mb-4 w-fit">
        <TytoMark size={64} />
      </div>
      <p className="text-xl font-bold text-fg">{t("setup_done_heading")}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{t("setup_done_body")}</p>
      <ul className="mx-auto mt-5 flex max-w-xs flex-col gap-2 text-left">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"
          >
            <span
              className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full text-[0.66rem] font-extrabold ${
                r.done
                  ? "bg-success-subtle text-success"
                  : "text-fg-subtle ring-1 ring-inset ring-line-strong"
              }`}
            >
              {r.done ? "✓" : "–"}
            </span>
            {r.label}
            <span className="ml-auto text-xs text-fg-muted">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
