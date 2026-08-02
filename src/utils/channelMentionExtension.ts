import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { createSuggestionRender, type SuggestionState } from "./mentionSuggestion";

export type { SuggestionState };

const channelMentionPluginKey = new PluginKey("channelMention");

export type Channel = { name: string; identifier: string };

export function createChannelMentionExtension(
  channelsRef: MutableRefObject<Channel[]>,
  setSuggestion: Dispatch<SetStateAction<SuggestionState<Channel>>>,
) {
  return Mention.extend({
    name: "channelMention",
    parseHTML() {
      return [
        {
          tag: "span.mention-channel",
          getAttrs: (el) => {
            const elem = el as HTMLElement;
            const id = elem.dataset.channelId ?? elem.textContent?.replace(/^#/, "") ?? "";
            const label = elem.textContent?.replace(/^#/, "") ?? "";
            return { id, label };
          },
        },
        {
          tag: 'a[href^="channel:"]',
          getAttrs: (el) => {
            const elem = el as HTMLAnchorElement;
            const id = elem.getAttribute("href")?.slice("channel:".length) ?? "";
            const label = elem.textContent?.replace(/^#/, "") ?? "";
            return { id, label };
          },
        },
      ];
    },
  }).configure({
    renderHTML({ node }) {
      return [
        "span",
        { class: "mention-channel", "data-channel-id": node.attrs.id },
        `#${node.attrs.label ?? node.attrs.id}`,
      ];
    },
    suggestion: {
      char: "#",
      pluginKey: channelMentionPluginKey,
      items: ({ query }) =>
        channelsRef.current
          .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8),
      render: createSuggestionRender(setSuggestion, (item) => ({
        id: item.identifier,
        label: item.name,
      })),
    },
  });
}
