import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCommunity } from "@/queries/communityQueries";
import { useCommunityMembership } from "@/queries/membershipQueries";
import {
  useDeleteSection,
  useChannelUnread,
  useArchiveChannel,
  useUnarchiveChannel,
} from "@/queries/channelQueries";
import { useConfirm } from "@/hooks/useConfirm";
import { useServerInfo } from "@/hooks/useServerInfo";
import { useNotificationUnreadCounts } from "@/queries/notificationQueries";
import { useAuth } from "@/hooks/useAuth";
import { useIsCommunityAdmin } from "@/hooks/useIsCommunityAdmin";
import { useGroups } from "@/queries/groupQueries";
import { useNotification } from "@/context/NotificationContext";
import { useChannelParticipants } from "@/hooks/useChannelParticipants";
import { useCommunityActivityMercure } from "@/hooks/useCommunityActivityMercure";
import { useCommunityEmojiMercure } from "@/hooks/useCommunityEmojiMercure";
import { useCommunityMercure } from "@/hooks/useCommunityMercure";
import {
  useChannelNotificationLevel,
  useIsCommunityMuted,
  useNotificationPreferences,
  useChannelPinState,
  useSetChannelPinState,
} from "@/queries/notificationPreferenceQueries";
import { useUnreadMentionChannels } from "@/queries/notificationQueries";
import { useUserPreferences, useToggleSectionCollapse } from "@/queries/userPreferencesQueries";
import { buildSidebarSections } from "@/utils/sidebarSections";
import { CommunitySettingsModal } from "@/components/CommunitySettingsModal";
import { LeaveCommunityModal } from "@/components/LeaveCommunityModal";
import { ReorderSectionsModal } from "@/components/ReorderSectionsModal";
import { ReorderChannelsModal } from "@/components/ReorderChannelsModal";
import { SectionModal } from "@/components/SectionModal";
import { ChannelModal } from "@/components/ChannelModal";
import { NotificationPopover } from "@/components/NotificationPopover";
import { ChannelParticipantsList } from "@/components/ChannelParticipantsList";
import { ChannelNotificationMenu } from "@/components/ChannelNotificationMenu";
import { Menu, MenuItem } from "@/components/ui";
import {
  EditIcon,
  TrashIcon,
  CheckIcon,
  CheckDoubleIcon,
  XIcon,
  PlusIcon,
  LockIcon,
  ArchiveIcon,
  ReadonlyIcon,
  ReadonlyRepliesIcon,
  BellIcon,
  HeadphonesIcon,
  LogOutIcon,
  ChevronRightIcon,
  EllipsisIcon,
  ArrowUpDownIcon,
} from "@/components/icons";
import { useMarkCommunityAllRead } from "@/queries/readStateQueries";
import { useMobileNav } from "@/context/MobileNavContext";
import { cn } from "@/utils/cn";
import type { Channel, ChannelSection, ChannelPinState } from "@/types/api";

interface Props {
  communityId: string;
}

