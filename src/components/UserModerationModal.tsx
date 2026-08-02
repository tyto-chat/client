import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate } from "@tanstack/react-router";
import { Modal } from "@/components/Modal";
import { ModalTabs } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { PresenceDot } from "@/components/PresenceDot";
import { avatarUrl } from "@/api/client";
import { getUserTextColor } from "@/utils/userColor";
import { toSafeHttpUrl } from "@/utils/safeUrl";
import { usePresenceSubscription, useUserPresence } from "@/queries/presenceQueries";
import {
  ShieldIcon,
  TrashIcon,
  EditIcon,
  CheckIcon,
  XIcon,
  ChatBubbleIcon,
  LinkIcon,
  MapPinIcon,
  CakeIcon,
  FlagIcon,
} from "@/components/icons";
import { ReportModal } from "@/components/ReportModal";
import { useUser } from "@/queries/userQueries";
import { useCommunity } from "@/queries/communityQueries";
import { useCommunityMembership } from "@/queries/membershipQueries";
import { useCreateConversation } from "@/queries/conversationQueries";
import {
  useActiveModeration,
  useCreateModerationAction,
  useLiftModerationAction,
  useModerationLog,
  useModeratorNotes,
  useCreateModeratorNote,
  useUpdateModeratorNote,
  useDeleteModeratorNote,
} from "@/queries/moderationQueries";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";
import { useTimezone } from "@/context/TimezoneContext";
import { formatMessageTooltip } from "@/utils/dateFormat";
import { isBirthdayToday, formatBirthday } from "@/utils/birthday";
import type { ModerationAction, ModeratorNote } from "@/types/api";
import { sectionHeading } from "@/components/ui/styles";

const TIMEOUT_DURATIONS = [
  { labelKey: "moderation_duration_10m", seconds: 600 },
  { labelKey: "moderation_duration_30m", seconds: 1800 },
  { labelKey: "moderation_duration_1h", seconds: 3600 },
  { labelKey: "moderation_duration_6h", seconds: 21600 },
  { labelKey: "moderation_duration_12h", seconds: 43200 },
  { labelKey: "moderation_duration_24h", seconds: 86400 },
  { labelKey: "moderation_duration_3d", seconds: 259200 },
  { labelKey: "moderation_duration_7d", seconds: 604800 },
] as const;

type Tab = "profile" | "actions" | "notes";

interface Props {
  userId: number;
  communityId: string;
  channelRole?: "member" | "moderator";
  canModerate: boolean;
  callerIsChannelMod: boolean;
  currentChannelId: string;
  onClose: () => void;
}

