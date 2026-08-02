import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/icons";
import { fetchLegalDocument } from "@/api/legal";
import { renderLegalMarkdown } from "@/utils/renderLegalMarkdown";
import type { LegalDocumentType } from "@/types/api";

export function LegalDocumentModal({
  type,
  onClose,
}: {
  type: LegalDocumentType;
  onClose: () => void;
}) {
  const { t } = useTranslation("auth");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["legal", type],
    queryFn: () => fetchLegalDocument(type),
    staleTime: 5 * 60 * 1000,
  });

  const title = type === "terms" ? t("terms_of_service") : t("privacy_policy");

  return (
    <Modal title={title} onClose={onClose} size="2xl">
      {() => (
        <div className="max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size={28} className="text-[var(--accent)]" />
            </div>
          ) : isError || !data ? (
            <p className="py-6 text-center text-sm text-fg-muted">{t("legal_unavailable")}</p>
          ) : (
            <div
              className="legal-document"
              dangerouslySetInnerHTML={{ __html: renderLegalMarkdown(data.content) }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
