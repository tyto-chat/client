import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { MutableRefObject } from "react";
import type { CommunityEmoji } from "@/types/api";

const SHORTCODE_RE = /:([a-z0-9_-]{2,32}):/g;

export function createEmojiDecoratorExtension(emojisRef: MutableRefObject<CommunityEmoji[]>) {
  return Extension.create({
    name: "emojiDecorator",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("emojiDecorator"),
          props: {
            decorations(state) {
              const list = emojisRef.current ?? [];
              if (list.length === 0) return DecorationSet.empty;
              const byShortcode = new Map<string, CommunityEmoji>();
              for (const e of list) byShortcode.set(e.shortcode, e);

              const decos: Decoration[] = [];
              state.doc.descendants((node, pos, parent) => {
                if (!node.isText || !node.text) return;
                if (node.marks.some((m) => m.type.name === "code")) return;
                if (parent && parent.type.name === "codeBlock") return;
                const text = node.text;
                SHORTCODE_RE.lastIndex = 0;
                let m: RegExpExecArray | null;
                while ((m = SHORTCODE_RE.exec(text))) {
                  const shortcode = `:${m[1]}:`;
                  const emoji = byShortcode.get(shortcode);
                  if (!emoji) continue;
                  const from = pos + m.index;
                  const to = from + shortcode.length;
                  decos.push(Decoration.inline(from, to, { class: "emoji-shortcode-hidden" }));
                  decos.push(
                    Decoration.widget(
                      from,
                      () => {
                        const wrap = document.createElement("span");
                        wrap.className = "emoji-shortcode-widget";
                        wrap.contentEditable = "false";
                        if (emoji.image?.contentUrl) {
                          const img = document.createElement("img");
                          img.src = emoji.image.contentUrl;
                          img.alt = shortcode;
                          img.title = emoji.name ?? shortcode;
                          wrap.appendChild(img);
                        } else {
                          wrap.textContent = shortcode;
                        }
                        return wrap;
                      },
                      { side: -1, ignoreSelection: true },
                    ),
                  );
                }
              });
              return DecorationSet.create(state.doc, decos);
            },
          },
        }),
      ];
    },
  });
}
