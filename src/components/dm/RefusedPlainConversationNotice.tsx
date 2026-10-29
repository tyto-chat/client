import { useTranslation } from "react-i18next";
import { LockIcon } from "@/components/icons";
import { StartEncryptedAction } from "@/components/dm/StartEncryptedAction";
import type { Conversation } from "@/types/api";

export function RefusedPlainConversationNotice({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation("conversation");
  return (
    <div
      data-testid="e2ee-refused-plain-conversation"
      role="status"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <LockIcon size={20} className="text-accent" />
      <p className="max-w-md text-sm font-semibold text-fg">{t("e2ee_refused_plain_title")}</p>
      <p className="max-w-md text-sm text-fg-muted">{t("e2ee_refused_plain_body")}</p>
      <StartEncryptedAction conversation={conversation} />
    </div>
  );
}
