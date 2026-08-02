import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "@/components/ui/Switch";

describe("Switch", () => {
  it("reflects checked state and toggles on click", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} testId="sw" label="Test switch" />);
    const sw = screen.getByTestId("sw");
    expect(sw).toHaveAttribute("role", "switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveAttribute("aria-label", "Test switch");
    await userEvent.setup().click(sw);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const onChange = vi.fn();
    render(<Switch checked disabled onChange={onChange} testId="sw" label="Test switch" />);
    await userEvent.setup().click(screen.getByTestId("sw"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
