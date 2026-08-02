import { useTranslation } from "react-i18next";
import { setMicGain, setOutputVolume, useMicGain, useOutputVolume } from "@/utils/mediaEffects";

export function AudioSliders() {
  const { t } = useTranslation("settings");
  const micGain = useMicGain();
  const outputVolume = useOutputVolume();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-fg-muted">{t("mic_gain")}</span>
          <span className="text-xs tabular-nums text-fg-subtle">{micGain}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={200}
          value={micGain}
          onChange={(e) => setMicGain(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-fg-muted">{t("output_volume")}</span>
          <span className="text-xs tabular-nums text-fg-subtle">{outputVolume}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={outputVolume}
          onChange={(e) => setOutputVolume(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>
    </div>
  );
}
