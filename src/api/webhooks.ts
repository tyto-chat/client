import { apiClient } from "@/api/client";

export interface WebhookTrigger {
  key: string;
  label: string;
  description: string;
  filterFields: string[];
  requiredFilterFields: string[];
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  triggerKey: string;
  filters: Record<string, unknown> | null;
  isActive: boolean;
  disabledReason: string | null;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookWithSecret extends Webhook {
  secret: string;
}

export interface WebhookDelivery {
  id: number;
  triggerKey: string;
  status: "pending" | "queued" | "success" | "failed";
  httpCode: number | null;
  responseBody: string | null;
  error: string | null;
  attempts: number;
  durationMs: number | null;
  actorName: string | null;
  createdAt: string;
  requestPayload: Record<string, unknown>;
}

export interface WebhookDeliveryPage {
  items: WebhookDelivery[];
  total: number;
  page: number;
  perPage: number;
}

export interface CreateWebhookBody {
  name: string;
  url: string;
  triggerKey: string;
  filters: Record<string, unknown> | null;
}

export interface UpdateWebhookBody {
  name?: string;
  url?: string;
  filters?: Record<string, unknown> | null;
  isActive?: boolean;
  replayPending?: boolean;
}

export const fetchWebhooks = async (): Promise<Webhook[]> =>
  (await apiClient.getJson<{ rows: Webhook[] }>("/api/admin/webhooks")).rows;

export const fetchWebhookTriggers = async (): Promise<WebhookTrigger[]> =>
  (await apiClient.getJson<{ triggers: WebhookTrigger[] }>("/api/admin/webhooks/triggers"))
    .triggers;

export const createWebhook = (body: CreateWebhookBody): Promise<WebhookWithSecret> =>
  apiClient.postJson<WebhookWithSecret>("/api/admin/webhooks", body);

export const fetchWebhook = (id: number): Promise<Webhook> =>
  apiClient.getJson<Webhook>(`/api/admin/webhooks/${id}`);

export const updateWebhook = (id: number, body: UpdateWebhookBody): Promise<Webhook> =>
  apiClient.patch<Webhook>(`/api/admin/webhooks/${id}`, body);

export const deleteWebhook = (id: number): Promise<void> =>
  apiClient.delete<void>(`/api/admin/webhooks/${id}`);

export const regenerateSecret = (id: number): Promise<{ secret: string }> =>
  apiClient.postJson<{ secret: string }>(`/api/admin/webhooks/${id}/regenerate-secret`, {});

export const fetchWebhookDeliveries = async (
  id: number,
  page = 1,
  perPage = 25,
): Promise<WebhookDeliveryPage> => {
  const res = await apiClient.getJson<{
    rows: WebhookDelivery[];
    total: number;
    page: number;
    perPage: number;
  }>(`/api/admin/webhooks/${id}/deliveries?page=${page}&perPage=${perPage}`);
  return { items: res.rows, total: res.total, page: res.page, perPage: res.perPage };
};

export const sendTestWebhook = (id: number): Promise<void> =>
  apiClient.postJson<void>(`/api/admin/webhooks/${id}/test`, {});
