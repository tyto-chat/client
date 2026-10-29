import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ConversationSession, DecryptResult, E2eeIdentity } from "@/e2ee/conversationSession";
import type { KeyStoreScope } from "@/e2ee/keyStore";
import type { Message } from "@/types/api";
import { queryKeys } from "./queryKeys";

export function e2eeScopeKey(scope: KeyStoreScope): string {
  return `${scope.serverOrigin}|${scope.serverUserId}|${scope.profileId}`;
}

function isUnreadable(data: unknown): boolean {
  return typeof data === "object" && data !== null && "unreadable" in data;
}

export function useE2eeSync(identity: E2eeIdentity | null, intervalMs = 60_000): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (identity === null) return;
    const scope = e2eeScopeKey(identity.scope);
    const stopListening = identity.onChange(() => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "e2eeMessage" &&
          query.queryKey[1] === scope &&
          isUnreadable(query.state.data),
      });
    });
    const stopSync = identity.startSync(intervalMs);
    return () => {
      stopListening();
      stopSync();
    };
  }, [identity, intervalMs, queryClient]);
}

export function useDecryptedMessage(session: ConversationSession | null, message: Message) {
  return useQuery<DecryptResult>({
    queryKey: queryKeys.e2eeMessage(
      session === null ? "" : e2eeScopeKey(session.identity.scope),
      JSON.stringify([
        session?.conversation.id ?? null,
        message.id,
        message.revisionCount ?? null,
        message.text,
        message.parent?.id ?? null,
        message.createdBy?.id ?? null,
        message.createdAt,
        message.revisedAt ?? null,
        message.isDeleted,
      ]),
    ),
    queryFn: () => (session as ConversationSession).decrypt(message),
    enabled: session !== null,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}
