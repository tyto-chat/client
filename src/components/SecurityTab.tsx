import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatShortDate } from "@/utils/dateFormat";
import { useTwoFactorStatus } from "@/queries/twoFactorQueries";
import { TwoFactorSetupModal } from "@/components/TwoFactorSetupModal";
import { TwoFactorPasswordActionModal } from "@/components/TwoFactorPasswordActionModal";
import { sectionHeading } from "@/components/preferences/panelStyles";

export function SecurityTab() {
  const { t } = useTranslation("settings");
  const { data: status } = useTwoFactorStatus();
  const [showSetup, setShowSetup] = useState(false);
  const [action, setAction] = useState<"disable" | "regenerate" | null>(null);

  const buttonCls =
    "rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-raised";

  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeading}>{t("two_factor_section")}</h3>
      {!status ? null : status.enabled ? (
        <>
          <p className="text-sm text-fg">
            {t("two_factor_status_enabled", {
              date: status.enabledAt ? formatShortDate(status.enabledAt) : "",
            })}
          </p>
          <p className="text-xs text-fg-muted">
            {t("two_factor_codes_remaining", { count: status.recoveryCodesRemaining })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="two-factor-regenerate"
              className={buttonCls}
              onClick={() => setAction("regenerate")}
            >
              {t("two_factor_regenerate")}
            </button>
            <button
              type="button"
              data-testid="two-factor-disable"
              className={buttonCls}
              onClick={() => setAction("disable")}
            >
              {t("two_factor_disable")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-fg-muted">{t("two_factor_off_hint")}</p>
          <div>
            <button
              type="button"
              data-testid="two-factor-enable"
              className={buttonCls}
              onClick={() => setShowSetup(true)}
            >
              {t("two_factor_enable")}
            </button>
          </div>
        </>
      )}
      {showSetup && <TwoFactorSetupModal onClose={() => setShowSetup(false)} />}
      {action && <TwoFactorPasswordActionModal action={action} onClose={() => setAction(null)} />}
    </div>
  );
}
