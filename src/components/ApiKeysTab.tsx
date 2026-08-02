import { formatShortDate as fmt } from "@/utils/dateFormat";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IssueApiKeyModal } from "@/components/IssueApiKeyModal";
import { useApiKeys, useIssueApiKey, useRevokeApiKey } from "@/queries/apiKeyQueries";
import { useNotification } from "@/context/NotificationContext";
import { useConfirm } from "@/hooks/useConfirm";
import { Spinner } from "@/components/icons";
import type { ApiKey } from "@/types/api";

export function ApiKeysTab() {
  const { t } = useTranslation(["settings", "common"]);
  const { notify } = useNotification();
  const { confirm, confirmDialog } = useConfirm();
  const { data: keys, isLoading } = useApiKeys();
  const revoke = useRevokeApiKey();
  const issueMutation = useIssueApiKey();
  const [showCreate, setShowCreate] = useState(false);

  function statusFor(key: ApiKey): "revoked" | "expired" | "active" {
    if (key.revokedAt) return "revoked";
    if (key.expiresAt && new Date(key.expiresAt) <= new Date()) return "expired";
    return "active";
  }

  async function onRevoke(key: ApiKey) {
    const ok = await confirm({
      title: t("api_key_revoke_confirm", { name: key.name }),
      confirmLabel: t("common:revoke"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await revoke.mutateAsync(key.id);
    } catch {
      notify(t("api_key_revoke_failed"), "error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t("api_keys_intro")}</p>

      <div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
        >
          {t("api_key_create")}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size={24} />
        </div>
      ) : !keys || keys.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">{t("api_keys_empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((key) => {
            const status = statusFor(key);
            return (
              <li
                key={key.id}
                className={`rounded-lg border px-3 py-2 ${
                  status === "active"
                    ? "border-line bg-canvas"
                    : "border-line bg-surface opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg dark:text-white">
                        {key.name}
                      </span>
                      <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-fg">
                        {key.prefix}…
                      </code>
                      {status === "revoked" && (
                        <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-white">
                          {t("api_key_revoked_badge")}
                        </span>
                      )}
                      {status === "expired" && (
                        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white">
                          {t("api_key_expired_badge")}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-fg-muted"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-fg-muted">
                      <span>{t("api_key_created", { date: fmt(key.createdAt) })}</span>
                      <span>
                        {key.expiresAt
                          ? t("api_key_expires", { date: fmt(key.expiresAt) })
                          : t("api_key_expires_never")}
                      </span>
                      <span>
                        {key.lastUsedAt
                          ? t("api_key_last_used", { date: fmt(key.lastUsedAt) })
                          : t("api_key_never_used")}
                      </span>
                    </div>
                  </div>
                  {status === "active" && (
                    <button
                      type="button"
                      onClick={() => void onRevoke(key)}
                      disabled={revoke.isPending}
                      className="rounded-lg border border-red-300 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                    >
                      {t("api_key_revoke")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showCreate && (
        <IssueApiKeyModal onClose={() => setShowCreate(false)} issueMutation={issueMutation} />
      )}
      {confirmDialog}
    </div>
  );
}
