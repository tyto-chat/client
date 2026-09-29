import { useTranslation } from "react-i18next";
import { SettingRow } from "@/components/preferences/SettingRow";
import { sectionHeading } from "@/components/preferences/panelStyles";
import { Switch } from "@/components/ui/Switch";
import { playTestSound } from "@/sounds/sounds";
import { updateSoundSettings, useSoundSettings } from "@/sounds/soundSettings";

export function SoundsSection() {
  const { t } = useTranslation("settings");
  const settings = useSoundSettings();

  return (
    <section>
      <h3 className={sectionHeading}>{t("sounds_heading")}</h3>
      <div className="flex flex-col gap-2">
        <SettingRow label={t("call_sounds")} hint={t("call_sounds_hint")}>
          <button
            type="button"
            aria-label={t("sound_test_call_label")}
            data-testid="sounds-test-call"
            onClick={() => playTestSound("join")}
            className="rounded-md border border-line-strong bg-raised px-2 py-1 text-xs font-medium text-fg hover:bg-surface"
          >
            {t("sound_test")}
          </button>
          <Switch
            checked={settings.callSounds}
            onChange={() => updateSoundSettings({ callSounds: !settings.callSounds })}
            label={t("call_sounds")}
            testId="sounds-call-toggle"
          />
        </SettingRow>
        <SettingRow label={t("notification_sounds")} hint={t("notification_sounds_hint")}>
          <button
            type="button"
            aria-label={t("sound_test_notification_label")}
            data-testid="sounds-test-notification"
            onClick={() => playTestSound("notification")}
            className="rounded-md border border-line-strong bg-raised px-2 py-1 text-xs font-medium text-fg hover:bg-surface"
          >
            {t("sound_test")}
          </button>
          <Switch
            checked={settings.notificationSounds}
            onChange={() =>
              updateSoundSettings({ notificationSounds: !settings.notificationSounds })
            }
            label={t("notification_sounds")}
            testId="sounds-notification-toggle"
          />
        </SettingRow>
        <SettingRow label={t("sound_volume")}>
          <input
            id="sounds-volume"
            type="range"
            min="0"
            max="100"
            step="1"
            value={settings.volume}
            aria-label={t("sound_volume")}
            data-testid="sounds-volume"
            onChange={(e) => updateSoundSettings({ volume: Number(e.target.value) })}
            className="w-32 accent-[var(--accent)] max-md:w-full"
          />
          <span className="text-xs tabular-nums text-fg-subtle">{settings.volume}</span>
        </SettingRow>
      </div>
    </section>
  );
}
