import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useNewMessageCounter } from "@/hooks/useNewMessageCounter";
import { ChannelHeader } from "@/components/chat/ChannelHeader";
import { ChannelModals } from "@/components/chat/ChannelModals";
import { getChannelPermissions } from "@/utils/channelPermissions";
import { useSearchHotkey } from "@/hooks/useSearchHotkey";
import { useAuthModal } from "@/context/AuthModalContext";
import type { InfiniteData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/api/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchChannelPage, fetchChannelPages } from "@/api/pages";
import { fetchMessage } from "@/api/messages";
import { prefetchMessagePermalinks } from "@/utils/prefetchMessagePermalinks";
import { fetchCommunity, fetchCommunityMembers } from "@/api/communities";
import { fetchCommunityMembership } from "@/api/membership";
import { queryKeys } from "@/queries/queryKeys";
import { StaleTime } from "@/queries/staleTimes";
import { fetchCommunityEmojis } from "@/api/communityEmojis";
import {
  useDeleteAttachment,
  useDeleteMessage,
  useEditMessage,
  useInfiniteChannelMessages,
  useSendMessage,
} from "@/queries/messageQueries";
import {
  usePinMessage,
  useUnpinMessage,
  useChannelPinnedMessages,
} from "@/queries/pinnedMessageQueries";
import { useChannelMembers, useMarkChannelRead } from "@/queries/channelQueries";
import { useToggleReaction } from "@/queries/reactionQueries";
import { useCommunity, useCommunityMembers } from "@/queries/communityQueries";
import { useCommunityMembership } from "@/queries/membershipQueries";
import { useCommunityEmojis } from "@/queries/communityEmojiQueries";
import type { MemberItem } from "@/utils/userMentionExtension";
import { useChannelMercure } from "@/hooks/useMercure";
import { usePrefetchMessagePermalinks } from "@/hooks/usePrefetchMessagePermalinks";
import { useAuth } from "@/hooks/useAuth";
import { useServerInfo } from "@/hooks/useServerInfo";
import { getAccessToken } from "@/api/tokenStore";
import { useTimezone } from "@/context/TimezoneContext";
import { useNotification } from "@/context/NotificationContext";
import type { ChannelPage } from "@/types/api";
import { toMemberItems } from "@/utils/toMemberItems";
import { stripToPlaintext } from "@/utils/embedSnippet";
import { MessagePane } from "@/components/chat/MessagePane";
import { MessageHistoryModal } from "@/components/chat/MessageHistoryModal";
import { EmbedMessageModal } from "@/components/chat/EmbedMessageModal";
import { ReportModal } from "@/components/ReportModal";
import { uuidFromIri } from "@/api/hydra";
import { UserModerationModal } from "@/components/UserModerationModal";
import { JoinCommunityBanner } from "@/components/JoinCommunityBanner";
import { AudioChannelView } from "@/components/AudioChannelView";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  MicrophoneIcon,
  EditIcon,
  ManageUsersIcon,
  UsersIcon,
  SearchIcon,
  PinIcon,
  StarIcon,
  StarFilledIcon,
} from "@/components/icons";
import { MessagePaneSkeleton } from "@/components/ui/Skeleton";
import { useChannelPinState, useSetChannelPinState } from "@/queries/notificationPreferenceQueries";
import { SearchDialog } from "@/components/chat/SearchDialog";
import { PinnedMessagesModal } from "@/components/PinnedMessagesModal";
import { ThreadPanel } from "@/components/chat/ThreadPanel";
import { MobileTopBar } from "@/components/MobileTopBar";
import { MobileActionMenu } from "@/components/MobileActionMenu";
import type { MobileActionItem } from "@/components/MobileActionMenu";
import { writeLastLocation } from "@/utils/lastLocation";

interface ChannelSearch {
  m?: string;
  t?: string;
}

