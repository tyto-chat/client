import { useNavigate } from "@tanstack/react-router";
import { useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTimezone } from "@/context/TimezoneContext";
import { useNotification } from "@/context/NotificationContext";
import { useCreateConversation } from "@/queries/conversationQueries";
import { queryKeys } from "@/queries/queryKeys";
import { apiErrorText } from "@/api/client";
import {
  createConversationMessage,
  fetchConversationPreflight,
  fetchInvitableUsers,
  type ConversationPreflight,
} from "@/api/conversations";
import { useServerInfo } from "@/hooks/useServerInfo";
import { fetchUser } from "@/api/users";
import { avatarUrl } from "@/api/client";
import { useE2ee } from "@/e2ee/e2eeContextValue";
import { composeOutcome, type ComposeOutcome } from "@/e2ee/composeOutcome";
import { createEncryptedConversation, sendEncrypted } from "@/e2ee/conversationSession";
import { e2eeErrorKey } from "@/e2ee/e2eeErrors";
import { AlertTriangleIcon } from "@/components/icons";
import { CreationBlockedNotice } from "@/components/dm/CreationBlockedNotice";
import { EncryptionOutcome } from "@/components/dm/EncryptionOutcome";
import { PlainFallbackDialog } from "@/components/dm/PlainFallbackDialog";
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

