import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { uuidFromIri } from "@/api/hydra";
import { queryKeys } from "@/queries/queryKeys";
import type { ChannelPage, Conversation, Message, MessageUpdateEvent } from "@/types/api";
import { decodeEnvelope } from "./envelope";
import type { KnownMessage, LocalSecuritySnapshot } from "./localSecurityState";

export interface AdmissionConversation {
  id: number;
  identifier: string;
  encrypted?: boolean;
  members: { userId: number }[];
}

export type PlainWriteRefusal = "self_refuses" | "pinned_peer";

export class PlainWriteRefusedError extends Error {
  readonly reason: PlainWriteRefusal;

  constructor(reason: PlainWriteRefusal) {
    super(`writing to this conversation is refused: ${reason}`);
    this.name = "PlainWriteRefusedError";
    this.reason = reason;
  }
}

let active: LocalSecuritySnapshot | null = null;
const declined = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setActiveSecurity(snapshot: LocalSecuritySnapshot | null): void {
  active = snapshot;
  if (snapshot === null || !snapshot.refusal.on) declined.clear();
  emit();
}

export function activeSecurity(): LocalSecuritySnapshot | null {
  return active;
}

export function subscribeAdmission(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function wasDeclined(identifier: string): boolean {
  return declined.has(identifier);
}

function markDeclined(conversation: AdmissionConversation | undefined): void {
  if (conversation === undefined || declined.has(conversation.identifier)) return;
  declined.add(conversation.identifier);
  emit();
}

const revisionOf = (revisionCount: number | undefined): number => revisionCount ?? 1;

function isFullMessage(item: Message | MessageUpdateEvent): item is Message {
  return !("type" in item && item.type === "message.update");
}

function admitKnown(snapshot: LocalSecuritySnapshot, item: Message | MessageUpdateEvent): boolean {
  if (item.isDeleted === true) return true;
  const known = snapshot.knownBeforeRefusal.get(uuidFromIri(item["@id"]));
  if (known === undefined) return false;
  if (isFullMessage(item)) return known === revisionOf(item.revisionCount);
  if ("attachments" in item) return false;
  if ("text" in item || "revisionCount" in item) {
    return item.revisionCount !== undefined && known === item.revisionCount;
  }
  return true;
}

export function admitPlainContent(
  conversation: AdmissionConversation | undefined,
  item: Message | MessageUpdateEvent,
): "show" | "drop" {
  if (active === null || !active.refusal.on) return "show";
  if (conversation?.encrypted === true) return "show";
  if (conversation === undefined && decodeEnvelope(item.text ?? null) !== null) return "show";
  if (admitKnown(active, item)) return "show";
  markDeclined(conversation);
  return "drop";
}

export function admitMessages<T extends Message>(
  conversation: AdmissionConversation | undefined,
  messages: T[],
): T[] {
  return messages.filter((m) => admitPlainContent(conversation, m) === "show");
}

export function admitPage<P extends ChannelPage>(
  conversation: AdmissionConversation | undefined,
  page: P,
): P {
  return page.messages ? { ...page, messages: admitMessages(conversation, page.messages) } : page;
}

export function conversationFromCache(
  queryClient: QueryClient,
  identifier: string | null | undefined,
): Conversation | undefined {
  if (!identifier) return undefined;
  return (
    queryClient.getQueryData<Conversation>(queryKeys.conversation(identifier)) ??
    queryClient
      .getQueryData<Conversation[]>(queryKeys.conversations())
      ?.find((c) => c.identifier === identifier)
  );
}

export function hasPinnedPeer(
  conversation: AdmissionConversation,
  snapshot: LocalSecuritySnapshot,
): boolean {
  const self = snapshot.scope.serverUserId;
  return conversation.members.some(
    (m) => m.userId !== self && snapshot.pinnedUserIds.has(m.userId),
  );
}

export function plainWriteRefusal(
  conversation: AdmissionConversation | undefined,
  snapshot: LocalSecuritySnapshot | null = active,
): PlainWriteRefusal | null {
  if (snapshot === null || conversation?.encrypted === true) return null;
  if (snapshot.refusal.on) return "self_refuses";
  if (conversation === undefined) return null;
  if (snapshot.acceptedPlainConversations.has(conversation.id)) return null;
  return hasPinnedPeer(conversation, snapshot) ? "pinned_peer" : null;
}

export function assertPlainWriteAllowed(queryClient: QueryClient, identifier: string): void {
  const refusal = plainWriteRefusal(conversationFromCache(queryClient, identifier));
  if (refusal !== null) throw new PlainWriteRefusedError(refusal);
}

function cachedMessages(queryClient: QueryClient): Message[] {
  const cache = queryClient.getQueryCache();
  const out: Message[] = [];
  for (const query of cache.findAll({ queryKey: ["conversations"] })) {
    const data = query.state.data as InfiniteData<ChannelPage> | undefined;
    if (query.queryKey[2] !== "pages" || !data?.pages) continue;
    for (const page of data.pages) out.push(...(page.messages ?? []));
  }
  for (const query of cache.findAll({ queryKey: ["threadReplies"] })) {
    out.push(...((query.state.data as Message[] | undefined) ?? []));
  }
  for (const query of cache.findAll({ queryKey: ["message"] })) {
    const data = query.state.data as Message | undefined;
    if (data !== undefined) out.push(data);
  }
  return out;
}

export function knownPlainMessages(queryClient: QueryClient): KnownMessage[] {
  return cachedMessages(queryClient)
    .filter((m) => typeof m.id === "string" && !m["@id"].startsWith("optimistic-"))
    .map((m) => ({ id: m.id, revisionCount: revisionOf(m.revisionCount) }));
}

export function reapplyAdmission(queryClient: QueryClient): void {
  if (active === null || !active.refusal.on) return;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ["conversations"] })) {
    const identifier = query.queryKey[1];
    if (query.queryKey[2] !== "pages" || typeof identifier !== "string") continue;
    const conversation = conversationFromCache(queryClient, identifier);
    queryClient.setQueryData<InfiniteData<ChannelPage>>(query.queryKey, (old) =>
      old ? { ...old, pages: old.pages.map((page) => admitPage(conversation, page)) } : old,
    );
  }
  queryClient.removeQueries({ queryKey: ["threadReplies"] });
  queryClient.removeQueries({ queryKey: ["message"] });
}
