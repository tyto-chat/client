import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { GroupIcon } from "@/components/GroupIcon";
import { UserPicker } from "@/components/UserPicker";
import { buildPickerCandidates } from "@/utils/pickerCandidates";
import { avatarUrl } from "@/api/client";
import {
  useChannelMembers,
  useAddChannelMember,
  useRemoveChannelMember,
  useUpdateChannelMemberRole,
} from "@/queries/channelQueries";
import { useCommunityMembers } from "@/queries/communityQueries";
import { useGroups } from "@/queries/groupQueries";
import { fetchGroupChannelPermissions } from "@/api/groups";
import { queryKeys } from "@/queries/queryKeys";
import type { Channel } from "@/types/api";

interface RowMember {
  userId: number;
  profile: { name: string; avatar?: { contentUrl?: Parameters<typeof avatarUrl>[0] } | null };
}

function MemberRow({ member, children }: { member: RowMember; children?: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar
          name={member.profile.name}
          colorKey={String(member.userId)}
          imageUrl={avatarUrl(member.profile.avatar?.contentUrl ?? null)}
          size="xs"
        />
        <span className="truncate text-sm text-fg dark:text-white">{member.profile.name}</span>
      </div>
      {children}
    </li>
  );
}

interface Props {
  channel: Channel;
  communityId: string;
  isAdmin: boolean;
  canManageMembers: boolean;
  onClose: () => void;
}

export function ManageChannelAccessModal({
  channel,
  communityId,
  isAdmin,
  canManageMembers,
  onClose,
}: Props) {
  const { t } = useTranslation(["community", "common"]);
  const { data: channelMembers = [] } = useChannelMembers(communityId, channel.identifier);
  const { data: communityMembers = [] } = useCommunityMembers(communityId);
  const addMember = useAddChannelMember(communityId, channel.identifier);
  const removeMember = useRemoveChannelMember(communityId, channel.identifier);
  const updateRole = useUpdateChannelMemberRole(communityId, channel.identifier);

  const moderators = useMemo(
    () => channelMembers.filter((m) => m.role === "moderator"),
    [channelMembers],
  );
  const members = useMemo(
    () => channelMembers.filter((m) => m.role === "member"),
    [channelMembers],
  );

  const { data: groups = [] } = useGroups(communityId);
  const permQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: queryKeys.groupChannelPermissions(communityId, g.identifier),
      queryFn: () => fetchGroupChannelPermissions(communityId, g.identifier),
      staleTime: 30_000,
    })),
  });
  const groupsWithAccess = groups.flatMap((g, i) => {
    const perm = permQueries[i]?.data?.find((p) => p.channelId === channel.id);
    return perm ? [{ group: g, role: perm.role }] : [];
  });

  const [modQuery, setModQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const modCandidates = useMemo(
    () =>
      buildPickerCandidates(communityMembers, {
        query: modQuery,
        excludeIds: moderators.map((m) => m.userId),
      }),
    [communityMembers, moderators, modQuery],
  );
  const memberCandidates = useMemo(
    () =>
      buildPickerCandidates(communityMembers, {
        query: memberQuery,
        excludeIds: channelMembers.map((m) => m.userId),
      }),
    [communityMembers, channelMembers, memberQuery],
  );

  return (
    <Modal title={t("manage_access_title", { channel: channel.name })} onClose={onClose}>
      {() => (
        <div className="space-y-6">
          <section className="space-y-2">
            <p className="text-sm font-semibold text-fg">
              {moderators.length > 0
                ? t("moderators_count", { count: moderators.length })
                : t("moderators_section")}
            </p>

            {isAdmin && (
              <UserPicker
                placeholder={t("add_moderator_placeholder")}
                query={modQuery}
                onQueryChange={setModQuery}
                results={modCandidates}
                buttonLabel={t("add_as_mod")}
                onAdd={(item) => addMember.mutate({ userId: item.id, role: "moderator" })}
                isPending={addMember.isPending}
              />
            )}

            {moderators.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("no_moderators")}</p>
            ) : (
              <ul className="max-h-40 overflow-y-auto space-y-1">
                {moderators.map((m) => (
                  <MemberRow key={m.id} member={m}>
                    {isAdmin && (
                      <button
                        onClick={() => updateRole.mutate({ userId: m.userId, role: "member" })}
                        disabled={updateRole.isPending}
                        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                      >
                        {t("remove_mod")}
                      </button>
                    )}
                  </MemberRow>
                ))}
              </ul>
            )}
          </section>
          {channel.isPrivate && (
            <section className="space-y-2">
              <p className="text-sm font-semibold text-fg">
                {members.length > 0
                  ? t("members_count", { count: members.length })
                  : t("members_section")}
              </p>

              {canManageMembers && (
                <UserPicker
                  placeholder={t("add_member_placeholder")}
                  query={memberQuery}
                  onQueryChange={setMemberQuery}
                  results={memberCandidates}
                  buttonLabel={t("common:add")}
                  onAdd={(item) => addMember.mutate({ userId: item.id })}
                  isPending={addMember.isPending}
                />
              )}

              {members.length === 0 ? (
                <p className="text-sm text-fg-subtle">{t("no_members_yet")}</p>
              ) : (
                <ul className="max-h-40 overflow-y-auto space-y-1">
                  {members.map((m) => (
                    <MemberRow key={m.id} member={m}>
                      <div className="flex shrink-0 gap-1">
                        {isAdmin && (
                          <button
                            onClick={() =>
                              updateRole.mutate({ userId: m.userId, role: "moderator" })
                            }
                            disabled={updateRole.isPending}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent-light)] hover:text-[var(--accent-text-on-light)] disabled:opacity-50 dark:hover:bg-[var(--accent-dark)]"
                          >
                            {t("make_mod")}
                          </button>
                        )}
                        <button
                          onClick={() => removeMember.mutate(m.userId)}
                          disabled={removeMember.isPending}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                        >
                          {t("kick")}
                        </button>
                      </div>
                    </MemberRow>
                  ))}
                </ul>
              )}
            </section>
          )}

          {groupsWithAccess.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-semibold text-fg">{t("groups_with_access")}</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {groupsWithAccess.map(({ group, role }) => (
                  <li
                    key={group["@id"]}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {group.icon && (
                        <GroupIcon
                          icon={group.icon}
                          name=""
                          communityIdentifier={communityId}
                          className="text-base leading-none"
                        />
                      )}
                      <span className="truncate text-sm text-fg">{group.name}</span>
                      {group.color && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-fg-muted ring-1 ring-inset ring-line">
                      {t(
                        role === "moderator"
                          ? "group_permission_moderator"
                          : "group_permission_member",
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
