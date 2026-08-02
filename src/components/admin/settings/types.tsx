/* eslint-disable react-refresh/only-export-components */
import type React from "react";
import type { AdminServerConfig, AdminServerConfigPatch } from "@/api/adminServerConfig";

export function toForm(cfg: AdminServerConfig) {
  return {
    serverName: cfg.serverName,
    serverDescription: cfg.serverDescription,
    accentColor: cfg.accentColor,
    registrationEnabled: cfg.registrationEnabled,
    defaultLocale: cfg.defaultLocale,
    defaultAttachmentRetentionDays: cfg.defaultAttachmentRetentionDays,
    maxAttachmentSizeMb: cfg.maxAttachmentSizeMb,
    maxAttachmentsPerMessage: cfg.maxAttachmentsPerMessage,
    defaultWelcomeChannelName: cfg.defaultWelcomeChannelName,
    rateLoginLimit: cfg.rateLoginLimit,
    rateLoginIntervalSeconds: cfg.rateLoginIntervalSeconds,
    rateRegisterLimit: cfg.rateRegisterLimit,
    rateRegisterIntervalSeconds: cfg.rateRegisterIntervalSeconds,
    rateApiWriteLimit: cfg.rateApiWriteLimit,
    rateApiWriteIntervalSeconds: cfg.rateApiWriteIntervalSeconds,
    rateAttachmentUploadLimit: cfg.rateAttachmentUploadLimit,
    rateAttachmentUploadIntervalSeconds: cfg.rateAttachmentUploadIntervalSeconds,
  };
}

export type FormState = ReturnType<typeof toForm>;

export function diffPatch(initial: FormState, current: FormState): AdminServerConfigPatch {
  const patch: AdminServerConfigPatch = {};
  (Object.keys(current) as Array<keyof FormState>).forEach((key) => {
    if (current[key] !== initial[key]) {
      (patch[key] as FormState[typeof key]) = current[key];
    }
  });
  return patch;
}

export const inputClass =
  "block w-full rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] dark:text-white";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-muted">{hint}</span>}
    </label>
  );
}

export function RateLimitPair({
  labelLimit,
  labelInterval,
  limit,
  interval,
  onLimit,
  onInterval,
  maxLimit,
  inputClass,
}: {
  labelLimit: string;
  labelInterval: string;
  limit: number;
  interval: number;
  onLimit: (v: number) => void;
  onInterval: (v: number) => void;
  maxLimit: number;
  inputClass: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={labelLimit}>
        <input
          type="number"
          min={1}
          max={maxLimit}
          value={limit}
          onChange={(e) => onLimit(Number(e.target.value))}
          className={inputClass}
        />
      </Field>
      <Field label={labelInterval}>
        <input
          type="number"
          min={10}
          max={86400}
          value={interval}
          onChange={(e) => onInterval(Number(e.target.value))}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

export function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          value ? "bg-[var(--accent)]" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            value ? "translate-x-4" : ""
          }`}
        />
      </button>
      <span className="flex cursor-pointer flex-col" onClick={() => onChange(!value)}>
        <span className="font-medium text-fg">{label}</span>
        {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </span>
    </div>
  );
}

export type SettingsPatch = AdminServerConfigPatch;
