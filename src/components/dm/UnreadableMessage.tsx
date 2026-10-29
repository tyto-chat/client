import { useTranslation } from "react-i18next";

export function UnreadableMessage() {
  const { t } = useTranslation("conversation");
  return (
    <p data-testid="e2ee-unreadable" className="text-sm italic text-fg-subtle">
      {t("e2ee_message_unreadable")}
    </p>
  );
}

export function PendingDecryption() {
  const { t } = useTranslation("conversation");
  return (
    <p data-testid="e2ee-pending" className="text-sm italic text-fg-subtle">
      {t("e2ee_message_pending")}
    </p>
  );
}
