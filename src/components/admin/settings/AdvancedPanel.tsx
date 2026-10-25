import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig } from "@/api/adminServerConfig";
import { useAdminBots } from "@/queries/adminUserQueries";
import { useConfirm } from "@/hooks/useConfirm";
import { usePanelForm } from "./usePanelForm";
import { Section, Field, ToggleField, inputClass } from "./types";

const KEYS = [
  "resetPasswordCodeExpiryMinutes",
  "emailChallengeExpiryMinutes",
  "invitationExpiryHours",
  "realtimeTokenTtlMinutes",
  "validateEmails",
  "digestHour",
  "mediaTokenTtlSeconds",
  "communityEmojiTokenTtlSeconds",
  "httpCachePageTtlSeconds",
  "httpCachePresenceTtlSeconds",
  "httpCacheContextTtlSeconds",
  "defaultBotId",
  "welcomeBotId",
  "autoModeratorBotId",
] as const;

const CACHE_KEYS = [
  "httpCachePageTtlSeconds",
  "httpCachePresenceTtlSeconds",
  "httpCacheContextTtlSeconds",
] as const;

const CACHE_FIELDS = [
  {
    key: "httpCachePageTtlSeconds",
    label: "http_cache_page_ttl_seconds",
    hint: "http_cache_page_ttl_hint",
    max: 31536000,
  },
  {
    key: "httpCachePresenceTtlSeconds",
    label: "http_cache_presence_ttl_seconds",
    hint: "http_cache_presence_ttl_hint",
    max: 3600,
  },
  {
    key: "httpCacheContextTtlSeconds",
    label: "http_cache_context_ttl_seconds",
    hint: "http_cache_context_ttl_hint",
    max: 86400,
  },
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
  const { confirm, confirmDialog } = useConfirm();
  const [cacheUnlocked, setCacheUnlocked] = useState(false);

  const cacheChanged = CACHE_KEYS.some((k) => current[k] !== config[k]);

  async function handleSave() {
    if (cacheChanged) {
      const ok = await confirm({
        title: t("http_cache_confirm_title"),
        message: t("http_cache_confirm_message"),
        confirmLabel: t("http_cache_confirm_label"),
        destructive: true,
      });
      if (!ok) return;
    }
    await save();
  }

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

      <Section title={t("section_realtime")}>
        <Field label={t("realtime_token_ttl_minutes")} hint={t("realtime_token_ttl_hint")}>
          <input
            type="number"
            min={5}
            max={240}
            value={current.realtimeTokenTtlMinutes}
            onChange={(e) => set("realtimeTokenTtlMinutes", Number(e.target.value))}
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

      <Section title={t("section_http_cache")}>
        <p
          role="note"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-fg"
        >
          {t("http_cache_warning")}
        </p>
        <label className="flex items-center gap-2 text-sm font-medium text-fg">
          <input
            type="checkbox"
            checked={cacheUnlocked}
            onChange={(e) => setCacheUnlocked(e.target.checked)}
          />
          {t("http_cache_unlock")}
        </label>
        {CACHE_FIELDS.map((f) => (
          <Field key={f.key} label={t(f.label)} hint={t(f.hint)}>
            <input
              type="number"
              min={0}
              max={f.max}
              disabled={!cacheUnlocked}
              value={current[f.key]}
              onChange={(e) => set(f.key, Number(e.target.value))}
              className={inputClass}
            />
          </Field>
        ))}
        <div>
          <button
            type="button"
            disabled={!cacheUnlocked}
            onClick={() => CACHE_KEYS.forEach((k) => set(k, 0))}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger ring-1 ring-inset ring-danger/40 transition hover:bg-danger/10 disabled:opacity-40"
          >
            {t("http_cache_disable")}
          </button>
        </div>
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
          onClick={() => void handleSave()}
          className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}
