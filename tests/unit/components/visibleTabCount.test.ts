import { describe, it, expect } from "vitest";
import { visibleTabCount } from "@/components/ui/visibleTabCount";

describe("visibleTabCount", () => {
  it("shows every tab when they all fit", () => {
    expect(visibleTabCount(252, [80, 80, 80], 1)).toBe(3);
  });

  it("leaves room for the More button when they do not fit", () => {
    expect(visibleTabCount(251, [80, 80, 80], 1)).toBe(1);
    expect(visibleTabCount(300, [80, 80, 80, 80], 1)).toBe(2);
  });

  it("hides tabs that the space left after the leading buttons cannot hold", () => {
    const modalWidth = 400;
    const leadingButtons = 210;
    expect(visibleTabCount(modalWidth, [80, 80, 80], 1)).toBe(3);
    expect(visibleTabCount(modalWidth - leadingButtons, [80, 80, 80], 0)).toBe(1);
  });

  it("moves every tab into More when not even one fits and that is allowed", () => {
    expect(visibleTabCount(120, [80, 80, 80], 0)).toBe(0);
  });

  it("keeps one tab when a minimum of one is asked for", () => {
    expect(visibleTabCount(120, [80, 80, 80], 1)).toBe(1);
  });
});
