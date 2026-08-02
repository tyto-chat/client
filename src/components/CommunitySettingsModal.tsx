import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Flag,
  Scale,
  ScrollText,
  Settings,
  Shield,
  Smile,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal } from "@/components/Modal";
import { SettingsNav, type SettingsNavGroup } from "@/components/ui/SettingsNav";
import { useCommunity } from "@/queries/communityQueries";
import { EditCommunityPanel } from "@/components/EditCommunityPanel";
import { CommunityRolesPanel } from "@/components/CommunityRolesPanel";
import { CommunityInvitesPanel } from "@/components/CommunityInvitesPanel";
import { GroupsPanel } from "@/components/GroupsPanel";
import { EmojiManagerPanel } from "@/components/EmojiManagerPanel";
import { ModerationLogPanel } from "@/components/ModerationLogPanel";
import { ReportsPanel } from "@/components/ReportsPanel";
import { AppealsPanel } from "@/components/AppealsPanel";
import { PresenceHistoryChart } from "@/components/PresenceHistoryChart";

type Tab =
  | "overview"
  | "roles"
  | "invites"
  | "groups"
  | "emojis"
  | "activity"
  | "moderation"
  | "reports"
  | "appeals";

interface Props {
  communityId: string;
  currentUserId: number;
  isAdmin: boolean;
  ownsAnyGroup: boolean;
  canSeeModLog: boolean;
  canLiftModerationActions: boolean;
  initialTab?: Tab;
  onClose: () => void;
}

const ADMIN_TABS: Tab[] = ["overview", "roles", "invites", "groups", "emojis", "activity"];
const MOD_TABS: Tab[] = ["moderation", "reports", "appeals"];

const ICONS: Record<Tab, LucideIcon> = {
  overview: Settings,
  roles: Shield,
  invites: UserPlus,
  groups: Users,
  emojis: Smile,
  activity: Activity,
  moderation: ScrollText,
  reports: Flag,
  appeals: Scale,
};

export function CommunitySettingsModal({
  communityId,
  currentUserId,
  isAdmin,
  ownsAnyGroup,
  canSeeModLog,
  canLiftModerationActions,
  initialTab,
  onClose,
}: Props) {
  const { t } = useTranslation("community");
  const { t: tReports } = useTranslation("reports");
  const { t: tAppeals } = useTranslation("appeals");
  const { data: community } = useCommunity(communityId);

  const communityTabs: Tab[] = isAdmin ? ADMIN_TABS : ownsAnyGroup ? ["groups"] : [];
  const modTabs: Tab[] = canSeeModLog ? MOD_TABS : [];
  const tabs = [...communityTabs, ...modTabs];
  const defaultTab: Tab =
    initialTab && tabs.includes(initialTab) ? initialTab : (tabs[0] ?? "overview");
  const [tab, setTab] = useState<Tab>(defaultTab);

  const label = (key: Tab) =>
    key === "reports"
      ? tReports("tab_reports")
      : key === "appeals"
        ? tAppeals("tab_appeals")
        : t(`tab_${key === "moderation" ? "moderation_log" : key}`);

  const groups: SettingsNavGroup<Tab>[] = [
    { heading: t("nav_group_community"), items: communityTabs },
    { heading: t("nav_group_moderation"), items: modTabs },
  ]
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      heading: group.heading,
      items: group.items.map((key) => ({ key, label: label(key), icon: ICONS[key] })),
    }));

  return (
    <Modal title={t("community_settings_title")} onClose={onClose} size="2xl">
      {(close) => (
        <div className="flex max-md:flex-col md:h-[min(37.5rem,70vh)] md:gap-6">
          <SettingsNav
            groups={groups}
            active={tab}
            onChange={setTab}
            testIdPrefix="community-tab-"
          />

          <div className="min-w-0 flex-1 md:h-full md:overflow-y-auto">
            {tab === "overview" && isAdmin && community && (
              <EditCommunityPanel community={community} onClose={close} />
            )}
            {tab === "roles" && isAdmin && (
              <CommunityRolesPanel communityId={communityId} currentUserId={currentUserId} />
            )}
            {tab === "invites" && isAdmin && <CommunityInvitesPanel communityId={communityId} />}
            {tab === "groups" && (isAdmin || ownsAnyGroup) && (
              <GroupsPanel communityId={communityId} isCommunityAdmin={isAdmin} />
            )}
            {tab === "emojis" && isAdmin && <EmojiManagerPanel communityIdentifier={communityId} />}
            {tab === "activity" && isAdmin && (
              <PresenceHistoryChart communityIdentifier={communityId} />
            )}
            {tab === "moderation" && canSeeModLog && (
              <ModerationLogPanel communityId={communityId} canLift={canLiftModerationActions} />
            )}
            {tab === "reports" && canSeeModLog && <ReportsPanel communityId={communityId} />}
            {tab === "appeals" && canSeeModLog && <AppealsPanel communityId={communityId} />}
          </div>
        </div>
      )}
    </Modal>
  );
}