export const Route = createFileRoute("/_app/$communityId/$channelId")({
  validateSearch: (search: Record<string, unknown>): ChannelSearch => {
    const out: ChannelSearch = {};
    if (typeof search.m === "string" && search.m.length > 0) out.m = search.m;
    if (typeof search.t === "string" && search.t.length > 0) out.t = search.t;
    return out;
  },
  loaderDeps: ({ search }) => ({ m: search.m }),
  loader: async ({ context: { queryClient, auth }, params, deps }) => {
    try {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.communityEmojis(params.communityId),
        queryFn: () => fetchCommunityEmojis(params.communityId),
        staleTime: StaleTime.long,
      });
      const community = await queryClient.ensureQueryData({
        queryKey: queryKeys.community(params.communityId),
        queryFn: () => fetchCommunity(params.communityId),
      });
      const channel = community.channels.find((c) => c.identifier === params.channelId);
      if (!channel) {
        throw redirect({
          to: "/$communityId",
          params: { communityId: params.communityId },
          replace: true,
        });
      }

      const prefetches: Promise<unknown>[] = [];
      if (auth.token) {
        prefetches.push(
          queryClient.prefetchQuery({
            queryKey: queryKeys.communityMembers(params.communityId),
            queryFn: () => fetchCommunityMembers(params.communityId),
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.communityMembership(params.communityId),
            queryFn: () => fetchCommunityMembership(params.communityId),
            staleTime: StaleTime.long,
          }),
        );
      }

      let latestPageNumber = 1;
      let initialPageNumber = 1;
      let focusMessageId: string | null = null;

      if ((channel.type ?? "text") !== "audio") {
        const pages = await fetchChannelPages(params.communityId, params.channelId);
        const latestPage = pages[pages.length - 1];
        latestPageNumber = latestPage?.pageNumber ?? 1;
        initialPageNumber = latestPageNumber;

        if (deps.m) {
          try {
            const target = await fetchMessage(deps.m);
            const mismatch =
              target.communityIdentifier !== params.communityId ||
              target.channelIdentifier !== params.channelId;
            if (mismatch && target.communityIdentifier && target.channelIdentifier) {
              throw redirect({
                to: "/$communityId/$channelId",
                params: {
                  communityId: target.communityIdentifier,
                  channelId: target.channelIdentifier,
                },
                search: { m: deps.m },
                replace: true,
              });
            }
            if (target.pageNumber) {
              initialPageNumber = target.pageNumber;
              focusMessageId = target["@id"];
            }
          } catch (err) {
            if (err instanceof ApiError) {
              focusMessageId = null;
            } else {
              throw err;
            }
          }
        }

        if (latestPage) {
          prefetches.push(
            fetchChannelPage(params.communityId, params.channelId, initialPageNumber).then(
              async (pageData) => {
                queryClient.setQueryData<InfiniteData<ChannelPage, number>>(
                  queryKeys.channelPages(params.communityId, params.channelId),
                  { pages: [pageData], pageParams: [initialPageNumber] },
                );
                await prefetchMessagePermalinks(queryClient, pageData.messages ?? []);
              },
            ),
          );
          if (initialPageNumber !== latestPageNumber) {
            prefetches.push(
              fetchChannelPage(params.communityId, params.channelId, latestPageNumber)
                .then((pageData) => {
                  queryClient.setQueryData<ChannelPage>(
                    queryKeys.channelLatestPage(params.communityId, params.channelId),
                    pageData,
                  );
                })
                .catch(() => {}),
            );
          }
        } else {
          queryClient.setQueryData<InfiniteData<ChannelPage, number>>(
            queryKeys.channelPages(params.communityId, params.channelId),
            { pages: [], pageParams: [] },
          );
        }
      }

      await Promise.all(prefetches);
      return { latestPageNumber, focusMessageId, initialPageNumber };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw redirect({ to: "/" });
      }
      if (err instanceof ApiError && err.status === 401) {
        if (!auth.token) {
          throw redirect({ to: "/" });
        }
        return { latestPageNumber: 1, focusMessageId: null, initialPageNumber: 1 };
      }
      throw err;
    }
  },
  pendingMs: 100,
  pendingMinMs: 0,
  pendingComponent: ChannelPendingPane,
  component: ChannelPage,
});

function ChannelPendingPane() {
  return (
    <main className="flex min-w-0 flex-1">
      <MessagePaneSkeleton />
    </main>
  );
}

