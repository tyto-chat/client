import { useTranslation } from "react-i18next";
import { useMuteConversation } from "@/queries/conversationQueries";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import type { Conversation, ConversationMember } from "@/types/api";

interface Props {
  conversation: Conversation;
  currentUserId: number | undefined;
  onClose: () => void;
}

export function ConversationSettingsModal({ conversation, currentUserId, onClose }: Props) {
  const { t } = useTranslation(["conversation", "common"]);
  const muteMutation = useMuteConversation(conversation.identifier);
  const me = conversation.members.find((m) => m.userId === currentUserId);
  const isMuted = !!me?.mutedUntil;

  function renderMember(m: ConversationMember) {
    const isMe = m.userId === currentUserId;
    return (
      <li key={m.id} className="flex items-center gap-2 px-2 py-1.5">
        <Avatar
          name={m.profile?.name ?? `#${m.userId}`}
          colorKey={m.profile?.["@id"] ?? String(m.userId)}
          imageUrl={avatarUrl(m.profile?.avatar?.contentUrl ?? null)}
          size="xs"
        />
        <span className="truncate text-sm">
          {m.profile?.name ?? `#${m.userId}`}
          {isMe && <span className="ml-1 text-xs text-fg-subtle">({t("you")})</span>}
        </span>
      </li>
    );
  }

  return (
    <Modal title={t("settings")} onClose={onClose}>
      {(close) => (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
            <div>
              <p className="text-sm font-medium">{t("mute_notifications")}</p>
              <p className="text-xs text-fg-muted">{t("mute_notifications_hint")}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                muteMutation.mutate(
                  isMuted
                    ? null
                    : new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000).toISOString(),
                )
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                isMuted
                  ? "bg-[var(--accent-strong)] text-[var(--accent-on)]"
                  : "border border-line text-fg"
              }`}
            >
              {isMuted ? t("muted") : t("mute")}
            </button>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t("members")} ({conversation.members.length})
            </p>
            <ul className="space-y-0.5">{conversation.members.map(renderMember)}</ul>
          </div>

          <div className="flex justify-end border-t border-line pt-3">
            <button
              onClick={close}
              className="rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-surface"
            >
              {t("common:close")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
