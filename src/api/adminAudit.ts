import { apiClient } from "@/api/client";

export interface AdminAuditActor {
  id: number;
  name: string | null;
  email: string | null;
}

export interface AdminAuditRow {
  id: number;
  actor: AdminAuditActor | null;
  action: string;
  targetType: string | null;
  targetId: number | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditResponse {
  rows: AdminAuditRow[];
  total: number;
  page: number;
  perPage: number;
}

export interface AdminAuditParams {
  action?: string;
  actorId?: number;
  targetType?: string;
  targetId?: number;
  page?: number;
  perPage?: number;
}

function buildQuery(params: AdminAuditParams): string {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.actorId !== undefined) q.set("actorId", String(params.actorId));
  if (params.targetType) q.set("targetType", params.targetType);
  if (params.targetId !== undefined) q.set("targetId", String(params.targetId));
  if (params.page) q.set("page", String(params.page));
  if (params.perPage) q.set("perPage", String(params.perPage));
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const fetchAdminAuditLog = (params: AdminAuditParams): Promise<AdminAuditResponse> =>
  apiClient.getJson<AdminAuditResponse>(`/api/admin/audit-log${buildQuery(params)}`);

export const fetchAdminAuditActions = (): Promise<{ actions: string[] }> =>
  apiClient.getJson<{ actions: string[] }>(`/api/admin/audit-log/actions`);
