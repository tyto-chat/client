import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useTimezone } from "@/context/TimezoneContext";
import { useNotification } from "@/context/NotificationContext";
import { useCreateConversation, useInvitableUsers } from "@/queries/conversationQueries";
import { createConversationMessage } from "@/api/conversations";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ChatBubbleIcon } from "@/components/icons";
import { MessagePane } from "@/components/chat/MessagePane";
import { MobileTopBar } from "@/components/MobileTopBar";
import { UserPicker, type PickerItem } from "@/components/UserPicker";
import type { InvitableUser } from "@/types/api";
import type { MemberItem } from "@/utils/userMentionExtension";

export const Route = createFileRoute("/_app/dm/new")({
  component: ComposeConversation,
});

function ComposeConversation() {
  const { t } = useTranslation(["conversation", "common"]);
  const { user } = useAuth();
  const { timezone } = useTimezone();
  const { notify } = useNotification();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InvitableUser[]>([]);
  const [isSending, setIsSending] = useState(false);

  const { data: invitable } = useInvitableUsers(search);
  const createConversation = useCreateConversation();

  useDocumentTitle(t("compose_title"));

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
    [selected, createConversation, navigate, notify, t],
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
        <div className="space-y-1.5">
          <label className="block text-xs text-fg-muted">{t("compose_recipients_label")}</label>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => removeUser(u.id)}
                  className="flex items-center gap-1 rounded-full bg-accent-gradient px-2.5 py-1 text-xs font-medium text-on-accent shadow-soft-sm transition hover:opacity-90"
                >
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
