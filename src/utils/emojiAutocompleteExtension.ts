import { Extension } from "@tiptap/core";
import Suggestion, { exitSuggestion } from "@tiptap/suggestion";
import type { EditorView } from "@tiptap/pm/view";
import { PluginKey } from "@tiptap/pm/state";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CommunityEmoji } from "@/types/api";
import { searchUnicode } from "./emojiCatalog";
import { getEmojiLabel } from "./emojiNameI18n";
import { emptySuggestionState, type SuggestionState } from "./mentionSuggestion";

export type EmojiSuggestionItem = {
  key: string;
  value: string;
  label: string;
  glyph?: string;
  imageUrl?: string;
};

export const emojiAutocompletePluginKey = new PluginKey("emojiAutocomplete");

interface MatchPosition {
  from: number;
  query: string;
}

interface DismissState {
  lastDismissed: MatchPosition | null;
  currentMatch: MatchPosition | null;
}

// Per-view, not per-module: the composer and an open ThreadPanel are two live
// editors, and shared dismissal state suppresses the picker in the wrong one.
const dismissStateByView = new WeakMap<EditorView, DismissState>();

export function dismissState(view: EditorView): DismissState {
  let state = dismissStateByView.get(view);
  if (!state) {
    state = { lastDismissed: null, currentMatch: null };
    dismissStateByView.set(view, state);
  }
  return state;
}

export function exitEmojiSuggestion(view: EditorView): void {
  const state = dismissState(view);
  if (state.currentMatch) state.lastDismissed = state.currentMatch;
  exitSuggestion(view, emojiAutocompletePluginKey);
}

function bareShortcode(shortcode: string): string {
  return shortcode.replace(/^:|:$/g, "");
}

function communityToItem(emoji: CommunityEmoji): EmojiSuggestionItem {
  return {
    key: `c:${emoji.id}`,
    value: emoji.shortcode,
    label: emoji.name ?? bareShortcode(emoji.shortcode),
    imageUrl: emoji.image?.contentUrl ?? undefined,
  };
}

export function createEmojiAutocompleteExtension(
  communityEmojisRef: MutableRefObject<CommunityEmoji[]>,
  setSuggestion: Dispatch<SetStateAction<SuggestionState<EmojiSuggestionItem>>>,
) {
  return Extension.create({
    name: "emojiAutocomplete",

    addProseMirrorPlugins() {
      const editor = this.editor;
      const dismissed = () => dismissState(editor.view);

      return [
        Suggestion<EmojiSuggestionItem>({
          editor: this.editor,
          char: ":",
          pluginKey: emojiAutocompletePluginKey,
          allowedPrefixes: [" "],
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from);
            for (let d = $from.depth; d >= 0; d--) {
              if ($from.node(d).type.name === "codeBlock") return false;
            }
            if ($from.marks().some((m) => m.type.name === "code")) return false;
            return true;
          },
          shouldShow: ({ range, query }) => {
            const { lastDismissed } = dismissed();
            if (
              lastDismissed &&
              lastDismissed.from === range.from &&
              lastDismissed.query === query
            ) {
              return false;
            }
            dismissed().lastDismissed = null;
            return true;
          },
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(props.value + " ")
              .run();
          },
          items: async ({ query }) => {
            const q = query.trim().toLowerCase();
            if (!q) return [];

            const seen = new Set<string>();
            const out: EmojiSuggestionItem[] = [];

            const community = communityEmojisRef.current ?? [];
            const starts: CommunityEmoji[] = [];
            const includes: CommunityEmoji[] = [];
            for (const e of community) {
              const bare = bareShortcode(e.shortcode).toLowerCase();
              const name = e.name?.toLowerCase() ?? "";
              if (bare.startsWith(q) || name.startsWith(q)) starts.push(e);
              else if (bare.includes(q) || (name !== "" && name.includes(q))) includes.push(e);
            }
            for (const e of [...starts, ...includes]) {
              const item = communityToItem(e);
              if (seen.has(item.key)) continue;
              seen.add(item.key);
              out.push(item);
              if (out.length >= 8) return out;
            }

            for (const u of await searchUnicode(q, 0, 20)) {
              const key = `u:${u.id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              out.push({
                key,
                value: u.glyph,
                label: getEmojiLabel(u.glyph) ?? u.name,
                glyph: u.glyph,
              });
              if (out.length >= 8) return out;
            }

            return out;
          },
          render: () => {
            let commandFn: ((attrs: EmojiSuggestionItem) => void) | null = null;
            let currentItems: EmojiSuggestionItem[] = [];
            const indexRef = { current: 0 };

            const selectItem = (index: number) => {
              const item = currentItems[index];
              if (item && commandFn) commandFn(item);
            };

            const visible = () => currentItems.length > 0;

            return {
              onStart(props) {
                commandFn = props.command;
                currentItems = props.items;
                indexRef.current = 0;
                dismissed().currentMatch = { from: props.range.from, query: props.query };
                setSuggestion({
                  visible: visible(),
                  items: props.items,
                  index: 0,
                  rect: props.clientRect?.() ?? null,
                  selectItem,
                });
              },
              onUpdate(props) {
                commandFn = props.command;
                currentItems = props.items;
                indexRef.current = 0;
                dismissed().currentMatch = { from: props.range.from, query: props.query };
                setSuggestion({
                  visible: visible(),
                  items: props.items,
                  index: 0,
                  rect: props.clientRect?.() ?? null,
                  selectItem,
                });
              },
              onKeyDown({ event }) {
                if (!visible()) return false;
                if (event.key === "Escape") {
                  const s = dismissed();
                  if (s.currentMatch) s.lastDismissed = s.currentMatch;
                  setSuggestion((prev) => ({ ...prev, visible: false }));
                  return true;
                }
                if (event.key === "ArrowDown") {
                  const next = (indexRef.current + 1) % Math.max(currentItems.length, 1);
                  indexRef.current = next;
                  setSuggestion((prev) => ({ ...prev, index: next }));
                  return true;
                }
                if (event.key === "ArrowUp") {
                  const len = Math.max(currentItems.length, 1);
                  const next = (indexRef.current - 1 + len) % len;
                  indexRef.current = next;
                  setSuggestion((prev) => ({ ...prev, index: next }));
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  selectItem(indexRef.current);
                  return true;
                }
                return false;
              },
              onExit() {
                commandFn = null;
                currentItems = [];
                indexRef.current = 0;
                dismissed().currentMatch = null;
                setSuggestion(emptySuggestionState());
              },
            };
          },
        }),
      ];
    },
  });
}
