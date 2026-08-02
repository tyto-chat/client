import { apiClient } from "@/api/client";
import type { LegalDocument, LegalDocumentType } from "@/types/api";

export function fetchLegalDocument(
  type: LegalDocumentType,
  variant?: "default",
): Promise<LegalDocument> {
  const query = variant ? `?variant=${variant}` : "";
  return apiClient.getJson<LegalDocument>(`/api/legal/${type}${query}`);
}
