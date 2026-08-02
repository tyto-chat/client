import { useNavigate } from "@tanstack/react-router";
import { uuidFromIri } from "@/api/hydra";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { MessageGroup } from "@/components/chat/MessageGroup";
import { PinIcon, Spinner } from "@/components/icons";
import { useAuthContext } from "@/context/AuthContext";
import { useTimezone } from "@/context/TimezoneContext";
import { useChannelPinnedMessages, useUnpinMessage } from "@/queries/pinnedMessageQueries";
import type { UserGroup } from "@/types/api";

const EMPTY_MODS: Set<number> = new Set();
const EMPTY_GROUPS: Map<number, UserGroup[]> = new Map();
const noop = (): void => {};

interface Props {
  communityId: string;
  channelIdentifier: string;
  canPin: boolean;
  onClose: () => void;
}

export function PinnedMessagesModal({ communityId, channelIdentifier, canPin, onClose }: Props) {
  const { t } = useTranslation("channel");
  const navigate = useNavigate();
  const { timezone } = useTimezone();
  const { user } = useAuthContext();
  const { data: pinned, isLoading } = useChannelPinnedMessages(communityId, channelIdentifier);
  const unpin = useUnpinMessage(communityId, channelIdentifier);

  return (
    <Modal title={t("pinned_messages_title")} onClose={onClose} size="lg">
      {(close) => (
        <div data-testid="pinned-messages-modal" className="mt-2 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8 text-fg-subtle">
              <Spinner />
            </div>
          ) : !pinned || pinned.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">{t("pinned_messages_empty")}</p>
          ) : (
            <div className="divide-y divide-line">
              {pinned.map((msg) => {
                const messageId = uuidFromIri(msg["@id"]);
                return (
                  <div key={msg["@id"]} data-testid="pinned-message-row" className="group relative">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        void navigate({ to: "/m/$messageId", params: { messageId } });
                        close();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void navigate({ to: "/m/$messageId", params: { messageId } });
                          close();
                        }
                      }}
                      className="cursor-pointer rounded transition-colors hover:bg-surface"
                    >
                      <MessageGroup
                        group={{ isOwn: msg.createdBy?.id === user?.id, msgs: [msg] }}
                        groupIndex={0}
                        communityId={communityId}
                        user={user}
                        isChannelModerator={false}
                        moderatorUserIds={EMPTY_MODS}
                        groupsByUserId={EMPTY_GROUPS}
                        timezone={timezone}
                        onToggleReaction={noop}
                        onDeleteMessage={noop}
                        onEditMessage={noop}
                        onViewHistory={noop}
                        onUserClick={noop}
                        onDeleteAttachment={noop}
                        readOnly
                      />
                    </div>
                    {canPin && (
                      <button
                        data-testid="pinned-modal-unpin-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          unpin.mutate(msg["@id"]);
                        }}
                        title={t("unpin_message")}
                        aria-label={t("unpin_message")}
                        className="absolute right-1 top-1 rounded-md bg-canvas ring-1 ring-inset ring-line p-1 text-fg-muted opacity-0 shadow-sm transition hover:text-red-600 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:text-red-400"
                      >
                        <PinIcon size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
