import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EncryptionOutcome } from "@/components/dm/EncryptionOutcome";

describe("EncryptionOutcome", () => {
  it("limitations_list_mentions_reactions_and_threads", () => {
    render(<EncryptionOutcome />);

    expect(screen.getByText("This conversation will be end-to-end encrypted")).toBeInTheDocument();
    const items = within(screen.getByTestId("e2ee-limitations")).getAllByRole("listitem");
    expect(items).toHaveLength(10);
    expect(items[2]?.textContent).toMatch(/Reactions are not encrypted/);
    expect(items[3]?.textContent).toMatch(
      /Replies in threads are encrypted, but the server can see/,
    );
  });

  it("toggle_absent_everywhere", () => {
    render(<EncryptionOutcome />);

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
