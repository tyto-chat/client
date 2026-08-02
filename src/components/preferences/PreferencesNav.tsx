import { useTranslation } from "react-i18next";
import { Bell, KeyRound, MessageCircle, Mic, Settings, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SettingsNav, type SettingsNavGroup } from "@/components/ui/SettingsNav";

export type PanelKey = "general" | "chat" | "notifications" | "voice-video" | "account" | "apikeys";

type NavHeadingKey = "nav_group_app" | "nav_group_devices" | "nav_group_account";
type NavLabelKey =
  | "nav_general"
  | "tab_chat"
  | "tab_notifications"
  | "nav_voice_video"
  | "nav_account_security"
  | "tab_apikeys";

interface NavGroup {
  heading: NavHeadingKey;
  items: { key: PanelKey; label: NavLabelKey; icon: LucideIcon }[];
}

const GROUPS: NavGroup[] = [
  {
    heading: "nav_group_app",
    items: [
      { key: "general", label: "nav_general", icon: Settings },
      { key: "chat", label: "tab_chat", icon: MessageCircle },
      { key: "notifications", label: "tab_notifications", icon: Bell },
    ],
  },
  {
    heading: "nav_group_devices",
    items: [{ key: "voice-video", label: "nav_voice_video", icon: Mic }],
  },
  {
    heading: "nav_group_account",
    items: [
      { key: "account", label: "nav_account_security", icon: UserRound },
      { key: "apikeys", label: "tab_apikeys", icon: KeyRound },
    ],
  },
];

export function PreferencesNav({
  active,
  onChange,
  voiceEnabled,
}: {
  active: PanelKey;
  onChange: (key: PanelKey) => void;
  voiceEnabled: boolean;
}) {
  const { t } = useTranslation("settings");
  const groups: SettingsNavGroup<PanelKey>[] = GROUPS.filter(
    (group) => group.heading !== "nav_group_devices" || voiceEnabled,
  ).map((group) => ({
    heading: t(group.heading),
    items: group.items.map((item) => ({ key: item.key, label: t(item.label), icon: item.icon })),
  }));

  return (
    <SettingsNav groups={groups} active={active} onChange={onChange} testIdPrefix="pref-tab-" />
  );
}
