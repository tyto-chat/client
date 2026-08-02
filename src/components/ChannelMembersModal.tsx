import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import { useChannelMembers, useLeaveChannel } from "@/queries/channelQueries";
import type { Channel } from "@/types/api";

interface Props {
  channel: Channel;
  communityId: string;
  currentUserId: number;
  isAdmin: boolean;
  onClose: () => void;
  onLeft: () => void;
}

export function ChannelMembersModal({
  channel,
  communityId,
  currentUserId,
  isAdmin,
  onClose,
  onLeft,
}: Props) {
  const { t } = useTranslation(["community", "common"]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { data: members = [] } = useChannelMembers(communityId, channel.identifier);
  const leaveChannel = useLeaveChannel(communityId, channel.identifier);

  const currentUserIsMember = members.some((m) => m.userId === currentUserId);
  const canLeave = !isAdmin && currentUserIsMember;

  async function handleLeave() {
    await leaveChannel.mutateAsync(currentUserId);
    onLeft();
  }

  return (
    <Modal title={t("members_modal_title", { channel: channel.name })} onClose={onClose}>
      {() => (
        <>
          <ul className="space-y-0.5">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                <Avatar
                  name={member.profile.name}
                  colorKey={String(member.userId)}
                  imageUrl={avatarUrl(member.profile.avatar?.contentUrl ?? null)}
                  size="xs"
                />
                <span className="flex-1 text-sm font-medium text-fg dark:text-white">
                  {member.profile.name}
                </span>
                {member.role === "moderator" && (
                  <span className="rounded bg-[var(--accent-light)] px-1.5 py-0.5 text-xs font-medium text-[var(--accent-text-on-light)] dark:bg-[var(--accent-dark)] dark:text-[var(--accent-text-dark)]">
                    {t("mod_badge")}
                  </span>
                )}
              </li>
            ))}
            {members.length === 0 && (
              <li className="py-4 text-center text-sm text-fg-subtle">{t("no_members")}</li>
            )}
          </ul>

          {canLeave && (
            <div className="mt-4 border-t border-line pt-4">
              {confirmLeave ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg-muted">{t("leave_channel_confirm")}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmLeave(false)}
                      className="rounded px-3 py-1 text-sm text-fg-muted hover:bg-surface"
                    >
                      {t("common:cancel")}
                    </button>
                    <button
                      onClick={handleLeave}
                      disabled={leaveChannel.isPending}
                      className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {leaveChannel.isPending ? t("leaving") : t("leave")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmLeave(true)}
                  className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  {t("leave_channel")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
