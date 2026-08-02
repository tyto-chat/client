import { StaleTime } from "./staleTimes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { issueApiKey, fetchApiKeys, revokeApiKey, type IssueApiKeyPayload } from "@/api/apiKeys";
import { queryKeys } from "@/queries/queryKeys";
import type { ApiKey, IssuedApiKey } from "@/types/api";

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: queryKeys.apiKeys(),
    queryFn: fetchApiKeys,
    staleTime: StaleTime.short,
  });
}

export function useIssueApiKey() {
  const queryClient = useQueryClient();
  return useMutation<IssuedApiKey, Error, IssueApiKeyPayload>({
    mutationFn: issueApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys() });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number, { previous?: ApiKey[] }>({
    mutationFn: revokeApiKey,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.apiKeys() });
      const previous = queryClient.getQueryData<ApiKey[]>(queryKeys.apiKeys());
      queryClient.setQueryData<ApiKey[]>(
        queryKeys.apiKeys(),
        (old) =>
          old?.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)) ?? old,
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.apiKeys(), ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys() });
    },
  });
}
