import { useTranslation } from "react-i18next";
import { setBackgroundBlur, useBackgroundBlur } from "@/utils/mediaEffects";

export function BlurLevelPicker() {
  const { t } = useTranslation("settings");
  const blur = useBackgroundBlur();
  return (
    <div className="flex gap-2">
      {(["off", "light", "strong"] as const).map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => setBackgroundBlur(level)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            blur === level
              ? "border-[var(--accent)] bg-[var(--accent-strong)] text-[var(--accent-on)]"
              : "border-line bg-surface text-fg hover:bg-raised"
          }`}
        >
          {t(`blur_${level}`)}
        </button>
      ))}
    </div>
  );
}
