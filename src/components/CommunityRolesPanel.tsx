import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import { UserPicker, type PickerItem } from "@/components/UserPicker";
import { buildPickerCandidates } from "@/utils/pickerCandidates";
import { avatarUrl } from "@/api/client";
import {
  useAddCommunityMember,
  useCommunityMembers,
  useUpdateCommunityMemberRole,
} from "@/queries/communityQueries";
import { useInvitableUsers } from "@/queries/conversationQueries";
import { useNotification } from "@/context/NotificationContext";
import type { CommunityMember } from "@/types/api";

interface Props {
  communityId: string;
  currentUserId: number;
}

export function CommunityRolesPanel({ communityId, currentUserId }: Props) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const { data: members = [], isLoading } = useCommunityMembers(communityId);
  const updateRole = useUpdateCommunityMemberRole(communityId);

  const admins = members.filter((m) => m.role === "admin");
  const moderators = members.filter((m) => m.role === "moderator");
  const plainMembers = members.filter((m) => m.role === "member");

  async function setRole(member: CommunityMember, role: CommunityMember["role"]) {
    try {
      await updateRole.mutateAsync({ memberId: member.id, role });
      notify(t("member_role_updated"), "success");
    } catch {
      notify(t("member_role_update_error"), "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AddMemberSection communityId={communityId} memberUserIds={members.map((m) => m.userId)} />
      <RoleSection
        heading={t("roles_admins_heading")}
        list={admins}
        currentUserId={currentUserId}
        emptyLabel={t("roles_no_admins")}
        candidates={plainMembers.concat(moderators)}
        promoteLabel={t("roles_promote_admin")}
        promoteRole="admin"
        searchPlaceholder={t("roles_promote_search")}
        demoteLabel={t("roles_demote")}
        isLoading={isLoading}
        onChangeRole={setRole}
        isPending={updateRole.isPending}
      />
      <RoleSection
        heading={t("roles_moderators_heading")}
        list={moderators}
        currentUserId={currentUserId}
        emptyLabel={t("roles_no_moderators")}
        candidates={plainMembers}
        promoteLabel={t("roles_promote_moderator")}
        promoteRole="moderator"
        searchPlaceholder={t("roles_promote_search")}
        demoteLabel={t("roles_demote")}
        isLoading={isLoading}
        onChangeRole={setRole}
        isPending={updateRole.isPending}
      />
    </div>
  );
}

interface SectionProps {
  heading: string;
  list: CommunityMember[];
  currentUserId: number;
  emptyLabel: string;
  candidates: CommunityMember[];
  promoteLabel: string;
  promoteRole: CommunityMember["role"];
  searchPlaceholder: string;
  demoteLabel: string;
  isLoading: boolean;
  onChangeRole: (m: CommunityMember, role: CommunityMember["role"]) => void | Promise<void>;
  isPending: boolean;
}

function RoleSection({
  heading,
  list,
  currentUserId,
  emptyLabel,
  candidates,
  promoteLabel,
  promoteRole,
  searchPlaceholder,
  demoteLabel,
  isLoading,
  onChangeRole,
  isPending,
}: SectionProps) {
  const { t } = useTranslation(["community", "common"]);
  const [query, setQuery] = useState("");

  const candidatesById = useMemo(() => {
    const map = new Map<number, CommunityMember>();
    for (const m of candidates) map.set(m.userId, m);
    return map;
  }, [candidates]);

  const results = useMemo<PickerItem[]>(
    () => buildPickerCandidates(candidates, { query }),
    [candidates, query],
  );

  function handleAdd(item: PickerItem) {
    const member = candidatesById.get(item.id);
    if (!member) return;
    void onChangeRole(member, promoteRole);
    setQuery("");
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">{heading}</h3>

      {isLoading ? (
        <p className="text-sm text-fg-subtle">{t("common:loading")}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-fg-subtle">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {list.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar
                  name={m.profile.name}
                  colorKey={String(m.userId)}
                  imageUrl={avatarUrl(m.profile.avatar?.contentUrl ?? null)}
                  size="xs"
                />
                <span className="truncate text-sm text-fg dark:text-white">{m.profile.name}</span>
              </div>
              {m.userId !== currentUserId && (
                <button
                  type="button"
                  onClick={() => void onChangeRole(m, "member")}
                  disabled={isPending}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                >
                  {demoteLabel}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <UserPicker
        placeholder={searchPlaceholder}
        query={query}
        onQueryChange={setQuery}
        results={results}
        buttonLabel={promoteLabel}
        onAdd={handleAdd}
        isPending={isPending}
      />
    </section>
  );
}

function AddMemberSection({
  communityId,
  memberUserIds,
}: {
  communityId: string;
  memberUserIds: number[];
}) {
  const { t } = useTranslation(["community", "common"]);
  const { notify } = useNotification();
  const [query, setQuery] = useState("");
  const addMember = useAddCommunityMember(communityId);
  const { data: invitable } = useInvitableUsers(query.trim());

  const memberIdSet = useMemo(() => new Set(memberUserIds), [memberUserIds]);

  const results = useMemo<PickerItem[]>(() => {
    if (query.trim().length === 0) return [];
    return (invitable?.items ?? [])
      .filter((u) => !memberIdSet.has(u.id))
      .slice(0, 8)
      .map((u) => ({
        id: u.id,
        name: u.name ?? `#${u.id}`,
        avatarUrl: u.avatarUrl,
      }));
  }, [invitable, memberIdSet, query]);

  async function handleAdd(item: PickerItem) {
    try {
      await addMember.mutateAsync({ userId: item.id });
      notify(t("member_added"), "success");
      setQuery("");
    } catch {
      notify(t("member_add_error"), "error");
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">{t("add_member_heading")}</h3>
      <p className="text-xs text-fg-muted">{t("add_member_hint")}</p>
      <UserPicker
        placeholder={t("add_member_search")}
        query={query}
        onQueryChange={setQuery}
        results={results}
        buttonLabel={t("add_member_button")}
        onAdd={handleAdd}
        isPending={addMember.isPending}
      />
    </section>
  );
}
