import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { createSuggestionRender, type SuggestionState } from "./mentionSuggestion";

const userMentionPluginKey = new PluginKey("userMention");

export type MemberItem = { id: number; name: string; avatarUrl: string | null; colorKey: string };
export type BroadcastItem = { broadcast: "channel" | "here"; name: string };
export type UserSuggestionItem = MemberItem | BroadcastItem;

export function isBroadcastItem(item: UserSuggestionItem): item is BroadcastItem {
  return "broadcast" in item;
}

const BROADCAST_ID_PREFIX = "broadcast:";

export function createUserMentionExtension(
  membersRef: MutableRefObject<MemberItem[]>,
  broadcastsRef: MutableRefObject<BroadcastItem[]>,
  setSuggestion: Dispatch<SetStateAction<SuggestionState<UserSuggestionItem>>>,
) {
  return Mention.extend({
    name: "userMention",
    parseHTML() {
      return [
        {
          tag: "span.mention-broadcast",
          getAttrs: (el) => {
            const scope = (el as HTMLElement).dataset.broadcast ?? "";
            return { id: `${BROADCAST_ID_PREFIX}${scope}`, label: scope };
          },
        },
        {
          tag: 'a[href^="broadcast:"]',
          getAttrs: (el) => {
            const scope =
              (el as HTMLAnchorElement).getAttribute("href")?.slice("broadcast:".length) ?? "";
            return { id: `${BROADCAST_ID_PREFIX}${scope}`, label: scope };
          },
        },
        {
          tag: "span.mention-user",
          getAttrs: (el) => {
            const elem = el as HTMLElement;
            const id = elem.dataset.userId ?? "";
            const label = elem.textContent?.replace(/^@/, "") ?? "";
            return { id, label };
          },
        },
        {
          tag: 'a[href^="user:"]',
          getAttrs: (el) => {
            const elem = el as HTMLAnchorElement;
            const id = elem.getAttribute("href")?.slice("user:".length) ?? "";
            const label = elem.textContent?.replace(/^@/, "") ?? "";
            return { id, label };
          },
        },
      ];
    },
  }).configure({
    renderHTML({ node }) {
      const id = node.attrs.id as string;
      if (typeof id === "string" && id.startsWith(BROADCAST_ID_PREFIX)) {
        const scope = id.slice(BROADCAST_ID_PREFIX.length);
        return ["span", { class: "mention-broadcast", "data-broadcast": scope }, `@${scope}`];
      }
      return ["span", { class: "mention-user", "data-user-id": id }, `@${node.attrs.label ?? id}`];
    },
    suggestion: {
      char: "@",
      pluginKey: userMentionPluginKey,
      items: ({ query }): UserSuggestionItem[] => {
        const q = query.toLowerCase();
        const broadcasts = broadcastsRef.current.filter((b) => b.broadcast.includes(q));
        const members = membersRef.current
          .filter((m) => m.name.toLowerCase().includes(q))
          .slice(0, 8);
        return [...broadcasts, ...members];
      },
      render: createSuggestionRender(setSuggestion, (item) =>
        isBroadcastItem(item)
          ? { id: `${BROADCAST_ID_PREFIX}${item.broadcast}`, label: item.broadcast }
          : { id: String(item.id), label: item.name },
      ),
    },
  });
}
