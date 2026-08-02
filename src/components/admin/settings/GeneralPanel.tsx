import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig } from "@/api/adminServerConfig";
import type { CommunityLocale } from "@/types/api";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { usePanelForm } from "./usePanelForm";
import { Section, Field, ToggleField, inputClass } from "./types";

const KEYS = [
  "serverName",
  "serverDescription",
  "accentColor",
  "defaultLocale",
  "registrationEnabled",
  "listInServerCatalogue",
  "messageRetentionDays",
  "notificationRetentionDays",
  "archivedChannelRetentionDays",
  "defaultWelcomeChannelName",
] as const;

export function GeneralPanel({
  config,
  onDirtyChange,
}: {
  config: AdminServerConfig;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation("admin");
  const { current, dirty, set, save, saving } = usePanelForm(config, KEYS);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <Section title={t("section_branding")}>
        <Field label={t("server_name")}>
          <input
            type="text"
            value={current.serverName}
            onChange={(e) => set("serverName", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("server_description")} hint={t("server_description_hint")}>
          <textarea
            rows={3}
            maxLength={2000}
            value={current.serverDescription}
            onChange={(e) => set("serverDescription", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("accent_color")} hint={t("accent_color_hint")}>
          <input
            type="text"
            placeholder="#22d3ee"
            value={current.accentColor ?? ""}
            onChange={(e) => set("accentColor", e.target.value || null)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_signup")}>
        <ToggleField
          label={t("registration_enabled")}
          hint={t("registration_enabled_hint")}
          value={current.registrationEnabled}
          onChange={(v) => set("registrationEnabled", v)}
        />
        <ToggleField
          label={t("catalogue_listing")}
          hint={t("catalogue_listing_hint")}
          value={current.listInServerCatalogue}
          onChange={(v) => set("listInServerCatalogue", v)}
        />
      </Section>

      <Section title={t("section_retention")}>
        <p className="text-xs text-fg-subtle">{t("retention_cron_hint")}</p>
        <Field label={t("message_retention_days")} hint={t("message_retention_days_hint")}>
          <input
            type="number"
            min={0}
            max={3650}
            value={current.messageRetentionDays}
            onChange={(e) => set("messageRetentionDays", Math.max(0, Number(e.target.value) || 0))}
            className={inputClass}
          />
        </Field>
        <Field
          label={t("notification_retention_days")}
          hint={t("notification_retention_days_hint")}
        >
          <input
            type="number"
            min={0}
            max={3650}
            value={current.notificationRetentionDays}
            onChange={(e) =>
              set("notificationRetentionDays", Math.max(0, Number(e.target.value) || 0))
            }
            className={inputClass}
          />
        </Field>
        <Field
          label={t("archived_channel_retention_days")}
          hint={t("archived_channel_retention_days_hint")}
        >
          <input
            type="number"
            min={0}
            max={3650}
            value={current.archivedChannelRetentionDays}
            onChange={(e) =>
              set("archivedChannelRetentionDays", Math.max(0, Number(e.target.value) || 0))
            }
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_defaults")}>
        <Field label={t("default_locale")}>
          <select
            value={current.defaultLocale}
            onChange={(e) => set("defaultLocale", e.target.value as CommunityLocale)}
            className={inputClass}
          >
            {SUPPORTED_LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("default_welcome_channel_name")}>
          <input
            type="text"
            value={current.defaultWelcomeChannelName}
            onChange={(e) => set("defaultWelcomeChannelName", e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
