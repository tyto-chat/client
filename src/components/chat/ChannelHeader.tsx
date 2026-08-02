import { useTranslation } from "react-i18next";
import { Menu, MenuItem } from "@/components/ui";
import { CommunityOnlineBadge } from "@/components/CommunityOnlineBadge";
import {
  MicrophoneIcon,
  LockIcon,
  ReadonlyIcon,
  ReadonlyRepliesIcon,
  StarIcon,
  StarFilledIcon,
  PinIcon,
  SearchIcon,
  MoreVerticalIcon,
  EditIcon,
  UsersIcon,
  ManageUsersIcon,
} from "@/components/icons";
import type { Channel } from "@/types/api";

export function ChannelHeader({
  channel,
  communityId,
  isAudio,
  isAuthenticated,
  isFavorite,
  onToggleFavorite,
  hasPinnedMessages,
  onOpenPinned,
  onOpenSearch,
  isAdmin,
  canViewMembers,
  canManageChannelMembers,
  onOpenEdit,
  onOpenManageAccess,
  onOpenMembers,
  onUserClick,
}: {
  channel: Channel;
  communityId: string;
  isAudio: boolean;
  isAuthenticated: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  hasPinnedMessages: boolean;
  onOpenPinned: () => void;
  onOpenSearch: () => void;
  isAdmin: boolean;
  canViewMembers: boolean;
  canManageChannelMembers: boolean;
  onOpenEdit: () => void;
  onOpenManageAccess: () => void;
  onOpenMembers: () => void;
  onUserClick?: (userId: number) => void;
}) {
  const { t } = useTranslation(["channel", "common"]);

  const showEdit = isAdmin;
  const showMembers = channel.isPrivate && !isAdmin && canViewMembers;
  const showManageAccess = isAdmin || (canManageChannelMembers && channel.isPrivate);
  const showMenu = showEdit || showMembers || showManageAccess;

  return (
    <header className="flex items-center gap-1.5 border-b border-line px-4 py-3 max-md:hidden">
      <h1 className="flex min-w-0 items-center gap-1.5 text-[0.9375rem] font-semibold">
        {isAudio ? (
          <>
            <MicrophoneIcon size={14} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 truncate cap-trim-truncate" title={channel.name}>
              {channel.name}
            </span>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate cap-trim-truncate" title={channel.name}>
              # {channel.name}
            </span>
            {channel.isPrivate && (
              <LockIcon
                size={13}
                className="shrink-0 text-fg-subtle"
                title={t("private_channel")}
              />
            )}
            {channel.isReadonly &&
              (channel.areReadonlyRepliesAllowed ? (
                <ReadonlyRepliesIcon
                  size={13}
                  className="shrink-0 text-fg-subtle"
                  title={t("readonly_replies_channel")}
                />
              ) : (
                <ReadonlyIcon
                  size={13}
                  className="shrink-0 text-fg-subtle"
                  title={t("readonly_channel")}
                />
              ))}
          </>
        )}
      </h1>
      {channel.description && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line" />
          <span
            className="min-w-0 flex-1 truncate text-sm font-normal text-fg-muted"
            title={channel.description}
          >
            {channel.description}
          </span>
        </>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {isAuthenticated && (
          <button
            onClick={onToggleFavorite}
            title={t(isFavorite ? "unfavorite" : "favorite")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface ${
              isFavorite ? "text-yellow-500 hover:text-yellow-600" : "text-fg-muted hover:text-fg"
            }`}
          >
            {isFavorite ? <StarFilledIcon size={13} /> : <StarIcon size={13} />}
          </button>
        )}
        {!isAudio && hasPinnedMessages && (
          <button
            data-testid="pinned-open-btn"
            onClick={onOpenPinned}
            title={t("pinned_messages_title")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <PinIcon size={13} />
          </button>
        )}
        {!isAudio && isAuthenticated && (
          <button
            data-testid="search-open-btn"
            onClick={onOpenSearch}
            title={`${t("search")} (${navigator.platform.toLowerCase().includes("mac") ? "⌘K" : "Ctrl+K"})`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <SearchIcon size={13} />
          </button>
        )}
        {showMenu && (
          <Menu
            align="right"
            label={t("common:more")}
            testId="channel-header-menu-btn"
            trigger={
              <span className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface hover:text-fg">
                <MoreVerticalIcon size={16} />
              </span>
            }
          >
            {showEdit && (
              <MenuItem onSelect={onOpenEdit} iconLeft={<EditIcon size={14} />}>
                <span className="block cap-trim">{t("edit_channel")}</span>
              </MenuItem>
            )}
            {showMembers && (
              <MenuItem onSelect={onOpenMembers} iconLeft={<UsersIcon size={14} />}>
                <span className="block cap-trim">{t("view_members")}</span>
              </MenuItem>
            )}
            {showManageAccess && (
              <MenuItem onSelect={onOpenManageAccess} iconLeft={<ManageUsersIcon size={14} />}>
                <span className="block cap-trim">{t("manage_access")}</span>
              </MenuItem>
            )}
          </Menu>
        )}
      </div>
      <div className="ml-2">
        <CommunityOnlineBadge communityIdentifier={communityId} onUserClick={onUserClick} />
      </div>
    </header>
  );
}
