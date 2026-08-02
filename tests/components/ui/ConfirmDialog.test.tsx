import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders title + message and fires onConfirm", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Delete key?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Delete key?")).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();

    await userEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("fires onCancel on the cancel button and on Escape", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Discard?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    // Modal animates out (170ms) before onClose → onCancel fires.
    await new Promise((r) => setTimeout(r, 220));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
