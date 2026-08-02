import { useTranslation } from "react-i18next";

export function VersionMismatchScreen({
  direction,
}: {
  direction: "server-older" | "server-newer";
}) {
  const { t } = useTranslation("common");
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
      <h1 className="text-lg font-semibold text-fg">{t("version_mismatch_title")}</h1>
      <p className="max-w-md text-sm text-fg-muted">
        {direction === "server-newer"
          ? t("version_mismatch_client_old")
          : t("version_mismatch_server_old")}
      </p>
    </div>
  );
}
