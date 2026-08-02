import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCommunityInvites,
  useCreateCommunityInvite,
  useRevokeCommunityInvite,
} from "@/queries/communityQueries";
import { useNotification } from "@/context/NotificationContext";
import { TrashIcon, LinkIcon, CheckIcon } from "@/components/icons";
import type { CommunityInvite } from "@/types/api";

function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

export function CommunityInvitesPanel({ communityId }: { communityId: string }) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const { data: invites = [], isLoading } = useCommunityInvites(communityId);
  const createInvite = useCreateCommunityInvite(communityId);
  const revokeInvite = useRevokeCommunityInvite(communityId);

  const [maxUses, setMaxUses] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  async function handleCreate() {
    const expiresAt =
      expiresInDays.trim().length > 0
        ? new Date(Date.now() + Number(expiresInDays) * 86_400_000).toISOString()
        : null;
    try {
      await createInvite.mutateAsync({
        maxUses: maxUses.trim().length > 0 ? Number(maxUses) : null,
        expiresAt,
      });
      setMaxUses("");
      setExpiresInDays("");
    } catch {
      notify(t("invite_create_error"), "error");
    }
  }

  async function handleCopy(invite: CommunityInvite) {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.token));
      notify(t("invite_link_copied"), "success");
      setCopiedId(invite.id);
      window.setTimeout(() => setCopiedId((id) => (id === invite.id ? null : id)), 2000);
    } catch {
      notify(t("invite_link_copy_error"), "error");
    }
  }

  async function handleRevoke(invite: CommunityInvite) {
    try {
      await revokeInvite.mutateAsync(invite.id);
    } catch {
      notify(t("invite_revoke_error"), "error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t("invites_hint")}</p>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line p-3">
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          {t("invite_max_uses")}
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder={t("invite_unlimited")}
            className="w-28 rounded-md bg-canvas ring-1 ring-inset ring-line px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          {t("invite_expires_in_days")}
          <input
            type="number"
            min={1}
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            placeholder={t("invite_never")}
            className="w-28 rounded-md bg-canvas ring-1 ring-inset ring-line px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handleCreate}
          disabled={createInvite.isPending}
          className="rounded-lg bg-accent-gradient px-4 py-1.5 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {t("invite_generate")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-fg-subtle">{t("common:loading")}</p>
      ) : invites.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t("invites_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => handleCopy(invite)}
                  className="block max-w-full truncate font-mono text-sm text-[var(--accent)] hover:underline"
                  title={t("invite_copy_link")}
                >
                  {inviteUrl(invite.token)}
                </button>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {invite.maxUses === null
                    ? t("invite_uses_unlimited", { count: invite.useCount })
                    : t("invite_uses_limited", { count: invite.useCount, max: invite.maxUses })}
                  {invite.expiresAt &&
                    ` · ${t("invite_expires_on", {
                      date: new Date(invite.expiresAt).toLocaleDateString(),
                    })}`}
                  {!invite.isValid && ` · ${t("invite_inactive")}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleCopy(invite)}
                  title={t("invite_copy_link")}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-fg-muted hover:bg-surface hover:text-fg dark:hover:text-white"
                >
                  {copiedId === invite.id ? (
                    <>
                      <CheckIcon size={14} />
                      <span className="block cap-trim">{t("invite_link_copied_short")}</span>
                    </>
                  ) : (
                    <>
                      <LinkIcon size={14} />
                      <span className="block cap-trim">{t("invite_copy")}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleRevoke(invite)}
                  disabled={revokeInvite.isPending}
                  title={t("invite_revoke")}
                  className="rounded-lg p-1.5 text-fg-subtle hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
