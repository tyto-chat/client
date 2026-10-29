import { useTranslation } from "react-i18next";

export function DeclinedPlainNotice() {
  const { t } = useTranslation("conversation");
  return (
    <p
      data-testid="e2ee-declined-plain"
      role="status"
      className="border-b border-line bg-canvas px-4 py-2 text-xs text-fg-muted"
    >
      {t("e2ee_declined_plain")}
    </p>
  );
}