function ChannelPage() {
  const { t } = useTranslation(["channel", "auth", "common"]);
  const { communityId, channelId } = Route.useParams();
  const { latestPageNumber, focusMessageId, initialPageNumber } = Route.useLoaderData();
  const queryClient = useQueryClient();

  const { mutate: markRead } = useMarkChannelRead(communityId);
  const updateLastViewed = useCallback(() => {
    if (!getAccessToken()) return;
    markRead(channelId);
  }, [markRead, channelId]);

  useEffect(() => {
    updateLastViewed();
  }, [updateLastViewed]);

  const navigate = useNavigate();
  const { data: community } = useCommunity(communityId);
  const { data: rawMembers } = useCommunityMembers(communityId);
  useCommunityEmojis(communityId);
  const currentChannel = community?.channels.find((c) => c.identifier === channelId);
  const channelTopic = currentChannel
    ? `/api/communities/${communityId}/channels/${channelId}`
    : "";

  useEffect(() => {
    if (community && !currentChannel) {
      void navigate({ to: "/$communityId", params: { communityId }, replace: true });
    }
  }, [community, currentChannel, communityId, navigate]);

  const { user, token } = useAuth();
  const serverInfo = useServerInfo();
  const { openLogin, openRegister } = useAuthModal();
  const { data: membership } = useCommunityMembership(communityId);

  useEffect(() => {
    if (user) {
      writeLastLocation(user.id, { kind: "channel", communityId, channelId });
    }
  }, [user, communityId, channelId]);
  const {
    isAdmin,
    isMember,
    hasJoined,
    isChannelModerator,
    isCommunityModerator,
    canViewMembers,
    canPin,
    canModerate,
    canManageChannelMembers,
    canBroadcast,
  } = getChannelPermissions(community, currentChannel, user, membership);

  const { data: channelMembersData = [] } = useChannelMembers(
    communityId,
    channelId,
    (currentChannel?.isPrivate ?? false) && canViewMembers,
  );
  const moderatorUserIds = useMemo(
    () => new Set(channelMembersData.filter((m) => m.role === "moderator").map((m) => m.userId)),
    [channelMembersData],
  );
  const groupsByUserId = useMemo(() => {
    const map = new Map<number, import("@/types/api").UserGroup[]>();
    for (const m of rawMembers ?? []) {
      if (m.groups && m.groups.length > 0) map.set(m.userId, m.groups);
    }
    return map;
  }, [rawMembers]);

  const memberItems = useMemo<MemberItem[]>(
    () => toMemberItems(rawMembers, user?.id),
    [rawMembers, user?.id],
  );
  const searchMemberItems = useMemo<MemberItem[]>(
    () => toMemberItems(rawMembers, undefined),
    [rawMembers],
  );
  const { timezone } = useTimezone();
  useDocumentTitle(
    community && currentChannel ? `#${currentChannel.name} · ${community.name}` : "",
  );

  const isTextChannel = currentChannel?.type !== "audio";
  const canEmbed =
    !!community && community.isPrivate === false && currentChannel?.isPrivate === false;
  const isArchived = !!currentChannel?.archivedAt;

  const {
    data: pagesData,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteChannelMessages(
    communityId,
    channelId,
    initialPageNumber,
    latestPageNumber,
    isTextChannel,
  );

  const messages = useMemo(
    () => pagesData?.pages.flatMap((p) => p.messages ?? []) ?? [],
    [pagesData],
  );
  usePrefetchMessagePermalinks(messages);

  const { notify } = useNotification();
  const pinState = useChannelPinState(currentChannel?.id);
  const setPin = useSetChannelPinState();
  const isFavorite = pinState === "favorite";

  const toggleFavorite = useCallback(() => {
    if (!currentChannel) return;
    const next = isFavorite ? null : "favorite";
    setPin.mutate(
      {
        communityIdentifier: communityId,
        channelIdentifier: currentChannel.identifier,
        channelId: currentChannel.id,
        pinState: next,
      },
      {
        onSuccess: () =>
          notify(
            t(next === "favorite" ? "starred_toast" : "unstarred_toast", {
              channel: currentChannel.identifier,
            }),
            "success",
          ),
      },
    );
  }, [currentChannel, isFavorite, setPin, communityId, notify, t]);

  const sendMessage = useSendMessage(communityId, channelId, user ?? null, () =>
    notify(t("common:too_many_requests"), "error"),
  );
  const editMessage = useEditMessage(communityId, channelId);
  const deleteMessage = useDeleteMessage(communityId, channelId);
  const deleteAttachmentMutation = useDeleteAttachment(communityId, channelId);
  const toggleReaction = useToggleReaction(communityId, channelId, user?.id ?? 0);
  const pinMessageMutation = usePinMessage(communityId, channelId);
  const unpinMessageMutation = useUnpinMessage(communityId, channelId);
  const { data: pinnedMessages } = useChannelPinnedMessages(communityId, channelId);
  const hasPinnedMessages = (pinnedMessages?.length ?? 0) > 0;

  const {
    newMessagesCount,
    scrollToBottomTrigger,
    hasNextPageRef,
    isLatestLoaded,
    bumpNewMessagesCount,
    resetNewMessagesCount,
    triggerScrollToBottom,
  } = useNewMessageCounter(hasNextPage);
  useChannelMercure(channelTopic, communityId, channelId, {
    isLatestLoaded,
    onNewMessageWhileHistorical: bumpNewMessagesCount,
  });

  const [historyMessageIri, setHistoryMessageIri] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [editChannelOpen, setEditChannelOpen] = useState(false);
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [threadRootIri, setThreadRootIri] = useState<string | null>(null);
  const [embedMessageIri, setEmbedMessageIri] = useState<string | null>(null);
  const [reportMessageIri, setReportMessageIri] = useState<string | null>(null);
  const { t: searchT } = Route.useSearch();
  if (searchT && focusMessageId && !threadRootIri) {
    setThreadRootIri(focusMessageId);
  }
  const clearReplyFocus = useCallback(() => {
    void navigate({
      to: "/$communityId/$channelId",
      params: { communityId, channelId },
      search: (prev) => {
        const next = { ...(prev as ChannelSearch) };
        delete next.t;
        return next;
      },
      replace: true,
    });
  }, [navigate, communityId, channelId]);

  const mobileOverflowItems = useMemo<MobileActionItem[]>(() => {
    const items: MobileActionItem[] = [];
    items.push({
      key: "pinned",
      icon: <PinIcon size={16} />,
      label: t("pinned_messages_title"),
      onClick: () => setPinnedOpen(true),
    });
    if (currentChannel?.isPrivate && !isAdmin && canViewMembers) {
      items.push({
        key: "members",
        icon: <UsersIcon size={16} />,
        label: t("view_members"),
        onClick: () => setMembersModalOpen(true),
      });
    }
    if (isAdmin || (canManageChannelMembers && currentChannel?.isPrivate)) {
      items.push({
        key: "manage-access",
        icon: <ManageUsersIcon size={16} />,
        label: t("manage_access"),
        onClick: () => setManageAccessOpen(true),
      });
    }
    if (currentChannel && token) {
      items.push({
        key: "favorite",
        icon: isFavorite ? <StarFilledIcon size={16} /> : <StarIcon size={16} />,
        label: t(isFavorite ? "unfavorite" : "favorite"),
        onClick: toggleFavorite,
      });
    }
    if (isAdmin && currentChannel) {
      items.push({
        key: "edit-channel",
        icon: <EditIcon size={16} />,
        label: t("edit_channel"),
        onClick: () => setEditChannelOpen(true),
      });
    }
    return items;
  }, [
    t,
    currentChannel,
    isAdmin,
    canViewMembers,
    canManageChannelMembers,
    isFavorite,
    toggleFavorite,
    token,
  ]);

  useSearchHotkey(() => {
    if (token) setSearchOpen((v) => !v);
  });

  const handleToggleReaction = useCallback(
    (messageIri: string, emoji: string, existingId?: number) =>
      toggleReaction.mutate({ messageIri, emoji, existingId }),
    [toggleReaction],
  );
  const handleDeleteMessage = useCallback(
    (messageIri: string) => deleteMessage.mutate(messageIri),
    [deleteMessage],
  );
  const handleEditMessage = useCallback(
    (messageIri: string, text: string) => editMessage.mutate({ messageIri, text }),
    [editMessage],
  );
  const handleViewHistory = useCallback(
    (messageIri: string) => setHistoryMessageIri(messageIri),
    [],
  );
  const handleDeleteAttachment = useCallback(
    (attachmentIri: string) => deleteAttachmentMutation.mutate(attachmentIri),
    [deleteAttachmentMutation],
  );
  const handlePinMessage = useCallback(
    (messageIri: string) => pinMessageMutation.mutate(messageIri),
    [pinMessageMutation],
  );
  const handleUnpinMessage = useCallback(
    (messageIri: string) => unpinMessageMutation.mutate(messageIri),
    [unpinMessageMutation],
  );
  const handleFetchPreviousPage = useCallback(() => {
    void fetchPreviousPage();
  }, [fetchPreviousPage]);
  const handleFetchNextPage = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const clearFocus = useCallback(() => {
    if (!focusMessageId) return;
    void navigate({
      to: "/$communityId/$channelId",
      params: { communityId, channelId },
      search: () => ({}),
      replace: true,
    });
  }, [focusMessageId, navigate, communityId, channelId]);

  const jumpToLatest = useCallback(async () => {
    const shadowKey = queryKeys.channelLatestPage(communityId, channelId);
    const pagesKey = queryKeys.channelPages(communityId, channelId);
    const hasNew = newMessagesCount > 0;
    let latestPage = hasNew ? undefined : queryClient.getQueryData<ChannelPage>(shadowKey);
    if (!latestPage) {
      latestPage = await fetchChannelPage(communityId, channelId, latestPageNumber);
      queryClient.setQueryData<ChannelPage>(shadowKey, latestPage);
    }
    queryClient.setQueryData<InfiniteData<ChannelPage, number>>(pagesKey, {
      pages: [latestPage],
      pageParams: [latestPage.pageNumber],
    });
    resetNewMessagesCount();
    triggerScrollToBottom();
    clearFocus();
    if (hasNew) {
      void queryClient.invalidateQueries({ queryKey: pagesKey });
    }
  }, [
    communityId,
    channelId,
    latestPageNumber,
    newMessagesCount,
    queryClient,
    clearFocus,
    resetNewMessagesCount,
    triggerScrollToBottom,
  ]);

  const handleSend = useCallback(
    async (text: string, attachmentIris?: string[]) => {
      if (hasNextPageRef.current) await jumpToLatest();
      return sendMessage.mutateAsync({ text, attachmentIris });
    },
    [sendMessage, jumpToLatest, hasNextPageRef],
  );

  if (currentChannel?.type === "audio") {
    return (
      <>
        {currentChannel && (
          <ChannelModals
            channel={currentChannel}
            communityId={communityId}
            isAdmin={isAdmin}
            canManageChannelMembers={canManageChannelMembers}
            userId={user?.id}
            editChannelOpen={editChannelOpen}
            manageAccessOpen={manageAccessOpen}
            membersModalOpen={membersModalOpen}
            onCloseEdit={() => setEditChannelOpen(false)}
            onCloseManageAccess={() => setManageAccessOpen(false)}
            onCloseMembers={() => setMembersModalOpen(false)}
            onLeftCommunity={() => {
              setMembersModalOpen(false);
              void navigate({ to: "/$communityId", params: { communityId } });
            }}
          />
        )}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <MobileTopBar
            title={
              <>
                <MicrophoneIcon size={14} className="text-fg-subtle" />
                {currentChannel?.name ?? channelId}
              </>
            }
          />
          <ChannelHeader
            channel={currentChannel}
            communityId={communityId}
            isAudio
            isAuthenticated={!!token}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            hasPinnedMessages={false}
            onOpenPinned={() => {}}
            onOpenSearch={() => {}}
            isAdmin={isAdmin}
            canViewMembers={canViewMembers}
            canManageChannelMembers={canManageChannelMembers}
            onOpenEdit={() => setEditChannelOpen(true)}
            onOpenManageAccess={() => setManageAccessOpen(true)}
            onOpenMembers={() => setMembersModalOpen(true)}
            onUserClick={user ? setProfileUserId : undefined}
          />
          <AudioChannelView channel={currentChannel} />
        </main>
      </>
    );
  }

  const guestFooter = !token ? (
    <div className="border-t border-line px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-sm text-fg-muted">{t("auth:guest_prompt")}</p>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={openLogin}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface"
        >
          {t("auth:sign_in")}
        </button>
        <button
          onClick={openRegister}
          className="rounded-lg bg-accent-gradient px-3 py-1.5 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
        >
          {t("auth:create_account")}
        </button>
      </div>
    </div>
  ) : null;

  const joinFooter =
    token && community && !hasJoined ? (
      <div className="pt-3 max-md:pt-0">
        <JoinCommunityBanner community={community} isAdmin={isAdmin} />
      </div>
    ) : null;

  const readonlyFooter =
    token && (isMember || isAdmin) && currentChannel?.isReadonly && !isAdmin ? (
      <div className="border-t border-line px-4 py-3">
        <p className="text-sm text-fg-muted">{t("readonly_notice")}</p>
      </div>
    ) : null;

  const archivedDeleteDate = (() => {
    const days = serverInfo?.archivedChannelRetentionDays ?? 0;
    if (!isArchived || days <= 0 || !currentChannel?.archivedAt) return null;
    const d = new Date(currentChannel.archivedAt);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString();
  })();

  const archivedFooter = isArchived ? (
    <div className="border-t border-line px-4 py-3">
      <p className="text-sm text-fg-muted" data-testid="archived-notice">
        {t("archived_notice")}
        {archivedDeleteDate ? ` ${t("archived_delete_notice", { date: archivedDeleteDate })}` : ""}
      </p>
    </div>
  ) : null;

  const footer = guestFooter ?? joinFooter ?? archivedFooter ?? readonlyFooter ?? undefined;

  return (
    <>
      {historyMessageIri && (
        <MessageHistoryModal
          messageIri={historyMessageIri}
          onClose={() => setHistoryMessageIri(null)}
        />
      )}
      {embedMessageIri &&
        (() => {
          const msg = messages.find((m) => m["@id"] === embedMessageIri) ?? null;
          return (
            <EmbedMessageModal
              messageIri={embedMessageIri}
              authorName={msg?.createdBy?.profile?.name ?? ""}
              fallbackText={stripToPlaintext(msg?.text ?? "")}
              channelLabel={`in #${currentChannel?.name ?? channelId} · ${community?.name ?? communityId}`}
              onClose={() => setEmbedMessageIri(null)}
            />
          );
        })()}
      {reportMessageIri && (
        <ReportModal
          target={{ messageId: uuidFromIri(reportMessageIri) }}
          onClose={() => setReportMessageIri(null)}
        />
      )}
      {profileUserId !== null && (
        <UserModerationModal
          userId={profileUserId}
          communityId={communityId}
          channelRole={channelMembersData.find((m) => m.userId === profileUserId)?.role}
          canModerate={canModerate}
          callerIsChannelMod={isChannelModerator && !isAdmin && !isCommunityModerator}
          currentChannelId={channelId}
          onClose={() => setProfileUserId(null)}
        />
      )}
      {currentChannel && (
        <ChannelModals
          channel={currentChannel}
          communityId={communityId}
          isAdmin={isAdmin}
          canManageChannelMembers={canManageChannelMembers}
          userId={user?.id}
          editChannelOpen={editChannelOpen}
          manageAccessOpen={manageAccessOpen}
          membersModalOpen={membersModalOpen}
          onCloseEdit={() => setEditChannelOpen(false)}
          onCloseManageAccess={() => setManageAccessOpen(false)}
          onCloseMembers={() => setMembersModalOpen(false)}
          onLeftCommunity={() => {
            setMembersModalOpen(false);
            void navigate({ to: "/$communityId", params: { communityId } });
          }}
        />
      )}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileTopBar
          title={<>#&nbsp;{currentChannel?.name ?? channelId}</>}
          right={
            <MobileActionMenu
              leading={
                token ? (
                  <button
                    data-testid="mobile-search-open-btn"
                    onClick={() => setSearchOpen(true)}
                    title={t("search")}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg"
                  >
                    <SearchIcon size={18} />
                  </button>
                ) : undefined
              }
              items={mobileOverflowItems}
            />
          }
        />
        {currentChannel && (
          <ChannelHeader
            channel={currentChannel}
            communityId={communityId}
            isAudio={false}
            isAuthenticated={!!token}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            hasPinnedMessages={hasPinnedMessages}
            onOpenPinned={() => setPinnedOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            isAdmin={isAdmin}
            canViewMembers={canViewMembers}
            canManageChannelMembers={canManageChannelMembers}
            onOpenEdit={() => setEditChannelOpen(true)}
            onOpenManageAccess={() => setManageAccessOpen(true)}
            onOpenMembers={() => setMembersModalOpen(true)}
            onUserClick={user ? setProfileUserId : undefined}
          />
        )}

        <MessagePane
          messages={messages}
          hasPreviousPage={hasPreviousPage}
          isFetchingPreviousPage={isFetchingPreviousPage}
          fetchPreviousPage={handleFetchPreviousPage}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={handleFetchNextPage}
          newMessagesCount={newMessagesCount}
          scrollToBottomTrigger={scrollToBottomTrigger}
          focusMessageId={focusMessageId}
          onFocusComplete={clearFocus}
          onJumpToLatest={jumpToLatest}
          onSend={handleSend}
          isSending={sendMessage.isPending}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onToggleReaction={handleToggleReaction}
          onViewHistory={handleViewHistory}
          onUserClick={user ? setProfileUserId : undefined}
          onDeleteAttachment={handleDeleteAttachment}
          user={user}
          members={memberItems}
          channels={community?.channels ?? []}
          groupsByUserId={groupsByUserId}
          moderatorUserIds={moderatorUserIds}
          isChannelModerator={isChannelModerator}
          frozen={isArchived}
          canPin={canPin && !isArchived}
          canBroadcast={canBroadcast}
          onPinMessage={handlePinMessage}
          onUnpinMessage={handleUnpinMessage}
          canModerate={canModerate}
          canDeleteSystem={isAdmin}
          canReact={isMember}
          canReply={
            !isArchived &&
            !!user &&
            isMember &&
            (!currentChannel?.isReadonly ||
              !!currentChannel?.areReadonlyRepliesAllowed ||
              canModerate)
          }
          onOpenThread={setThreadRootIri}
          canEmbed={canEmbed}
          onEmbedMessage={setEmbedMessageIri}
          canReport={!!user}
          onReportMessage={setReportMessageIri}
          timezone={timezone}
          communityId={communityId}
          channelIdentifier={channelId}
          allowAttachments={currentChannel?.allowAttachments ?? false}
          placeholder={t("message_placeholder", {
            channel: currentChannel?.name ?? channelId,
          })}
          emptyTitle={t("no_messages")}
          emptySubtitle={t("be_first")}
          beginningLabel={t("beginning_of_history")}
          onAtBottom={updateLastViewed}
          footer={footer}
          footerHidesWhenScrolled={!!guestFooter}
        />
        {searchOpen && (
          <SearchDialog
            kind="channel"
            communityId={communityId}
            channelIdentifier={channelId}
            members={searchMemberItems}
            channels={community?.channels ?? []}
            onClose={() => setSearchOpen(false)}
          />
        )}
        {pinnedOpen && (
          <PinnedMessagesModal
            communityId={communityId}
            channelIdentifier={channelId}
            canPin={canPin}
            onClose={() => setPinnedOpen(false)}
          />
        )}
      </main>
      {threadRootIri && (
        <ThreadPanel
          key={threadRootIri}
          communityId={communityId}
          channelIdentifier={channelId}
          rootIri={threadRootIri}
          members={memberItems}
          channels={community?.channels ?? []}
          allowAttachments={currentChannel?.allowAttachments ?? false}
          canModerate={canModerate}
          onViewReplyHistory={handleViewHistory}
          canEmbed={canEmbed}
          onEmbedMessage={setEmbedMessageIri}
          focusReplyId={searchT ?? null}
          onReplyFocusComplete={clearReplyFocus}
          frozen={isArchived}
          canParticipate={isMember}
          onClose={() => {
            setThreadRootIri(null);
            if (searchT) clearReplyFocus();
          }}
        />
      )}
    </>
  );
}
