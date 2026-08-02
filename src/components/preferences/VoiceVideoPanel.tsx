import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAudioCall } from "@/context/AudioCallContext";
import { formatKey, type VoiceMode } from "@/utils/voiceSettings";
import { useMicLevelMonitor } from "@/hooks/useMicLevelMonitor";
import { useVoiceEnabled } from "@/hooks/useVoiceEnabled";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { AudioSliders } from "@/components/AudioSliders";
import { CameraPreview } from "@/components/CameraPreview";
import { LevelMeter } from "@/components/LevelMeter";
import { DeviceSelect } from "@/components/DeviceSelect";
import { BlurLevelPicker } from "@/components/BlurLevelPicker";
import {
  setMirrorSelf,
  setNoiseSuppression,
  useMirrorSelf,
  useNoiseSuppression,
} from "@/utils/mediaEffects";
import { Switch } from "@/components/ui/Switch";
import { SettingRow } from "@/components/preferences/SettingRow";
import {
  segBase,
  segActive,
  segInactive,
  sectionHeading,
} from "@/components/preferences/panelStyles";

const VOICE_MODE_VALUES: VoiceMode[] = ["open", "ptt"];

const DEVICE_LABEL_KEYS = {
  audioinput: "device_microphone",
  audiooutput: "device_speaker",
  videoinput: "device_camera",
} as const;

export function VoiceVideoPanel() {
  const { t } = useTranslation("settings");
  const { voiceMode, pttKey, setVoiceMode, setPttKey } = useAudioCall();
  const voiceEnabled = useVoiceEnabled();
  const [isBinding, setIsBinding] = useState(false);
  const micLevelRef = useRef<number>(0);
  const noiseSuppression = useNoiseSuppression();
  const mirrorSelf = useMirrorSelf();
  const devices = useMediaDevices(true);

  const voiceModeLabels: Record<VoiceMode, string> = {
    open: t("open_mic"),
    ptt: t("push_to_talk"),
  };

  useMicLevelMonitor(voiceEnabled, micLevelRef);

  useEffect(() => {
    if (!isBinding) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsBinding(false);
        return;
      }
      e.preventDefault();
      setPttKey(e.key);
      setIsBinding(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBinding, setPttKey]);

  const unlabeled = devices.length > 0 && devices.every((d) => d.kind !== "audioinput" || !d.label);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className={sectionHeading}>{t("devices_heading")}</h3>
        <div className="flex flex-col gap-3">
          {(["audioinput", "audiooutput", "videoinput"] as const).map((kind) => (
            <DeviceSelect
              key={kind}
              kind={kind}
              mediaKind={kind}
              label={t(DEVICE_LABEL_KEYS[kind])}
              devices={devices}
            />
          ))}
        </div>
        {unlabeled && <p className="mt-2 text-xs text-fg-subtle">{t("devices_hint")}</p>}
      </section>

      <section>
        <h3 className={sectionHeading}>{t("voice_mode")}</h3>
        <div className="flex flex-col gap-3">
          <SettingRow label={t("voice_mode")}>
            {VOICE_MODE_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                data-testid={`voice-mode-${value}`}
                onClick={() => setVoiceMode(value)}
                className={`${segBase} ${voiceMode === value ? segActive : segInactive}`}
              >
                <span className="block cap-trim">{voiceModeLabels[value]}</span>
              </button>
            ))}
          </SettingRow>

          {voiceMode === "ptt" && (
            <SettingRow label={t("ptt_key")}>
              <button
                type="button"
                onClick={() => setIsBinding(true)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  isBinding
                    ? "border-blue-400 bg-blue-50 text-blue-600 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-400"
                    : "border-line bg-surface text-fg hover:bg-raised"
                }`}
              >
                {isBinding ? t("press_key") : formatKey(pttKey)}
              </button>
            </SettingRow>
          )}

          <div>
            <p className="mb-2 text-sm text-fg-muted">{t("levels_heading")}</p>
            <div className="flex flex-col gap-3">
              <AudioSliders />
              <LevelMeter micLevelRef={micLevelRef} thresholdPct={100} />
            </div>
          </div>

          <SettingRow label={t("noise_suppression")} hint={t("noise_suppression_hint")}>
            <Switch
              checked={noiseSuppression}
              onChange={() => setNoiseSuppression(!noiseSuppression)}
              label={t("noise_suppression")}
            />
          </SettingRow>
        </div>
      </section>

      <section>
        <h3 className={sectionHeading}>{t("tab_video")}</h3>
        <div className="flex flex-col gap-3">
          <CameraPreview />
          <div>
            <p className="mb-1 text-sm text-fg-muted">{t("background_blur")}</p>
            <BlurLevelPicker />
            <p className="mt-1 text-xs text-fg-muted">{t("background_blur_hint")}</p>
          </div>
          <SettingRow label={t("mirror_self")} hint={t("mirror_self_hint")}>
            <Switch
              checked={mirrorSelf}
              onChange={() => setMirrorSelf(!mirrorSelf)}
              label={t("mirror_self")}
            />
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
