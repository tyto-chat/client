import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GroupIcon } from "@/components/GroupIcon";
import { GroupIconPicker } from "@/components/GroupIconPicker";
import { useCommunity, useCommunityMembers } from "@/queries/communityQueries";
import {
  useGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useGroupMembers,
  useGroupChannelPermissions,
  useAddGroupMember,
  useRemoveGroupMember,
  useSetGroupChannelPermission,
  useRemoveGroupChannelPermission,
  useTransferGroupOwnership,
} from "@/queries/groupQueries";
import { fetchGroupChannelPermissions } from "@/api/groups";
import { queryKeys } from "@/queries/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { useNotification } from "@/context/NotificationContext";
import { Avatar } from "@/components/Avatar";
import { UserPicker } from "@/components/UserPicker";
import { buildPickerCandidates } from "@/utils/pickerCandidates";
import { TextInput } from "@/components/TextInput";
import { ModalFooter } from "@/components/ModalFooter";
import { ErrorMessage } from "@/components/ErrorMessage";
import {
  EditIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
  PlusIcon,
  Spinner,
  LockIcon,
  ReadonlyIcon,
  MicrophoneIcon,
} from "@/components/icons";
import { avatarUrl } from "@/api/client";
import type { Channel, UserGroup } from "@/types/api";
import { sectionHeading } from "@/components/ui/styles";

type View =
  | { kind: "list" }
  | { kind: "form"; group?: UserGroup }
  | { kind: "detail"; group: UserGroup }
  | { kind: "channels"; group: UserGroup };

const COLOR_PRESETS = ["#0d9488", "#6366f1", "#db2777", "#d97706", "#059669", "#dc2626"];

export function GroupsPanel({
  communityId,
  isCommunityAdmin = true,
}: {
  communityId: string;
  isCommunityAdmin?: boolean;
}) {
  const { t } = useTranslation(["community", "common"]);
  const [view, setView] = useState<View>({ kind: "list" });

  const subtitle =
    view.kind === "list"
      ? null
      : view.kind === "form"
        ? view.group
          ? t("edit_group")
          : t("create_group")
        : view.kind === "channels"
          ? `${view.group.name} — ${t("group_channels_title")}`
          : null;

  return (
    <div className="flex flex-col gap-3">
      {subtitle && <h3 className="text-sm font-semibold text-fg">{subtitle}</h3>}
      {view.kind === "list" && (
        <GroupListView
          communityId={communityId}
          isCommunityAdmin={isCommunityAdmin}
          onCreate={() => setView({ kind: "form" })}
          onDetail={(g) => setView({ kind: "detail", group: g })}
        />
      )}
      {view.kind === "form" && (
        <GroupFormView
          communityId={communityId}
          group={view.group}
          onBack={() =>
            setView(view.group ? { kind: "detail", group: view.group } : { kind: "list" })
          }
        />
      )}
      {view.kind === "detail" && (
        <GroupDetailView
          communityId={communityId}
          group={view.group}
          isCommunityAdmin={isCommunityAdmin}
          onBack={() => setView({ kind: "list" })}
          onEdit={(g) => setView({ kind: "form", group: g })}
          onChannels={(g) => setView({ kind: "channels", group: g })}
        />
      )}
      {view.kind === "channels" && (
        <GroupChannelPermissionsView
          communityId={communityId}
          readOnly={!isCommunityAdmin}
          group={view.group}
          onBack={() => setView({ kind: "detail", group: view.group })}
        />
      )}
    </div>
  );
}

