import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { Spinner, StarFilledIcon } from "@/components/icons";
import { TextInput } from "@/components/TextInput";
import { GroupIcon } from "@/components/GroupIcon";
import { GroupIconPicker } from "@/components/GroupIconPicker";
import { UserPicker } from "@/components/UserPicker";
import { avatarUrl } from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { useNotification } from "@/context/NotificationContext";
import { useCommunityMembers } from "@/queries/communityQueries";
import {
  useAddGroupMember,
  useGroup,
  useGroupMembers,
  useMyGroups,
  useRemoveGroupMember,
  useTransferGroupOwnership,
  useUpdateGroup,
} from "@/queries/groupQueries";
import { buildPickerCandidates } from "@/utils/pickerCandidates";
import type { MyGroupSummary } from "@/types/api";
import { sectionHeading } from "@/components/ui/styles";

export function MyGroupsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["community", "common"]);
  const { data: groups = [], isLoading } = useMyGroups();
  const [selected, setSelected] = useState<{ community: string; group: string } | null>(null);

  const selectedGroup = selected
    ? groups.find(
        (g) => g.communityIdentifier === selected.community && g.identifier === selected.group,
      )
    : null;

  const owned = groups.filter((g) => g.isOwner);
  const memberOf = groups.filter((g) => !g.isOwner);

  return (
    <Modal title={t("my_groups_title")} onClose={onClose} size="lg">
      {() =>
        selectedGroup ? (
          <MyGroupDetail group={selectedGroup} onBack={() => setSelected(null)} />
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size={22} />
          </div>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">{t("my_groups_empty")}</p>
        ) : (
          <div className="space-y-4">
            {owned.length > 0 && (
              <GroupList
                heading={t("my_groups_owned")}
                groups={owned}
                onOpen={(g) =>
                  setSelected({ community: g.communityIdentifier, group: g.identifier })
                }
              />
            )}
            {memberOf.length > 0 && (
              <GroupList
                heading={t("my_groups_member")}
                groups={memberOf}
                onOpen={(g) =>
                  setSelected({ community: g.communityIdentifier, group: g.identifier })
                }
              />
            )}
          </div>
        )
      }
    </Modal>
  );
}