export function ComposeConversation({
  initialRecipientId = null,
}: { initialRecipientId?: number | null } = {}) {
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
  const [pendingPlain, setPendingPlain] = useState<{
    text: string;
    settle: (sent: Promise<void> | null) => void;
  } | null>(null);
  const { identity, availability } = useE2ee();
  const mode = useServerInfo()?.encryptedDmsMode;

  const { data: invitable } = useQuery({
    queryKey: [...queryKeys.invitableUsers(search), composeIdentityId ?? "local"],
    queryFn: () => {
      if (remoteCtx) {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        return identityFetch<InvitableUsersResponse>(
          remoteCtx,
          `/me/invitable-users?${params.toString()}`,
        );
      }
      return fetchInvitableUsers(search);
    },
    enabled: !isRemote || !!remoteCtx,
  });
  const createConversation = useCreateConversation();
  const queryClient = useQueryClient();

  const { data: preselected } = useQuery({
    queryKey: ["composeRecipient", initialRecipientId ?? 0],
    queryFn: async (): Promise<InvitableUser> => {
      const found = await fetchUser(initialRecipientId as number);
      return {
        id: found.id,
        name: found.profile?.name ?? null,
        avatarUrl: avatarUrl(found.profile?.avatar?.contentUrl ?? null),
      };
    },
    enabled: initialRecipientId !== null,
    staleTime: Infinity,
  });
  const [preselectApplied, setPreselectApplied] = useState(false);
  if (preselected && !preselectApplied) {
    setPreselectApplied(true);
    setSelected((prev) => (prev.some((u) => u.id === preselected.id) ? prev : [preselected]));
  }

  const memberIds = useMemo(() => selected.map((u) => u.id), [selected]);
  const preflight = useQuery({
    queryKey: [
      "conversationPreflight",
      composeIdentityId ?? "local",
      [...memberIds].sort().join(","),
    ],
    queryFn: () => {
      if (remoteCtx) {
        const params = new URLSearchParams();
        for (const id of memberIds) params.append("memberUserIds[]", String(id));
        return identityFetch<ConversationPreflight>(
          remoteCtx,
          `/conversations/preflight?${params.toString()}`,
        );
      }
      return fetchConversationPreflight(memberIds);
    },
    enabled: memberIds.length > 0 && (!isRemote || !!remoteCtx),
    retry: false,
    staleTime: 0,
  });
  const outcomeContext = useMemo(
    () => ({ availability, recipientCount: memberIds.length, otherServer: isRemote, mode }),
    [availability, memberIds.length, isRemote, mode],
  );
  const outcome: ComposeOutcome | null = preflight.data
    ? composeOutcome(preflight.data, outcomeContext)
    : null;
  const preflightError = preflight.error
    ? apiErrorText(preflight.error, t("e2ee_blocked_generic"))
    : null;
  const nameOf = useCallback(
    (ids: number[]) =>
      ids
        .map((id) =>
          id === user?.id ? t("e2ee_you") : (selected.find((u) => u.id === id)?.name ?? `#${id}`),
        )
        .join(", "),
    [selected, user?.id, t],
  );

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

  const createAndSend = useCallback(
    async (text: string, kind: "encrypted" | "plain") => {
      setIsSending(true);
      try {
        if (remoteCtx && composeIdentityId) {
          const conversation = await identityPost<Conversation>(remoteCtx, "/conversations", {
            memberUserIds: memberIds,
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
        let conversation: Conversation;
        if (kind === "encrypted") {
          if (identity === null || memberIds.length !== 1) throw new Error("not ready");
          conversation = await createEncryptedConversation(identity, memberIds[0] as number);
          await sendEncrypted(identity.session(conversation), text);
          void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
        } else {
          conversation = await createConversation.mutateAsync(memberIds);
          await createConversationMessage(conversation.identifier, text);
        }
        void navigate({
          to: "/dm/$conversationId",
          params: { conversationId: conversation.identifier },
        });
      } catch (error) {
        setIsSending(false);
        const before = preflight.data?.outcome;
        const after = await preflight.refetch();
        if (after.data?.outcome === before && !after.error) {
          notify(
            kind === "encrypted" ? t(e2eeErrorKey(error)) : apiErrorText(error, t("create_failed")),
            "error",
          );
        }
        throw error;
      }
    },
    [
      remoteCtx,
      composeIdentityId,
      memberIds,
      identity,
      queryClient,
      createConversation,
      navigate,
      preflight,
      notify,
      t,
    ],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (selected.length === 0) {
        notify(t("select_at_least_one"), "error");
        return;
      }
      let current = outcome;
      if (current === null) {
        const fresh = (await preflight.refetch()).data;
        current = fresh ? composeOutcome(fresh, outcomeContext) : null;
      }
      if (current === null) return;
      if (current.kind === "encrypted") return createAndSend(text, "encrypted");
      if (current.kind === "plain") return createAndSend(text, "plain");
      if (current.kind === "plain_warning") {
        return new Promise<void>((resolve, reject) => {
          setPendingPlain({
            text,
            settle: (sent) =>
              sent === null ? reject(new Error("cancelled")) : sent.then(resolve, reject),
          });
        });
      }
    },
    [selected.length, outcome, preflight, outcomeContext, createAndSend, notify, t],
  );

  const outcomePanel =
    outcome === null ? null : outcome.kind === "encrypted" ? (
      <EncryptionOutcome />
    ) : outcome.kind === "plain_warning" ? (
      <p
        data-testid="e2ee-plain-inline"
        className="flex items-center gap-1.5 text-xs text-fg-muted"
      >
        <AlertTriangleIcon size={12} className="text-warning" />
        {t("e2ee_plain_inline")}
      </p>
    ) : null;
  const blockingNotice =
    preflightError !== null ? (
      <CreationBlockedNotice
        outcome={{ kind: "blocked", reason: null, refusingUserIds: [], unreachableUserIds: [] }}
        names={nameOf}
        group={memberIds.length > 1}
        serverMessage={preflightError}
      />
    ) : outcome?.kind === "blocked" || outcome?.kind === "client_not_ready" ? (
      <CreationBlockedNotice outcome={outcome} names={nameOf} group={memberIds.length > 1} />
    ) : undefined;
  const composeLocked = blockingNotice !== undefined;

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
        {outcomePanel}
      </header>
      {pendingPlain !== null && outcome?.kind === "plain_warning" && (
        <PlainFallbackDialog
          names={nameOf(outcome.unreachableUserIds)}
          group={outcome.group}
          onCancel={() => {
            pendingPlain.settle(null);
            setPendingPlain(null);
          }}
          onConfirm={() => {
            pendingPlain.settle(createAndSend(pendingPlain.text, "plain"));
            setPendingPlain(null);
          }}
        />
      )}

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
        footer={blockingNotice}
        writeLocked={composeLocked}
        emptyTitle={t("no_messages")}
        emptySubtitle={t("be_first")}
        beginningLabel={t("beginning_of_history")}
      />
    </main>
  );
}
