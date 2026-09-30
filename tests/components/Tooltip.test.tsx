import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "@/components/Tooltip";

describe("Tooltip", () => {
  it("uses the theme's text colour on the theme's background", async () => {
    render(
      <Tooltip content="Full address">
        <span>short</span>
      </Tooltip>,
    );

    await userEvent.hover(screen.getByText("short"));

    const bubble = await screen.findByText("Full address");
    expect(bubble.className).toContain("bg-canvas");
    expect(bubble.className).toContain("text-fg");
    expect(bubble.className).not.toContain("text-white");
  });
});
