import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminServerConfig } from "@/api/adminServerConfig";
import type { LegalDocumentType } from "@/types/api";
import { fetchLegalDocument } from "@/api/legal";
import { usePanelForm } from "./usePanelForm";
import { Section, Field, ToggleField, inputClass } from "./types";

const KEYS = [
  "termsContent",
  "privacyContent",
  "legalContactEmail",
  "requireRegistrationConsent",
  "minimumAgeYears",
] as const;

export function LegalPanel({
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
      <Section title={t("section_legal")}>
        <LegalDocEditor
          type="terms"
          label={t("terms_document")}
          value={current.termsContent}
          onChange={(v) => set("termsContent", v)}
        />
        <LegalDocEditor
          type="privacy"
          label={t("privacy_document")}
          value={current.privacyContent}
          onChange={(v) => set("privacyContent", v)}
        />
        <ToggleField
          label={t("require_consent")}
          hint={t("require_consent_hint")}
          value={current.requireRegistrationConsent}
          onChange={(v) => set("requireRegistrationConsent", v)}
        />
        <Field label={t("legal_contact_email")} hint={t("legal_contact_email_hint")}>
          <input
            type="email"
            placeholder="legal@example.com"
            value={current.legalContactEmail ?? ""}
            onChange={(e) => set("legalContactEmail", e.target.value || null)}
            className={inputClass}
          />
        </Field>
        <Field label={t("minimum_age")} hint={t("minimum_age_hint")}>
          <input
            type="number"
            min={0}
            max={25}
            value={current.minimumAgeYears}
            onChange={(e) => set("minimumAgeYears", Math.max(0, Number(e.target.value) || 0))}
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

function LegalDocEditor({
  type,
  label,
  value,
  onChange,
}: {
  type: LegalDocumentType;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("admin");
  const usingDefault = value.trim().length === 0;
  const [defaultText, setDefaultText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLegalDocument(type, "default").then((doc) => {
      if (!cancelled) setDefaultText(doc.content);
    });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const display = usingDefault ? (defaultText ?? "") : value;
  const loadingDefault = usingDefault && defaultText === null;

  return (
    <Field label={label} hint={usingDefault ? t("legal_doc_default_in_use") : undefined}>
      <textarea
        rows={10}
        maxLength={100000}
        value={display}
        disabled={loadingDefault}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("legal_doc_placeholder")}
        className={`${inputClass} font-mono text-xs`}
      />
      {!usingDefault && (
        <div className="mt-1.5 flex gap-3">
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-fg-muted hover:underline"
          >
            {t("legal_doc_reset")}
          </button>
        </div>
      )}
    </Field>
  );
}
