import { useTranslation } from "react-i18next";
import { PaperclipIcon } from "@/components/icons";

export function PurgedAttachmentsNote({ count }: { count: number }) {
  const { t } = useTranslation("channel");
  if (count <= 0) return null;
  return (
    <span className="mt-1 flex items-center gap-1.5 text-xs italic text-fg-subtle">
      <PaperclipIcon size={12} />
      {t("attachments_purged", { count })}
    </span>
  );
}
