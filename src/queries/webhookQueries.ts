import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWebhook,
  deleteWebhook,
  fetchWebhookDeliveries,
  fetchWebhookTriggers,
  fetchWebhooks,
  regenerateSecret,
  sendTestWebhook,
  updateWebhook,
  type CreateWebhookBody,
  type UpdateWebhookBody,
  type Webhook,
  type WebhookDeliveryPage,
  type WebhookTrigger,
  type WebhookWithSecret,
} from "@/api/webhooks";
import { queryKeys } from "@/queries/queryKeys";

export function useWebhooks() {
  return useQuery<Webhook[]>({
    queryKey: queryKeys.adminWebhooks(),
    queryFn: fetchWebhooks,
  });
}

export function useWebhookTriggers() {
  return useQuery<WebhookTrigger[]>({
    queryKey: queryKeys.adminWebhookTriggers(),
    queryFn: fetchWebhookTriggers,
    staleTime: StaleTime.long,
  });
}

export function useWebhookDeliveries(id: number, page: number) {
  return useQuery<WebhookDeliveryPage>({
    queryKey: queryKeys.adminWebhookDeliveries(id, page),
    queryFn: () => fetchWebhookDeliveries(id, page),
    enabled: id > 0,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation<WebhookWithSecret, Error, CreateWebhookBody>({
    mutationFn: createWebhook,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.adminWebhooks() });
    },
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation<Webhook, Error, { id: number; body: UpdateWebhookBody }>({
    mutationFn: ({ id, body }) => updateWebhook(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.adminWebhooks() });
    },
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.adminWebhooks() });
    },
  });
}

export function useRegenerateSecret() {
  const qc = useQueryClient();
  return useMutation<{ secret: string }, Error, number>({
    mutationFn: regenerateSecret,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.adminWebhooks() });
    },
  });
}

export function useSendTestWebhook() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: sendTestWebhook,
    onSuccess: (_, id) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.adminWebhookDeliveries(id, 1),
      });
    },
  });
}
