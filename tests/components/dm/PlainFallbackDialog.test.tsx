import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlainFallbackDialog } from "@/components/dm/PlainFallbackDialog";

describe("PlainFallbackDialog", () => {
  it("outcome_plain_fallback_requires_confirm_and_names_user", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PlainFallbackDialog names="Bora" group={false} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    expect(
      screen.getByText(/Bora cannot take part in an end-to-end encrypted conversation/),
    ).toBeInTheDocument();
    expect(screen.getByText(/the server can read this conversation/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("e2ee-plain-fallback-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("states that group conversations are not encrypted", () => {
    render(<PlainFallbackDialog names="" group onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(
      screen.getByText(/Group conversations are not end-to-end encrypted/),
    ).toBeInTheDocument();
  });
});
