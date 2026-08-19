import { useNavigate } from "@tanstack/react-router";
import { useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTimezone } from "@/context/TimezoneContext";
import { useNotification } from "@/context/NotificationContext";
import { useCreateConversation } from "@/queries/conversationQueries";
import { queryKeys } from "@/queries/queryKeys";
import { createConversationMessage, fetchInvitableUsers } from "@/api/conversations";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Avatar } from "@/components/Avatar";
import { ChatBubbleIcon } from "@/components/icons";
import { MessagePane } from "@/components/chat/MessagePane";
import { MobileTopBar } from "@/components/MobileTopBar";
import { UserPicker, type PickerItem } from "@/components/UserPicker";
import { ConnectionsContext } from "@/desktop/connections/ConnectionsContext";
import { identityFetch, identityPost } from "@/desktop/connections/identityFetch";
import type { ServerContext } from "@/desktop/connections/identityFetch";
import { requestIdentitySwitch } from "@/platform/activeIdentity";
import { hostFromOrigin } from "@/utils/serverDisplay";
import type { Conversation, InvitableUser, InvitableUsersResponse } from "@/types/api";
import type { MemberItem } from "@/utils/userMentionExtension";

export function ComposeConversation() {
  const { t } = useTranslation(["conversation", "desktop", "common"]);
  const { user } = useAuth();
  const { timezone } = useTimezone();
  const { notify } = useNotification();
  const navigate = useNavigate();

  const connectionsContext = useContext(ConnectionsContext);
  const registry = connectionsContext?.registry ?? null;
  const subscribe = useCallback(
    (listener: () => void) => (registry ? registry.subscribe(listener) : () => undefined),
    [registry],
  );
  const getSnapshot = useCallback(() => registry?.getSnapshot() ?? null, [registry]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const healthyIdentities = useMemo(
    () => snapshot?.connections.filter((c) => c.status === "healthy") ?? [],
    [snapshot],
  );

  const [identitySelection, setIdentitySelection] = useState<string | null>(null);
  const composeIdentityId = identitySelection ?? snapshot?.activeIdentityId ?? null;
  const isRemote =
    !!snapshot && !!composeIdentityId && composeIdentityId !== snapshot.activeIdentityId;
  const remoteCtx: ServerContext | null =
    isRemote && registry
      ? (registry.getConnection(composeIdentityId)?.serverContext() ?? null)
      : null;

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InvitableUser[]>([]);
  const [isSending, setIsSending] = useState(false);

  const { data: invitable } = useQuery({
    queryKey: [...queryKeys.invitableUsers(search), composeIdentityId ?? "local"],
    queryFn: () => {
      if (remoteCtx) {
        const qs = search ? `?${new URLSearchParams({ search }).toString()}` : "";
        return identityFetch<InvitableUsersResponse>(remoteCtx, `/me/invitable-users${qs}`);
      }
      return fetchInvitableUsers(search);
    },
    enabled: !isRemote || !!remoteCtx,
  });
  const createConversation = useCreateConversation();

  useDocumentTitle(t("compose_title"));

  function handleIdentityChange(identityId: string) {
    setIdentitySelection(identityId);
    setSelected([]);
    setSearch("");
  }

  const usersById = useMemo(() => {
    const map = new Map<number, InvitableUser>();
    for (const u of invitable?.items ?? []) map.set(u.id, u);
    return map;
  }, [invitable?.items]);

  const pickerResults = useMemo<PickerItem[]>(() => {
    const excluded = new Set(selected.map((u) => u.id));
    return (invitable?.items ?? [])
      .filter((u) => !excluded.has(u.id))
      .slice(0, 10)
      .map((u) => ({
        id: u.id,
        name: u.name ?? `#${u.id}`,
        avatarUrl: u.avatarUrl,
      }));
  }, [invitable?.items, selected]);

  const memberItems = useMemo<MemberItem[]>(
    () =>
      selected.map((u) => ({
        id: u.id,
        name: u.name ?? `#${u.id}`,
        avatarUrl: u.avatarUrl,
        colorKey: String(u.id),
      })),
    [selected],
  );

  function addUser(item: PickerItem) {
    const full = usersById.get(item.id);
    if (!full) return;
    setSelected((prev) => [...prev, full]);
    setSearch("");
  }

  function removeUser(id: number) {
    setSelected((prev) => prev.filter((u) => u.id !== id));
  }

  const handleSend = useCallback(
    async (text: string) => {
      if (selected.length === 0) {
        notify(t("select_at_least_one"), "error");
        return;
      }
      setIsSending(true);
      try {
        if (remoteCtx && composeIdentityId) {
          const conversation = await identityPost<Conversation>(remoteCtx, "/conversations", {
            memberUserIds: selected.map((u) => u.id),
          });
          await identityPost(remoteCtx, `/conversations/${conversation.identifier}/messages`, {
            text,
            attachmentIris: [],
          });
          void requestIdentitySwitch(composeIdentityId, {
            to: "/dm/$conversationId",
            params: { conversationId: conversation.identifier },
          });
          return;
        }
        const conversation = await createConversation.mutateAsync(selected.map((u) => u.id));
        await createConversationMessage(conversation.identifier, text);
        void navigate({
          to: "/dm/$conversationId",
          params: { conversationId: conversation.identifier },
        });
      } catch {
        notify(t("create_failed"), "error");
        setIsSending(false);
      }
    },
    [selected, remoteCtx, composeIdentityId, createConversation, navigate, notify, t],
  );

  const noop = useCallback(() => {}, []);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <MobileTopBar title={t("compose_title")} />
      <header className="space-y-2 border-b border-line px-4 py-3">
        <h1 className="flex items-center gap-1.5 font-semibold">
          <ChatBubbleIcon size={14} className="text-fg-subtle" />
          <span className="block cap-trim">{t("compose_title")}</span>
        </h1>
        {healthyIdentities.length > 1 && (
          <div className="space-y-1.5">
            <label className="block text-xs text-fg-muted" htmlFor="compose-identity-select">
              {t("desktop:compose_on_server")}
            </label>
            <select
              id="compose-identity-select"
              data-testid="dm-compose-identity-select"
              value={composeIdentityId ?? ""}
              onChange={(e) => handleIdentityChange(e.target.value)}
              className="w-full max-w-xs truncate rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-fg outline-none focus:border-line-strong"
            >
              {healthyIdentities.map((c) => (
                <option key={c.identityId} value={c.identityId}>
                  {c.serverName ?? hostFromOrigin(c.origin)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-xs text-fg-muted">{t("compose_recipients_label")}</label>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => removeUser(u.id)}
                  className="flex items-center gap-1.5 rounded-full bg-accent-gradient py-1 pl-1 pr-2.5 text-xs font-medium text-on-accent shadow-soft-sm transition hover:opacity-90"
                >
                  <Avatar
                    name={u.name ?? `#${u.id}`}
                    colorKey={String(u.id)}
                    imageUrl={u.avatarUrl ?? null}
                    size="xs"
                  />
                  {u.name ?? `#${u.id}`}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
          <UserPicker
            placeholder={t("search_users_placeholder")}
            query={search}
            onQueryChange={setSearch}
            results={pickerResults}
            buttonLabel={t("common:add")}
            onAdd={addUser}
            autoFocus
            layout="chips"
          />
        </div>
      </header>

      <MessagePane
        messages={[]}
        hasPreviousPage={false}
        isFetchingPreviousPage={false}
        fetchPreviousPage={noop}
        onSend={handleSend}
        isSending={isSending}
        onEditMessage={noop}
        onDeleteMessage={noop}
        onToggleReaction={noop}
        onViewHistory={noop}
        onUserClick={noop}
        onDeleteAttachment={noop}
        user={user}
        members={memberItems}
        timezone={timezone}
        allowAttachments={false}
        placeholder={t("compose_placeholder")}
        emptyTitle={t("no_messages")}
        emptySubtitle={t("be_first")}
        beginningLabel={t("beginning_of_history")}
      />
    </main>
  );
}
