import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { PresenceDot } from "@/components/PresenceDot";
import { avatarUrl as getAvatarUrl } from "@/api/client";
import { useCommunityMembers } from "@/queries/communityQueries";
import {
  useCommunityOnlineUsers,
  usePresenceSubscription,
  useUserPresence,
} from "@/queries/presenceQueries";
import type { CommunityMember } from "@/types/api";

interface CommunityOnlinePanelProps {
  communityIdentifier: string;
  onUserClick?: (userId: number) => void;
}

export function CommunityOnlinePanel({
  communityIdentifier,
  onUserClick,
}: CommunityOnlinePanelProps) {
  const { t } = useTranslation("common");
  const { data: members = [] } = useCommunityMembers(communityIdentifier);
  const { data: online = [] } = useCommunityOnlineUsers(communityIdentifier);

  const onlineUserIds = useMemo(() => online.map((o) => o.userId), [online]);
  usePresenceSubscription(onlineUserIds);

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
  const rows = useMemo(
    () =>
      members
        .filter((m) => onlineSet.has(m.userId))
        .sort((a, b) => a.profile.name.localeCompare(b.profile.name)),
    [members, onlineSet],
  );

  return (
    <div
      data-testid="community-online-panel"
      className="flex max-h-[60vh] w-64 max-w-[calc(100vw-1rem)] flex-col rounded-lg border border-line bg-surface shadow-soft-lg"
    >
      <div className="border-b border-line px-3 py-2 text-sm font-semibold text-fg">
        {t("presence.online_panel_title")}
      </div>
      <div className="overflow-y-auto py-1">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-fg-muted">
            {t("presence.online_panel_empty")}
          </p>
        ) : (
          rows.map((m) => <OnlineRow key={m.userId} member={m} onUserClick={onUserClick} />)
        )}
      </div>
    </div>
  );
}

function OnlineRow({
  member,
  onUserClick,
}: {
  member: CommunityMember;
  onUserClick?: (userId: number) => void;
}) {
  const state = useUserPresence(member.userId);
  const { t } = useTranslation("common");
  const clickable = !!onUserClick;

  const content = (
    <>
      <Avatar
        name={member.profile.name}
        colorKey={member.profile["@id"]}
        imageUrl={getAvatarUrl(member.profile.avatar?.contentUrl ?? null)}
        size="xs"
      />
      <span className="flex-1 truncate text-left text-sm text-fg">{member.profile.name}</span>
      <PresenceDot state={state} size="sm" hideOffline={false} />
      <span className="sr-only">{t(`presence.${state}`)}</span>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onUserClick(member.userId)}
        className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-raised"
      >
        {content}
      </button>
    );
  }

  return <div className="flex items-center gap-2 px-3 py-1.5">{content}</div>;
}
