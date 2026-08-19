import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useSearchHotkey } from "@/hooks/useSearchHotkey";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type InfiniteData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchConversation } from "@/api/conversations";
import {
  useConversation,
  useDeleteConversationAttachment,
  useDeleteConversationMessage,
  useEditConversationMessage,
  useInfiniteConversationMessages,
  useMarkConversationRead,
  useMuteConversation,
  useSendConversationMessage,
} from "@/queries/conversationQueries";
import { useToggleConversationReaction } from "@/queries/reactionQueries";
import { conversationDisplayName } from "@/utils/conversationDisplayName";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { fetchConversationPage, fetchConversationPages } from "@/api/pages";
import { fetchMessage } from "@/api/messages";
import { prefetchMessagePermalinks } from "@/utils/prefetchMessagePermalinks";
import { useConversationMercure } from "@/hooks/useMercure";
import { usePrefetchMessagePermalinks } from "@/hooks/usePrefetchMessagePermalinks";
import { useNotification } from "@/context/NotificationContext";
import { useTimezone } from "@/context/TimezoneContext";
import { queryKeys } from "@/queries/queryKeys";
import { ApiError } from "@/api/client";
import { toMemberItems } from "@/utils/toMemberItems";
import { MessageHistoryModal } from "@/components/chat/MessageHistoryModal";
import { MessagePane } from "@/components/chat/MessagePane";
import { ThreadPanel } from "@/components/chat/ThreadPanel";
import { Avatar } from "@/components/Avatar";
import { avatarUrl } from "@/api/client";
import { Menu, MenuStaticItem } from "@/components/ui/Menu";
import { ReportModal } from "@/components/ReportModal";
import { uuidFromIri } from "@/api/hydra";
import { BellIcon, BellOffIcon, ChatBubbleIcon, SearchIcon } from "@/components/icons";
import { MessagePaneSkeleton } from "@/components/ui/Skeleton";
import { SearchDialog } from "@/components/chat/SearchDialog";
import { MobileTopBar } from "@/components/MobileTopBar";
import type { ChannelPage } from "@/types/api";
import { writeLastLocation } from "@/utils/lastLocation";
import type { MemberItem } from "@/utils/userMentionExtension";

const MUTE_FOREVER = () => new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000);

interface ConversationSearch {
  m?: string;
  t?: string;
}

export const Route = createFileRoute("/_app/dm/$conversationId")({
  validateSearch: (search: Record<string, unknown>): ConversationSearch => {
    const out: ConversationSearch = {};
    if (typeof search.m === "string" && search.m.length > 0) out.m = search.m;
    if (typeof search.t === "string" && search.t.length > 0) out.t = search.t;
    return out;
  },
  loaderDeps: ({ search }) => ({ m: search.m }),
  loader: async ({ context: { queryClient }, params, deps }) => {
    try {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.conversation(params.conversationId),
        queryFn: () => fetchConversation(params.conversationId),
      });
      const pages = await fetchConversationPages(params.conversationId);
      const latestPage = pages[pages.length - 1];
      const latestPageNumber = latestPage?.pageNumber ?? 1;
      let initialPageNumber = latestPageNumber;
      let focusMessageId: string | null = null;

      if (deps.m) {
        try {
          const target = await fetchMessage(deps.m);
          if (
            target.conversationIdentifier &&
            target.conversationIdentifier !== params.conversationId
          ) {
            throw redirect({
              to: "/dm/$conversationId",
              params: { conversationId: target.conversationIdentifier },
              search: { m: deps.m },
              replace: true,
            });
          }
          if (target.conversationIdentifier && target.pageNumber) {
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
        const pageData = await fetchConversationPage(params.conversationId, initialPageNumber);
        queryClient.setQueryData<InfiniteData<ChannelPage, number>>(
          queryKeys.conversationPages(params.conversationId),
          { pages: [pageData], pageParams: [initialPageNumber] },
        );
        await prefetchMessagePermalinks(queryClient, pageData.messages ?? []);
      } else {
        queryClient.setQueryData<InfiniteData<ChannelPage, number>>(
          queryKeys.conversationPages(params.conversationId),
          { pages: [], pageParams: [] },
        );
      }
      return { latestPageNumber, focusMessageId, initialPageNumber };
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403 || err.status === 404)
      ) {
        return { latestPageNumber: 1, focusMessageId: null, initialPageNumber: 1 };
      }
      throw err;
    }
  },
  pendingMs: 100,
  pendingMinMs: 0,
  pendingComponent: ConversationPendingPane,
  component: ConversationPage,
});

function ConversationPendingPane() {
  return (
    <main className="flex min-w-0 flex-1">
      <MessagePaneSkeleton />
    </main>
  );
}

