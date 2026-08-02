import { formatShortDate } from "@/utils/dateFormat";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DeleteAccountModal } from "@/components/DeleteAccountModal";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { DataExportSection } from "@/components/DataExportSection";
import {
  useAccountDeletionStatus,
  useCancelAccountDeletion,
} from "@/queries/accountDeletionQueries";
import { useNotification } from "@/context/NotificationContext";
import { sectionHeading } from "@/components/preferences/panelStyles";

export function AccountTab() {
  const { t } = useTranslation(["settings", "common"]);
  const { notify } = useNotification();
  const [showDialog, setShowDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: status } = useAccountDeletionStatus();
  const cancel = useCancelAccountDeletion();

  const pending = status?.pending === true;
  const purgeDate = status?.purgeAt ? formatShortDate(status.purgeAt) : null;

  async function onCancel() {
    try {
      await cancel.mutateAsync();
      notify(t("delete_account_cancel_done"), "success");
    } catch {
      notify(t("delete_account_cancel_failed"), "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h3 className={sectionHeading}>{t("change_password_section")}</h3>
        <div>
          <button
            type="button"
            onClick={() => setShowPassword(true)}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-raised"
          >
            {t("change_password_menu")}
          </button>
        </div>
        {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
      </div>

      <hr className="border-line" />

      <DataExportSection />

      <hr className="border-line" />

      <div className="flex flex-col gap-4">
        <h3 className={sectionHeading}>{t("delete_account_section")}</h3>

        {pending ? (
          <div className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 dark:border-red-700 dark:bg-red-900/30">
            <p className="text-sm text-red-700 dark:text-red-200">
              {t("delete_account_pending_intro", { date: purgeDate ?? "—" })}
            </p>
            <div>
              <button
                type="button"
                onClick={() => void onCancel()}
                disabled={cancel.isPending}
                className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
              >
                {t("delete_account_cancel_action")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-fg-muted">{t("delete_account_intro")}</p>
            <div>
              <button
                type="button"
                onClick={() => setShowDialog(true)}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                {t("delete_account_action")}
              </button>
            </div>
          </>
        )}

        {showDialog && <DeleteAccountModal onClose={() => setShowDialog(false)} />}
      </div>
    </div>
  );
}
