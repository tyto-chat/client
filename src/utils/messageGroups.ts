import type { Message, User } from "@/types/api";
import { isOptimisticMessage } from "@/utils/optimisticMessage";

export const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

const NO_BLOCKED: ReadonlySet<number> = new Set();

export interface MessageGroupData {
  isOwn: boolean;
  blocked: boolean;
  msgs: Message[];
}

function authorKey(msg: Message, user: User | null): string {
  if (msg.kind === "system") return `__system__:${msg["@id"]}`;
  if (isOptimisticMessage(msg["@id"])) return "__me__";
  if (user && msg.createdBy && msg.createdBy.profile["@id"] === user.profile["@id"])
    return "__me__";
  return msg.createdBy?.profile["@id"] ?? `__sys__:${msg["@id"]}`;
}

function isBlockedMessage(
  msg: Message,
  user: User | null,
  blockedUserIds: ReadonlySet<number>,
): boolean {
  if (msg.kind === "system" || isOptimisticMessage(msg["@id"])) return false;
  const authorId = msg.createdBy?.id;
  if (authorId === undefined || authorId === user?.id) return false;
  return blockedUserIds.has(authorId);
}

export function groupMessages(
  messages: Message[],
  user: User | null,
  blockedUserIds: ReadonlySet<number> = NO_BLOCKED,
): MessageGroupData[] {
  return messages.reduce<MessageGroupData[]>((groups, msg) => {
    const key = authorKey(msg, user);
    const blocked = isBlockedMessage(msg, user, blockedUserIds);
    const last = groups[groups.length - 1];
    const lastMsg = last?.msgs[last.msgs.length - 1];
    const withinWindow = lastMsg
      ? Math.abs(new Date(msg.createdAt).getTime() - new Date(lastMsg.createdAt).getTime()) <
        GROUP_THRESHOLD_MS
      : false;
    if (
      last &&
      lastMsg &&
      authorKey(lastMsg, user) === key &&
      last.blocked === blocked &&
      (withinWindow || blocked)
    ) {
      last.msgs.push(msg);
    } else {
      const isOwn =
        isOptimisticMessage(msg["@id"]) ||
        (!!user && !!msg.createdBy && msg.createdBy.profile["@id"] === user.profile["@id"]);
      groups.push({ isOwn, blocked, msgs: [msg] });
    }
    return groups;
  }, []);
}

export function revealGroups(
  groups: MessageGroupData[],
  user: User | null,
  revealedIds: ReadonlySet<string>,
): MessageGroupData[] {
  return groups.flatMap((group) =>
    group.blocked && group.msgs.some((m) => revealedIds.has(m["@id"]))
      ? groupMessages(group.msgs, user)
      : [group],
  );
}
