import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSetupStatus } from "@/queries/adminSetupQueries";
import { SetupWizard } from "@/components/onboarding/SetupWizard";
import { queryKeys } from "@/queries/queryKeys";

export function SetupAttentionBanner({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useSetupStatus(isAdmin);
  const [showWizard, setShowWizard] = useState(false);

  if (!data?.needsAttention) return null;
  const outstanding = data.items.filter((i) => !i.satisfied);

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-semibold">{t("setup_banner_title")}</span>{" "}
          <span>{t("setup_banner_intro")}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="whitespace-nowrap font-semibold underline hover:no-underline"
        >
          {t("setup_run_wizard")}
        </button>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {outstanding.map((item) => (
          <li key={item.key}>
            {item.fixable === "ui" ? (
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={() =>
                  void navigate({
                    to: "/admin/settings",
                    search: item.deepLink ? { tab: item.deepLink } : {},
                  })
                }
              >
                {t(`setup_item_${item.key}` as never)}
              </button>
            ) : (
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={() => void navigate({ to: "/admin/health" })}
              >
                {t(`setup_item_${item.key}` as never)}
              </button>
            )}
          </li>
        ))}
      </ul>
      {showWizard && (
        <SetupWizard
          onClose={() => {
            setShowWizard(false);
            void qc.invalidateQueries({ queryKey: queryKeys.adminSetupStatus() });
            void qc.invalidateQueries({ queryKey: queryKeys.adminServerConfig() });
          }}
        />
      )}
    </div>
  );
}
