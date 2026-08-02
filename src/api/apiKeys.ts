import { apiClient } from "@/api/client";
import { unwrapCollection } from "@/api/hydra";
import type { ApiKey, ApiKeyScope, HydraCollection, IssuedApiKey } from "@/types/api";

export const fetchApiKeys = async (): Promise<ApiKey[]> => {
  const res = await apiClient.get<HydraCollection<ApiKey>>("/api/me/api-keys");
  return unwrapCollection(res);
};

export interface IssueApiKeyPayload {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string | null;
}

export const issueApiKey = (payload: IssueApiKeyPayload): Promise<IssuedApiKey> =>
  apiClient.post<IssuedApiKey>("/api/me/api-keys", payload);

export const revokeApiKey = (id: number): Promise<void> =>
  apiClient.delete<void>(`/api/me/api-keys/${id}`);