export function ChannelSidebar({ communityId }: Props) {
  const { t } = useTranslation(["community", "common"]);
  const { data: community } = useCommunity(communityId);
  const { data: membership } = useCommunityMembership(communityId);
  const { user } = useAuth();
  const isAdmin = useIsCommunityAdmin(communityId);
  const isCommunityModerator = membership?.role === "moderator";
  const canSeeModLog = isAdmin || isCommunityModerator;
  const { data: groups = [] } = useGroups(communityId);
  const ownsAnyGroup = user != null && groups.some((g) => g.ownerId === user.id);
  const { notify } = useNotification();

  const [settingsTab, setSettingsTab] = useState<
    "overview" | "roles" | "groups" | "emojis" | "moderation" | null
  >(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [editSection, setEditSection] = useState<ChannelSection | null>(null);
  const [createChannelForSection, setCreateChannelForSection] = useState<ChannelSection | null>(
    null,
  );
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<number | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reorderSectionsOpen, setReorderSectionsOpen] = useState(false);
  const [reorderChannelsFor, setReorderChannelsFor] = useState<ChannelSection | null>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const markCommunityRead = useMarkCommunityAllRead(communityId);

  const { data: unreadData } = useNotificationUnreadCounts();
  const communityNumericId = community?.id;
  const unreadCount =
    communityNumericId !== undefined ? (unreadData?.counts?.[String(communityNumericId)] ?? 0) : 0;

  useCommunityActivityMercure(communityId);
  useCommunityEmojiMercure(communityId);
  useCommunityMercure(communityId);
  const { data: snapshot } = useNotificationPreferences();
  const isCommunityMuted = useIsCommunityMuted(communityNumericId);
  const hasJoined = membership?.hasMembership ?? false;

  const params = useParams({ strict: false });
  const activeChannelId = (params as { channelId?: string }).channelId;

  const { data: unreadChannels = [] } = useChannelUnread(communityId);
  const mentionChannels = useUnreadMentionChannels(communityId);

  const deleteSection = useDeleteSection(communityId);

  const { data: prefs } = useUserPreferences();
  const toggleCollapse = useToggleSectionCollapse();
  const pinStateByChannelId = new Map<number, ChannelPinState | null>(
    (snapshot?.channels ?? []).map((c) => [c.channelId, c.pinState ?? null]),
  );

  const builtSections = buildSidebarSections({
    sections: community?.channelSections ?? [],
    channels: community?.channels ?? [],
    communityId,
    pinStateByChannelId,
    collapseMap: prefs?.sectionCollapse ?? {},
    unreadIdentifiers: new Set(unreadChannels),
    labels: {
      favorites: t("favorites_section"),
      hidden: t("hidden_section"),
      archived: t("archived_section"),
    },
  });
  const hasRealSections = (community?.channelSections ?? []).length > 0;

  const { navOpen } = useMobileNav();

  return (
    <>
      <aside
        className={cn(
          "group/sidebar w-60 overflow-y-auto bg-surface px-2 pb-4",
          "max-md:fixed max-md:inset-y-0 max-md:left-16 max-md:z-40 max-md:w-[calc(100vw-4rem)] max-md:max-w-72 max-md:transition-transform",
          navOpen ? "max-md:translate-x-0" : "max-md:-translate-x-[calc(4rem+100%)]",
          "md:static md:w-60",
        )}
      >
        <div className="group -mx-2 mb-2 flex items-center justify-between gap-2 border-b-2 border-[color-mix(in_srgb,var(--accent)_55%,transparent)] px-4 py-3">
          <h2
            className="min-w-0 flex-1 text-[0.9375rem] font-bold text-fg"
            title={community?.name ?? undefined}
          >
            <span className="block cap-trim-truncate truncate">{community?.name ?? "…"}</span>
          </h2>
          <div className="flex h-8 items-center gap-0.5">
            {(user || isAdmin || canSeeModLog || ownsAnyGroup || hasJoined) && (
              <Menu
                align="right"
                label={t("common:more")}
                testId="community-actions-btn"
                trigger={
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-raised hover:text-fg">
                    <EllipsisIcon />
                  </span>
                }
              >
                {user && (
                  <MenuItem
                    onSelect={() =>
                      markCommunityRead.mutate(undefined, {
                        onSuccess: () => notify(t("mark_community_read_done"), "success"),
                      })
                    }
                    iconLeft={<CheckDoubleIcon />}
                  >
                    {t("mark_community_read")}
                  </MenuItem>
                )}
                {(isAdmin || canSeeModLog || ownsAnyGroup) && (
                  <MenuItem
                    testId="manage-community"
                    onSelect={() =>
                      setSettingsTab(isAdmin ? "overview" : canSeeModLog ? "moderation" : "groups")
                    }
                    iconLeft={<EditIcon />}
                  >
                    {t("manage_community")}
                  </MenuItem>
                )}
                {isAdmin && (
                  <MenuItem onSelect={() => setCreateSectionOpen(true)} iconLeft={<PlusIcon />}>
                    <span className="block cap-trim">{t("add_section")}</span>
                  </MenuItem>
                )}
                {isAdmin && hasRealSections && (
                  <MenuItem
                    testId="reorder-sections-open"
                    onSelect={() => setReorderSectionsOpen(true)}
                    iconLeft={<ArrowUpDownIcon />}
                  >
                    {t("reorder_sections")}
                  </MenuItem>
                )}
                {hasJoined && (
                  <MenuItem
                    danger
                    onSelect={() => setShowLeaveDialog(true)}
                    iconLeft={<LogOutIcon />}
                  >
                    {t("leave_community")}
                  </MenuItem>
                )}
              </Menu>
            )}
            {user && (
              <div className="relative">
                <button
                  ref={bellRef}
                  data-testid="notification-bell"
                  onClick={() => setNotificationsOpen((o) => !o)}
                  title={t("notifications")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-raised hover:text-fg"
                >
                  <BellIcon />
                  {unreadCount > 0 && (
                    <span
                      data-testid="notification-unread-badge"
                      className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-0.5 text-[0.5625rem] font-bold leading-none text-white"
                    >
                      <span className="block cap-trim">{unreadCount > 9 ? "9+" : unreadCount}</span>
                    </span>
                  )}
                </button>
                {notificationsOpen &&
                  createPortal(
                    <NotificationPopover
                      anchorRef={bellRef}
                      communityIdentifier={communityId}
                      onClose={() => setNotificationsOpen(false)}
                    />,
                    document.body,
                  )}
              </div>
            )}
          </div>
        </div>

        {!hasRealSections && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-fg-muted">
            <p className="font-medium">{t("no_channels_yet")}</p>
            <p className="text-[0.6875rem] opacity-80">
              {isAdmin ? t("no_channels_yet_admin_hint") : t("no_channels_yet_hint")}
            </p>
            {isAdmin && (
              <button
                onClick={() => setCreateSectionOpen(true)}
                className="mt-1 rounded-lg bg-accent-gradient px-3 py-1 text-[0.6875rem] font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
              >
                <span className="block cap-trim">{t("add_section")}</span>
              </button>
            )}
          </div>
        )}
        <nav aria-label={t("channels_nav")}>
          {builtSections.map((s, i) => (
            <div
              key={s.key}
              className={cn("mb-2", i > 0 && "pt-1.5")}
              data-testid={
                s.kind === "favorites"
                  ? "sidebar-favorites-section"
                  : s.kind === "hidden"
                    ? "sidebar-hidden-section"
                    : s.kind === "archived"
                      ? "sidebar-archived-section"
                      : undefined
              }
            >
              <div className="group flex items-center justify-between px-1 pb-1">
                <button
                  onClick={() => toggleCollapse(s.key, !s.collapsed)}
                  aria-expanded={!s.collapsed}
                  className="flex flex-1 items-center gap-1 text-left"
                >
                  <ChevronRightIcon
                    size={12}
                    className={`-mt-0.5 shrink-0 transition-transform ${
                      s.collapsed ? "text-fg-muted" : "rotate-90 text-[var(--accent)]"
                    }`}
                  />
                  <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-fg-subtle">
                    {s.name}
                  </span>
                  {s.collapsed && s.hasUnread && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  )}
                </button>
                {isAdmin &&
                  s.section &&
                  (confirmDeleteSection === s.section.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-fg-muted">{t("delete_section_confirm")}</span>
                      <button
                        onClick={async () => {
                          try {
                            await deleteSection.mutateAsync(s.section!.id);
                            notify(t("section_deleted"), "success");
                          } catch {
                            notify(t("section_delete_error"), "error");
                          }
                          setConfirmDeleteSection(null);
                        }}
                        title={t("confirm_delete")}
                        className="text-fg-subtle hover:text-danger"
                      >
                        <CheckIcon />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteSection(null)}
                        title={t("cancel_delete")}
                        className="text-fg-subtle hover:text-fg"
                      >
                        <XIcon />
                      </button>
                    </div>
                  ) : (
                    <span className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <Menu
                        align="right"
                        label={t("common:more")}
                        testId="section-actions-btn"
                        trigger={
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-raised hover:text-fg">
                            <EllipsisIcon />
                          </span>
                        }
                      >
                        <MenuItem
                          onSelect={() => setCreateChannelForSection(s.section)}
                          iconLeft={<PlusIcon />}
                        >
                          {t("add_channel")}
                        </MenuItem>
                        <MenuItem
                          onSelect={() => setEditSection(s.section)}
                          iconLeft={<EditIcon />}
                        >
                          {t("edit_section")}
                        </MenuItem>
                        {s.section && s.channels.length > 1 && (
                          <MenuItem
                            testId="reorder-channels-open"
                            onSelect={() => setReorderChannelsFor(s.section)}
                            iconLeft={<ArrowUpDownIcon />}
                          >
                            {t("reorder_channels")}
                          </MenuItem>
                        )}
                        {s.isEmpty && (
                          <MenuItem
                            danger
                            onSelect={() => setConfirmDeleteSection(s.section!.id)}
                            iconLeft={<TrashIcon />}
                          >
                            {t("delete_section")}
                          </MenuItem>
                        )}
                      </Menu>
                    </span>
                  ))}
              </div>
              {!s.collapsed &&
                s.channels.map((channel) => {
                  const isActive = channel.identifier === activeChannelId;

                  if (channel.type === "audio") {
                    return (
                      <AudioChannelSidebarItem
                        key={channel["@id"]}
                        channel={channel}
                        communityId={communityId}
                      />
                    );
                  }

                  return (
                    <ChannelRow
                      key={channel["@id"]}
                      channel={channel}
                      communityId={communityId}
                      isUnread={!isActive && unreadChannels.includes(channel.identifier)}
                      hasUnreadMention={!isActive && mentionChannels.has(channel.identifier)}
                      communityMuted={isCommunityMuted}
                      hasJoined={hasJoined}
                      isAdmin={isAdmin}
                    />
                  );
                })}
            </div>
          ))}
        </nav>
      </aside>

      {settingsTab && user && (
        <CommunitySettingsModal
          communityId={communityId}
          currentUserId={user.id}
          isAdmin={isAdmin}
          ownsAnyGroup={ownsAnyGroup}
          canSeeModLog={canSeeModLog}
          canLiftModerationActions={isAdmin}
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
        />
      )}

      {showLeaveDialog && community && (
        <LeaveCommunityModal
          communityIdentifier={community.identifier}
          communityName={community.name}
          onClose={() => setShowLeaveDialog(false)}
        />
      )}
      {createSectionOpen && (
        <SectionModal
          mode="create"
          communityId={communityId}
          onClose={() => setCreateSectionOpen(false)}
        />
      )}
      {editSection && (
        <SectionModal
          mode="edit"
          section={editSection}
          communityId={communityId}
          onClose={() => setEditSection(null)}
        />
      )}
      {createChannelForSection && (
        <ChannelModal
          mode="create"
          communityId={communityId}
          section={createChannelForSection}
          onClose={() => setCreateChannelForSection(null)}
        />
      )}
      {reorderSectionsOpen && community && (
        <ReorderSectionsModal
          communityId={communityId}
          sections={community.channelSections ?? []}
          onClose={() => setReorderSectionsOpen(false)}
        />
      )}
      {reorderChannelsFor && (
        <ReorderChannelsModal
          communityId={communityId}
          sectionId={reorderChannelsFor.id}
          sectionName={reorderChannelsFor.name}
          channels={(community?.channels ?? []).filter(
            (c) => c.section.id === reorderChannelsFor.id,
          )}
          onClose={() => setReorderChannelsFor(null)}
        />
      )}
    </>
  );
}