export function UserModerationModal({
  userId,
  communityId,
  channelRole,
  canModerate,
  callerIsChannelMod,
  currentChannelId,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation("community");
  const { t: tc } = useTranslation("common");
  const { t: tConv } = useTranslation("conversation");
  const { t: tReports } = useTranslation("reports");
  const { notify } = useNotification();
  const { timezone } = useTimezone();
  const { data: user, isLoading } = useUser(userId);
  const { data: community } = useCommunity(communityId);
  const { data: membership } = useCommunityMembership(communityId);
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  usePresenceSubscription([userId]);
  const presenceState = useUserPresence(userId);

  async function handleSendDm() {
    try {
      const conversation = await createConversation.mutateAsync([userId]);
      onClose();
      void navigate({
        to: "/dm/$conversationId",
        params: { conversationId: conversation.identifier },
      });
    } catch {
      notify(tConv("create_failed"), "error");
    }
  }

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [reportOpen, setReportOpen] = useState(false);

  const { data: activeActions = [] } = useActiveModeration(
    communityId,
    canModerate ? userId : null,
  );
  const { data: actionHistory } = useModerationLog(
    communityId,
    1,
    undefined,
    undefined,
    canModerate && activeTab === "actions" ? userId : undefined,
  );
  const { data: notes = [] } = useModeratorNotes(
    communityId,
    canModerate && activeTab === "notes" ? userId : null,
  );

  const createAction = useCreateModerationAction(communityId);
  const liftAction = useLiftModerationAction(communityId, userId);
  const createNote = useCreateModeratorNote(communityId, userId);
  const updateNote = useUpdateModeratorNote(communityId, userId);
  const deleteNote = useDeleteModeratorNote(communityId, userId);

  const isGlobalAdmin = currentUser?.roles?.includes("ROLE_ADMIN") ?? false;
  const isCommunityAdmin = membership?.role === "admin";
  const availableActionTypes: Array<"warn" | "timeout" | "ban" | "server_ban"> = callerIsChannelMod
    ? ["timeout"]
    : isGlobalAdmin
      ? ["warn", "timeout", "ban", "server_ban"]
      : isCommunityAdmin
        ? ["warn", "timeout", "ban"]
        : ["warn", "timeout"];
  const [actionType, setActionType] = useState<"warn" | "timeout" | "ban" | "server_ban">(
    callerIsChannelMod ? "timeout" : "warn",
  );
  const [reason, setReason] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(3600);
  const [timeoutChannelId, setTimeoutChannelId] = useState("");

  const [noteContent, setNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  async function handleSubmitAction() {
    try {
      const expiresAt =
        actionType === "timeout"
          ? new Date(Date.now() + durationSeconds * 1000).toISOString()
          : null;
      const channelIdentifier =
        actionType === "timeout"
          ? callerIsChannelMod
            ? currentChannelId
            : timeoutChannelId || null
          : null;
      await createAction.mutateAsync({
        targetUserId: userId,
        type: actionType,
        reason: reason || undefined,
        expiresAt,
        channelIdentifier,
      });
      setReason("");
      notify(t("moderation_action_success"), "success");
    } catch {
      notify(t("moderation_action_error"), "error");
    }
  }

  async function handleLift(action: ModerationAction) {
    try {
      await liftAction.mutateAsync(action.id);
      notify(t("moderation_lift_success"), "success");
    } catch {
      notify(t("moderation_lift_error"), "error");
    }
  }

  async function handleAddNote() {
    if (!noteContent.trim()) return;
    try {
      await createNote.mutateAsync(noteContent.trim());
      setNoteContent("");
      notify(t("moderation_note_saved"), "success");
    } catch {
      notify(t("moderation_note_error"), "error");
    }
  }

  function startEditNote(note: ModeratorNote) {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  }

  async function handleSaveNote() {
    if (editingNoteId === null || !editContent.trim()) return;
    try {
      await updateNote.mutateAsync({ noteId: editingNoteId, content: editContent.trim() });
      setEditingNoteId(null);
      notify(t("moderation_note_saved"), "success");
    } catch {
      notify(t("moderation_note_error"), "error");
    }
  }

  async function handleDeleteNote(noteId: number) {
    try {
      await deleteNote.mutateAsync(noteId);
      notify(t("moderation_note_deleted"), "success");
    } catch {
      notify(t("moderation_note_error"), "error");
    }
  }

  return (
    <Modal onClose={onClose} size={canModerate ? "md" : "sm"}>
      {() => (
        <div className="flex flex-col gap-4">
          {reportOpen && (
            <ReportModal
              target={{ userId, communityIdentifier: communityId }}
              onClose={() => setReportOpen(false)}
            />
          )}
          {isLoading && <p className="text-sm text-fg-muted">{tc("loading")}</p>}
          {user && (
            <>
              <div className="flex items-center gap-3 pr-7">
                <Avatar
                  name={user.profile.name}
                  colorKey={user.profile["@id"]}
                  imageUrl={avatarUrl(user.profile.avatar?.contentUrl ?? null, "md")}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="font-semibold"
                    style={{ color: getUserTextColor(user.profile["@id"]) }}
                  >
                    {user.profile.name}
                    {isBirthdayToday(user.profile) && (
                      <span
                        className="ml-1"
                        title={tc("birthday_today")}
                        aria-label={tc("birthday_today")}
                      >
                        🎂
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <PresenceDot state={presenceState} size="sm" hideOffline={false} />
                    {tc(`presence.${presenceState}`)}
                  </p>
                  {user.isAdmin && (
                    <p className="text-xs text-yellow-500">{t("moderation_global_admin")}</p>
                  )}
                  {channelRole === "moderator" && (
                    <p className="flex items-center gap-1 text-xs text-[var(--accent-muted)]">
                      <ShieldIcon size={11} />
                      {t("channel_moderator_badge")}
                    </p>
                  )}
                </div>
                {canModerate && activeActions.length > 0 && (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    {activeActions[0]!.type === "server_ban"
                      ? t("moderation_status_server_banned")
                      : activeActions[0]!.type === "ban"
                        ? t("moderation_status_banned")
                        : t("moderation_status_timed_out")}
                  </span>
                )}
              </div>

              <ModalTabs
                testIdPrefix="mod-tab-"
                active={activeTab}
                onChange={(key) => setActiveTab(key as typeof activeTab)}
                leading={
                  currentUser && currentUser.id !== userId ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSendDm}
                        disabled={createConversation.isPending}
                        title={tConv("write_private_message")}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-subtle px-3 py-1.5 text-sm font-medium text-accent transition-opacity hover:opacity-80 disabled:opacity-50"
                      >
                        <ChatBubbleIcon size={14} />
                        {tConv("message_tab")}
                      </button>
                      {!user?.isAdmin && (
                        <button
                          type="button"
                          onClick={() => setReportOpen(true)}
                          title={tReports("report_user")}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-danger-subtle hover:text-danger"
                        >
                          <FlagIcon size={14} />
                          {tReports("report_action")}
                        </button>
                      )}
                    </div>
                  ) : undefined
                }
                tabs={(canModerate
                  ? (["profile", "actions", "notes"] as const)
                  : (["profile"] as const)
                ).map((tab) => ({ key: tab, label: t(`moderation_tab_${tab}`) }))}
              />

              {activeTab === "profile" && (
                <div className="flex flex-col gap-3">
                  {(user.profile.bio ||
                    user.profile.location ||
                    user.profile.website ||
                    user.profile.birthdayMonth) && (
                    <div className="flex flex-col gap-2.5">
                      {user.profile.bio && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                          {user.profile.bio}
                        </p>
                      )}
                      <div className="flex flex-col gap-1.5 text-sm text-fg-muted">
                        {user.profile.location && (
                          <div className="flex items-center gap-2">
                            <MapPinIcon size={14} className="shrink-0 text-fg-subtle" />
                            <span>{user.profile.location}</span>
                          </div>
                        )}
                        {user.profile.birthdayMonth && user.profile.birthdayDay && (
                          <div className="flex items-center gap-2">
                            <CakeIcon size={14} className="shrink-0 text-fg-subtle" />
                            <span>
                              {formatBirthday(
                                user.profile.birthdayMonth,
                                user.profile.birthdayDay,
                                i18n.language,
                              )}
                            </span>
                          </div>
                        )}
                        {toSafeHttpUrl(user.profile.website) && (
                          <div className="flex items-center gap-2">
                            <LinkIcon size={14} className="shrink-0 text-fg-subtle" />
                            <a
                              href={toSafeHttpUrl(user.profile.website)!}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="min-w-0 truncate text-accent-text hover:underline"
                            >
                              {user.profile.website!.replace(/^https?:\/\//, "")}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "actions" && (
                <div className="flex flex-col gap-4">
                  {activeActions.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className={sectionHeading}>{t("moderation_active_actions")}</p>
                      {activeActions.map((action) => (
                        <ActiveActionRow
                          key={action.id}
                          action={action}
                          timezone={timezone}
                          onLift={handleLift}
                          isLifting={liftAction.isPending}
                          canLift={
                            callerIsChannelMod
                              ? action.channelIdentifier === currentChannelId
                              : true
                          }
                          t={t}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-fg-muted">{t("moderation_no_active_actions")}</p>
                  )}

                  {actionHistory && actionHistory["hydra:member"].length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-line pt-3">
                      <p className={sectionHeading}>{t("moderation_action_history")}</p>
                      <div className="flex max-h-40 flex-col divide-y divide-line overflow-y-auto">
                        {actionHistory["hydra:member"].map((action) => (
                          <div
                            key={action.id}
                            className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0"
                          >
                            {action.reason && (
                              <span className="min-w-0 truncate text-xs text-fg-muted">
                                "{action.reason}"
                              </span>
                            )}
                            <div className="flex items-center gap-2 text-xs text-fg-subtle">
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
                                  action.type === "server_ban"
                                    ? "bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
                                    : action.type === "ban"
                                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                      : action.type === "timeout"
                                        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                                }`}
                              >
                                {t(`moderation_action_${action.type}`)}
                              </span>
                              <span>
                                {t("moderation_log_by")} {action.actorUser.profile.name}
                              </span>
                              <span>·</span>
                              <span>{new Date(action.createdAt).toLocaleDateString()}</span>
                              <span>·</span>
                              {action.active ? (
                                <span className="text-green-600 dark:text-green-400">
                                  {t("moderation_log_active")}
                                </span>
                              ) : action.liftedAt ? (
                                <span>{t("moderation_log_lifted")}</span>
                              ) : (
                                <span>{t("moderation_log_expired")}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t border-line pt-3">
                    <p className={sectionHeading}>{t("moderation_new_action")}</p>
                    <div className="flex flex-wrap gap-2">
                      {availableActionTypes.map((type) => (
                        <button
                          key={type}
                          data-testid={`mod-action-${type}`}
                          onClick={() => setActionType(type)}
                          className={`min-w-[4.5rem] flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
                            actionType === type
                              ? type === "server_ban"
                                ? "bg-purple-700 text-white"
                                : type === "ban"
                                  ? "bg-red-600 text-white"
                                  : type === "timeout"
                                    ? "bg-orange-500 text-white"
                                    : "bg-yellow-500 text-white"
                              : "bg-surface text-fg-muted hover:bg-raised"
                          }`}
                        >
                          {t(`moderation_action_${type}`)}
                        </button>
                      ))}
                    </div>
                    {actionType === "timeout" && (
                      <>
                        <select
                          value={durationSeconds}
                          onChange={(e) => setDurationSeconds(Number(e.target.value))}
                          className="rounded-md bg-canvas ring-1 ring-inset ring-line px-2 py-1.5 text-sm dark:text-white"
                        >
                          {TIMEOUT_DURATIONS.map((d) => (
                            <option key={d.seconds} value={d.seconds}>
                              {t(d.labelKey)}
                            </option>
                          ))}
                        </select>
                        {callerIsChannelMod ? (
                          <p className="text-xs text-fg-muted">#{currentChannelId}</p>
                        ) : (
                          <select
                            value={timeoutChannelId}
                            onChange={(e) => setTimeoutChannelId(e.target.value)}
                            className="rounded-md bg-canvas ring-1 ring-inset ring-line px-2 py-1.5 text-sm dark:text-white"
                          >
                            <option value="">
                              {t("moderation_timeout_channel_community_wide")}
                            </option>
                            {community?.channels
                              .filter((c) => c.type === "text")
                              .map((c) => (
                                <option key={c.identifier} value={c.identifier}>
                                  #{c.identifier}
                                </option>
                              ))}
                          </select>
                        )}
                      </>
                    )}
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("moderation_reason_placeholder")}
                      rows={2}
                      className="w-full resize-none rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-sm dark:text-white"
                    />
                    <button
                      data-testid="mod-apply"
                      onClick={() => void handleSubmitAction()}
                      disabled={createAction.isPending}
                      className="self-end rounded-lg bg-accent-gradient px-4 py-1.5 text-sm font-medium text-[var(--accent-on)] hover:opacity-90 disabled:opacity-50"
                    >
                      {createAction.isPending ? tc("loading") : t("moderation_action_submit")}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="flex flex-col gap-3">
                  {notes.length === 0 ? (
                    <p className="text-sm text-fg-muted">{t("moderation_no_notes")}</p>
                  ) : (
                    <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                      {notes.map((note) => (
                        <NoteRow
                          key={note.id}
                          note={note}
                          timezone={timezone}
                          editingNoteId={editingNoteId}
                          editContent={editContent}
                          onEditContentChange={setEditContent}
                          onStartEdit={startEditNote}
                          onSaveEdit={() => void handleSaveNote()}
                          onCancelEdit={() => setEditingNoteId(null)}
                          onDelete={handleDeleteNote}
                          isSaving={updateNote.isPending}
                          isDeleting={deleteNote.isPending}
                        />
                      ))}
                    </div>
                  )}
                  {editingNoteId === null && (
                    <div className="flex flex-col gap-2 border-t border-line pt-2">
                      <textarea
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder={t("moderation_note_placeholder")}
                        rows={2}
                        className="w-full resize-none rounded-md bg-canvas ring-1 ring-inset ring-line px-3 py-2 text-sm dark:text-white"
                      />
                      <button
                        onClick={() => void handleAddNote()}
                        disabled={createNote.isPending || !noteContent.trim()}
                        className="self-end rounded-lg bg-accent-gradient px-4 py-1.5 text-sm font-medium text-[var(--accent-on)] hover:opacity-90 disabled:opacity-50"
                      >
                        {t("moderation_note_add")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

interface ActiveActionRowProps {
  action: ModerationAction;
  timezone: string;
  onLift: (action: ModerationAction) => void;
  isLifting: boolean;
  canLift: boolean;
  t: TFunction<"community">;
}

function ActiveActionRow({
  action,
  timezone,
  onLift,
  isLifting,
  canLift,
  t,
}: ActiveActionRowProps) {
  return (
    <div className="flex items-start justify-between rounded-lg bg-surface p-2">
      <div className="flex flex-col gap-0.5">
        <span
          className={`text-xs font-semibold ${
            action.type === "ban"
              ? "text-red-600 dark:text-red-400"
              : action.type === "timeout"
                ? "text-orange-600 dark:text-orange-400"
                : "text-yellow-600 dark:text-yellow-400"
          }`}
        >
          {t(`moderation_action_${action.type}`)}
        </span>
        {action.reason && <span className="text-xs text-fg-muted">{action.reason}</span>}
        {action.expiresAt && (
          <span className="text-xs text-fg-muted">
            {t("moderation_active_expires")}{" "}
            <span title={formatMessageTooltip(action.expiresAt, timezone)}>
              {new Date(action.expiresAt).toLocaleString()}
            </span>
          </span>
        )}
      </div>
      {canLift && (
        <button
          onClick={() => onLift(action)}
          disabled={isLifting}
          className="ml-2 shrink-0 rounded px-2 py-1 text-xs text-fg-muted hover:bg-raised hover:text-fg disabled:opacity-50 dark:hover:text-white"
        >
          {t("moderation_lift")}
        </button>
      )}
    </div>
  );
}

interface NoteRowProps {
  note: ModeratorNote;
  timezone: string;
  editingNoteId: number | null;
  editContent: string;
  onEditContentChange: (v: string) => void;
  onStartEdit: (note: ModeratorNote) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  isSaving: boolean;
  isDeleting: boolean;
}

function NoteRow({
  note,
  timezone,
  editingNoteId,
  editContent,
  onEditContentChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  isSaving,
  isDeleting,
}: NoteRowProps) {
  const { t } = useTranslation("common");
  const isEditing = editingNoteId === note.id;
  return (
    <div className="rounded-lg bg-surface p-2">
      {isEditing ? (
        <div className="flex flex-col gap-1">
          <textarea
            data-testid="note-edit-textarea"
            data-value={editContent}
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            rows={2}
            className="w-full resize-none rounded bg-canvas ring-1 ring-inset ring-line px-2 py-1 text-sm dark:text-white"
          />
          <div className="flex gap-1">
            <button
              title={t("save_note")}
              onClick={onSaveEdit}
              disabled={isSaving}
              className="rounded p-1 text-green-600 hover:bg-raised"
            >
              <CheckIcon size={13} />
            </button>
            <button
              title={t("cancel_edit")}
              onClick={onCancelEdit}
              className="rounded p-1 text-fg-muted hover:bg-raised"
            >
              <XIcon size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <p className="text-sm text-fg">{note.content}</p>
            <p
              className="mt-0.5 text-xs text-fg-subtle"
              title={formatMessageTooltip(note.updatedAt, timezone)}
            >
              {note.author.profile.name} · {new Date(note.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              title={t("edit_note")}
              onClick={() => onStartEdit(note)}
              className="rounded p-1 text-fg-subtle hover:bg-raised hover:text-fg dark:hover:text-white"
            >
              <EditIcon size={12} />
            </button>
            <button
              title={t("delete_note")}
              onClick={() => onDelete(note.id)}
              disabled={isDeleting}
              className="rounded p-1 text-fg-subtle hover:bg-raised hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
            >
              <TrashIcon size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
