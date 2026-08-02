import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig } from "@/api/adminServerConfig";
import { usePanelForm } from "./usePanelForm";
import { Section, Field, ToggleField, inputClass } from "./types";

const KEYS = [
  "autoTimeoutEnabled",
  "autoTimeoutHits",
  "autoTimeoutWindowSeconds",
  "autoTimeoutDurationSeconds",
  "autoTimeoutProgressive",
  "autoTimeoutResetSeconds",
  "autoTimeoutMaxSeconds",
  "ipReputationEnabled",
  "ipReputationEndpoint",
  "ipReputationConfidenceMin",
  "ipReputationCheckUsername",
  "ipReputationAllowlist",
  "ipReputationAppealContact",
] as const;

export function ModerationPanel({
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
      <Section title={t("section_auto_timeout")}>
        <ToggleField
          label={t("auto_timeout_enabled")}
          value={current.autoTimeoutEnabled}
          onChange={(v) => set("autoTimeoutEnabled", v)}
        />
        <ToggleField
          label={t("auto_timeout_progressive")}
          hint={t("auto_timeout_progressive_hint")}
          value={current.autoTimeoutProgressive}
          onChange={(v) => set("autoTimeoutProgressive", v)}
        />
        <Field label={t("auto_timeout_hits")} hint={t("auto_timeout_hits_hint")}>
          <input
            type="number"
            min={1}
            max={1000}
            value={current.autoTimeoutHits}
            onChange={(e) => set("autoTimeoutHits", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("auto_timeout_window_seconds")} hint={t("auto_timeout_window_hint")}>
          <input
            type="number"
            min={10}
            max={86400}
            value={current.autoTimeoutWindowSeconds}
            onChange={(e) => set("autoTimeoutWindowSeconds", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("auto_timeout_duration_seconds")} hint={t("auto_timeout_duration_hint")}>
          <input
            type="number"
            min={10}
            max={604800}
            value={current.autoTimeoutDurationSeconds}
            onChange={(e) => set("autoTimeoutDurationSeconds", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("auto_timeout_reset_seconds")} hint={t("auto_timeout_reset_hint")}>
          <input
            type="number"
            min={10}
            max={604800}
            value={current.autoTimeoutResetSeconds}
            onChange={(e) => set("autoTimeoutResetSeconds", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("auto_timeout_max_seconds")} hint={t("auto_timeout_max_hint")}>
          <input
            type="number"
            min={60}
            max={2592000}
            value={current.autoTimeoutMaxSeconds}
            onChange={(e) => set("autoTimeoutMaxSeconds", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_ip_reputation")}>
        <ToggleField
          label={t("ip_reputation_enabled")}
          hint={t("ip_reputation_enabled_hint")}
          value={current.ipReputationEnabled}
          onChange={(v) => set("ipReputationEnabled", v)}
        />
        <Field
          label={t("ip_reputation_confidence_min")}
          hint={t("ip_reputation_confidence_min_hint")}
        >
          <input
            type="number"
            min={0}
            max={100}
            value={current.ipReputationConfidenceMin}
            onChange={(e) => set("ipReputationConfidenceMin", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <ToggleField
          label={t("ip_reputation_check_username")}
          value={current.ipReputationCheckUsername}
          onChange={(v) => set("ipReputationCheckUsername", v)}
        />
        <Field label={t("ip_reputation_allowlist")} hint={t("ip_reputation_allowlist_hint")}>
          <textarea
            rows={5}
            value={current.ipReputationAllowlist}
            onChange={(e) => set("ipReputationAllowlist", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label={t("ip_reputation_appeal_contact")}
          hint={t("ip_reputation_appeal_contact_hint")}
        >
          <input
            type="text"
            value={current.ipReputationAppealContact}
            onChange={(e) => set("ipReputationAppealContact", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("ip_reputation_endpoint")} hint={t("ip_reputation_endpoint_hint")}>
          <input
            type="text"
            value={current.ipReputationEndpoint}
            onChange={(e) => set("ipReputationEndpoint", e.target.value)}
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