function GroupListView({
  communityId,
  isCommunityAdmin,
  onCreate,
  onDetail,
}: {
  communityId: string;
  isCommunityAdmin: boolean;
  onCreate: () => void;
  onDetail: (g: UserGroup) => void;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { user } = useAuth();
  const { data: allGroups = [], isLoading } = useGroups(communityId);

  const groups = isCommunityAdmin ? allGroups : allGroups.filter((g) => g.ownerId === user?.id);

  const permQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: queryKeys.groupChannelPermissions(communityId, g.identifier),
      queryFn: () => fetchGroupChannelPermissions(communityId, g.identifier),
      staleTime: 30_000,
    })),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">{t("group_list_hint")}</p>
        {isCommunityAdmin && (
          <button
            onClick={onCreate}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-gradient px-3 py-1.5 min-h-8 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
          >
            <PlusIcon size={13} />
            <span className="block cap-trim">{t("create_group")}</span>
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-4">
          <Spinner size={20} />
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <p className="py-4 text-center text-sm text-fg-muted">{t("no_groups")}</p>
      )}

      {groups.length > 0 && (
        <ul className="space-y-2">
          {groups.map((group, i) => {
            const channelCount = permQueries[i]?.data?.length;
            return (
              <li
                key={group["@id"]}
                onClick={() => onDetail(group)}
                className="flex cursor-pointer items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-inset ring-line transition hover:-translate-y-px hover:shadow-soft-sm hover:ring-line-strong"
              >
                <GroupIcon
                  icon={group.icon}
                  name={group.name}
                  communityIdentifier={communityId}
                  color={group.color}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{group.name}</span>
                    {group.color && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                    )}
                  </div>
                  <div className="mt-0.5 flex gap-3 text-xs text-fg-subtle">
                    <span>{t("group_members_count", { count: group.memberCount ?? 0 })}</span>
                    {channelCount !== undefined && (
                      <span>{t("group_channels_count", { count: channelCount })}</span>
                    )}
                  </div>
                </div>
                {group.isHidden && (
                  <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-fg-subtle ring-1 ring-inset ring-line">
                    {t("hidden_badge")}
                  </span>
                )}
                <span className="shrink-0 text-fg-subtle">›</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GroupFormView({
  communityId,
  group,
  onBack,
}: {
  communityId: string;
  group?: UserGroup;
  onBack: () => void;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const createGroup = useCreateGroup(communityId);
  const updateGroup = useUpdateGroup(communityId, group?.identifier ?? "");

  const [name, setName] = useState(group?.name ?? "");
  const [icon, setIcon] = useState(group?.icon ?? "");
  const [color, setColor] = useState<string | null>(group?.color ?? null);
  const [isHidden, setIsHidden] = useState(group?.isHidden ?? false);
  const [error, setError] = useState("");

  const isEdit = !!group;
  const isPending = isEdit ? updateGroup.isPending : createGroup.isPending;
  const customIsActive = color !== null && !COLOR_PRESETS.includes(color);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (isEdit) {
        await updateGroup.mutateAsync({
          name,
          icon: icon || null,
          color,
          isHidden,
          ownerId: group.ownerId ?? null,
        });
        notify(t("group_updated"), "success");
      } else {
        await createGroup.mutateAsync({
          name,
          icon: icon || null,
          color,
          isHidden,
        });
        notify(t("group_created"), "success");
      }
      onBack();
    } catch {
      setError(isEdit ? t("group_update_error") : t("group_create_error"));
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-fg-muted hover:text-fg dark:hover:text-white"
      >
        ← {t("common:back")}
      </button>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-start gap-4">
          <GroupIconPicker
            value={icon}
            onChange={setIcon}
            communityIdentifier={communityId}
            color={color}
            label={t("group_icon_label")}
          />
          <div className="min-w-0 flex-1 space-y-4">
            <TextInput
              label={t("common:name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <div>
              <p className={sectionHeading}>{t("group_color_label")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  title={t("group_color_none")}
                  className={`relative h-6 w-6 rounded-full bg-surface ring-1 ring-inset ring-line-strong ${
                    color === null ? "outline outline-2 outline-offset-1 outline-fg" : ""
                  }`}
                >
                  <span className="absolute inset-1 rounded-full bg-[linear-gradient(135deg,transparent_45%,var(--color-danger)_45%,var(--color-danger)_55%,transparent_55%)]" />
                </button>
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    title={preset}
                    className={`h-6 w-6 rounded-full ${
                      color === preset ? "outline outline-2 outline-offset-1 outline-fg" : ""
                    }`}
                    style={{ backgroundColor: preset }}
                  />
                ))}
                <input
                  type="color"
                  value={customIsActive ? color : "#6366f1"}
                  onChange={(e) => setColor(e.target.value.toLowerCase())}
                  title={t("group_color_custom")}
                  className={`h-6 w-6 cursor-pointer rounded-full bg-transparent p-0 ${
                    customIsActive ? "outline outline-2 outline-offset-1 outline-fg" : ""
                  }`}
                />
              </div>
              <p className="mt-1.5 text-xs text-fg-subtle">{t("group_color_hint")}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isHidden}
            onClick={() => setIsHidden((v) => !v)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              isHidden ? "bg-[var(--accent)]" : "bg-line-strong"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                isHidden ? "translate-x-4" : ""
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-semibold text-fg">{t("group_hidden_label")}</p>
            <p className="text-xs text-fg-subtle">{t("group_hidden_hint")}</p>
          </div>
        </div>

        <ErrorMessage message={error} />
        <ModalFooter
          onCancel={onBack}
          submitLabel={isEdit ? t("common:save") : t("create_group")}
          isPending={isPending}
          pendingLabel={isEdit ? t("common:saving") : t("common:creating")}
          disabled={!name.trim()}
        />
      </form>
    </div>
  );
}

function GroupDetailView({
  communityId,
  group,
  isCommunityAdmin,
  onBack,
  onEdit,
  onChannels,
}: {
  communityId: string;
  group: UserGroup;
  isCommunityAdmin: boolean;
  onBack: () => void;
  onEdit: (g: UserGroup) => void;
  onChannels: (g: UserGroup) => void;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const deleteGroup = useDeleteGroup(communityId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { user } = useAuth();
  const { data: allGroups = [] } = useGroups(communityId);
  const currentGroup = allGroups.find((g) => g.identifier === group.identifier) ?? group;
  const { data: members = [], isLoading: membersLoading } = useGroupMembers(
    communityId,
    group.identifier,
  );
  const { data: communityMembers = [] } = useCommunityMembers(communityId);
  const { data: permissions = [] } = useGroupChannelPermissions(communityId, group.identifier);
  const { data: community } = useCommunity(communityId);

  const addMember = useAddGroupMember(communityId, group.identifier);
  const removeMember = useRemoveGroupMember(communityId, group.identifier);
  const transferOwner = useTransferGroupOwnership(communityId, group.identifier);

  const profileByUserId = Object.fromEntries(communityMembers.map((cm) => [cm.userId, cm.profile]));
  const channelById = Object.fromEntries((community?.channels ?? []).map((ch) => [ch.id, ch]));
  const ownerName =
    currentGroup.ownerId !== null ? profileByUserId[currentGroup.ownerId]?.name : undefined;

  const [memberQuery, setMemberQuery] = useState("");
  const memberCandidates = buildPickerCandidates(communityMembers, {
    query: memberQuery,
    excludeIds: members.map((m) => m.userId),
  });

  async function handleDelete() {
    try {
      await deleteGroup.mutateAsync(group.identifier);
      notify(t("group_deleted"), "success");
      onBack();
    } catch {
      notify(t("group_delete_error"), "error");
    }
  }

  async function handleAddMember(userId: number) {
    try {
      await addMember.mutateAsync(userId);
      notify(t("group_member_added"), "success");
    } catch {
      notify(t("group_member_add_error"), "error");
    }
  }

  async function handleRemoveMember(userId: number) {
    try {
      await removeMember.mutateAsync(userId);
      notify(t("group_member_removed"), "success");
    } catch {
      notify(t("group_member_remove_error"), "error");
    }
  }

  async function handleTransferOwner(userId: number) {
    try {
      await transferOwner.mutateAsync(userId);
      notify(t("group_owner_transferred"), "success");
    } catch {
      notify(t("group_owner_transfer_error"), "error");
    }
  }

  const isAdminOrOwner =
    user !== null &&
    (currentGroup.ownerId === user.id ||
      user.roles?.includes("ROLE_ADMIN") ||
      communityMembers.find((m) => m.userId === user.id)?.role === "admin");

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-fg-muted hover:text-fg dark:hover:text-white"
      >
        ← {t("common:back")}
      </button>
      <div
        className="flex items-center gap-3.5 rounded-2xl p-4 ring-1 ring-inset ring-line"
        style={
          currentGroup.color
            ? {
                background: `linear-gradient(135deg, color-mix(in srgb, ${currentGroup.color} 14%, var(--color-canvas)), var(--color-canvas) 70%)`,
              }
            : undefined
        }
      >
        <GroupIcon
          icon={currentGroup.icon}
          name={currentGroup.name}
          communityIdentifier={communityId}
          color={currentGroup.color}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-2xl"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-bold">
            <span className="truncate">{currentGroup.name}</span>
            {currentGroup.color && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: currentGroup.color }}
              />
            )}
            {currentGroup.isHidden && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-fg-subtle ring-1 ring-inset ring-line">
                {t("hidden_badge")}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted">
            <span>{t("group_members_count", { count: members.length })}</span>
            {ownerName && <span>{t("group_owner_meta", { name: ownerName })}</span>}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {isCommunityAdmin &&
            (confirmDelete ? (
              <>
                <span className="text-xs text-fg-muted">{t("group_delete_confirm")}</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteGroup.isPending}
                  title={t("confirm_delete")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface hover:text-danger disabled:opacity-50"
                >
                  <CheckIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  title={t("cancel_delete")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface hover:text-fg"
                >
                  <XIcon />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(currentGroup)}
                  title={t("common:edit")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface hover:text-fg"
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  title={t("common:delete")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface hover:text-danger"
                >
                  <TrashIcon />
                </button>
              </>
            ))}
        </div>
      </div>
      <div className="rounded-2xl bg-canvas p-4 ring-1 ring-inset ring-line">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[0.8125rem] font-bold">{t("group_access_title")}</span>
          <button
            type="button"
            data-testid="group-channel-permissions"
            onClick={() => onChannels(currentGroup)}
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            {t("group_access_manage")} ›
          </button>
        </div>
        {permissions.length === 0 ? (
          <p className="text-xs text-fg-subtle">{t("group_permission_none")}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {permissions.map((p) => {
              const ch = channelById[p.channelId];
              return (
                <span
                  key={p["@id"]}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs ring-1 ring-inset ring-line"
                >
                  # {ch?.name ?? p.channelId}
                  <span className="text-[0.5625rem] font-bold uppercase tracking-wide text-[var(--accent)]">
                    {p.role === "moderator"
                      ? t("group_permission_moderator")
                      : t("group_permission_member")}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-canvas p-4 ring-1 ring-inset ring-line">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="text-[0.8125rem] font-bold">{t("group_members_title")}</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[0.625rem] font-semibold text-fg-muted ring-1 ring-inset ring-line">
            {members.length}
          </span>
        </div>
        {isAdminOrOwner && (
          <div className="mb-2">
            <UserPicker
              placeholder={t("group_add_member_placeholder")}
              query={memberQuery}
              onQueryChange={setMemberQuery}
              results={memberCandidates}
              buttonLabel={t("common:add")}
              onAdd={(item) => handleAddMember(item.id)}
              isPending={addMember.isPending}
            />
          </div>
        )}
        {membersLoading ? (
          <div className="flex justify-center py-2">
            <Spinner size={18} />
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("no_group_members")}</p>
        ) : (
          <ul className="space-y-0.5">
            {members.map((m) => {
              const profile = profileByUserId[m.userId];
              const isOwner = m.userId === currentGroup.ownerId;
              return (
                <li
                  key={m.userId}
                  className="group/row flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface"
                >
                  <Avatar
                    name={profile?.name ?? String(m.userId)}
                    colorKey={profile?.["@id"] ?? String(m.userId)}
                    imageUrl={avatarUrl(profile?.avatar?.contentUrl ?? null)}
                    size="xs"
                  />
                  <span className="truncate text-sm text-fg dark:text-white">
                    {profile?.name ?? `#${m.userId}`}
                  </span>
                  {isOwner && (
                    <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-accent">
                      {t("group_owner_badge")}
                    </span>
                  )}
                  {isAdminOrOwner && (
                    <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                      {!isOwner && (
                        <button
                          type="button"
                          onClick={() => handleTransferOwner(m.userId)}
                          disabled={transferOwner.isPending}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-raised hover:text-fg disabled:opacity-50"
                        >
                          {t("make_owner")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.userId)}
                        disabled={removeMember.isPending}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-subtle disabled:opacity-50"
                      >
                        {t("common:remove")}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function RoleSegment({
  channel,
  current,
  readOnly,
  onChange,
}: {
  channel: Channel;
  current: "" | "member" | "moderator";
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation(["community"]);
  const isPrivate = channel.isPrivate ?? false;
  const options: Array<{ value: "" | "member" | "moderator"; label: string }> = [
    ...(isPrivate ? [{ value: "" as const, label: t("group_permission_none_short") }] : []),
    { value: "member" as const, label: t("group_permission_member") },
    { value: "moderator" as const, label: t("group_permission_moderator") },
  ];

  if (readOnly) {
    return (
      <span className="ml-2 shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs text-fg-muted ring-1 ring-inset ring-line">
        {current === ""
          ? t("group_permission_none")
          : current === "moderator"
            ? t("group_permission_moderator")
            : t("group_permission_member")}
      </span>
    );
  }

  return (
    <span className="ml-2 flex shrink-0 rounded-lg bg-surface p-0.5 ring-1 ring-inset ring-line">
      {options.map((opt) => (
        <button
          key={opt.value || "none"}
          type="button"
          data-role-value={opt.value}
          aria-pressed={current === opt.value}
          onClick={() => current !== opt.value && onChange(opt.value)}
          className={`rounded-md px-2.5 py-1 text-[0.71875rem] font-semibold transition-colors ${
            current === opt.value
              ? opt.value === "moderator"
                ? "bg-[var(--accent-strong)] text-[var(--accent-on)]"
                : opt.value === "member"
                  ? "bg-accent-subtle text-accent"
                  : "bg-raised text-fg shadow-soft-sm"
              : "text-fg-subtle hover:text-fg"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </span>
  );
}

function GroupChannelPermissionsView({
  communityId,
  group,
  onBack,
  readOnly = false,
}: {
  communityId: string;
  group: UserGroup;
  onBack: () => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();

  const { data: permissions = [] } = useGroupChannelPermissions(communityId, group.identifier);
  const { data: community } = useCommunity(communityId);
  const setPermission = useSetGroupChannelPermission(communityId, group.identifier);
  const removePermission = useRemoveGroupChannelPermission(communityId, group.identifier);

  const permByChannelId = Object.fromEntries(permissions.map((p) => [p.channelId, p]));
  const allChannels = community?.channels ?? [];
  const sections = (community?.channelSections ?? []).map((section) => ({
    section,
    channels: allChannels.filter((ch) => ch.section.id === section.id),
  }));

  async function handlePermissionChange(channel: Channel, value: string) {
    const isPrivate = channel.isPrivate ?? false;
    const shouldRemove = isPrivate ? value === "" : value === "member";
    try {
      if (shouldRemove) {
        await removePermission.mutateAsync({
          channelIdentifier: channel.identifier,
          channelId: channel.id,
        });
      } else {
        await setPermission.mutateAsync({
          channelIdentifier: channel.identifier,
          role: value as "member" | "moderator",
        });
      }
      notify(t("group_permission_updated"), "success");
    } catch {
      notify(t("group_permission_error"), "error");
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-fg-muted hover:text-fg dark:hover:text-white"
      >
        ← {t("common:back")}
      </button>

      <p className="text-xs text-fg-subtle">{t("group_channels_hint")}</p>

      {allChannels.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("no_channels")}</p>
      ) : (
        <div className="space-y-4">
          {sections.map(({ section, channels }) => (
            <div key={section["@id"]}>
              <p className={`${sectionHeading} px-2`}>{section.name}</p>
              <div className="space-y-0.5">
                {channels.map((ch) => {
                  const perm = permByChannelId[ch.id];
                  const isPrivate = ch.isPrivate ?? false;
                  const isReadonly = ch.isReadonly ?? false;
                  const isAudio = ch.type === "audio";
                  const current = (perm?.role ?? (isPrivate ? "" : "member")) as
                    "" | "member" | "moderator";
                  return (
                    <div
                      key={ch["@id"]}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-sm text-fg">
                        {isAudio ? (
                          <MicrophoneIcon size={14} className="shrink-0 text-fg-subtle" />
                        ) : isPrivate ? (
                          <LockIcon size={14} className="shrink-0 text-fg-subtle" />
                        ) : isReadonly ? (
                          <ReadonlyIcon size={14} className="shrink-0 text-fg-subtle" />
                        ) : (
                          <span className="shrink-0 text-fg-subtle">#</span>
                        )}
                        <span className="truncate">{ch.name}</span>
                      </span>
                      <RoleSegment
                        channel={ch}
                        current={current}
                        readOnly={readOnly}
                        onChange={(value) => handlePermissionChange(ch, value)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