function ChannelRow({
  channel,
  communityId,
  isUnread,
  hasUnreadMention,
  communityMuted,
  hasJoined,
  isAdmin,
}: {
  channel: Channel;
  communityId: string;
  isUnread: boolean;
  hasUnreadMention: boolean;
  communityMuted: boolean;
  hasJoined: boolean;
  isAdmin: boolean;
}) {
  const { t } = useTranslation(["channel", "common"]);
  const { user } = useAuth();
  const { notify } = useNotification();
  const level = useChannelNotificationLevel(channel.id);
  const pinState = useChannelPinState(channel.id);
  const setPin = useSetChannelPinState();
  const [menuOpen, setMenuOpen] = useState(false);
  const isFavorite = pinState === "favorite";
  const isHidden = pinState === "hidden";
  const setPinState = (next: "favorite" | "hidden" | null) =>
    setPin.mutate({
      communityIdentifier: communityId,
      channelIdentifier: channel.identifier,
      channelId: channel.id,
      pinState: next,
    });
  const suppressBold = communityMuted || level === "none";
  const effectiveUnread = isUnread && !suppressBold;
  const { closeNav } = useMobileNav();
  const { confirm, confirmDialog } = useConfirm();
  const archive = useArchiveChannel();
  const unarchive = useUnarchiveChannel();
  const serverInfo = useServerInfo();
  const isArchived = !!channel.archivedAt;
  const retentionDays = serverInfo?.archivedChannelRetentionDays ?? 0;

  const handleArchiveToggle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setMenuOpen(false);
    if (isArchived) {
      try {
        await unarchive.mutateAsync({
          communityIdentifier: communityId,
          channelIdentifier: channel.identifier,
        });
      } catch {
        notify(t("archive_failed"), "error");
      }
      return;
    }
    const ok = await confirm({
      title: t("archive_confirm_title", { channel: channel.name }),
      message:
        retentionDays > 0
          ? t("archive_confirm_message_retention", { days: retentionDays })
          : t("archive_confirm_message"),
      confirmLabel: t("archive_confirm_label"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await archive.mutateAsync({
        communityIdentifier: communityId,
        channelIdentifier: channel.identifier,
      });
    } catch {
      notify(t("archive_failed"), "error");
    }
  };

  return (
    <div className="group relative">
      <Link
        to="/$communityId/$channelId"
        params={{ communityId, channelId: channel.identifier }}
        onClick={closeNav}
        className={`my-px flex items-center gap-2 rounded-lg px-2.5 py-[5px] text-sm ${
          effectiveUnread
            ? "font-semibold text-fg hover:bg-raised"
            : "text-fg-muted hover:bg-raised hover:text-fg"
        }`}
        activeProps={{
          "aria-current": "page",
          className:
            "my-px flex items-center gap-2 rounded-lg px-2.5 py-[5px] text-sm bg-raised text-accent shadow-soft-sm ring-1 ring-[var(--accent)]/15",
        }}
      >
        <span className="min-w-0 truncate"># {channel.name}</span>
        {hasUnreadMention && !suppressBold && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
            title={t("unread_mention")}
          />
        )}
        {channel.isPrivate && (
          <LockIcon className="shrink-0 opacity-60" title={t("private_channel")} />
        )}
        {channel.isReadonly &&
          (channel.areReadonlyRepliesAllowed ? (
            <ReadonlyRepliesIcon
              className="shrink-0 opacity-60"
              title={t("readonly_replies_channel")}
            />
          ) : (
            <ReadonlyIcon className="shrink-0 opacity-60" title={t("readonly_channel")} />
          ))}
        {!!channel.archivedAt && (
          <ArchiveIcon className="shrink-0 opacity-60" title={t("archived_channel")} />
        )}
        <span className="flex-1" />
        {hasJoined && !isArchived && (
          <ChannelNotificationMenu
            communityIdentifier={communityId}
            channelIdentifier={channel.identifier}
            channelId={channel.id}
          />
        )}
        {user && (
          <button
            type="button"
            data-testid="channel-more-actions-btn"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen((o) => !o);
            }}
            title={t("more_actions")}
            className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-fg-subtle hover:text-fg"
          >
            <EllipsisIcon size={14} />
          </button>
        )}
      </Link>
      {menuOpen && (
        <div
          className="absolute right-2 top-7 z-20 w-44 rounded-md border border-line bg-overlay py-1 text-sm shadow-soft-md"
          onMouseLeave={() => setMenuOpen(false)}
        >
          {!isArchived && (
            <>
              <button
                type="button"
                data-testid="channel-favorite-btn"
                onClick={(e) => {
                  e.preventDefault();
                  setPinState(isFavorite ? null : "favorite");
                  setMenuOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-surface"
              >
                {t(isFavorite ? "unfavorite" : "favorite")}
              </button>
              <button
                type="button"
                data-testid="channel-hide-btn"
                onClick={(e) => {
                  e.preventDefault();
                  setPinState(isHidden ? null : "hidden");
                  setMenuOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-surface"
              >
                {t(isHidden ? "unhide_channel" : "hide_channel")}
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              data-testid={isArchived ? "channel-unarchive-btn" : "channel-archive-btn"}
              onClick={handleArchiveToggle}
              className="block w-full px-3 py-1.5 text-left hover:bg-surface"
            >
              {t(isArchived ? "unarchive_channel" : "archive_channel")}
            </button>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function AudioChannelSidebarItem({
  channel,
  communityId,
}: {
  channel: Channel;
  communityId: string;
}) {
  const { t } = useTranslation(["channel", "common"]);
  const { user } = useAuth();
  const { data: participants = [] } = useChannelParticipants(communityId, channel.identifier);
  const pinState = useChannelPinState(channel.id);
  const setPin = useSetChannelPinState();
  const [menuOpen, setMenuOpen] = useState(false);
  const isFavorite = pinState === "favorite";
  const isHidden = pinState === "hidden";
  const setPinState = (next: "favorite" | "hidden" | null) =>
    setPin.mutate({
      communityIdentifier: communityId,
      channelIdentifier: channel.identifier,
      channelId: channel.id,
      pinState: next,
    });
  const { closeNav } = useMobileNav();

  return (
    <div className="group relative">
      <Link
        to="/$communityId/$channelId"
        params={{ communityId, channelId: channel.identifier }}
        onClick={closeNav}
        className="my-px flex items-center gap-2 rounded-lg px-2.5 py-[5px] text-sm text-fg-muted hover:bg-raised hover:text-fg"
        activeProps={{
          "aria-current": "page",
          className:
            "my-px flex items-center gap-2 rounded-lg px-2.5 py-[5px] text-sm bg-raised text-accent shadow-soft-sm ring-1 ring-[var(--accent)]/15",
        }}
      >
        <HeadphonesIcon size={13} className="shrink-0 opacity-60" title={t("voice_channel")} />
        <span className="min-w-0 truncate">{channel.name}</span>
        {channel.isPrivate && (
          <LockIcon className="shrink-0 opacity-60" title={t("private_channel")} />
        )}
        <span className="flex-1" />
        {participants.length > 0 && (
          <span className="shrink-0 rounded-full bg-success/20 px-1.5 py-0.5 text-[0.625rem] font-semibold text-success">
            {participants.length}
          </span>
        )}
        {user && (
          <button
            type="button"
            data-testid="channel-more-actions-btn"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen((o) => !o);
            }}
            title={t("more_actions")}
            className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-fg-subtle hover:text-fg"
          >
            <EllipsisIcon size={14} />
          </button>
        )}
      </Link>
      {menuOpen && (
        <div
          className="absolute right-2 top-7 z-20 w-44 rounded-md border border-line bg-overlay py-1 text-sm shadow-soft-md"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            type="button"
            data-testid="channel-favorite-btn"
            onClick={(e) => {
              e.preventDefault();
              setPinState(isFavorite ? null : "favorite");
              setMenuOpen(false);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-surface"
          >
            {t(isFavorite ? "unfavorite" : "favorite")}
          </button>
          <button
            type="button"
            data-testid="channel-hide-btn"
            onClick={(e) => {
              e.preventDefault();
              setPinState(isHidden ? null : "hidden");
              setMenuOpen(false);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-surface"
          >
            {t(isHidden ? "unhide_channel" : "hide_channel")}
          </button>
        </div>
      )}
      <ChannelParticipantsList participants={participants} channelIdentifier={channel.identifier} />
    </div>
  );
}