function GroupList({
  heading,
  groups,
  onOpen,
}: {
  heading: string;
  groups: MyGroupSummary[];
  onOpen: (g: MyGroupSummary) => void;
}) {
  const { t } = useTranslation("community");
  return (
    <div>
      <p className={sectionHeading}>{heading}</p>
      <ul className="space-y-1">
        {groups.map((g) => (
          <li key={`${g.communityIdentifier}/${g.identifier}`}>
            <button
              type="button"
              data-testid="my-group-row"
              onClick={() => onOpen(g)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 ring-inset ring-line hover:bg-surface"
            >
              <GroupIcon
                icon={g.icon}
                name={g.name}
                communityIdentifier={g.communityIdentifier}
                color={g.color}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-lg"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">{g.name}</span>
                <span className="block truncate text-xs text-fg-muted">{g.communityName}</span>
              </span>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[0.625rem] font-semibold text-fg-muted ring-1 ring-inset ring-line">
                {t("my_groups_member_count", { count: g.memberCount })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyGroupDetail({ group, onBack }: { group: MyGroupSummary; onBack: () => void }) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const { user } = useAuth();
  const { confirm, confirmDialog } = useConfirm();

  const communityId = group.communityIdentifier;
  const { data: fullGroup } = useGroup(communityId, group.identifier);
  const ownerId = fullGroup?.ownerId ?? (group.isOwner ? (user?.id ?? null) : null);
  const { data: members = [], isLoading: membersLoading } = useGroupMembers(
    communityId,
    group.identifier,
  );
  const { data: communityMembers = [] } = useCommunityMembers(communityId);
  const profileByUserId = Object.fromEntries(communityMembers.map((cm) => [cm.userId, cm.profile]));

  const updateGroup = useUpdateGroup(communityId, group.identifier);
  const addMember = useAddGroupMember(communityId, group.identifier);
  const removeMember = useRemoveGroupMember(communityId, group.identifier);
  const transferOwner = useTransferGroupOwnership(communityId, group.identifier);

  const [name, setName] = useState(group.name);
  const [icon, setIcon] = useState(group.icon ?? "");
  const [color, setColor] = useState(group.color ?? "#8b8b8b");
  const edited = name.trim() !== group.name || (group.icon ?? "") !== icon || group.color !== color;

  const [memberQuery, setMemberQuery] = useState("");
  const memberCandidates = buildPickerCandidates(communityMembers, {
    query: memberQuery,
    excludeIds: members.map((m) => m.userId),
  });

  async function handleSave() {
    try {
      await updateGroup.mutateAsync({
        name: name.trim(),
        icon: icon.trim() || null,
        color,
      });
      notify(t("group_updated"), "success");
    } catch {
      notify(t("group_update_error"), "error");
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

  async function handleTransfer(userId: number) {
    const targetName = profileByUserId[userId]?.name ?? `#${userId}`;
    const ok = await confirm({
      title: t("my_groups_make_owner_title"),
      message: t("my_groups_make_owner_confirm", { name: targetName, group: group.name }),
      confirmLabel: t("make_owner"),
    });
    if (!ok) return;
    try {
      await transferOwner.mutateAsync(userId);
      notify(t("group_owner_transferred"), "success");
    } catch {
      notify(t("group_owner_transfer_error"), "error");
    }
  }

  async function handleLeave() {
    if (!user) return;
    const ok = await confirm({
      title: t("my_groups_leave_title"),
      message: t("my_groups_leave_confirm", { group: group.name }),
      confirmLabel: t("my_groups_leave"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeMember.mutateAsync(user.id);
      notify(t("my_groups_left", { group: group.name }), "success");
      onBack();
    } catch {
      notify(t("group_member_remove_error"), "error");
    }
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-fg-muted hover:text-fg dark:hover:text-white"
      >
        ← {t("common:back")}
      </button>

      <div className="rounded-2xl border border-line bg-canvas p-4">
        {group.isOwner ? (
          <div className="flex items-start gap-4">
            <GroupIconPicker
              value={icon}
              onChange={setIcon}
              communityIdentifier={communityId}
              color={color}
              label={t("group_icon_label")}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-text">
                <StarFilledIcon size={11} /> {t("my_groups_you_own")}
              </span>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">{t("common:name")}</label>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs text-fg-muted">
                    {t("group_color_label")}
                  </label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="color-swatch"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!edited || !name.trim() || updateGroup.isPending}
                  className="ml-auto rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
                >
                  {t("common:save")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <GroupIcon
              icon={group.icon}
              name={group.name}
              communityIdentifier={communityId}
              color={group.color}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-fg">{group.name}</p>
              <p className="truncate text-xs text-fg-muted">{group.communityName}</p>
            </div>
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-[0.6875rem] font-semibold text-fg-muted ring-1 ring-inset ring-line">
              {t("my_groups_member_role")}
            </span>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[0.8125rem] font-bold">{t("group_members_title")}</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[0.625rem] font-semibold text-fg-muted ring-1 ring-inset ring-line">
            {members.length}
          </span>
        </div>

        {group.isOwner && (
          <div className="mb-2">
            <UserPicker
              placeholder={t("group_add_member_placeholder")}
              query={memberQuery}
              onQueryChange={setMemberQuery}
              results={memberCandidates}
              buttonLabel={t("common:add")}
              onAdd={(item) => void handleAddMember(item.id)}
              isPending={addMember.isPending}
            />
          </div>
        )}

        {membersLoading ? (
          <div className="flex justify-center py-2">
            <Spinner size={18} />
          </div>
        ) : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {members.map((m) => {
              const profile = profileByUserId[m.userId];
              const isSelf = m.userId === user?.id;
              const isGroupOwner = ownerId != null && m.userId === ownerId;
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
                    {isSelf && (
                      <span className="ml-1 text-xs text-fg-subtle">({t("common:you")})</span>
                    )}
                  </span>
                  {isGroupOwner ? (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-text">
                      <StarFilledIcon size={10} /> {t("my_groups_owner_role")}
                    </span>
                  ) : group.isOwner && !isSelf ? (
                    <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                      <button
                        type="button"
                        onClick={() => void handleTransfer(m.userId)}
                        disabled={transferOwner.isPending}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-fg-muted hover:bg-raised hover:text-fg disabled:opacity-50"
                      >
                        {t("make_owner")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveMember(m.userId)}
                        disabled={removeMember.isPending}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-subtle disabled:opacity-50"
                      >
                        {t("common:remove")}
                      </button>
                    </span>
                  ) : (
                    <span className="ml-auto shrink-0 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-muted ring-1 ring-inset ring-line">
                      {t("my_groups_member_role")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line pt-3">
        {group.isOwner ? (
          <p className="text-xs text-fg-subtle">{t("my_groups_transfer_first")}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          data-testid="my-group-leave"
          onClick={() => void handleLeave()}
          disabled={group.isOwner || removeMember.isPending}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("my_groups_leave")}
        </button>
      </div>
    </div>
  );
}
