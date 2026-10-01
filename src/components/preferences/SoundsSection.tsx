import { useTranslation } from "react-i18next";
import { SettingRow } from "@/components/preferences/SettingRow";
import { sectionHeading } from "@/components/preferences/panelStyles";
import { Switch } from "@/components/ui/Switch";
import { playRandomSound, playTestSound } from "@/sounds/sounds";
import {
  LENGTH_RANGE,
  PITCH_RANGE,
  updateSoundSettings,
  useSoundSettings,
} from "@/sounds/soundSettings";

const sliderClass = "w-32 accent-[var(--accent)] max-md:w-full";
const valueClass = "w-10 text-right text-xs tabular-nums text-fg-subtle";
const buttonClass =
  "rounded-md border border-line-strong bg-raised px-2 py-1 text-xs font-medium text-fg hover:bg-surface";

function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

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
            className={buttonClass}
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
            className={buttonClass}
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
            aria-valuetext={`${settings.volume}%`}
            data-testid="sounds-volume"
            onChange={(e) => updateSoundSettings({ volume: Number(e.target.value) })}
            className={sliderClass}
          />
          <span className={valueClass}>{settings.volume}</span>
        </SettingRow>
        <SettingRow label={t("sound_pitch")} hint={t("sound_pitch_hint")}>
          <input
            id="sounds-pitch"
            type="range"
            min={PITCH_RANGE.min}
            max={PITCH_RANGE.max}
            step="1"
            value={settings.pitch}
            aria-label={t("sound_pitch")}
            aria-valuetext={signed(settings.pitch)}
            data-testid="sounds-pitch"
            onChange={(e) => updateSoundSettings({ pitch: Number(e.target.value) })}
            className={sliderClass}
          />
          <span className={valueClass} data-testid="sounds-pitch-value">
            {signed(settings.pitch)}
          </span>
        </SettingRow>
        <SettingRow label={t("sound_length")} hint={t("sound_length_hint")}>
          <input
            id="sounds-length"
            type="range"
            min={LENGTH_RANGE.min}
            max={LENGTH_RANGE.max}
            step="10"
            value={settings.length}
            aria-label={t("sound_length")}
            aria-valuetext={`${settings.length}%`}
            data-testid="sounds-length"
            onChange={(e) => updateSoundSettings({ length: Number(e.target.value) })}
            className={sliderClass}
          />
          <span className={valueClass} data-testid="sounds-length-value">
            {`${settings.length}%`}
          </span>
        </SettingRow>
        <SettingRow label={t("sound_random")}>
          <button
            type="button"
            aria-label={t("sound_random_label")}
            data-testid="sounds-test-random"
            onClick={() => playRandomSound()}
            className={buttonClass}
          >
            {t("sound_test")}
          </button>
        </SettingRow>
      </div>
    </section>
  );
}
