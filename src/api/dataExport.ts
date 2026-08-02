import { apiClient, getBaseUrl } from "@/api/client";

export type DataExportStatus = "queued" | "processing" | "ready" | "failed" | "expired";

export interface DataExportRequest {
  pending: boolean;
  id?: number;
  status?: DataExportStatus;
  requestedAt?: string;
  readyAt?: string | null;
  expiresAt?: string | null;
  fileSize?: number | null;
  downloadUrl?: string | null;
}

export const fetchDataExportStatus = (): Promise<DataExportRequest> =>
  apiClient.getJson<DataExportRequest>("/api/me/data-export");

export const requestDataExport = (): Promise<DataExportRequest> =>
  apiClient.postJson<DataExportRequest>("/api/me/data-export", {});

export const downloadUrl = (relative: string): string => getBaseUrl() + relative;
