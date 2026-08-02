import { useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Webhook, WebhookTrigger } from "@/api/webhooks";
import { triggerLabel, triggerDescription } from "@/utils/webhookTriggerLabel";
import { useAdminCommunities } from "@/queries/adminCommunityQueries";
import { fetchCommunity } from "@/api/communities";
import { queryKeys } from "@/queries/queryKeys";
import { UnifiedEmojiPicker } from "@/components/chat/UnifiedEmojiPicker";
import { useClickOutside } from "@/hooks/useClickOutside";
import { SmileIcon } from "@/components/icons";
import type { AdminCommunityRow } from "@/api/adminCommunities";
import type { Channel } from "@/types/api";

interface FormValues {
  name: string;
  url: string;
  triggerKey: string;
  filters: Record<string, string>;
  isActive: boolean;
}

export interface WebhookFormSubmit {
  name: string;
  url: string;
  triggerKey: string;
  filters: Record<string, unknown> | null;
  isActive?: boolean;
}

interface Props {
  initial?: Webhook;
  triggers: WebhookTrigger[];
  onSubmit: (values: WebhookFormSubmit) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const ACTION_TYPES = ["warn", "timeout", "ban", "server_ban"] as const;

function currentTriggerOf(triggers: WebhookTrigger[], key: string): WebhookTrigger | undefined {
  return triggers.find((t) => t.key === key);
}

function buildInitialFilters(
  webhook: Webhook | undefined,
  triggerKey: string,
  triggers: WebhookTrigger[],
): Record<string, string> {
  const trigger = triggers.find((t) => t.key === triggerKey);
  if (!trigger) return {};
  const result: Record<string, string> = {};
  for (const field of trigger.filterFields) {
    const existing = webhook?.filters?.[field];
    result[field] = existing != null ? String(existing) : "";
  }
  return result;
}

export function WebhookForm({ initial, triggers, onSubmit, onCancel, isSubmitting }: Props) {
  const { t } = useTranslation("admin");

  const defaultTriggerKey = initial?.triggerKey ?? triggers[0]?.key ?? "";

  const [values, setValues] = useState<FormValues>({
    name: initial?.name ?? "",
    url: initial?.url ?? "",
    triggerKey: defaultTriggerKey,
    filters: buildInitialFilters(initial, defaultTriggerKey, triggers),
    isActive: initial?.isActive ?? true,
  });
  const [filterError, setFilterError] = useState<string | null>(null);

  function handleTriggerChange(key: string) {
    setFilterError(null);
    setValues((prev) => ({
      ...prev,
      triggerKey: key,
      filters: buildInitialFilters(undefined, key, triggers),
    }));
  }

  const triggerKey = values.triggerKey !== "" ? values.triggerKey : (triggers[0]?.key ?? "");

  function setFilter(field: string, value: string) {
    setValues((prev) => {
      const filters = { ...prev.filters, [field]: value };
      if (field === "communityId" && "channelId" in filters) {
        filters.channelId = "";
      }
      return { ...prev, filters };
    });
  }

  const { data: communitiesData } = useAdminCommunities({ perPage: 100 });
  const communities = communitiesData?.rows ?? [];
  const selectedCommunity = communities.find(
    (c) => String(c.id) === (values.filters.communityId ?? ""),
  );
  const wantsChannels = currentTriggerOf(triggers, triggerKey)?.filterFields.includes("channelId");
  const { data: communityDetail } = useQuery({
    queryKey: queryKeys.community(selectedCommunity?.identifier ?? ""),
    queryFn: () => fetchCommunity(selectedCommunity?.identifier ?? ""),
    enabled: Boolean(wantsChannels && selectedCommunity),
  });
  const channels = (communityDetail?.channels ?? []).filter((c) => c.type !== "audio");

  function set(field: keyof FormValues, value: string | boolean) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filters: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values.filters)) {
      if (v !== "") filters[k] = v;
    }
    const required = triggers.find((tr) => tr.key === triggerKey)?.requiredFilterFields ?? [];
    const missing = required.filter((f) => !(f in filters));
    if (missing.length > 0) {
      setFilterError(
        t("webhook_filter_required_error", {
          fields: missing.map((f) => t(`webhook_filter_${f}`, { defaultValue: f })).join(", "),
        }),
      );
      return;
    }
    setFilterError(null);
    const payload: WebhookFormSubmit = {
      name: values.name,
      url: values.url,
      triggerKey,
      filters: Object.keys(filters).length > 0 ? filters : null,
    };
    if (initial !== undefined) {
      payload.isActive = values.isActive;
    }
    await onSubmit(payload);
  }

  const currentTrigger = currentTriggerOf(triggers, triggerKey);
  const isEdit = initial !== undefined;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-fg-muted">
          {t("webhook_field_name")}
        </label>
        <input
          type="text"
          required
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          className="w-full rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
          placeholder={t("webhook_field_name_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-fg-muted">
          {t("webhook_field_url")}
        </label>
        <input
          type="url"
          required
          value={values.url}
          onChange={(e) => set("url", e.target.value)}
          className="w-full rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
          placeholder="https://example.com/webhook"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-fg-muted">
          {t("webhook_field_trigger")}
        </label>
        <select
          value={triggerKey}
          onChange={(e) => handleTriggerChange(e.target.value)}
          disabled={isEdit}
          className="w-full rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {triggers.map((tr) => (
            <option key={tr.key} value={tr.key}>
              {triggerLabel(t, tr)}
            </option>
          ))}
        </select>
        {currentTrigger && (
          <p className="mt-1 text-xs text-fg-muted">{triggerDescription(t, currentTrigger)}</p>
        )}
      </div>
      {currentTrigger && currentTrigger.filterFields.length > 0 && (
        <div className="rounded-md border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t("webhook_filters_heading")}
          </p>
          <div className="flex flex-col gap-3">
            {currentTrigger.filterFields.map((field) => (
              <FilterField
                key={field}
                field={field}
                value={values.filters[field] ?? ""}
                required={currentTrigger.requiredFilterFields.includes(field)}
                onChange={(v) => setFilter(field, v)}
                communities={communities}
                communitySelected={selectedCommunity !== undefined}
                channels={channels}
                t={t}
              />
            ))}
          </div>
          {filterError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{filterError}</p>
          )}
        </div>
      )}
      {isEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="rounded"
          />
          <span className="font-medium text-fg">{t("webhook_field_active")}</span>
        </label>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-fg-muted hover:text-fg dark:hover:text-white"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || triggerKey === ""}
          className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? t("webhook_saving") : isEdit ? t("webhook_save") : t("webhook_create")}
        </button>
      </div>
    </form>
  );
}

