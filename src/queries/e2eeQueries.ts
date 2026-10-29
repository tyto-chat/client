import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  parentIdOf,
  type ConversationSession,
  type DecryptResult,
  type E2eeIdentity,
  type SessionStatus,
} from "@/e2ee/conversationSession";
import { decodeEnvelope } from "@/e2ee/envelope";
import type { KeyStoreScope } from "@/e2ee/keyStore";
import { isOptimisticMessage } from "@/utils/optimisticMessage";
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
          (query.queryKey[0] === "e2eeMessage" &&
            query.queryKey[1] === scope &&
            isUnreadable(query.state.data)) ||
          (query.queryKey[0] === "e2eeStatus" && query.queryKey[1] === scope),
      });
    });
    const stopSync = identity.startSync(intervalMs);
    return () => {
      stopListening();
      stopSync();
    };
  }, [identity, intervalMs, queryClient]);
}

function decryptOptions(session: ConversationSession | null, message: Message) {
  return {
    queryKey: queryKeys.e2eeMessage(
      session === null ? "" : e2eeScopeKey(session.identity.scope),
      JSON.stringify([
        session?.conversation.id ?? null,
        message.id,
        message.revisionCount ?? null,
        message.text,
        parentIdOf(message),
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
  };
}

export function useDecryptedMessage(session: ConversationSession | null, message: Message) {
  return useQuery<DecryptResult>(decryptOptions(session, message));
}

function needsDecryption(message: Message): boolean {
  return (
    !message.isDeleted &&
    !isOptimisticMessage(message["@id"]) &&
    message.kind !== "system" &&
    message.text !== null
  );
}

function display(message: Message, result: DecryptResult | undefined): Message {
  if (result === undefined) return { ...message, text: null, e2eeStatus: "pending" };
  if ("text" in result) return { ...message, text: result.text };
  return {
    ...message,
    text: null,
    e2eeStatus: "unreadable" in result ? "unreadable" : "tampered",
  };
}

export function useDecryptedMessages(
  session: ConversationSession | null,
  messages: readonly Message[],
): Message[] {
  const targets = useMemo(() => messages.filter(needsDecryption), [messages]);
  const results = useQueries({
    queries: targets.map((message) => decryptOptions(session, message)),
  });
  const byId = new Map(targets.map((message, i) => [message["@id"], results[i]?.data]));
  const signature = targets.map((m, i) => `${m["@id"]}:${results[i]?.dataUpdatedAt ?? 0}`).join();
  return useMemo(
    () =>
      session === null
        ? [...messages]
        : messages.map((message) =>
            byId.has(message["@id"]) ? display(message, byId.get(message["@id"])) : message,
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, messages, signature],
  );
}

export function isEnvelopeText(text: string | null | undefined): boolean {
  return decodeEnvelope(text) !== null;
}

export function useE2eeSessionStatus(session: ConversationSession | null) {
  return useQuery<SessionStatus>({
    queryKey: [
      "e2eeStatus",
      session === null ? "" : e2eeScopeKey(session.identity.scope),
      session?.identifier ?? "",
    ],
    queryFn: async () => {
      const current = session as ConversationSession;
      await current.open().catch(() => undefined);
      return current.status();
    },
    enabled: session !== null,
    staleTime: 30_000,
    retry: 1,
  });
}
