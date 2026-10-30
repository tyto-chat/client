import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOwnDevices, type OwnDevice } from "@/api/e2ee";
import { sectionHeading } from "@/components/preferences/panelStyles";
import { useE2ee } from "@/e2ee/e2eeContextValue";
import { leaveDevice } from "@/e2ee/leaveDevice";
import { RemovalIncompleteError, removeDevice } from "@/e2ee/removeDevice";
import { useConfirm } from "@/hooks/useConfirm";
import { queryKeys } from "@/queries/queryKeys";

function formatDate(value: string, language: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric" });
}

export function DevicesTab() {
  const { t, i18n } = useTranslation("settings");
  const { identity, setIdentity } = useE2ee();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [failed, setFailed] = useState(false);
  const devices = useQuery({ queryKey: queryKeys.e2eeOwnDevices(), queryFn: fetchOwnDevices });

  const remove = useMutation({
    mutationFn: async (device: OwnDevice) => {
      if (identity === null) return;
      if (device.id === identity.deviceId) {
        await leaveDevice(identity);
        setIdentity(null);
        return;
      }
      try {
        await removeDevice(identity, device.id);
      } catch (error) {
        if (!(error instanceof RemovalIncompleteError)) throw error;
      }
    },
    onMutate: () => setFailed(false),
    onError: () => setFailed(true),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.e2eeOwnDevices() }),
  });

  const askToRemove = async (device: OwnDevice) => {
    const self = device.id === identity?.deviceId;
    const ok = await confirm({
      title: self
        ? t("devices_remove_this_confirm_title")
        : t("devices_remove_confirm_title", { name: device.name }),
      message: self
        ? t("devices_remove_this_confirm_body")
        : t("devices_remove_confirm_body", { name: device.name }),
      confirmLabel: self ? t("devices_remove_this") : t("devices_remove"),
      destructive: true,
    });
    if (ok) remove.mutate(device);
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className={sectionHeading}>{t("devices_title")}</h3>
      <p className="text-sm text-fg-muted">{t("devices_intro")}</p>
      {identity === null && (
        <p className="text-sm text-fg-subtle">{t("devices_manage_needs_setup")}</p>
      )}
      {devices.isError && (
        <p role="alert" className="text-sm text-danger">
          {t("devices_load_failed")}
        </p>
      )}
      {devices.data?.length === 0 && <p className="text-sm text-fg-subtle">{t("devices_none")}</p>}
      <ul className="flex flex-col gap-2">
        {devices.data?.map((device) => {
          const self = device.id === identity?.deviceId;
          return (
            <li
              key={device.id}
              data-testid={`e2ee-device-${device.id}`}
              className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 ring-1 ring-inset ring-line"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-fg">
                  {device.name}
                  {self && (
                    <span className="ml-2 text-xs font-normal text-fg-subtle">
                      {t("devices_this_device")}
                    </span>
                  )}
                </span>
                <span className="text-xs text-fg-subtle">
                  {t("devices_added", { date: formatDate(device.createdAt, i18n.language) })}
                  {" · "}
                  {t("devices_last_seen", { date: formatDate(device.lastSeenAt, i18n.language) })}
                </span>
              </div>
              {identity !== null && (
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => void askToRemove(device)}
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold text-danger ring-1 ring-inset ring-line hover:bg-raised disabled:opacity-50"
                >
                  {self ? t("devices_remove_this") : t("devices_remove")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t("devices_remove_failed")}
        </p>
      )}
      {confirmDialog}
    </section>
  );
}
