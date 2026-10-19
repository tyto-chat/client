import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  MessageContextMenu,
  type MessageContextMenuProps,
} from "@/components/chat/MessageContextMenu";

vi.mock("@/components/chat/QuickReactionPicker", () => ({
  QuickReactionPicker: ({ onPick }: { onPick: (value: string) => void }) => (
    <button type="button" onClick={() => onPick("👍")}>
      pick-thumbs
    </button>
  ),
}));

function renderMenu(overrides: Partial<MessageContextMenuProps> = {}) {
  const props: MessageContextMenuProps = {
    x: 40,
    y: 50,
    communityIdentifier: "comm",
    canCopyText: true,
    canReact: true,
    canEdit: false,
    canDelete: false,
    canViewHistory: false,
    canPin: false,
    isPinned: false,
    canReply: true,
    canEmbed: false,
    canReport: false,
    onCopyMessage: vi.fn(),
    onCopyLink: vi.fn(),
    onReaction: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onViewHistory: vi.fn(),
    onPin: vi.fn(),
    onUnpin: vi.fn(),
    onReply: vi.fn(),
    onEmbed: vi.fn(),
    onReport: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<MessageContextMenu {...props} />);
  return props;
}

describe("MessageContextMenu", () => {
  it("lists only the permitted actions", () => {
    renderMenu();
    const labels = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(labels).toEqual(["Copy message", "Copy link", "Reply in thread", "Add reaction"]);
  });

  it("runs an action and closes", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByTestId("msg-context-copy-message"));
    expect(props.onCopyMessage).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before deleting", () => {
    const props = renderMenu({ canDelete: true });
    fireEvent.click(screen.getByTestId("msg-context-delete"));
    expect(props.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Yes"));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("switches to the reaction picker and reports the pick", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByTestId("msg-context-react"));
    fireEvent.click(screen.getByText("pick-thumbs"));
    expect(props.onReaction).toHaveBeenCalledWith("👍");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows unpin for a pinned message and closes on Escape", () => {
    const props = renderMenu({ canPin: true, isPinned: true });
    expect(screen.getByTestId("msg-context-pin")).toHaveTextContent("Unpin");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });
});
