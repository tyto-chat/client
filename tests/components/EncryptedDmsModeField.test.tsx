import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EncryptedDmsModeField } from "@/components/admin/settings/EncryptedDmsModeField";

describe("EncryptedDmsModeField", () => {
  it("shows the current mode and the consequences of each option", () => {
    render(<EncryptedDmsModeField value="enabled" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: /^Allowed/ })).toBeChecked();
    expect(screen.getByText(/No new encrypted conversations can be started/)).toBeInTheDocument();
    expect(
      screen.getByText(/Users who use only the web app cannot start or join/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Group direct messages are not available/)).toBeInTheDocument();
  });

  it("reports a change to disabled", async () => {
    const onChange = vi.fn();
    render(<EncryptedDmsModeField value="enabled" onChange={onChange} />);

    await userEvent.click(screen.getByRole("radio", { name: /^Off/ }));

    expect(onChange).toHaveBeenCalledWith("disabled");
  });

  it("keeps required unavailable until encrypted DMs ship", () => {
    render(<EncryptedDmsModeField value="enabled" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: /^Required/ })).toBeDisabled();
    expect(screen.getByText("Available once encrypted DMs ship.")).toBeInTheDocument();
  });
});
