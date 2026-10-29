import type { QueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "@/api/client";
import { getServerInfo, setServerInfo } from "@/api/serverInfo";
import { queryKeys } from "@/queries/queryKeys";
import type { ServerInfo } from "@/types/api";

export function isReadOnlyError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 422;
}

export function refreshConversationPolicy(queryClient: QueryClient, identifier: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversation(identifier), exact: true });
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(), exact: true });
}

export async function refreshServerPolicy(queryClient: QueryClient): Promise<void> {
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversations() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.serverInfo() });
  void queryClient.invalidateQueries({ queryKey: ["conversationPreflight"] });
  const fresh = await apiClient.getJson<ServerInfo>("/api/server-info").catch(() => null);
  const current = getServerInfo();
  if (fresh !== null) setServerInfo(current === null ? fresh : { ...current, ...fresh });
}
