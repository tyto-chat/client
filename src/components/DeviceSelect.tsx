import { useTranslation } from "react-i18next";
import { setPreferredDevice, usePreferredDevice } from "@/utils/deviceSettings";
import type { DeviceKind } from "@/utils/deviceSettings";

export function DeviceSelect({
  kind,
  mediaKind,
  label,
  devices,
  compact = false,
  icon,
}: {
  kind: DeviceKind;
  mediaKind: MediaDeviceKind;
  label: string;
  devices: MediaDeviceInfo[];
  compact?: boolean;
  icon?: React.ReactNode;
}) {
  const { t } = useTranslation("settings");
  const preferred = usePreferredDevice(kind);
  const options = devices.filter((d) => d.kind === mediaKind && d.deviceId);
  const known = options.some((d) => d.deviceId === preferred);

  const select = (
    <select
      aria-label={label}
      value={known ? preferred : ""}
      onChange={(e) => setPreferredDevice(kind, e.target.value)}
      className={
        compact
          ? "w-full min-w-0 truncate bg-transparent pr-4 text-sm outline-none"
          : "w-full truncate rounded-md bg-canvas ring-1 ring-inset ring-line py-1.5 pl-3 pr-7 text-sm"
      }
    >
      <option value="">{t("device_default")}</option>
      {options.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || t("device_unnamed")}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <div
        title={label}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-canvas px-2.5 py-1.5 ring-1 ring-inset ring-line"
      >
        <span className="shrink-0 text-fg-subtle">{icon}</span>
        {select}
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-xs text-fg-muted">{label}</label>
      {select}
    </div>
  );
}
