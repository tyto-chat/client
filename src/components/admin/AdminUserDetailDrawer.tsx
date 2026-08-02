import { formatShortDate as fmtDate } from "@/utils/dateFormat";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IssueApiKeyModal } from "@/components/IssueApiKeyModal";
import {
  useAdminUserApiKeys,
  useAdminUserDetail,
  useDeleteAdminUser,
  useDisableAdminUserTwoFactor,
  useIssueAdminUserApiKey,
  usePatchAdminUser,
  useRevokeAdminUserApiKey,
} from "@/queries/adminUserQueries";
import { useNotification } from "@/context/NotificationContext";
import { useConfirm } from "@/hooks/useConfirm";
import { Spinner } from "@/components/icons";

interface Props {
  userId: number;
  onClose: () => void;
}

export function AdminUserDetailDrawer({ userId, onClose }: Props) {
  const { t } = useTranslation("admin");
  const { notify } = useNotification();
  const { confirm, confirmDialog } = useConfirm();
  const { data: user, isLoading } = useAdminUserDetail(userId);
  const { data: apiKeysData } = useAdminUserApiKeys(userId);
  const patchMutation = usePatchAdminUser();
  const deleteMutation = useDeleteAdminUser();
  const revokeMutation = useRevokeAdminUserApiKey();
  const disable2faMutation = useDisableAdminUserTwoFactor();

  const fetchedName = user?.displayName ?? "";
  const [prevFetchedName, setPrevFetchedName] = useState(fetchedName);
  const [displayName, setDisplayName] = useState<string>(fetchedName);
  if (fetchedName !== prevFetchedName) {
    setPrevFetchedName(fetchedName);
    setDisplayName(fetchedName);
  }
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showIssueKey, setShowIssueKey] = useState(false);
  const issueKeyMutation = useIssueAdminUserApiKey(userId);

  async function saveName() {
    if (!user || displayName.trim() === user.displayName) return;
    try {
      await patchMutation.mutateAsync({ id: userId, patch: { displayName: displayName.trim() } });
      notify(t("user_name_updated"), "success");
    } catch {
      notify(t("user_name_update_failed"), "error");
    }
  }

  async function toggleAdmin() {
    if (!user || user.isBot) return;
    try {
      await patchMutation.mutateAsync({ id: userId, patch: { isAdmin: !user.isAdmin } });
      notify(user.isAdmin ? t("user_demoted") : t("user_promoted"), "success");
    } catch {
      notify(t("user_role_update_failed"), "error");
    }
  }

  async function disable2fa() {
    if (!user) return;
    const ok = await confirm({
      title: t("user_disable_two_factor_title"),
      message: t("user_disable_two_factor_message"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await disable2faMutation.mutateAsync(userId);
      notify(t("user_two_factor_disabled"), "success");
    } catch {
      notify(t("user_two_factor_disable_failed"), "error");
    }
  }

  async function forceDelete() {
    if (!user) return;
    if (confirmEmail !== user.email) return;
    try {
      await deleteMutation.mutateAsync({ id: userId, confirm: confirmEmail });
      notify(t("user_force_deleted"), "success");
      onClose();
    } catch {
      notify(t("user_force_delete_failed"), "error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-canvas shadow-soft-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line p-4">
          <h3 className="text-lg font-bold">{t("user_drawer_title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-fg-muted hover:bg-surface"
          >
            ✕
          </button>
        </header>

        {isLoading || !user ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-6 p-4">
            <section className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-fg-muted">
                {t("col_email")}
              </span>
              <span className="font-mono text-sm">{user.email}</span>
              <span className="mt-2 text-xs uppercase tracking-wider text-fg-muted">
                {t("col_joined")}
              </span>
              <span className="text-sm">{fmtDate(user.createdAt)}</span>
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {t("user_display_name")}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={
                    displayName.trim() === (user.displayName ?? "") || patchMutation.isPending
                  }
                  onClick={() => void saveName()}
                  className="rounded-lg bg-accent-gradient px-3 py-1.5 text-sm font-semibold text-[var(--accent-on)] disabled:opacity-40"
                >
                  {t("save")}
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {t("user_role_label")}
              </span>
              <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <span className="text-sm">
                  {user.isAdmin ? t("user_is_admin") : t("user_not_admin")}
                </span>
                {user.isBot ? (
                  <span className="text-xs text-fg-muted">{t("user_bot_role_locked")}</span>
                ) : (
                  <button
                    type="button"
                    disabled={patchMutation.isPending}
                    onClick={() => void toggleAdmin()}
                    className="text-sm font-semibold text-accent-text hover:underline disabled:opacity-40"
                  >
                    {user.isAdmin ? t("action_demote") : t("action_promote")}
                  </button>
                )}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {t("user_api_keys")}
              </span>
              {user.isBot && (
                <button
                  type="button"
                  onClick={() => setShowIssueKey(true)}
                  className="self-start text-xs font-semibold text-accent-text hover:underline"
                >
                  {t("user_issue_api_key")}
                </button>
              )}
              {(apiKeysData?.rows ?? []).length === 0 ? (
                <p className="text-sm text-fg-muted">{t("user_no_api_keys")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {apiKeysData?.rows.map((k) => (
                    <li key={k.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        {k.name} <code className="ml-1 text-xs text-fg-muted">{k.prefix}…</code>
                        {k.revokedAt && (
                          <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs text-fg">
                            {t("user_api_key_revoked")}
                          </span>
                        )}
                      </span>
                      {!k.revokedAt && (
                        <button
                          type="button"
                          onClick={() =>
                            void revokeMutation
                              .mutateAsync({ userId, keyId: k.id })
                              .then(() => notify(t("user_api_key_revoke_success"), "success"))
                              .catch(() => notify(t("user_api_key_revoke_failed"), "error"))
                          }
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          {t("action_revoke")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-fg-muted">
                {t("user_push_subscription_count", { count: user.pushSubscriptionCount })}
              </p>
            </section>

            {user.twoFactorEnabled && !user.isBot && (
              <section className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  {t("user_two_factor")}
                </span>
                <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span className="text-sm">{t("user_two_factor_enabled")}</span>
                  <button
                    type="button"
                    data-testid="admin-disable-2fa"
                    disabled={disable2faMutation.isPending}
                    onClick={() => void disable2fa()}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    {t("user_disable_two_factor")}
                  </button>
                </div>
              </section>
            )}

            <section className="mt-4 flex flex-col gap-3 rounded-md border border-red-300 p-3 dark:border-red-800">
              <h4 className="text-sm font-bold text-red-700 dark:text-red-300">
                {t("user_danger_zone")}
              </h4>
              <p className="text-xs text-red-700 dark:text-red-300">
                {t("user_force_delete_intro")}
              </p>
              {!confirmOpen ? (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={user.isPendingDeletion}
                  className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {t("action_force_delete")}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-red-700 dark:text-red-300">
                    {t("user_type_email_to_confirm", { email: user.email })}
                  </label>
                  <input
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    className="rounded-md border border-red-300 bg-canvas px-3 py-1.5 text-sm dark:border-red-700"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={confirmEmail !== user.email || deleteMutation.isPending}
                      onClick={() => void forceDelete()}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      {deleteMutation.isPending ? t("deleting") : t("confirm_delete")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmOpen(false);
                        setConfirmEmail("");
                      }}
                      className="text-sm text-fg-muted hover:text-fg dark:hover:text-white"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
      {showIssueKey && (
        <IssueApiKeyModal onClose={() => setShowIssueKey(false)} issueMutation={issueKeyMutation} />
      )}
      {confirmDialog}
    </div>
  );
}