function ConversationPage() {
  const { t } = useTranslation(["conversation", "channel", "common"]);
  const { conversationId } = Route.useParams();
  const { latestPageNumber, focusMessageId, initialPageNumber } = Route.useLoaderData();
  const navigate = useNavigate();
  const { user, ensureMercureTopic } = useAuth();
  const { notify } = useNotification();
  const { timezone } = useTimezone();

  const markReadMutation = useMarkConversationRead(conversationId);
  const updateLastViewed = useCallback(() => {
    markReadMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    updateLastViewed();
  }, [updateLastViewed]);

  useEffect(() => {
    if (user) {
      writeLastLocation(user.id, { kind: "dm", conversationId });
    }
  }, [user, conversationId]);

  const { data: conversation, isLoading } = useConversation(conversationId);

  const overflowSuffix = (count: number) => t("compact_overflow_suffix", { count });
  const title = conversation ? conversationDisplayName(conversation, user?.id, overflowSuffix) : "";
  useDocumentTitle(title);

  const me = conversation?.members.find((m) => m.userId === user?.id);
  const isMember = !!me;
  const isMuted = !!me?.mutedUntil;
  const isGroup = (conversation?.members.length ?? 0) > 2;
  const muteConversation = useMuteConversation(conversationId);
  const toggleMute = useCallback(
    () => muteConversation.mutate(isMuted ? null : MUTE_FOREVER().toISOString()),
    [muteConversation, isMuted],
  );

  const memberItems = useMemo<MemberItem[]>(
    () => toMemberItems(conversation?.members, user?.id),
    [conversation?.members, user?.id],
  );
  const searchMemberItems = useMemo<MemberItem[]>(
    () => toMemberItems(conversation?.members, undefined),
    [conversation?.members],
  );

  const sendMessage = useSendConversationMessage(conversationId, user ?? null, () =>
    notify(t("common:too_many_requests"), "error"),
  );
  const editMessage = useEditConversationMessage(conversationId);
  const deleteMessage = useDeleteConversationMessage(conversationId);
  const deleteAttachmentMutation = useDeleteConversationAttachment(conversationId);
  const toggleReaction = useToggleConversationReaction(conversationId, user?.id ?? 0);
  useConversationMercure(isMember ? conversationId : "");

  useEffect(() => {
    if (isMember) ensureMercureTopic(`/api/conversations/${conversationId}`);
  }, [isMember, conversationId, ensureMercureTopic]);

  const {
    data: pagesData,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteConversationMessages(
    conversationId,
    initialPageNumber,
    latestPageNumber,
    isMember,
  );

  const messages = useMemo(
    () => pagesData?.pages.flatMap((p) => p.messages ?? []) ?? [],
    [pagesData],
  );
  usePrefetchMessagePermalinks(messages);

  const [historyMessageIri, setHistoryMessageIri] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [threadRootIri, setThreadRootIri] = useState<string | null>(null);
  const [reportMessageIri, setReportMessageIri] = useState<string | null>(null);
  const { t: searchT } = Route.useSearch();
  if (searchT && focusMessageId && !threadRootIri) {
    setThreadRootIri(focusMessageId);
  }
  const clearReplyFocus = useCallback(() => {
    void navigate({
      to: "/dm/$conversationId",
      params: { conversationId },
      search: (prev) => {
        const next = { ...(prev as ConversationSearch) };
        delete next.t;
        return next;
      },
      replace: true,
    });
  }, [navigate, conversationId]);

  useSearchHotkey(() => setSearchOpen((v) => !v));

  const handleToggleReaction = useCallback(
    (messageIri: string, emoji: string, existingId?: number) =>
      toggleReaction.mutate({ messageIri, emoji, existingId }),
    [toggleReaction],
  );
  const handleDeleteMessage = useCallback(
    (iri: string) => deleteMessage.mutate(iri),
    [deleteMessage],
  );
  const handleEditMessage = useCallback(
    (iri: string, text: string) => editMessage.mutate({ messageIri: iri, text }),
    [editMessage],
  );
  const handleViewHistory = useCallback((iri: string) => setHistoryMessageIri(iri), []);
  const handleDeleteAttachment = useCallback(
    (iri: string) => deleteAttachmentMutation.mutate(iri),
    [deleteAttachmentMutation],
  );
  const handleUserClick = useCallback(() => {}, []);
  const handleFetchPreviousPage = useCallback(() => {
    void fetchPreviousPage();
  }, [fetchPreviousPage]);
  const handleFetchNextPage = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const handleSend = useCallback(
    (text: string, attachmentIris?: string[]) => sendMessage.mutateAsync({ text, attachmentIris }),
    [sendMessage],
  );

  const clearFocus = useCallback(() => {
    if (!focusMessageId) return;
    void navigate({
      to: "/dm/$conversationId",
      params: { conversationId },
      search: () => ({}),
      replace: true,
    });
  }, [focusMessageId, navigate, conversationId]);

  if (isLoading) {
    return (
      <main className="flex min-w-0 flex-1">
        <MessagePaneSkeleton />
      </main>
    );
  }

  if (!conversation || !isMember) {
    return (
      <main className="flex flex-1 items-center justify-center text-fg-muted">
        {t("conversation_not_found")}
      </main>
    );
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileTopBar
          title={
            <>
              <ChatBubbleIcon size={14} className="text-fg-subtle" />
              <span className="block cap-trim">{title}</span>
            </>
          }
          right={
            <button
              onClick={() => setSearchOpen(true)}
              title={t("channel:search")}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-muted hover:bg-surface hover:text-fg"
            >
              <SearchIcon size={18} />
            </button>
          }
        />
        <header className="border-b border-line px-4 py-3 max-md:hidden">
          <h1 className="flex items-center gap-1.5 font-semibold">
            <ChatBubbleIcon size={14} className="text-fg-subtle" />
            {isGroup ? (
              <Menu
                label={t("members")}
                testId="dm-members-menu"
                trigger={
                  <span className="cap-trim rounded px-1 -mx-1 hover:bg-surface">{title}</span>
                }
              >
                <MenuStaticItem className="font-semibold uppercase tracking-wide">
                  {t("members")} ({conversation.members.length})
                </MenuStaticItem>
                {conversation.members.map((m) => (
                  <MenuStaticItem key={m.id} className="text-sm text-fg">
                    <span className="flex items-center gap-2">
                      <Avatar
                        name={m.profile?.name ?? `#${m.userId}`}
                        colorKey={m.profile?.["@id"] ?? String(m.userId)}
                        imageUrl={avatarUrl(m.profile?.avatar?.contentUrl ?? null)}
                        size="xs"
                      />
                      <span className="truncate">
                        {m.profile?.name ?? `#${m.userId}`}
                        {m.userId === user?.id && (
                          <span className="ml-1 text-xs text-fg-subtle">({t("you")})</span>
                        )}
                      </span>
                    </span>
                  </MenuStaticItem>
                ))}
              </Menu>
            ) : (
              <span className="block cap-trim">{title}</span>
            )}
            <button
              onClick={() => toggleMute()}
              disabled={muteConversation.isPending}
              aria-pressed={isMuted}
              data-testid="dm-mute-toggle"
              title={isMuted ? t("muted") : t("mute_notifications")}
              className={`ml-auto flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface disabled:opacity-50 ${
                isMuted ? "text-accent" : "text-fg-muted hover:text-fg"
              }`}
            >
              {isMuted ? <BellOffIcon size={13} /> : <BellIcon size={13} />}
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              title={`${t("channel:search")} (${navigator.platform.toLowerCase().includes("mac") ? "⌘K" : "Ctrl+K"})`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              <SearchIcon size={13} />
            </button>
          </h1>
        </header>

        {historyMessageIri && (
          <MessageHistoryModal
            messageIri={historyMessageIri}
            onClose={() => setHistoryMessageIri(null)}
          />
        )}
        {reportMessageIri && (
          <ReportModal
            target={{ messageId: uuidFromIri(reportMessageIri) }}
            onClose={() => setReportMessageIri(null)}
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
          focusMessageId={focusMessageId}
          onFocusComplete={clearFocus}
          onSend={handleSend}
          isSending={sendMessage.isPending}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onToggleReaction={handleToggleReaction}
          onViewHistory={handleViewHistory}
          onUserClick={handleUserClick}
          onDeleteAttachment={handleDeleteAttachment}
          user={user}
          members={memberItems}
          timezone={timezone}
          conversationIdentifier={conversationId}
          allowAttachments={true}
          placeholder={t("message_placeholder", { name: title })}
          emptyTitle={t("no_messages")}
          emptySubtitle={t("be_first")}
          beginningLabel={t("beginning_of_history")}
          onAtBottom={updateLastViewed}
          canReply={!!user}
          onOpenThread={setThreadRootIri}
          canReport={!!user}
          onReportMessage={setReportMessageIri}
        />
        {searchOpen && (
          <SearchDialog
            kind="conversation"
            conversationIdentifier={conversationId}
            members={searchMemberItems}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </main>
      {threadRootIri && (
        <ThreadPanel
          key={threadRootIri}
          conversationIdentifier={conversationId}
          rootIri={threadRootIri}
          members={memberItems}
          channels={[]}
          allowAttachments={true}
          canModerate={false}
          onViewReplyHistory={handleViewHistory}
          onClose={() => {
            setThreadRootIri(null);
            if (searchT) clearReplyFocus();
          }}
          focusReplyId={searchT ?? null}
          onReplyFocusComplete={() => {
            if (searchT) clearReplyFocus();
          }}
        />
      )}
    </div>
  );
}
