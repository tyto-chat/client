import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig } from "@/api/adminServerConfig";
import { usePanelForm } from "./usePanelForm";
import { Section, Field, ToggleField, inputClass } from "./types";

const KEYS = [
  "maxAttachmentSizeMb",
  "maxAttachmentsPerMessage",
  "defaultAttachmentRetentionDays",
  "attachmentAllowedMimes",
  "avatarMaxSizeMb",
  "avatarMaxWidth",
  "avatarMaxHeight",
  "logoMaxSizeMb",
  "logoMaxWidth",
  "logoMaxHeight",
  "communityEmojiMaxSizeMb",
  "communityEmojiAllowedMimes",
  "diskPurgeTriggerPercent",
  "diskPurgeTargetPercent",
  "diskPurgeMinAgeDays",
  "diskPurgeIncludeDms",
] as const;

export function AttachmentsPanel({
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
      <Section title={t("section_attachments")}>
        <Field label={t("max_attachment_size_mb")}>
          <input
            type="number"
            min={1}
            max={1024}
            value={current.maxAttachmentSizeMb}
            onChange={(e) => set("maxAttachmentSizeMb", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("max_attachments_per_message")}>
          <input
            type="number"
            min={1}
            max={50}
            value={current.maxAttachmentsPerMessage}
            onChange={(e) => set("maxAttachmentsPerMessage", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field
          label={t("default_attachment_retention_days")}
          hint={t("default_attachment_retention_hint")}
        >
          <input
            type="number"
            min={1}
            max={3650}
            placeholder={t("forever")}
            value={current.defaultAttachmentRetentionDays ?? ""}
            onChange={(e) =>
              set(
                "defaultAttachmentRetentionDays",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className={inputClass}
          />
        </Field>
        <Field label={t("attachment_allowed_mimes")} hint={t("mime_types_hint")}>
          <input
            type="text"
            value={current.attachmentAllowedMimes}
            onChange={(e) => set("attachmentAllowedMimes", e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_avatars_logos")}>
        <Field label={t("avatar_max_size_mb")}>
          <input
            type="number"
            min={1}
            max={100}
            value={current.avatarMaxSizeMb}
            onChange={(e) => set("avatarMaxSizeMb", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("avatar_max_width")}>
          <input
            type="number"
            min={16}
            max={8192}
            value={current.avatarMaxWidth}
            onChange={(e) => set("avatarMaxWidth", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("avatar_max_height")}>
          <input
            type="number"
            min={16}
            max={8192}
            value={current.avatarMaxHeight}
            onChange={(e) => set("avatarMaxHeight", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("logo_max_size_mb")}>
          <input
            type="number"
            min={1}
            max={100}
            value={current.logoMaxSizeMb}
            onChange={(e) => set("logoMaxSizeMb", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("logo_max_width")}>
          <input
            type="number"
            min={16}
            max={8192}
            value={current.logoMaxWidth}
            onChange={(e) => set("logoMaxWidth", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("logo_max_height")}>
          <input
            type="number"
            min={16}
            max={8192}
            value={current.logoMaxHeight}
            onChange={(e) => set("logoMaxHeight", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_emoji")}>
        <Field label={t("community_emoji_max_size_mb")}>
          <input
            type="number"
            min={1}
            max={100}
            value={current.communityEmojiMaxSizeMb}
            onChange={(e) => set("communityEmojiMaxSizeMb", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label={t("community_emoji_allowed_mimes")} hint={t("mime_types_hint")}>
          <input
            type="text"
            value={current.communityEmojiAllowedMimes}
            onChange={(e) => set("communityEmojiAllowedMimes", e.target.value)}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t("section_disk_purge")}>
        <p className="text-xs text-fg-subtle">{t("disk_purge_hint")}</p>
        <Field label={t("disk_purge_trigger_percent")} hint={t("disk_purge_trigger_hint")}>
          <input
            type="number"
            min={0}
            max={90}
            value={current.diskPurgeTriggerPercent}
            onChange={(e) =>
              set("diskPurgeTriggerPercent", Math.max(0, Number(e.target.value) || 0))
            }
            className={inputClass}
          />
        </Field>
        <Field label={t("disk_purge_target_percent")} hint={t("disk_purge_target_hint")}>
          <input
            type="number"
            min={1}
            max={95}
            value={current.diskPurgeTargetPercent}
            onChange={(e) =>
              set("diskPurgeTargetPercent", Math.max(1, Number(e.target.value) || 0))
            }
            className={inputClass}
          />
        </Field>
        <Field label={t("disk_purge_min_age_days")} hint={t("disk_purge_min_age_hint")}>
          <input
            type="number"
            min={0}
            max={3650}
            value={current.diskPurgeMinAgeDays}
            onChange={(e) => set("diskPurgeMinAgeDays", Math.max(0, Number(e.target.value) || 0))}
            className={inputClass}
          />
        </Field>
        <ToggleField
          label={t("disk_purge_include_dms")}
          hint={t("disk_purge_include_dms_hint")}
          value={current.diskPurgeIncludeDms}
          onChange={(v) => set("diskPurgeIncludeDms", v)}
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
