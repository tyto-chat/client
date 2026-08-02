import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig } from "@/api/adminServerConfig";
import { usePanelForm } from "./usePanelForm";
import { Section, RateLimitPair, inputClass } from "./types";

const KEYS = [
  "rateLoginLimit",
  "rateLoginIntervalSeconds",
  "rateSessionRefreshLimit",
  "rateSessionRefreshIntervalSeconds",
  "rateRegisterLimit",
  "rateRegisterIntervalSeconds",
  "rateApiWriteLimit",
  "rateApiWriteIntervalSeconds",
  "rateMessageSendLimit",
  "rateMessageSendIntervalSeconds",
  "rateAttachmentUploadLimit",
  "rateAttachmentUploadIntervalSeconds",
  "rateSearchLimit",
  "rateSearchIntervalSeconds",
] as const;

export function RateLimitsPanel({
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
      <Section title={t("section_rate_limits")}>
        <p className="text-xs text-fg-muted">{t("rate_limits_intro")}</p>
        <RateLimitPair
          labelLimit={t("rate_login_limit")}
          labelInterval={t("rate_login_interval")}
          limit={current.rateLoginLimit}
          interval={current.rateLoginIntervalSeconds}
          onLimit={(v) => set("rateLoginLimit", v)}
          onInterval={(v) => set("rateLoginIntervalSeconds", v)}
          maxLimit={1000}
          inputClass={inputClass}
        />
        <RateLimitPair
          labelLimit={t("rate_session_refresh_limit")}
          labelInterval={t("rate_session_refresh_interval")}
          limit={current.rateSessionRefreshLimit}
          interval={current.rateSessionRefreshIntervalSeconds}
          onLimit={(v) => set("rateSessionRefreshLimit", v)}
          onInterval={(v) => set("rateSessionRefreshIntervalSeconds", v)}
          maxLimit={1000}
          inputClass={inputClass}
        />
        <RateLimitPair
          labelLimit={t("rate_register_limit")}
          labelInterval={t("rate_register_interval")}
          limit={current.rateRegisterLimit}
          interval={current.rateRegisterIntervalSeconds}
          onLimit={(v) => set("rateRegisterLimit", v)}
          onInterval={(v) => set("rateRegisterIntervalSeconds", v)}
          maxLimit={1000}
          inputClass={inputClass}
        />
        <RateLimitPair
          labelLimit={t("rate_api_write_limit")}
          labelInterval={t("rate_api_write_interval")}
          limit={current.rateApiWriteLimit}
          interval={current.rateApiWriteIntervalSeconds}
          onLimit={(v) => set("rateApiWriteLimit", v)}
          onInterval={(v) => set("rateApiWriteIntervalSeconds", v)}
          maxLimit={10000}
          inputClass={inputClass}
        />
        <RateLimitPair
          labelLimit={t("rate_message_send_limit")}
          labelInterval={t("rate_message_send_interval")}
          limit={current.rateMessageSendLimit}
          interval={current.rateMessageSendIntervalSeconds}
          onLimit={(v) => set("rateMessageSendLimit", v)}
          onInterval={(v) => set("rateMessageSendIntervalSeconds", v)}
          maxLimit={10000}
          inputClass={inputClass}
        />
        <RateLimitPair
          labelLimit={t("rate_attachment_upload_limit")}
          labelInterval={t("rate_attachment_upload_interval")}
          limit={current.rateAttachmentUploadLimit}
          interval={current.rateAttachmentUploadIntervalSeconds}
          onLimit={(v) => set("rateAttachmentUploadLimit", v)}
          onInterval={(v) => set("rateAttachmentUploadIntervalSeconds", v)}
          maxLimit={1000}
          inputClass={inputClass}
        />
        <RateLimitPair
          labelLimit={t("rate_search_limit")}
          labelInterval={t("rate_search_interval")}
          limit={current.rateSearchLimit}
          interval={current.rateSearchIntervalSeconds}
          onLimit={(v) => set("rateSearchLimit", v)}
          onInterval={(v) => set("rateSearchIntervalSeconds", v)}
          maxLimit={10000}
          inputClass={inputClass}
        />
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
