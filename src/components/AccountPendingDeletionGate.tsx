import { formatShortDate } from "@/utils/dateFormat";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useCancelAccountDeletion } from "@/queries/accountDeletionQueries";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";

interface Props {
  purgeAt: string | undefined;
}

export function AccountPendingDeletionGate({ purgeAt }: Props) {
  const { t } = useTranslation(["settings", "common"]);
  const { logout } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const cancel = useCancelAccountDeletion();

  const date = formatShortDate(purgeAt);

  async function onCancel() {
    try {
      await cancel.mutateAsync();
      notify(t("delete_account_cancel_done"), "success");
      await navigate({ to: "/" });
    } catch {
      notify(t("delete_account_cancel_failed"), "error");
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-surface px-6">
      <div className="max-w-md rounded-2xl border border-red-300 bg-canvas p-8 text-center shadow-soft-md dark:border-red-700">
        <h1 className="mb-3 text-xl font-bold text-red-600 dark:text-red-400">
          {t("delete_account_full_lockout_title")}
        </h1>
        <p className="mb-2 text-sm text-fg">{t("delete_account_pending_banner", { date })}</p>
        <p className="mb-6 text-sm text-fg-muted">{t("delete_account_full_lockout_body")}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={cancel.isPending}
            className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
          >
            {t("delete_account_cancel_action")}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-surface"
          >
            {t("delete_account_sign_out")}
          </button>
        </div>
      </div>
    </div>
  );
}
