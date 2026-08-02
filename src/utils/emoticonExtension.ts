import { Extension, InputRule } from "@tiptap/core";

const EMOTICONS: Record<string, string> = {
  ":)": "🙂",
  ":-)": "🙂",
  "=)": "🙂",
  ":(": "🙁",
  ":-(": "🙁",
  "=(": "🙁",
  ";)": "😉",
  ";-)": "😉",
  ":D": "😄",
  ":-D": "😄",
  "=D": "😄",
  ":P": "😛",
  ":-P": "😛",
  ":p": "😛",
  ":-p": "😛",
  "=P": "😛",
  xD: "😆",
  XD: "😆",
  "<3": "❤️",
  "</3": "💔",
  ":O": "😮",
  ":-O": "😮",
  ":o": "😮",
  ":-o": "😮",
  ":|": "😐",
  ":-|": "😐",
  ":/": "😕",
  ":-/": "😕",
  ":\\": "😕",
  ":-\\": "😕",
  ":'(": "😢",
  ":*": "😘",
  ":-*": "😘",
  ">:(": "😠",
  ">:-(": "😠",
  ">:)": "😈",
  ">:-)": "😈",
  "\\o/": "🙌",
  "-_-": "😑",
  T_T: "😭",
  o_O: "😳",
  O_o: "😳",
};

function buildRegex(): RegExp {
  const keys = Object.keys(EMOTICONS).sort((a, b) => b.length - a.length);
  const alts = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(^|\\s)(${alts})$`);
}

const FIND = buildRegex();

export function matchEmoticon(textBeforeCursor: string): string | null {
  const key = textBeforeCursor.match(FIND)?.[2];
  return key ? (EMOTICONS[key] ?? null) : null;
}

export function createEmoticonExtension(enabledRef: { current: boolean }): Extension {
  return Extension.create({
    name: "emoticonConversion",

    addInputRules() {
      return [
        new InputRule({
          find: FIND,
          handler: ({ state, range, match }) => {
            if (!enabledRef.current) return null;
            const emoticon = match[2];
            if (!emoticon) return null;
            const emoji = EMOTICONS[emoticon];
            if (!emoji) return null;

            const start = range.to - emoticon.length;
            const $start = state.doc.resolve(start);
            if ($start.parent.type.spec.code) return null;
            if ($start.marks().some((m) => m.type.name === "code")) return null;
            for (let d = $start.depth; d > 0; d--) {
              if ($start.node(d).type.name === "codeBlock") return null;
            }

            state.tr.insertText(emoji, start, range.to);
          },
        }),
      ];
    },
  });
}
