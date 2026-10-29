import { useTranslation } from "react-i18next";
import { LockIcon } from "@/components/icons";

export const LIMITATION_KEYS = [
  "e2ee_limitation_1",
  "e2ee_limitation_2",
  "e2ee_limitation_3",
  "e2ee_limitation_4",
  "e2ee_limitation_5",
  "e2ee_limitation_6",
  "e2ee_limitation_7",
  "e2ee_limitation_8",
  "e2ee_limitation_9",
  "e2ee_limitation_10",
] as const;

export function EncryptionOutcome() {
  const { t } = useTranslation("conversation");
  return (
    <section
      data-testid="e2ee-outcome-encrypted"
      className="space-y-2 rounded-lg border border-line bg-surface px-3 py-2.5"
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <LockIcon size={13} className="text-accent" />
        <span className="block cap-trim">{t("e2ee_outcome_encrypted")}</span>
      </p>
      <details className="text-xs text-fg-muted">
        <summary className="cursor-pointer select-none font-medium text-fg-muted hover:text-fg">
          {t("e2ee_limitations_title")}
        </summary>
        <ul data-testid="e2ee-limitations" className="mt-1.5 list-disc space-y-1 pl-4">
          {LIMITATION_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
