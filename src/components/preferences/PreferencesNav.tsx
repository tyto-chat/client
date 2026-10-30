import { useTranslation } from "react-i18next";
import {
  Bell,
  KeyRound,
  Laptop,
  MessageCircle,
  Mic,
  Settings,
  ShieldBan,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SettingsNav, type SettingsNavGroup } from "@/components/ui/SettingsNav";

export type PanelKey =
  | "general"
  | "chat"
  | "notifications"
  | "voice-video"
  | "account"
  | "devices"
  | "privacy"
  | "apikeys";

type NavHeadingKey = "nav_group_app" | "nav_group_devices" | "nav_group_account";
type NavLabelKey =
  | "nav_general"
  | "tab_chat"
  | "tab_notifications"
  | "nav_voice_video"
  | "nav_account_security"
  | "nav_encryption_devices"
  | "nav_privacy"
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
      { key: "devices", label: "nav_encryption_devices", icon: Laptop },
      { key: "privacy", label: "nav_privacy", icon: ShieldBan },
      { key: "apikeys", label: "tab_apikeys", icon: KeyRound },
    ],
  },
];

export function PreferencesNav({
  active,
  onChange,
  voiceEnabled,
  encryptionDevices,
}: {
  active: PanelKey;
  onChange: (key: PanelKey) => void;
  voiceEnabled: boolean;
  encryptionDevices: boolean;
}) {
  const { t } = useTranslation("settings");
  const groups: SettingsNavGroup<PanelKey>[] = GROUPS.filter(
    (group) => group.heading !== "nav_group_devices" || voiceEnabled,
  ).map((group) => ({
    heading: t(group.heading),
    items: group.items
      .filter((item) => item.key !== "devices" || encryptionDevices)
      .map((item) => ({ key: item.key, label: t(item.label), icon: item.icon })),
  }));

  return (
    <SettingsNav groups={groups} active={active} onChange={onChange} testIdPrefix="pref-tab-" />
  );
}
