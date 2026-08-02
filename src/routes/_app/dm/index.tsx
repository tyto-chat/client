import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MobileTopBar } from "@/components/MobileTopBar";

export const Route = createFileRoute("/_app/dm/")({
  component: DmIndex,
});

function DmIndex() {
  const { t } = useTranslation("conversation");
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <MobileTopBar title={t("direct_messages")} />
      <div className="flex flex-1 items-center justify-center text-fg-muted">
        {t("select_conversation")}
      </div>
    </main>
  );
}
