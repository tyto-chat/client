import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig, AdminServerConfigPatch } from "@/api/adminServerConfig";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import {
  usePatchAdminServerConfig,
  useSendAdminTestEmail,
} from "@/queries/adminServerConfigQueries";
import { useNotification } from "@/context/NotificationContext";
import { Section, Field, inputClass } from "./types";

const FIELDS = [
  "smtpHost",
  "smtpPort",
  "smtpUsername",
  "smtpEncryption",
  "smtpFromEmail",
  "smtpFromName",
] as const;

type FieldKey = (typeof FIELDS)[number];

export function EmailPanel({
  config,
  onDirtyChange,
}: {
  config: AdminServerConfig;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation("admin");
  const { notify } = useNotification();
  const patch = usePatchAdminServerConfig();
  const testEmail = useSendAdminTestEmail();

  const initial = useMemo(() => {
    const slice = {} as Pick<AdminServerConfig, FieldKey>;
    for (const k of FIELDS) (slice[k] as AdminServerConfig[FieldKey]) = config[k];
    return slice;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, ...FIELDS.map((k) => config[k])]);

  const [form, setForm] = useState<Pick<AdminServerConfig, FieldKey> | null>(null);
  const [password, setPassword] = useState("");
  const current = form ?? initial;

  const fieldsDirty = JSON.stringify(current) !== JSON.stringify(initial);
  const dirty = fieldsDirty || password !== "";

  useUnsavedGuard(dirty);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const [testTo, setTestTo] = useState("");

  function set<F extends FieldKey>(key: F, value: AdminServerConfig[F]) {
    setForm((prev) => ({ ...(prev ?? initial), [key]: value }));
  }

  async function save() {
    if (!dirty) return;
    const body: AdminServerConfigPatch = {};
    for (const k of FIELDS) {
      if (current[k] !== initial[k]) (body[k] as AdminServerConfig[FieldKey]) = current[k];
    }
    if (password !== "") body.smtpPassword = password;
    if (Object.keys(body).length === 0) return;
    try {
      await patch.mutateAsync(body);
      setForm(null);
      setPassword("");
      notify(t("save_success"), "success");
    } catch {
      notify(t("save_failed"), "error");
    }
  }

  async function onTestEmail() {
    if (!testTo) return;
    try {
      const result = await testEmail.mutateAsync(testTo);
      if (result.ok) {
        notify(t("test_email_sent"), "success");
      } else {
        notify(t("test_email_failed", { error: result.error ?? "" }), "error");
      }
    } catch {
      notify(t("test_email_failed", { error: "" }), "error");
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <Section title={t("section_smtp")}>
        <Field label={t("smtp_host")}>
          <input
            type="text"
            value={current.smtpHost ?? ""}
            onChange={(e) => set("smtpHost", e.target.value || null)}
            className={inputClass}
          />
        </Field>
        <Field label={t("smtp_port")}>
          <input
            type="number"
            min={1}
            max={65535}
            value={current.smtpPort ?? ""}
            onChange={(e) => set("smtpPort", e.target.value === "" ? null : Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("smtp_username")}>
          <input
            type="text"
            value={current.smtpUsername ?? ""}
            onChange={(e) => set("smtpUsername", e.target.value || null)}
            className={inputClass}
          />
        </Field>
        <Field label={t("smtp_password")}>
          <input
            type="password"
            value={password}
            placeholder={config.smtpPasswordSet ? t("smtp_password_set") : t("smtp_password_unset")}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("smtp_encryption")}>
          <select
            value={current.smtpEncryption ?? "none"}
            onChange={(e) => set("smtpEncryption", e.target.value as "none" | "tls" | "ssl")}
            className={inputClass}
          >
            <option value="none">{t("smtp_encryption_none")}</option>
            <option value="tls">{t("smtp_encryption_tls")}</option>
            <option value="ssl">{t("smtp_encryption_ssl")}</option>
          </select>
        </Field>
        <Field label={t("smtp_from_email")}>
          <input
            type="email"
            value={current.smtpFromEmail ?? ""}
            onChange={(e) => set("smtpFromEmail", e.target.value || null)}
            className={inputClass}
          />
        </Field>
        <Field label={t("smtp_from_name")}>
          <input
            type="text"
            value={current.smtpFromName ?? ""}
            onChange={(e) => set("smtpFromName", e.target.value || null)}
            className={inputClass}
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!dirty || patch.isPending}
            onClick={() => void save()}
            className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
          >
            {patch.isPending ? t("saving") : t("save")}
          </button>
        </div>
      </Section>

      <Section title={t("section_email_test")}>
        <p className="text-sm text-fg-muted">{t("email_test_intro")}</p>
        <div className="flex items-end gap-2">
          <Field label={t("email_test_to")}>
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              className={inputClass}
            />
          </Field>
          <button
            type="button"
            disabled={!testTo || testEmail.isPending}
            onClick={() => void onTestEmail()}
            className="mb-1 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-40"
          >
            {testEmail.isPending ? t("sending") : t("send")}
          </button>
        </div>
      </Section>
    </div>
  );
}
