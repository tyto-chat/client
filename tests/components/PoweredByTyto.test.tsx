import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoweredByTyto } from "@/components/LegalLinks";

describe("PoweredByTyto", () => {
  it("links to tyto.chat in a new tab", () => {
    render(<PoweredByTyto />);
    const link = screen.getByRole("link", { name: "Tyto" });
    expect(link).toHaveAttribute("href", "https://tyto.chat");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/Powered by/)).toBeInTheDocument();
  });
});
