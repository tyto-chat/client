import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useVoiceEnabled } from "@/hooks/useVoiceEnabled";
import { Modal } from "@/components/Modal";
import { ApiKeysTab } from "@/components/ApiKeysTab";
import { PreferencesNav, type PanelKey } from "@/components/preferences/PreferencesNav";
import { GeneralPanel } from "@/components/preferences/GeneralPanel";
import { ChatPanel } from "@/components/preferences/ChatPanel";
import { NotificationsPanel } from "@/components/preferences/NotificationsPanel";
import { VoiceVideoPanel } from "@/components/preferences/VoiceVideoPanel";
import { AccountSecurityPanel } from "@/components/preferences/AccountSecurityPanel";

export function PreferencesModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("settings");
  const voiceEnabled = useVoiceEnabled();
  const [active, setActive] = useState<PanelKey>("general");
  const effective = active === "voice-video" && !voiceEnabled ? "general" : active;

  return (
    <Modal title={t("preferences_title")} onClose={onClose} size="2xl">
      {() => (
        <div className="flex max-md:flex-col md:h-[min(37.5rem,70vh)] md:gap-6">
          <PreferencesNav active={active} onChange={setActive} voiceEnabled={voiceEnabled} />
          <div className="min-w-0 flex-1 md:h-full md:overflow-y-auto md:overflow-x-hidden">
            {effective === "general" && <GeneralPanel />}
            {effective === "chat" && <ChatPanel />}
            {effective === "notifications" && <NotificationsPanel />}
            {effective === "voice-video" && <VoiceVideoPanel />}
            {effective === "account" && <AccountSecurityPanel />}
            {effective === "apikeys" && <ApiKeysTab />}
          </div>
        </div>
      )}
    </Modal>
  );
}
