import { useTranslation } from "react-i18next";
import type { EncryptedDmsMode } from "@/types/api";

const MODES: readonly EncryptedDmsMode[] = ["disabled", "enabled", "required"];
const UNAVAILABLE: ReadonlySet<EncryptedDmsMode> = new Set(["required"]);

export function EncryptedDmsModeField({
  value,
  onChange,
}: {
  value: EncryptedDmsMode;
  onChange: (mode: EncryptedDmsMode) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t("section_encrypted_dms")}</legend>
      {MODES.map((mode) => {
        const unavailable = UNAVAILABLE.has(mode);
        return (
          <label
            key={mode}
            className={`flex gap-3 rounded-lg p-3 ring-1 ring-inset ring-line ${
              unavailable ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-surface"
            }`}
          >
            <input
              type="radio"
              name="encryptedDmsMode"
              value={mode}
              checked={value === mode}
              disabled={unavailable}
              onChange={() => onChange(mode)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-fg">{t(`encrypted_dms_${mode}`)}</span>
              <span className="text-xs text-fg-muted">{t(`encrypted_dms_${mode}_hint`)}</span>
              {unavailable && (
                <span className="text-xs font-medium text-fg-subtle">
                  {t("encrypted_dms_required_unavailable")}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
