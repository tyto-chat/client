import { describe, it, expect, vi } from "vitest";
import type { EditorView } from "@tiptap/pm/view";

vi.mock("@tiptap/suggestion", () => ({
  default: vi.fn(),
  exitSuggestion: vi.fn(),
}));

const { dismissState, exitEmojiSuggestion } = await import("@/utils/emojiAutocompleteExtension");

function fakeView(): EditorView {
  return {} as EditorView;
}

describe("emoji autocomplete dismissal state", () => {
  it("returns the same state object for one view", () => {
    const view = fakeView();
    expect(dismissState(view)).toBe(dismissState(view));
  });

  it("keeps a dismissal in one editor from suppressing the picker in another", () => {
    const composer = fakeView();
    const threadPanel = fakeView();

    dismissState(composer).currentMatch = { from: 5, query: "smi" };
    dismissState(threadPanel).currentMatch = { from: 5, query: "smi" };

    exitEmojiSuggestion(composer);

    expect(dismissState(composer).lastDismissed).toEqual({ from: 5, query: "smi" });
    expect(dismissState(threadPanel).lastDismissed).toBeNull();
  });

  it("records nothing when there is no active match", () => {
    const view = fakeView();
    exitEmojiSuggestion(view);
    expect(dismissState(view).lastDismissed).toBeNull();
  });
});
