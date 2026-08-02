import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import type { Dispatch, SetStateAction } from "react";

export type SuggestionState<T> = {
  visible: boolean;
  items: T[];
  index: number;
  rect: DOMRect | null;
  selectItem: ((index: number) => void) | null;
};

export function emptySuggestionState<T>(): SuggestionState<T> {
  return { visible: false, items: [], index: 0, rect: null, selectItem: null };
}

export function createSuggestionRender<T>(
  setSuggestion: Dispatch<SetStateAction<SuggestionState<T>>>,
  toCommandArgs: (item: T) => { id: string; label: string },
) {
  return () => {
    let commandFn: ((attrs: { id: string; label: string }) => void) | null = null;
    let currentItems: T[] = [];
    const indexRef = { current: 0 };

    const selectItem = (index: number) => {
      const item = currentItems[index];
      if (item && commandFn) commandFn(toCommandArgs(item));
    };

    return {
      onStart(props: SuggestionProps<T>) {
        commandFn = props.command;
        currentItems = props.items;
        indexRef.current = 0;
        setSuggestion({
          visible: true,
          items: props.items,
          index: 0,
          rect: props.clientRect?.() ?? null,
          selectItem,
        });
      },
      onUpdate(props: SuggestionProps<T>) {
        commandFn = props.command;
        currentItems = props.items;
        indexRef.current = 0;
        setSuggestion((prev) => ({
          ...prev,
          items: props.items,
          index: 0,
          rect: props.clientRect?.() ?? null,
          selectItem,
        }));
      },
      onKeyDown(props: SuggestionKeyDownProps) {
        const { event } = props;
        if (event.key === "Escape") {
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
        if (event.key === "Enter") {
          selectItem(indexRef.current);
          return true;
        }
        return false;
      },
      onExit() {
        commandFn = null;
        currentItems = [];
        indexRef.current = 0;
        setSuggestion(emptySuggestionState());
      },
    };
  };
}
