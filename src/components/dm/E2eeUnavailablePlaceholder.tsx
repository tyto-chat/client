import { useTranslation } from "react-i18next";
import { LockIcon } from "@/components/icons";
import type { E2eeAvailability } from "@/e2ee/e2eeContextValue";

export function E2eeUnavailablePlaceholder({
  availability,
}: {
  availability: Exclude<E2eeAvailability, "ready">;
}) {
  const { t } = useTranslation("conversation");
  return (
    <div
      data-testid="e2ee-unavailable"
      className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <LockIcon size={20} className="text-fg-subtle" />
      <p className="font-semibold text-fg">{t("e2ee_placeholder_title")}</p>
      <p className="max-w-sm text-sm text-fg-muted">
        {availability === "unsupported" ? t("e2ee_placeholder_web") : t("e2ee_placeholder_restore")}
      </p>
    </div>
  );
}
