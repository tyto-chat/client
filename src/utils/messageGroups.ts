import type { Message, User } from "@/types/api";

export const GROUP_THRESHOLD_MS = 5 * 60 * 1000;

function authorKey(msg: Message, user: User | null): string {
  if (msg.kind === "system") return `__system__:${msg["@id"]}`;
  if (msg["@id"].startsWith("optimistic-")) return "__me__";
  if (user && msg.createdBy && msg.createdBy.profile["@id"] === user.profile["@id"])
    return "__me__";
  return msg.createdBy?.profile["@id"] ?? `__sys__:${msg["@id"]}`;
}

export function groupMessages(
  messages: Message[],
  user: User | null,
): { isOwn: boolean; msgs: Message[] }[] {
  return messages.reduce<{ isOwn: boolean; msgs: Message[] }[]>((groups, msg) => {
    const key = authorKey(msg, user);
    const last = groups[groups.length - 1];
    const lastMsg = last?.msgs[last.msgs.length - 1];
    const withinWindow = lastMsg
      ? Math.abs(new Date(msg.createdAt).getTime() - new Date(lastMsg.createdAt).getTime()) <
        GROUP_THRESHOLD_MS
      : false;
    if (lastMsg && authorKey(lastMsg, user) === key && withinWindow) {
      last.msgs.push(msg);
    } else {
      const isOwn =
        msg["@id"].startsWith("optimistic-") ||
        (!!user && !!msg.createdBy && msg.createdBy.profile["@id"] === user.profile["@id"]);
      groups.push({ isOwn, msgs: [msg] });
    }
    return groups;
  }, []);
}