interface FilterFieldProps {
  field: string;
  value: string;
  required?: boolean;
  onChange: (v: string) => void;
  communities: AdminCommunityRow[];
  communitySelected: boolean;
  channels: Channel[];
  t: TFunction<"admin">;
}

const FILTER_INPUT_CLASS =
  "w-full rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm";

function FilterField({
  field,
  value,
  required = false,
  onChange,
  communities,
  communitySelected,
  channels,
  t,
}: FilterFieldProps) {
  const baseLabel = t(`webhook_filter_${field}`, { defaultValue: field });
  const label = required ? (
    <>
      {baseLabel} <span className="text-red-500">*</span>
    </>
  ) : (
    baseLabel
  );

  if (field === "actionType") {
    return (
      <div>
        <label className="mb-1 block text-xs text-fg-muted">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={FILTER_INPUT_CLASS}
        >
          <option value="">{t("webhook_filter_any")}</option>
          {ACTION_TYPES.map((at) => (
            <option key={at} value={at}>
              {at}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field === "communityId") {
    const known = communities.some((c) => String(c.id) === value);
    return (
      <div>
        <label className="mb-1 block text-xs text-fg-muted">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={FILTER_INPUT_CLASS}
        >
          <option value="">{t("webhook_filter_any")}</option>
          {value !== "" && !known && <option value={value}>#{value}</option>}
          {communities.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field === "channelId") {
    const known = channels.some((c) => String(c.id) === value);
    return (
      <div>
        <label className="mb-1 block text-xs text-fg-muted">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!communitySelected}
          className={`${FILTER_INPUT_CLASS} disabled:opacity-60`}
        >
          <option value="">{t("webhook_filter_any")}</option>
          {value !== "" && !known && <option value={value}>#{value}</option>}
          {channels.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
        {!communitySelected && (
          <p className="mt-1 text-xs text-fg-subtle">{t("webhook_filter_pick_community_first")}</p>
        )}
      </div>
    );
  }

  if (field === "emoji") {
    return <EmojiFilterField label={label} value={value} onChange={onChange} t={t} />;
  }

  return (
    <div>
      <label className="mb-1 block text-xs text-fg-muted">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FILTER_INPUT_CLASS}
      />
    </div>
  );
}

function EmojiFilterField({
  label,
  value,
  onChange,
  t,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  t: TFunction<"admin">;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapperRef, () => setPickerOpen(false), pickerOpen);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1 block text-xs text-fg-muted">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={FILTER_INPUT_CLASS}
          placeholder={t("webhook_filter_emoji_placeholder")}
        />
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label={t("webhook_filter_emoji_pick")}
          title={t("webhook_filter_emoji_pick")}
          className="rounded-md p-2 text-fg-muted ring-1 ring-inset ring-line hover:bg-surface hover:text-fg"
        >
          <SmileIcon />
        </button>
      </div>
      {pickerOpen && (
        <div className="absolute right-0 top-full z-50 mt-1">
          <UnifiedEmojiPicker
            communityIdentifier={undefined}
            onPick={(v) => {
              onChange(v);
              setPickerOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
