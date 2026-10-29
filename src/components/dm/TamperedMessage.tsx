import { useTranslation } from "react-i18next";
import { AlertTriangleIcon } from "@/components/icons";

export function TamperedMessage() {
  const { t } = useTranslation("conversation");
  return (
    <p data-testid="e2ee-tampered" className="flex items-center gap-1.5 text-sm italic text-danger">
      <AlertTriangleIcon size={12} />
      {t("e2ee_message_tampered")}
    </p>
  );
}
