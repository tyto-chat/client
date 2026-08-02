import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../utils/renderWithProviders";
import { Avatar } from "@/components/Avatar";

describe("Avatar", () => {
  it("shows an uppercased initial when no image", () => {
    renderWithProviders(<Avatar name="ada" colorKey="ada" />);
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("renders an <img> with alt when imageUrl is given", () => {
    renderWithProviders(<Avatar name="Ada" colorKey="ada" imageUrl="/x.png" />);
    expect(screen.getByRole("img", { name: "Ada" })).toBeInstanceOf(HTMLImageElement);
  });
});
