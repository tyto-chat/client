import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig } from "@/api/adminServerConfig";
import { useAdminBots } from "@/queries/adminUserQueries";
import { usePanelForm } from "./usePanelForm";
import { Section, Field, ToggleField, inputClass } from "./types";

const KEYS = [
  "resetPasswordCodeExpiryMinutes",
  "emailChallengeExpiryMinutes",
  "invitationExpiryHours",
  "validateEmails",
  "digestHour",
  "mediaTokenTtlSeconds",
  "communityEmojiTokenTtlSeconds",
  "defaultBotId",
  "welcomeBotId",
  "autoModeratorBotId",
] as const;

export function AdvancedPanel({
  config,
  onDirtyChange,
}: {
  config: AdminServerConfig;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation("admin");
  const { current, dirty, set, save, saving } = usePanelForm(config, KEYS);
  const { data: bots, isLoading: botsLoading } = useAdminBots();

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <Section title={t("section_auth_codes")}>
        <ToggleField
          label={t("validate_emails")}
          hint={t("validate_emails_hint")}
          value={current.validateEmails}
          onChange={(v) => set("validateEmails", v)}
        />
        <Field label={t("reset_password_code_expiry_minutes")} hint={t("expiry_minutes_hint")}>
          <input
            type="number"
            min={1}
            max={1440}
            value={current.resetPasswordCodeExpiryMinutes}
            onChange={(e) => set("resetPasswordCodeExpiryMinutes", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("email_challenge_expiry_minutes")} hint={t("expiry_minutes_hint")}>
          <input
            type="number"
            min={1}
            max={1440}
            value={current.emailChallengeExpiryMinutes}
            onChange={(e) => set("emailChallengeExpiryMinutes", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("invitation_expiry_hours")} hint={t("invitation_expiry_hours_hint")}>
          <input
            type="number"
            min={1}
            max={720}
            value={current.invitationExpiryHours}
            onChange={(e) => set("invitationExpiryHours", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_notifications")}>
        <Field label={t("digest_hour")} hint={t("digest_hour_hint")}>
          <input
            type="number"
            min={0}
            max={23}
            value={current.digestHour}
            onChange={(e) => set("digestHour", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_media_tokens")}>
        <Field label={t("media_token_ttl_seconds")} hint={t("media_token_ttl_hint")}>
          <input
            type="number"
            min={60}
            max={2592000}
            value={current.mediaTokenTtlSeconds}
            onChange={(e) => set("mediaTokenTtlSeconds", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("community_emoji_token_ttl_seconds")} hint={t("emoji_token_ttl_hint")}>
          <input
            type="number"
            min={60}
            max={31536000}
            value={current.communityEmojiTokenTtlSeconds}
            onChange={(e) => set("communityEmojiTokenTtlSeconds", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_bot")}>
        <Field label={t("default_bot")} hint={t("default_bot_hint")}>
          <select
            value={current.defaultBotId}
            onChange={(e) => set("defaultBotId", Number(e.target.value))}
            disabled={botsLoading}
            className={inputClass}
          >
            <option value={0}>{t("bot_none")}</option>
            {bots?.rows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.displayName ?? `#${b.id}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("welcome_bot")} hint={t("welcome_bot_hint")}>
          <select
            value={current.welcomeBotId}
            onChange={(e) => set("welcomeBotId", Number(e.target.value))}
            disabled={botsLoading}
            className={inputClass}
          >
            <option value={0}>{t("bot_none_use_default")}</option>
            {bots?.rows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.displayName ?? `#${b.id}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("auto_moderator_bot")} hint={t("auto_moderator_bot_hint")}>
          <select
            value={current.autoModeratorBotId}
            onChange={(e) => set("autoModeratorBotId", Number(e.target.value))}
            disabled={botsLoading}
            className={inputClass}
          >
            <option value={0}>{t("bot_none_use_default")}</option>
            {bots?.rows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.displayName ?? `#${b.id}`}
              </option>
            ))}
          </select>
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
