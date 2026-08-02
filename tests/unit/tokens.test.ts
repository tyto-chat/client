import { describe, it, expect, afterEach } from "vitest";

describe("design tokens", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.getElementById("tok-test")?.remove();
  });

  it("flips --color-surface between light and dark", () => {
    const style = document.createElement("style");
    style.id = "tok-test";
    style.textContent = `
      :root { --color-surface: #f9fafb; }
      .dark { --color-surface: #111827; }
    `;
    document.head.appendChild(style);
    const read = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim();

    expect(read()).toBe("#f9fafb");
    document.documentElement.classList.add("dark");
    expect(read()).toBe("#111827");
  });
});
