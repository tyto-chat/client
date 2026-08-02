import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAdminServerConfig } from "@/queries/adminServerConfigQueries";
import { Spinner } from "@/components/icons";
import { ModalTabs } from "@/components/ui";
import { GeneralPanel } from "./GeneralPanel";
import { LegalPanel } from "./LegalPanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { RateLimitsPanel } from "./RateLimitsPanel";
import { EmailPanel } from "./EmailPanel";
import { ModerationPanel } from "./ModerationPanel";
import { AdvancedPanel } from "./AdvancedPanel";
import { useConfirm } from "@/hooks/useConfirm";
import { SetupWizard } from "@/components/onboarding/SetupWizard";
import { queryKeys } from "@/queries/queryKeys";

type TabKey = "general" | "legal" | "attachments" | "rate" | "moderation" | "email" | "advanced";

const validTabs: TabKey[] = [
  "general",
  "legal",
  "attachments",
  "rate",
  "moderation",
  "email",
  "advanced",
];

export function AdminSettingsTabs({ initialTab }: { initialTab?: string } = {}) {
  const { t } = useTranslation("admin");
  const { confirm, confirmDialog } = useConfirm();
  const qc = useQueryClient();
  const [showWizard, setShowWizard] = useState(false);
  const { data: config, isLoading } = useAdminServerConfig();
  const [active, setActive] = useState<TabKey>(
    initialTab && validTabs.includes(initialTab as TabKey) ? (initialTab as TabKey) : "general",
  );
  const [dirtyByTab, setDirtyByTab] = useState<Record<string, boolean>>({});

  const onDirtyGeneral = useCallback(
    (d: boolean) => setDirtyByTab((m) => (m.general === d ? m : { ...m, general: d })),
    [],
  );
  const onDirtyLegal = useCallback(
    (d: boolean) => setDirtyByTab((m) => (m.legal === d ? m : { ...m, legal: d })),
    [],
  );
  const onDirtyAttachments = useCallback(
    (d: boolean) => setDirtyByTab((m) => (m.attachments === d ? m : { ...m, attachments: d })),
    [],
  );
  const onDirtyRate = useCallback(
    (d: boolean) => setDirtyByTab((m) => (m.rate === d ? m : { ...m, rate: d })),
    [],
  );
  const onDirtyEmail = useCallback(
    (d: boolean) => setDirtyByTab((m) => (m.email === d ? m : { ...m, email: d })),
    [],
  );
  const onDirtyModeration = useCallback(
    (d: boolean) => setDirtyByTab((m) => (m.moderation === d ? m : { ...m, moderation: d })),
    [],
  );
  const onDirtyAdvanced = useCallback(
    (d: boolean) => setDirtyByTab((m) => (m.advanced === d ? m : { ...m, advanced: d })),
    [],
  );

  if (isLoading || !config) {
    return (
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <Spinner size={16} /> {t("loading")}
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: t("tab_general") },
    { key: "legal", label: t("tab_legal") },
    { key: "attachments", label: t("tab_attachments") },
    { key: "rate", label: t("tab_rate_limits") },
    { key: "moderation", label: t("tab_moderation") },
    { key: "email", label: t("tab_email") },
    { key: "advanced", label: t("tab_advanced") },
  ];

  async function switchTo(next: TabKey) {
    if (next === active) return;
    if (dirtyByTab[active]) {
      const ok = await confirm({ title: t("discard_changes_confirm"), destructive: true });
      if (!ok) return;
    }
    setActive(next);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t("nav_settings")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("settings_intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface"
        >
          {t("setup_run_wizard")}
        </button>
      </header>
      <ModalTabs
        active={active}
        onChange={(key) => void switchTo(key as typeof active)}
        tabs={tabs.map((tab) => ({ key: tab.key, label: tab.label }))}
      />
      {active === "general" && <GeneralPanel config={config} onDirtyChange={onDirtyGeneral} />}
      {active === "legal" && <LegalPanel config={config} onDirtyChange={onDirtyLegal} />}
      {active === "attachments" && (
        <AttachmentsPanel config={config} onDirtyChange={onDirtyAttachments} />
      )}
      {active === "rate" && <RateLimitsPanel config={config} onDirtyChange={onDirtyRate} />}
      {active === "moderation" && (
        <ModerationPanel config={config} onDirtyChange={onDirtyModeration} />
      )}
      {active === "email" && <EmailPanel config={config} onDirtyChange={onDirtyEmail} />}
      {active === "advanced" && <AdvancedPanel config={config} onDirtyChange={onDirtyAdvanced} />}
      {confirmDialog}
      {showWizard && (
        <SetupWizard
          onClose={() => {
            setShowWizard(false);
            void qc.invalidateQueries({ queryKey: queryKeys.adminServerConfig() });
            void qc.invalidateQueries({ queryKey: queryKeys.adminSetupStatus() });
          }}
        />
      )}
    </div>
  );
}
