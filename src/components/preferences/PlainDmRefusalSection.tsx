import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/Switch";
import { SettingRow } from "@/components/preferences/SettingRow";
import { sectionHeading } from "@/components/preferences/panelStyles";
import { useConfirm } from "@/hooks/useConfirm";
import { useServerInfo } from "@/hooks/useServerInfo";
import { useUserPreferences } from "@/queries/userPreferencesQueries";
import { useLocalPlainDmRefusal, useSetPlainDmRefusal } from "@/queries/plainDmRefusalQueries";

export function PlainDmRefusalSection() {
  const { t } = useTranslation("settings");
  const mode = useServerInfo()?.encryptedDmsMode;
  const {
    data: prefs,
    isFetching,
    isError: checkFailed,
    refetch,
  } = useUserPreferences({ enabled: mode !== undefined });
  const update = useSetPlainDmRefusal();
  const localRefusal = useLocalPlainDmRefusal();
  const { confirm, confirmDialog } = useConfirm();

  if (mode === undefined) return null;

  const refuses = prefs?.refusePlainDms === true || localRefusal;
  const required = mode === "required";
  const checked = required || refuses;
  const locked =
    required ||
    (mode === "disabled" && !refuses) ||
    prefs === undefined ||
    update.isPending ||
    (update.isError && (isFetching || checkFailed));
  const hint = required
    ? t("refuse_plain_dms_required")
    : mode === "disabled"
      ? t("refuse_plain_dms_disabled")
      : t("refuse_plain_dms_hint");

  const toggle = async () => {
    if (update.isPending) return;
    if (refuses) {
      update.mutate(false);
      return;
    }
    const ok = await confirm({
      title: t("refuse_plain_dms_confirm_title"),
      message: t("refuse_plain_dms_consequence"),
      confirmLabel: t("refuse_plain_dms_confirm"),
    });
    if (ok) update.mutate(true);
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className={sectionHeading}>{t("direct_messages_section")}</h3>
      <SettingRow label={t("refuse_plain_dms")} hint={hint}>
        <Switch
          checked={checked}
          disabled={locked}
          onChange={() => void toggle()}
          testId="pref-refuse-plain-dms"
          label={t("refuse_plain_dms")}
        />
      </SettingRow>
      {update.isError && (
        <p role="alert" className="text-xs text-danger">
          {t("refuse_plain_dms_save_failed")}
          {checkFailed && !isFetching && (
            <>
              {" "}
              {t("refuse_plain_dms_check_failed")}{" "}
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-semibold underline"
              >
                {t("refuse_plain_dms_retry")}
              </button>
            </>
          )}
        </p>
      )}
      {confirmDialog}
    </section>
  );
}
