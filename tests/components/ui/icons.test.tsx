import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import * as Icons from "@/components/icons";

describe("icons", () => {
  it("every export renders an <svg> and forwards size + className", () => {
    const names = Object.keys(Icons).filter((n) => n !== "IconProps");
    expect(names.length).toBe(76);
    for (const name of names) {
      const Cmp = (
        Icons as Record<string, React.ComponentType<{ size?: number; className?: string }>>
      )[name];
      if (!Cmp) throw new Error(`${name} is not an exported icon component`);
      const { container, unmount } = render(<Cmp size={20} className="text-fg" />);
      const svg = container.querySelector("svg");
      expect(svg, `${name} should render an svg`).toBeTruthy();
      expect(svg?.getAttribute("class") ?? "").toContain("text-fg");
      unmount();
    }
  });

  it("Spinner spins", () => {
    const { container } = render(<Icons.Spinner />);
    expect(container.querySelector("svg")?.getAttribute("class") ?? "").toContain("animate-spin");
  });
});
