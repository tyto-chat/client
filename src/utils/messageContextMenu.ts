const NATIVE_MENU_TARGETS =
  "a, img, video, audio, button, input, textarea, [contenteditable], .tiptap";

export function wantsNativeContextMenu(target: EventTarget | null, selection: string): boolean {
  if (selection.trim() !== "") return true;
  return target instanceof Element && target.closest(NATIVE_MENU_TARGETS) !== null;
}
